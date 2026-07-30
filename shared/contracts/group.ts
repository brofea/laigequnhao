import { z } from "zod";
import { groupKindSchema, groupStatusSchema, joinMethodSchema } from "../domain/group";

// ─── 公开群聊 DTO ────────────────────────────────────────
//
// 禁止包含：联系方式、审核备注、软删除字段、
//           R2 对象 key、投票者 hash、内部版本号、asset ID

const publicJoinMethodSchema = z.object({
  type: joinMethodSchema,
  /** group_number 类型的群号 */
  value: z.string().optional(),
  /** url 类型的 HTTPS 链接 */
  url: z.string().url().optional(),
  /** qr_code 类型的展示 URL（始终公开，从 asset 引用解析） */
  qrCodeUrl: z.string().optional(),
  /** qr_code 展示元数据（宽高、体积），来自 asset 引用 */
  qrCodeMeta: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      byteLength: z.number().int().positive(),
    })
    .optional(),
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

const adminJoinMethodSchema = publicJoinMethodSchema.extend({
  /** 关联的 asset ID（qr_code 类型时指向 assets 表） */
  assetId: z.string().uuid().nullable().optional(),
  /** asset 的公开 URL（从 asset 引用计算，非 DB 直存） */
  assetUrl: z.string().nullable().optional(),
  /** asset 宽度 */
  assetWidth: z.number().int().positive().nullable().optional(),
  /** asset 高度 */
  assetHeight: z.number().int().positive().nullable().optional(),
  /** asset 字节数 */
  assetByteLength: z.number().int().positive().nullable().optional(),
  /** asset 生命周期状态 */
  assetStatus: z.enum(["staged", "ready", "delete_pending", "delete_failed"]).nullable().optional(),
});

export const adminGroupDtoSchema = publicGroupDtoSchema.extend({
  joinMethods: z.array(adminJoinMethodSchema),
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

// ─── 管理员创建/更新输入 ─────────────────────────────────

/** 加群方式输入（判别联合） */
export const joinMethodInputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("group_number"),
    value: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().min(1, "群号不能为空")),
    sortOrder: z.number().int().min(0),
  }),
  z.object({
    type: z.literal("url"),
    url: z.string().url().startsWith("https://", "链接必须以 https:// 开头"),
    sortOrder: z.number().int().min(0),
  }),
  z.object({
    type: z.literal("qr_code"),
    assetId: z.string().uuid("请上传有效的二维码图片"),
    sortOrder: z.number().int().min(0),
  }),
]);
export type JoinMethodInput = z.infer<typeof joinMethodInputSchema>;

/** 群组创建输入 */
export const groupCreateSchema = z
  .object({
    title: z.string().min(1, "标题不能为空").max(200),
    description: z.string().max(2000).optional().default(""),
    kind: groupKindSchema,
    platform: z.string().min(1, "平台不能为空"),
    status: groupStatusSchema,
    tags: z
      .array(z.string().transform((s) => s.trim()))
      .max(5, "最多 5 个标签")
      .optional()
      .default([]),
    joinMethods: z.array(joinMethodInputSchema).min(1, "至少需要一个加群方式"),
    auditNotes: z.string().max(2000).nullable().optional().default(null),
    /** Logo R2 key（上传后由服务端校验） */
    logoR2Key: z.string().nullable().optional(),
    /** 需要 adopt 的 staged asset ID 列表 */
    adoptAssetIds: z.array(z.string()).optional(),
  })
  .refine(
    (data) => {
      // 拒绝空标签（trim 后为空字符串）
      for (const tag of data.tags) {
        if (!tag) return false;
      }
      // 大小写不敏感去重
      const seen = new Set<string>();
      for (const tag of data.tags) {
        if (seen.has(tag.toLowerCase())) return false;
        seen.add(tag.toLowerCase());
      }
      return true;
    },
    { message: "标签存在重复或空值（大小写不敏感）", path: ["tags"] },
  )
  .refine(
    (data) => {
      // joinMethods 不能有完全重复的项
      const keys = data.joinMethods.map((m) =>
        m.type === "group_number"
          ? `${m.type}:${m.value}`
          : m.type === "url"
            ? `${m.type}:${m.url}`
            : `${m.type}:${m.assetId}`,
      );
      return new Set(keys).size === keys.length;
    },
    { message: "加群方式存在完全重复的项", path: ["joinMethods"] },
  );
export type GroupCreateInput = z.infer<typeof groupCreateSchema>;

/** 群组更新输入 */
export const groupUpdateSchema = z
  .object({
    title: z.string().min(1, "标题不能为空").max(200).optional(),
    description: z.string().max(2000).optional(),
    kind: groupKindSchema.optional(),
    platform: z.string().min(1, "平台不能为空").optional(),
    status: groupStatusSchema.optional(),
    tags: z
      .array(z.string().transform((s) => s.trim()))
      .max(5, "最多 5 个标签")
      .optional(),
    joinMethods: z.array(joinMethodInputSchema).min(1, "至少需要一个加群方式").optional(),
    auditNotes: z.string().max(2000).nullable().optional(),
    /** Logo R2 key（上传后由服务端校验） */
    logoR2Key: z.string().nullable().optional(),
    /** 需要 adopt 的 staged asset ID 列表 */
    adoptAssetIds: z.array(z.string()).optional(),
    /** 乐观锁版本号（必传） */
    version: z.number().int().nonnegative("版本号必须是非负整数"),
  })
  .refine(
    (data) => {
      if (!data.tags) return true;
      // 拒绝空标签
      for (const tag of data.tags) {
        if (!tag) return false;
      }
      const seen = new Set<string>();
      for (const tag of data.tags) {
        if (seen.has(tag.toLowerCase())) return false;
        seen.add(tag.toLowerCase());
      }
      return true;
    },
    { message: "标签存在重复或空值（大小写不敏感）", path: ["tags"] },
  )
  .refine(
    (data) => {
      if (!data.joinMethods) return true;
      const keys = data.joinMethods.map((m) =>
        m.type === "group_number"
          ? `${m.type}:${m.value}`
          : m.type === "url"
            ? `${m.type}:${m.url}`
            : `${m.type}:${m.assetId}`,
      );
      return new Set(keys).size === keys.length;
    },
    { message: "加群方式存在完全重复的项", path: ["joinMethods"] },
  );
export type GroupUpdateInput = z.infer<typeof groupUpdateSchema>;
