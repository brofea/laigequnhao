import { z } from "zod";

// ─── 管理端页码分页 ──────────────────────────────────────
//
// RPD §21：固定每页 50 条，第一版本不提供每页数量切换。

export const ADMIN_PAGE_SIZE = 50;

export const pageResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    page: z.number().int().min(1),
    pageSize: z.literal(ADMIN_PAGE_SIZE),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  });

export type PageResponse<T> = {
  items: T[];
  page: number;
  pageSize: typeof ADMIN_PAGE_SIZE;
  totalItems: number;
  totalPages: number;
};
