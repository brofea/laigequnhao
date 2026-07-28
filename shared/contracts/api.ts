import { z } from "zod";

// ─── 错误码 ──────────────────────────────────────────────

export const ErrorCode = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  AUTH_REQUIRED: "AUTH_REQUIRED",
  AUTH_FAILED: "AUTH_FAILED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VERSION_CONFLICT: "VERSION_CONFLICT",
  STATE_CONFLICT: "STATE_CONFLICT",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
  RATE_LIMITED: "RATE_LIMITED",
  DEPENDENCY_UNAVAILABLE: "DEPENDENCY_UNAVAILABLE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const errorCodeSchema = z.enum(Object.values(ErrorCode) as [string, ...string[]]);

// ─── 错误详情 ────────────────────────────────────────────

export const apiErrorDetailSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
});

// ─── 响应信封 ────────────────────────────────────────────

export const apiSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    ok: z.literal(true),
    data: dataSchema,
    meta: z.record(z.string(), z.unknown()).optional(),
    requestId: z.string().uuid(),
  });

export const apiErrorSchema = z.object({
  ok: z.literal(false),
  error: apiErrorDetailSchema,
  requestId: z.string().uuid(),
});

export const apiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.discriminatedUnion("ok", [apiSuccessSchema(dataSchema), apiErrorSchema]);

// ─── TypeScript 类型 ─────────────────────────────────────

export type ApiSuccess<T = unknown> = z.infer<ReturnType<typeof apiSuccessSchema<z.ZodType<T>>>>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;
