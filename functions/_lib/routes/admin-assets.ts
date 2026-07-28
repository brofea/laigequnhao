import { Hono } from "hono";
import { assetInfoSchema } from "@shared/contracts/asset";
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

/** POST /admin/assets — 上传资源（返回 staged asset） */
adminAssetsRoute.post("/assets", csrfProtection(), async (c) => {
  const requestId = c.get("requestId");
  const formData = await c.req.formData();

  const file = formData.get("file") as File | null;
  const purpose = formData.get("purpose") as string | null;
  const width = Number(formData.get("width"));
  const height = Number(formData.get("height"));
  const byteLength = Number(formData.get("byteLength"));
  const groupId = formData.get("groupId") as string | null;

  if (!file || !purpose || !width || !height || !byteLength) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "VALIDATION_FAILED", message: "Missing fields." },
        requestId,
      }),
      400,
    );
  }
  if (purpose !== "logo" && purpose !== "qr_code") {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "VALIDATION_FAILED", message: "Invalid purpose." },
        requestId,
      }),
      400,
    );
  }

  const maxBytes = purpose === "logo" ? 100 * 1024 : 300 * 1024;
  if (byteLength > maxBytes) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: `File exceeds ${maxBytes} bytes.`,
        },
        requestId,
      }),
      413,
    );
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  if (!isValidWebp(buffer)) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "Not a valid WebP file.",
        },
        requestId,
      }),
      415,
    );
  }

  const assetService = createAssetService(c.env.DB, c.env.R2, c.env);
  const asset = await assetService.uploadStaged(buffer.buffer, purpose as "logo" | "qr_code", {
    width,
    height,
    byteLength,
  });

  // 如果关联群聊且是 logo，更新群聊 Logo 字段
  if (groupId && purpose === "logo") {
    const publicUrl = assetService.r2Adapter.getPublicUrl(asset.r2Key);
    await c.env.DB.prepare(
      "UPDATE groups SET logo_r2_key = ?, logo_url = ?, logo_width = ?, logo_height = ?, logo_byte_length = ?, updated_at = ? WHERE id = ?",
    )
      .bind(asset.r2Key, publicUrl, width, height, byteLength, new Date().toISOString(), groupId)
      .run();
  }

  return c.json(
    apiSuccessSchema(assetInfoSchema).parse({
      ok: true,
      data: asset,
      requestId,
    }),
    201,
  );
});

/** POST /admin/assets/:id/adopt — 采纳 staged asset → ready */
adminAssetsRoute.post("/assets/:id/adopt", csrfProtection(), async (c) => {
  const requestId = c.get("requestId");
  const id = c.req.param("id");
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
  await assetService.adopt(id);

  return c.json({ ok: true, data: { id }, requestId });
});

/** DELETE /admin/assets/:id — 解除引用并清理 */
adminAssetsRoute.delete("/assets/:id", csrfProtection(), async (c) => {
  const requestId = c.get("requestId");
  const id = c.req.param("id");
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

  // 解除引用（ref_count -1；归零则标记 delete_pending 并异步清理）
  await assetService.release(id);

  return c.json({ ok: true, data: { id }, requestId });
});
