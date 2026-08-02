import { z } from "zod";
import { boardSortModeSchema, groupStatusSchema } from "../domain";
import { TITLE_MAX_WIDTH, measureDisplayWidth } from "../domain/display-width";
import { publicGroupDtoSchema } from "./group";

// ─── 管理员板块 DTO ──────────────────────────────────────

export const boardDtoSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  isEnabled: z.boolean(),
  position: z.number().int().nonnegative(),
  sortMode: boardSortModeSchema,
  version: z.number().int().nonnegative(),
  memberCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type BoardDto = z.infer<typeof boardDtoSchema>;

// ─── 公开板块（含成员）DTO ───────────────────────────────

export const boardWithGroupsSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  sortMode: boardSortModeSchema,
  groups: z.array(publicGroupDtoSchema),
});
export type BoardWithGroups = z.infer<typeof boardWithGroupsSchema>;

// ─── 板块成员 DTO ────────────────────────────────────────

export const boardMemberDtoSchema = z.object({
  groupId: z.string().uuid(),
  title: z.string(),
  status: groupStatusSchema,
  position: z.number().int().nonnegative(),
});
export type BoardMemberDto = z.infer<typeof boardMemberDtoSchema>;

// ─── 管理输入 ────────────────────────────────────────────

const boardTitleSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(
    z
      .string()
      .min(1, "板块标题不能为空")
      .refine((s) => measureDisplayWidth(s) <= TITLE_MAX_WIDTH, {
        message: `板块标题显示宽度不能超过 ${String(TITLE_MAX_WIDTH)}`,
      }),
  );

export const boardCreateSchema = z.object({
  title: boardTitleSchema,
});
export type BoardCreateInput = z.infer<typeof boardCreateSchema>;

export const boardUpdateSchema = z.object({
  title: boardTitleSchema.optional(),
  isEnabled: z.boolean().optional(),
  sortMode: boardSortModeSchema.optional(),
  version: z.number().int().nonnegative("版本号必须是非负整数"),
});
export type BoardUpdateInput = z.infer<typeof boardUpdateSchema>;

export const boardReorderSchema = z.object({
  boardIds: z.array(z.string().uuid()).min(1, "板块列表不能为空"),
});
export type BoardReorderInput = z.infer<typeof boardReorderSchema>;

export const boardMemberAddSchema = z.object({
  groupId: z.string().uuid(),
});
export type BoardMemberAddInput = z.infer<typeof boardMemberAddSchema>;

export const boardMemberMoveSchema = z.object({
  direction: z.enum(["up", "down"]),
});
export type BoardMemberMoveInput = z.infer<typeof boardMemberMoveSchema>;

// ─── 响应 ────────────────────────────────────────────────

export const adminBoardListResponseSchema = z.object({
  boards: z.array(boardDtoSchema),
});

export const publicBoardsResponseSchema = z.object({
  boards: z.array(boardWithGroupsSchema),
});

export const boardMemberListResponseSchema = z.object({
  members: z.array(boardMemberDtoSchema),
});
