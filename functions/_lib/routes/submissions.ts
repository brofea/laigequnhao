import { Hono } from "hono";
import {
  submissionRequestSchema,
  submissionReceiptSchema,
  SUBMISSION_LOGO_FORM_FIELD,
  SUBMISSION_MULTIPART_MAX_BYTES,
  SUBMISSION_QR_FORM_FIELD,
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
import {
  ImageValidationError,
  validateImageUpload,
  validatePngUpload,
} from "../services/image-validation";
import { dependencyUnavailable } from "../api-error";
import { getSubmissionLimitPerHour } from "../env";
import type { Env } from "../env";

type Vars = { requestId: string };
export const submissionsRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

type ParsedSubmission = {
  payload: unknown;
  logoBytes?: Uint8Array;
  logoContentType?: string;
  qrBytes?: Uint8Array;
  qrContentType?: string;
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

  const purposes = formData.getAll("filePurpose");
  for (const purpose of purposes) {
    if (purpose !== SUBMISSION_LOGO_FORM_FIELD && purpose !== SUBMISSION_QR_FORM_FIELD) {
      return validationError(requestId, "Unsupported file purpose.", {
        filePurpose: ["Must be logo or qr"],
      });
    }
  }

  // 字段名即用途：logo/file 字段 → 头像，qr 字段 → 二维码。
  // 每种用途最多一个文件；未知字段名拒绝，避免绕过用途校验。
  const fileEntries: Array<[string, File]> = [];
  for (const [field, value] of formData.entries()) {
    if (isFileEntry(value)) fileEntries.push([field, value]);
  }

  let logoFile: File | undefined;
  let qrFile: File | undefined;
  for (const [field, value] of fileEntries) {
    if (field === SUBMISSION_LOGO_FORM_FIELD || field === "file") {
      if (logoFile) {
        return validationError(requestId, "Only one logo image may be submitted.", {
          logo: ["Only one file is allowed"],
        });
      }
      logoFile = value;
    } else if (field === SUBMISSION_QR_FORM_FIELD) {
      if (qrFile) {
        return validationError(requestId, "Only one QR image may be submitted.", {
          qr: ["Only one file is allowed"],
        });
      }
      qrFile = value;
    } else {
      return validationError(requestId, "Unsupported file field.", {
        logo: ["Unsupported file field"],
      });
    }
  }

  let logoBytes: Uint8Array | undefined;
  let logoContentType: string | undefined;
  if (logoFile) {
    logoContentType = logoFile.type.toLowerCase();
    logoBytes = new Uint8Array(await logoFile.arrayBuffer());
  }

  let qrBytes: Uint8Array | undefined;
  let qrContentType: string | undefined;
  if (qrFile) {
    qrContentType = qrFile.type.toLowerCase();
    qrBytes = new Uint8Array(await qrFile.arrayBuffer());
  }

  return { payload, logoBytes, logoContentType, qrBytes, qrContentType };
}

function imageValidationError(requestId: string, error: unknown, purpose: "logo" | "qr"): Response {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  if (code === "PAYLOAD_TOO_LARGE") return payloadTooLargeError(requestId);

  const unsupported = code === "UNSUPPORTED_MEDIA_TYPE";
  return new Response(
    JSON.stringify(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: unsupported ? "UNSUPPORTED_MEDIA_TYPE" : "VALIDATION_FAILED",
          message:
            purpose === "qr"
              ? unsupported
                ? "QR must be a valid JPEG image."
                : "QR image metadata is invalid."
              : unsupported
                ? "Logo must be a valid PNG image."
                : "Logo image metadata is invalid.",
        },
        requestId,
      }),
    ),
    {
      status: unsupported ? 415 : 400,
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
      if (
        parsedRequest.logoContentType &&
        parsedRequest.logoContentType !== getAssetContentType("logo")
      ) {
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
      return imageValidationError(requestId, error, "logo");
    }
  }

  let qr: ValidatedSubmissionLogo | undefined;
  if (parsedRequest.qrBytes) {
    try {
      if (
        parsedRequest.qrContentType &&
        parsedRequest.qrContentType !== getAssetContentType("qr_code")
      ) {
        throw new ImageValidationError(
          "UNSUPPORTED_MEDIA_TYPE",
          415,
          "二维码文件 MIME 类型必须是 image/jpeg。",
        );
      }
      const validated = validateImageUpload(parsedRequest.qrBytes, "qr_code");
      qr = {
        bytes: validated.bytes,
        width: validated.width,
        height: validated.height,
      };
    } catch (error) {
      return imageValidationError(requestId, error, "qr");
    }
  }

  // 契约允许 qr=true 无群号/链接提交，但图片本体走 multipart：
  // 标记存在却没有二维码文件时拒绝，避免落库出"声称有二维码"的群。
  if (input.qr && !qr) {
    return validationError(requestId, "QR flag requires a QR image file.", {
      qr: ["QR image is required when qr is true"],
    });
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
      qr,
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
