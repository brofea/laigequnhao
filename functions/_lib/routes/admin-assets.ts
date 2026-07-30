import { Hono } from "hono";
import { assetInfoSchema, LOGO_MAX_BYTES, QR_CODE_TARGET_BYTES } from "@shared/contracts/asset";
import { apiSuccessSchema, apiErrorSchema } from "@shared/contracts/api";
import { createAssetService } from "../services/asset-service";
import { authRequired, csrfProtection } from "../middleware/auth";
import type { Env } from "../env";

type Vars = { requestId: string; sessionId: string };
export const adminAssetsRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

adminAssetsRoute.use("*", authRequired());

/** 验证 WebP 文件签名 (RIFF .... WEBP) */
function isValidWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 && // "RIFF"
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50 // "WEBP"
  );
}

/** 从 WebP 字节数据中解析宽度和高度。返回 null 表示无法解析。 */
function parseWebpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 30) return null;

  // 读取 4 字节 chunk header (offset 12-15)
  const chunkHeader = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);

  if (chunkHeader === "VP8X") {
    // Extended WebP: width-1 at bytes 24-26 (24-bit LE), height-1 at bytes 27-29
    const w = bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16);
    const h = bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16);
    return { width: w + 1, height: h + 1 };
  }

  if (chunkHeader === "VP8 ") {
    // Lossy WebP: width at bytes 26-27 (16-bit LE), height at bytes 28-29
    const w = bytes[26]! | (bytes[27]! << 8);
    const h = bytes[28]! | (bytes[29]! << 8);
    return { width: w & 0x3fff, height: h & 0x3fff };
  }

  if (chunkHeader === "VP8L") {
    // Lossless WebP: 5 bytes at offset 21-25 contain the bitstream header
    // Byte layout (little-endian 32-bit): bits 0-13=width-1, bits 14-27=height-1, bit 28=alpha
    const b0 = bytes[21]!;
    const b1 = bytes[22]!;
    const b2 = bytes[23]!;
    const b3 = bytes[24]!;
    const bits = b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
    const width = (bits & 0x3fff) + 1; // bits 0-13
    const height = ((bits >> 14) & 0x3fff) + 1; // bits 14-27
    return { width, height };
  }

  return null;
}

/** POST /admin/assets — 上传资源（返回 staged asset） */
adminAssetsRoute.post("/assets", csrfProtection(), async (c) => {
  const requestId = c.get("requestId");
  const formData = await c.req.formData();

  const file = formData.get("file") as File | null;
  const purpose = formData.get("purpose") as string | null;

  if (!file || !purpose) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "VALIDATION_FAILED", message: "缺少文件或资源用途。" },
        requestId,
      }),
      400,
    );
  }
  if (purpose !== "logo" && purpose !== "qr_code") {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "VALIDATION_FAILED", message: "资源用途无效。" },
        requestId,
      }),
      400,
    );
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const actualByteLength = buffer.byteLength;

  // 使用实际文件大小校验（不信任客户端提交的 byteLength）
  const maxBytes = purpose === "logo" ? LOGO_MAX_BYTES : QR_CODE_TARGET_BYTES;
  if (actualByteLength > maxBytes) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: `文件大小 ${actualByteLength} 字节，超过 ${maxBytes} 字节限制。`,
        },
        requestId,
      }),
      413,
    );
  }

  if (!isValidWebp(buffer)) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "文件不是有效的 WebP 图片。",
        },
        requestId,
      }),
      415,
    );
  }

  // 从实际文件数据解析宽高（不信任客户端提交的 width/height）
  const dims = parseWebpDimensions(buffer);
  if (!dims || dims.width < 1 || dims.height < 1 || dims.width > 4096 || dims.height > 4096) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "无法从文件中识别有效的图片尺寸。",
        },
        requestId,
      }),
      400,
    );
  }

  const assetService = createAssetService(c.env.DB, c.env.R2, c.env);
  const asset = await assetService.uploadStaged(buffer.buffer, purpose as "logo" | "qr_code", {
    width: dims.width,
    height: dims.height,
    byteLength: actualByteLength,
  });

  c.header("Cache-Control", "no-store");
  return c.json(
    apiSuccessSchema(assetInfoSchema).parse({
      ok: true,
      data: asset,
      requestId,
    }),
    201,
  );
});

/** DELETE /admin/assets/:id?mode=purge — 只清理未被聚合保存采用的 staged 资源 */
adminAssetsRoute.delete("/assets/:id", csrfProtection(), async (c) => {
  const requestId = c.get("requestId");
  const id = c.req.param("id");
  const mode = c.req.query("mode");

  if (!id) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "NOT_FOUND", message: "Asset not found." },
        requestId,
      }),
      404,
    );
  }

  const assetService = createAssetService(c.env.DB, c.env.R2, c.env);

  // 检查 asset 是否存在
  const existing = await assetService.getById(id);
  if (!existing) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "NOT_FOUND", message: "Asset not found." },
        requestId,
      }),
      404,
    );
  }

  if (mode !== "purge") {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: "STATE_CONFLICT",
          message: "Asset references can only be changed by saving the owning group aggregate.",
        },
        requestId,
      }),
      409,
    );
  }

  // 强制清理仅限 staged 资源（未被任何群组引用）
  if (existing.status !== "staged") {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: "STATE_CONFLICT",
          message: `Cannot purge asset in '${existing.status}' state. Only staged assets can be purged.`,
        },
        requestId,
      }),
      409,
    );
  }

  // 再次确认没有被 join_methods 引用
  const refs = await assetService.countExternalRefs(id);
  if (refs > 0) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: "STATE_CONFLICT",
          message: "Asset is still referenced by join_methods.",
        },
        requestId,
      }),
      409,
    );
  }

  // 原子切换为 delete_pending（带状态条件）
  const result = await c.env.DB.prepare(
    "UPDATE assets SET status = 'delete_pending', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND status = 'staged'",
  )
    .bind(id)
    .run();

  if (result.meta.changes === 0) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: "STATE_CONFLICT",
          message: "Asset status changed concurrently.",
        },
        requestId,
      }),
      409,
    );
  }

  // 删除 R2 对象 + D1 行
  const r2Deleted = await assetService.deleteIfUnreferenced(id);
  if (!r2Deleted) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: "DEPENDENCY_UNAVAILABLE",
          message: "R2 cleanup failed. Asset marked for retry.",
        },
        requestId,
      }),
      502,
    );
  }

  return c.json({ ok: true, data: { id }, requestId });
});

/** POST /admin/assets/cleanup — 清理过期 staged 和重试 failed deletes */
adminAssetsRoute.post("/assets/cleanup", csrfProtection(), async (c) => {
  const requestId = c.get("requestId");
  const assetService = createAssetService(c.env.DB, c.env.R2, c.env);
  const stagedCleaned = await assetService.cleanupStaged(30);
  const failedRetried = await assetService.retryFailedDeletes();
  return c.json({
    ok: true,
    data: { stagedCleaned, failedRetried },
    requestId,
  });
});
