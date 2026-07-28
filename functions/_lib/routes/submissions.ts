import { Hono } from "hono";
import { submissionRequestSchema, submissionReceiptSchema } from "@shared/contracts/submission";
import { apiSuccessSchema, apiErrorSchema } from "@shared/contracts/api";
import { createGroupRepository } from "../repositories/group-repository";
import { createRateLimitRepository } from "../repositories/rate-limit-repository";
import { createSubmissionService } from "../services/submission-service";
import { createTurnstileAdapter } from "../adapters/turnstile-adapter";
import type { Env } from "../env";

type Vars = { requestId: string };
export const submissionsRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

submissionsRoute.post("/", async (c) => {
  const requestId = c.get("requestId");

  // 解析 body
  const body = await c.req.json<unknown>();
  const parseResult = submissionRequestSchema.safeParse(body);
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

  // Turnstile 验证
  const turnstile = createTurnstileAdapter(
    c.env.TURNSTILE_SECRET_KEY,
    c.env.SKIP_TURNSTILE === "true",
  );
  const passed = await turnstile.verify(input.turnstileToken);
  if (!passed) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "DEPENDENCY_UNAVAILABLE", message: "Turnstile verification failed." },
        requestId,
      }),
      503,
    );
  }

  // 提交服务
  const groupRepo = createGroupRepository(c.env.DB);
  const rateLimitRepo = createRateLimitRepository(c.env.DB);
  const service = createSubmissionService(groupRepo, rateLimitRepo);

  const clientKey = c.req.header("CF-Connecting-IP") ?? "unknown";

  try {
    const result = await service.submit(input, clientKey);
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
    throw err;
  }
});
