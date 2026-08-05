import { z } from "zod";
import { assetPurposeSchema } from "../domain/group";

export type AssetPurpose = z.infer<typeof assetPurposeSchema>;

/** 浏览器读取原图的上限；服务端不会把它当作最终资源上限。 */
export const ASSET_SOURCE_MAX_BYTES = 5 * 1024 * 1024;

/** 管理资源 multipart 请求的总字节上限，必须大于二维码最终字节上限及表单边界开销。 */
export const ASSET_UPLOAD_REQUEST_MAX_BYTES = 1_200 * 1024;

/** 按用途定义最终资源 MIME，避免二维码继续复用头像的 PNG 契约。 */
export const ASSET_CONTENT_TYPES = {
  logo: "image/png",
  qr_code: "image/jpeg",
} as const;

export const ASSET_FILE_EXTENSIONS = {
  logo: "png",
  qr_code: "jpg",
} as const;

export function getAssetContentType(purpose: AssetPurpose): AssetContentType {
  return ASSET_CONTENT_TYPES[purpose];
}

export function getAssetFileExtension(purpose: AssetPurpose): AssetFileExtension {
  return ASSET_FILE_EXTENSIONS[purpose];
}

export type AssetContentType = (typeof ASSET_CONTENT_TYPES)[AssetPurpose];
export type AssetFileExtension = (typeof ASSET_FILE_EXTENSIONS)[AssetPurpose];

export const ASSET_POLICIES = {
  logo: {
    purpose: "logo",
    maxBytes: 128 * 1024,
    maxDimension: 128,
    maxPixels: 128 * 128,
    preserveAlpha: true,
    opaque: false,
  },
  qr_code: {
    purpose: "qr_code",
    maxBytes: 1024 * 1024,
    maxDimension: 1024,
    maxPixels: 1024 * 1024,
    preserveAlpha: false,
    opaque: true,
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
  }
>;

export const assetPurposePolicySchema = z.object({
  purpose: assetPurposeSchema,
  maxBytes: z.number().int().positive(),
  maxDimension: z.number().int().positive(),
  maxPixels: z.number().int().positive(),
  preserveAlpha: z.boolean(),
  opaque: z.boolean(),
});

export type AssetPurposePolicy = (typeof ASSET_POLICIES)[AssetPurpose];

export function getAssetPolicy(purpose: AssetPurpose): AssetPurposePolicy {
  return ASSET_POLICIES[purpose];
}

// ─── 资源上传元数据 ──────────────────────────────────────

export const assetUploadMetaSchema = z
  .object({
    purpose: assetPurposeSchema,
    contentType: z.enum(["image/png", "image/jpeg"]),
    byteLength: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .superRefine((value, ctx) => {
    if (value.contentType !== getAssetContentType(value.purpose)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contentType"],
        message: "资源 MIME 与用途不匹配。",
      });
    }
  });
export type AssetUploadMeta = z.infer<typeof assetUploadMetaSchema>;

// ─── Logo 上传限制和压缩参数 ───────────────────────────────────────

export const LOGO_CODE_MAX_BYTES = ASSET_SOURCE_MAX_BYTES;
export const LOGO_MAX_BYTES = ASSET_POLICIES.logo.maxBytes;
export const LOGO_MAX_DIMENSION = ASSET_POLICIES.logo.maxDimension;
export const LOGO_MAX_PIXELS = ASSET_POLICIES.logo.maxPixels;

// ─── 二维码上传限制和压缩参数 ───────────────────────────────────────

export const QR_CODE_MAX_BYTES = ASSET_SOURCE_MAX_BYTES;
export const QR_CODE_TARGET_BYTES = ASSET_POLICIES.qr_code.maxBytes;
export const QR_CODE_MAX_DIMENSION = ASSET_POLICIES.qr_code.maxDimension;
export const QR_CODE_MAX_PIXELS = ASSET_POLICIES.qr_code.maxPixels;

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

// ─── 公开资源 URL ────────────────────────────────────────

const ASSET_ROUTE_PREFIX = "/api/v1/assets/";

/**
 * 资源 URL 可以来自自定义 HTTP(S) 域名，也可以是当前 Worker 的同源路由。
 * 同源路径只允许资源路由本身，避免把任意相对路径或不安全协议写入 DTO。
 */
export const assetPublicUrlSchema = z.string().refine(
  (value) => {
    if (value.startsWith(ASSET_ROUTE_PREFIX)) {
      return value.length > ASSET_ROUTE_PREFIX.length && !/[?#]/.test(value);
    }

    try {
      const url = new URL(value);
      return (
        (url.protocol === "http:" || url.protocol === "https:") &&
        url.hostname.length > 0 &&
        url.username.length === 0 &&
        url.password.length === 0
      );
    } catch {
      return false;
    }
  },
  { message: "资源 URL 必须是 HTTP(S) 地址或 /api/v1/assets/ 同源路径。" },
);

// ─── 资源信息（上传响应） ──────────────────────────────────

const assetInfoBaseSchema = z.object({
  id: z.string().uuid(),
  purpose: assetPurposeSchema,
  r2Key: z.string(),
  contentType: z.enum(["image/png", "image/jpeg"]),
  byteLength: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  status: z.enum(["staged", "ready", "delete_pending", "delete_failed"]),
  publicUrl: assetPublicUrlSchema,
});

function refineAssetPurposeContentType<T extends z.AnyZodObject>(schema: T): z.ZodEffects<T> {
  return schema.superRefine((value, ctx) => {
    if (value.contentType !== getAssetContentType(value.purpose as AssetPurpose)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contentType"],
        message: "资源 MIME 与用途不匹配。",
      });
    }
  });
}

export const assetInfoSchema = refineAssetPurposeContentType(assetInfoBaseSchema);
export type AssetInfo = z.infer<typeof assetInfoSchema>;

// ─── 管理员资源 DTO ───────────────────────────────────────

export const adminAssetDtoSchema = refineAssetPurposeContentType(
  assetInfoBaseSchema.extend({
    refCount: z.number().int().nonnegative(),
    deleteAttempts: z.number().int().nonnegative(),
    deleteLastError: z.string().nullable(),
    deleteLastErrorCode: z.string().nullable(),
    createdAt: z.string().datetime(),
  }),
);
export type AdminAssetDto = z.infer<typeof adminAssetDtoSchema>;

// ─── 公开资源展示信息 ─────────────────────────────────────

export const publicAssetMetaSchema = z.object({
  url: assetPublicUrlSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  byteLength: z.number().int().positive(),
});
export type PublicAssetMeta = z.infer<typeof publicAssetMetaSchema>;
