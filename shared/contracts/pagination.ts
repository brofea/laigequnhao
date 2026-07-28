import { z } from "zod";

// ─── 列表查询参数 ────────────────────────────────────────

export const listQuerySchema = z.object({
  q: z.string().optional(),
  cursor: z.string().nullable().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

// ─── 游标分页 ────────────────────────────────────────────

export const cursorPageSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
    rotationWindow: z.string(),
  });

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
  rotationWindow: string;
};
