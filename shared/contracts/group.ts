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
