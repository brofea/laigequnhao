import { z } from "zod";

// ─── 登录请求 ────────────────────────────────────────────

export const loginRequestSchema = z.object({
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

// ─── 会话响应 ────────────────────────────────────────────

export const sessionResponseSchema = z.object({
  csrfToken: z.string(),
  expiresAt: z.string().datetime(),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

// ─── 会话状态 ────────────────────────────────────────────

export const sessionStatusSchema = z.object({
  authenticated: z.literal(true),
  csrfToken: z.string(),
  expiresAt: z.string().datetime(),
});
export type SessionStatus = z.infer<typeof sessionStatusSchema>;
