import { z } from "zod";

// ─── 点赞切换响应 ────────────────────────────────────────

export const likeToggleResponseSchema = z.object({
  liked: z.boolean(),
  likeCount: z.number().int().nonnegative(),
});
export type LikeToggleResponse = z.infer<typeof likeToggleResponseSchema>;
