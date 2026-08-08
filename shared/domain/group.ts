import { z } from "zod";

// ─── 群聊性质 ────────────────────────────────────────────
// 性质由站点配置提供前端候选项，但 API/D1 保持开放文本，便于历史数据和
// 受信任管理工具使用自定义性质。网络边界统一限制为空值和异常长文本。
export const groupKindSchema = z
  .string()
  .min(1, "群组性质不能为空")
  .max(50, "群组性质不能超过 50 个字符")
  .refine((value) => value.trim().length > 0, "群组性质不能只包含空白字符");
export type GroupKind = z.infer<typeof groupKindSchema>;

// ─── 业务状态 ────────────────────────────────────────────
export const groupStatusSchema = z.enum(["pending", "published", "rejected", "delisted"]);
export type GroupStatus = z.infer<typeof groupStatusSchema>;

// ─── 加群方式 ────────────────────────────────────────────
export const joinMethodSchema = z.enum(["group_number", "url", "qr_code"]);
export type JoinMethod = z.infer<typeof joinMethodSchema>;

// ─── 资源用途 ────────────────────────────────────────────
export const assetPurposeSchema = z.enum(["logo", "qr_code"]);
export type AssetPurpose = z.infer<typeof assetPurposeSchema>;
