import { z } from "zod";

// ─── 标签聚合统计 ────────────────────────────────────────
//
// 只统计已发布群组（RPD §14.1），单次聚合查询（RPD §14.5）。

export const tagStatsSchema = z.object({
  tag: z.string(),
  count: z.number().int().nonnegative(),
});
export type TagStats = z.infer<typeof tagStatsSchema>;

export const tagStatsResponseSchema = z.object({
  tags: z.array(tagStatsSchema),
});
export type TagStatsResponse = z.infer<typeof tagStatsResponseSchema>;
