import { z } from "zod";

// ─── 板块排序模式 ────────────────────────────────────────

export const boardSortModeSchema = z.enum(["manual_asc", "manual_desc", "hourly_random"]);
export type BoardSortMode = z.infer<typeof boardSortModeSchema>;
