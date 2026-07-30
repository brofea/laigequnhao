import { z } from "zod";
import { assetPurposeSchema } from "../domain/group";

// ─── 资源上传元数据 ──────────────────────────────────────

export const assetUploadMetaSchema = z.object({
  purpose: assetPurposeSchema,
  contentType: z.literal("image/webp"),
  byteLength: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type AssetUploadMeta = z.infer<typeof assetUploadMetaSchema>;

// ─── Logo 上传限制 ───────────────────────────────────────

export const LOGO_MAX_BYTES = 100 * 1024; // 100 KB
export const QR_CODE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB upload limit
export const QR_CODE_TARGET_BYTES = 300 * 1024; // 300 KB compression target
export const QR_CODE_MAX_DIMENSION = 1024; // 1024px longest edge

export const assetUploadLimitsSchema = z.union([
  z.object({
    purpose: z.literal("logo"),
    byteLength: z.number().int().max(LOGO_MAX_BYTES),
  }),
  z.object({
    purpose: z.literal("qr_code"),
    byteLength: z.number().int().max(QR_CODE_TARGET_BYTES),
  }),
]);

// ─── 资源信息（上传响应） ──────────────────────────────────

export const assetInfoSchema = z.object({
  id: z.string().uuid(),
  purpose: assetPurposeSchema,
  r2Key: z.string(),
  contentType: z.literal("image/webp"),
  byteLength: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  status: z.enum(["staged", "ready", "delete_pending", "delete_failed"]),
  publicUrl: z.string().url(),
});
export type AssetInfo = z.infer<typeof assetInfoSchema>;

// ─── 管理员资源 DTO ───────────────────────────────────────

export const adminAssetDtoSchema = assetInfoSchema.extend({
  refCount: z.number().int().nonnegative(),
  deleteAttempts: z.number().int().nonnegative(),
  deleteLastError: z.string().nullable(),
  deleteLastErrorCode: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type AdminAssetDto = z.infer<typeof adminAssetDtoSchema>;

// ─── 公开资源展示信息 ─────────────────────────────────────

export const publicAssetMetaSchema = z.object({
  url: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  byteLength: z.number().int().positive(),
});
export type PublicAssetMeta = z.infer<typeof publicAssetMetaSchema>;
