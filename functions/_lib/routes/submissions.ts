import { Hono } from "hono";
import {
  submissionRequestSchema,
  submissionReceiptSchema,
  SUBMISSION_LOGO_FORM_FIELD,
  SUBMISSION_MULTIPART_MAX_BYTES,
} from "@shared/contracts/submission";
import { getAssetContentType } from "@shared/contracts/asset";
import { apiSuccessSchema, apiErrorSchema } from "@shared/contracts/api";
import { createGroupRepository } from "../repositories/group-repository";
import { createRateLimitRepository } from "../repositories/rate-limit-repository";
import {
  createSubmissionService,
  SubmissionDependencyError,
  type ValidatedSubmissionLogo,
} from "../services/submission-service";
import { createR2Adapter } from "../adapters/r2-adapter";
import { ImageValidationError, validatePngUpload } from "../services/image-validation";
import { dependencyUnavailable } from "../api-error";
import { getSubmissionLimitPerHour } from "../env";
import type { Env } from "../env";

type Vars = { requestId: string };
export const submissionsRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

type ParsedSubmission = {
  payload: unknown;
  logoBytes?: Uint8Array;
  logoContentType?: string;
};

function validationError(
  requestId: string,
  message = "Request data is invalid.",
  fieldErrors?: Record<string, string[]>,
): Response {
  return new Response(
    JSON.stringify(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "VALIDATION_FAILED", message, fieldErrors },
        requestId,
      }),
    ),
    { status: 400, headers: { "Content-Type": "application/json" } },
  );
}

function payloadTooLargeError(requestId: string): Response {
  return new Response(
    JSON.stringify(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "PAYLOAD_TOO_LARGE", message: "Submission payload is too large." },
        requestId,
      }),
    ),
    { status: 413, headers: { "Content-Type": "application/json" } },
  );
}

function isMultipart(contentType: string | undefined): boolean {
  return contentType?.toLowerCase().startsWith("multipart/form-data") === true;
}

function isFileEntry(value: unknown): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    typeof value.arrayBuffer === "function"
  );
}

/**
 * 读取投稿请求边界。FormData 只负责封装，不把文件元数据带入共享 JSON 契约。
 * 先检查 Content-Length，再读取实际 body，防止无图/伪造 Content-Length 绕过请求上限。
 */
async function parseRequest(
  request: Request,
  requestId: string,
): Promise<ParsedSubmission | Response> {
  if (!isMultipart(request.headers.get("Content-Type") ?? undefined)) {
    try {
      return { payload: await request.json() };
    } catch {
      return validationError(requestId);
    }
  }

  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength) {
    const length = Number.parseInt(declaredLength, 10);
    if (Number.isFinite(length) && length > SUBMISSION_MULTIPART_MAX_BYTES) {
      return payloadTooLargeError(requestId);
    }
  }

  let body: ArrayBuffer;
  try {
    body = await request.clone().arrayBuffer();
  } catch {
    return validationError(requestId, "Submission payload could not be read.");
  }
  if (body.byteLength > SUBMISSION_MULTIPART_MAX_BYTES) {
    return payloadTooLargeError(requestId);
  }

  let formData: FormData;
  try {
    // Request.formData() consumes the body; use the bounded copy so the original
    // request remains untouched for middleware and diagnostics.
    formData = await new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body,
    }).formData();
  } catch {
    return validationError(requestId, "Submission multipart data is invalid.");
  }

  const payloadPart = formData.get("payload");
  if (typeof payloadPart !== "string") {
    return validationError(requestId, "Submission payload is required.", {
      payload: ["Required"],
    });
  }

  let payload: Record<string, unknown>;
  try {
    const decoded: unknown = JSON.parse(payloadPart);
    if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
      return validationError(requestId);
    }
    payload = decoded as Record<string, unknown>;
  } catch {
    return validationError(requestId, "Submission payload is invalid.", {
      payload: ["Must be valid JSON"],
    });
  }

  const purpose = formData.get("filePurpose");
  if (purpose !== null && (typeof purpose !== "string" || purpose !== "logo")) {
    return validationError(requestId, "Only logo images are accepted.", {
      filePurpose: ["Must be logo"],
    });
  }

  const fileEntries: Array<[string, File]> = [];
  for (const [field, value] of formData.entries()) {
    if (isFileEntry(value)) fileEntries.push([field, value]);
  }
  if (fileEntries.length > 1) {
    return validationError(requestId, "Only one logo image may be submitted.", {
      logo: ["Only one file is allowed"],
    });
  }

  let logoBytes: Uint8Array | undefined;
  let logoContentType: string | undefined;
  if (fileEntries.length === 1) {
    const [field, value] = fileEntries[0]!;
    if (field !== SUBMISSION_LOGO_FORM_FIELD && field !== "file") {
      return validationError(requestId, "Only a logo image is accepted.", {
        logo: ["Unsupported file field"],
      });
    }

    logoContentType = value.type.toLowerCase();
    logoBytes = new Uint8Array(await value.arrayBuffer());
  }

  return { payload, logoBytes, logoContentType };
}

function imageValidationError(requestId: string, error: unknown): Response {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  if (code === "PAYLOAD_TOO_LARGE") return payloadTooLargeError(requestId);

  return new Response(
    JSON.stringify(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: code === "UNSUPPORTED_MEDIA_TYPE" ? "UNSUPPORTED_MEDIA_TYPE" : "VALIDATION_FAILED",
          message:
            code === "UNSUPPORTED_MEDIA_TYPE"
              ? "Logo must be a valid PNG image."
              : "Logo image metadata is invalid.",
        },
        requestId,
      }),
    ),
    {
      status: code === "UNSUPPORTED_MEDIA_TYPE" ? 415 : 400,
      headers: { "Content-Type": "application/json" },
    },
  );
}

submissionsRoute.post("/", async (c) => {
  const requestId = c.get("requestId");

  const parsedRequest = await parseRequest(c.req.raw, requestId);
  if (parsedRequest instanceof Response) return parsedRequest;

  const parseResult = submissionRequestSchema.safeParse(parsedRequest.payload);
  if (!parseResult.success) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "Request data is invalid.",
          fieldErrors: parseResult.error.flatten().fieldErrors,
        },
        requestId,
      }),
      400,
    );
  }

  const input = parseResult.data;

  let logo: ValidatedSubmissionLogo | undefined;
  if (parsedRequest.logoBytes) {
    try {
      if (parsedRequest.logoContentType !== getAssetContentType("logo")) {
        throw new ImageValidationError(
          "UNSUPPORTED_MEDIA_TYPE",
          415,
          "Logo 文件 MIME 类型必须是 image/png。",
        );
      }
      const validated = validatePngUpload(parsedRequest.logoBytes, "logo");
      logo = {
        bytes: validated.bytes,
        width: validated.width,
        height: validated.height,
      };
    } catch (error) {
      return imageValidationError(requestId, error);
    }
  }

  const groupRepo = createGroupRepository(c.env.DB);
  const rateLimitRepo = createRateLimitRepository(c.env.DB);
  const service = createSubmissionService(groupRepo, rateLimitRepo, {
    r2Adapter: createR2Adapter(c.env.R2, c.env),
    requestId,
  });

  const clientKey = c.req.header("CF-Connecting-IP") ?? "unknown";

  try {
    const result = await service.submit(input, clientKey, getSubmissionLimitPerHour(c.env), {
      logo,
      requestId,
    });
    c.header("Cache-Control", "no-store");
    return c.json(
      apiSuccessSchema(submissionReceiptSchema).parse({
        ok: true,
        data: { id: result.id, title: result.title, status: "pending" as const },
        requestId,
      }),
      201,
    );
  } catch (err) {
    if (err instanceof Error && err.name === "RateLimitError") {
      return c.json(
        apiErrorSchema.parse({
          ok: false,
          error: { code: "RATE_LIMITED", message: "Too many submissions." },
          requestId,
        }),
        429,
      );
    }
    if (err instanceof SubmissionDependencyError) {
      return c.json(dependencyUnavailable(requestId, "Submission could not be completed."), 503);
    }
    throw err;
  }
});
