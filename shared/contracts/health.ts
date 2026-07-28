import { z } from "zod";

// ─── 健康检查响应 ────────────────────────────────────────

export const healthResponseSchema = z.object({
  status: z.string(),
  version: z.string(),
  timestamp: z.string().datetime(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
