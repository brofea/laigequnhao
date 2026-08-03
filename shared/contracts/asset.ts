import { z } from "zod";
import { assetPurposeSchema } from "../domain/group";

export type AssetPurpose = z.infer<typeof assetPurposeSchema>;

/** 浏览器读取原图的上限；服务端不会把它当作最终资源上限。 */
export const ASSET_SOURCE_MAX_BYTES = 5 * 1024 * 1024;

/** 管理资源 multipart 请求的总字节上限，必须大于二维码最终字节上限及表单边界开销。 */
export const ASSET_UPLOAD_REQUEST_MAX_BYTES = 512 * 1024;

export const ASSET_POLICIES = {
  logo: {
    purpose: "logo",
    maxBytes: 80 * 1024,
    maxDimension: 128,
    maxPixels: 128 * 128,
    preserveAlpha: true,
    opaque: false,
    startQuality: 85,
    minQuality: 45,
    qualityStep: 20,
  },
  qr_code: {
    purpose: "qr_code",
    maxBytes: 400 * 1024,
    maxDimension: 1024,
    maxPixels: 1024 * 1024,
    preserveAlpha: false,
    opaque: true,
    startQuality: 95,
    minQuality: 55,
    qualityStep: 10,
  },
} as const satisfies Record<
  AssetPurpose,
  {
    purpose: AssetPurpose;
    maxBytes: number;
    maxDimension: number;
    maxPixels: number;
    preserveAlpha: boolean;
    opaque: boolean;
    startQuality: number;
    minQuality: number;
    qualityStep: number;
  }
>;

export const assetPurposePolicySchema = z.object({
  purpose: assetPurposeSchema,
  maxBytes: z.number().int().positive(),
  maxDimension: z.number().int().positive(),
  maxPixels: z.number().int().positive(),
  preserveAlpha: z.boolean(),
  opaque: z.boolean(),
  startQuality: z.number().int().min(1).max(100),
  minQuality: z.number().int().min(1).max(100),
  qualityStep: z.number().int().positive(),
});

export type AssetPurposePolicy = (typeof ASSET_POLICIES)[AssetPurpose];

export function getAssetPolicy(purpose: AssetPurpose): AssetPurposePolicy {
  return ASSET_POLICIES[purpose];
}

// ─── 资源上传元数据 ──────────────────────────────────────

export const assetUploadMetaSchema = z.object({
  purpose: assetPurposeSchema,
  contentType: z.literal("image/webp"),
  byteLength: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type AssetUploadMeta = z.infer<typeof assetUploadMetaSchema>;

// ─── Logo 上传限制和压缩参数 ───────────────────────────────────────

export const LOGO_CODE_MAX_BYTES = ASSET_SOURCE_MAX_BYTES;
export const LOGO_MAX_BYTES = ASSET_POLICIES.logo.maxBytes;
export const LOGO_MAX_DIMENSION = ASSET_POLICIES.logo.maxDimension;
export const LOGO_MAX_PIXELS = ASSET_POLICIES.logo.maxPixels;
export const LOGO_START_QUALITY = ASSET_POLICIES.logo.startQuality;
export const LOGO_MIN_QUALITY = ASSET_POLICIES.logo.minQuality;
export const LOGO_QUALITY_STEP = ASSET_POLICIES.logo.qualityStep;

// ─── 二维码上传限制和压缩参数 ───────────────────────────────────────

export const QR_CODE_MAX_BYTES = ASSET_SOURCE_MAX_BYTES;
export const QR_CODE_TARGET_BYTES = ASSET_POLICIES.qr_code.maxBytes;
export const QR_CODE_MAX_DIMENSION = ASSET_POLICIES.qr_code.maxDimension;
export const QR_CODE_MAX_PIXELS = ASSET_POLICIES.qr_code.maxPixels;
export const QR_START_QUALITY = ASSET_POLICIES.qr_code.startQuality;
export const QR_MIN_QUALITY = ASSET_POLICIES.qr_code.minQuality;
export const QR_QUALITY_STEP = ASSET_POLICIES.qr_code.qualityStep;

export const assetUploadLimitsSchema = z.union([
  z.object({
    purpose: z.literal("logo"),
    byteLength: z.number().int().positive().max(LOGO_MAX_BYTES),
    width: z.number().int().positive().max(LOGO_MAX_DIMENSION),
    height: z.number().int().positive().max(LOGO_MAX_DIMENSION),
    pixelCount: z.number().int().positive().max(LOGO_MAX_PIXELS),
  }),
  z.object({
    purpose: z.literal("qr_code"),
    byteLength: z.number().int().positive().max(QR_CODE_TARGET_BYTES),
    width: z.number().int().positive().max(QR_CODE_MAX_DIMENSION),
    height: z.number().int().positive().max(QR_CODE_MAX_DIMENSION),
    pixelCount: z.number().int().positive().max(QR_CODE_MAX_PIXELS),
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
