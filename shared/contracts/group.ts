import { z } from "zod";
import { groupKindSchema, groupStatusSchema, joinMethodSchema } from "../domain/group";

// ─── 公开群聊 DTO ────────────────────────────────────────
//
// 禁止包含：联系方式、审核备注、软删除字段、
//           R2 对象 key、投票者 hash、内部版本号

const publicJoinMethodSchema = z.object({
  type: joinMethodSchema,
  /** group_number 类型的群号 */
  value: z.string().optional(),
  /** url 类型的 HTTPS 链接 */
  url: z.string().url().optional(),
  /** qr_code 类型的展示 URL（阶段开关控制是否返回） */
  qrCodeUrl: z.string().optional(),
});

export const publicGroupDtoSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    description: z.string(),
    kind: groupKindSchema,
    platform: z.string(),
    tags: z.array(z.string()),
    status: groupStatusSchema,
    logoUrl: z.string().nullable(),
    logoMeta: z
      .object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        byteLength: z.number().int().positive(),
      })
      .nullable(),
    joinMethods: z.array(publicJoinMethodSchema),
    likeCount: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type PublicGroupDto = z.infer<typeof publicGroupDtoSchema>;

// ─── 管理员群聊 DTO ──────────────────────────────────────
//
// 公开字段超集 + 管理私有字段

export const adminGroupDtoSchema = publicGroupDtoSchema.extend({
  /** 提交者联系方式（仅管理员可见） */
  submissionContact: z.string().nullable(),
  /** 审核备注（仅管理员可见） */
  auditNotes: z.string().nullable(),
  /** 软删除时间 */
  deletedAt: z.string().datetime().nullable(),
  /** 永久删除进度 */
  deleteProgress: z.enum(["none", "pending", "r2_done"]).nullable(),
  /** R2 Logo 对象 key */
  logoR2Key: z.string().nullable(),
  /** 乐观锁版本号 */
  version: z.number().int().nonnegative(),
});
export type AdminGroupDto = z.infer<typeof adminGroupDtoSchema>;

// ─── 管理员列表查询与响应 ────────────────────────────────

/** 管理员可排序字段 */
export const adminSortFieldSchema = z.enum([
  "title",
  "kind",
  "status",
  "platform",
  "tags",
  "likeCount",
]);
export type AdminSortField = z.infer<typeof adminSortFieldSchema>;

export const adminSortDirSchema = z.enum(["asc", "desc"]);
export type AdminSortDir = z.infer<typeof adminSortDirSchema>;

/**
 * 管理员列表查询参数。
 *
 * 正常模式：statuses 包含 1–4 个业务状态，deleted 为 false（或未传递）。
 * 回收站模式：statuses 为空，deleted 为 true。
 * 两者同时出现或正常模式 statuses 为空 → VALIDATION_FAILED。
 */
export const adminGroupListQuerySchema = z
  .object({
    /** 业务状态筛选（可重复的 status 参数），回收站模式为空 */
    statuses: z.array(groupStatusSchema).optional().default([]),
    /** 回收站模式 */
    deleted: z.coerce.boolean().optional().default(false),
    /** 搜索词（标题、简介、标签子串匹配） */
    q: z.string().optional(),
    /** 排序字段，默认 created_at */
    sortBy: adminSortFieldSchema.optional(),
    /** 排序方向，默认 desc */
    sortDir: adminSortDirSchema.optional().default("desc"),
    /** 不透明游标 */
    cursor: z.string().nullable().optional().default(null),
    /** 每页条数，默认 50，最多 200 */
    limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  })
  .refine(
    (data) => {
      // 回收站模式：deleted=true，statuses 必须为空
      if (data.deleted) return data.statuses.length === 0;
      return true;
    },
    { message: "回收站模式不允许业务状态筛选", path: ["statuses"] },
  )
  .refine(
    (data) => {
      // 正常模式：deleted=false，statuses 至少 1 个
      if (!data.deleted) return data.statuses.length >= 1;
      return true;
    },
    { message: "正常模式至少选择一个业务状态", path: ["statuses"] },
  );
export type AdminGroupListQuery = z.infer<typeof adminGroupListQuerySchema>;

/** 管理员列表响应 */
export const adminGroupListResponseSchema = z.object({
  items: z.array(adminGroupDtoSchema),
  total: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
});
export type AdminGroupListResponse = z.infer<typeof adminGroupListResponseSchema>;
