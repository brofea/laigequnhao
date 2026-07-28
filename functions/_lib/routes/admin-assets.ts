import { Hono } from "hono";
import { assetInfoSchema } from "@shared/contracts/asset";
import { apiSuccessSchema, apiErrorSchema } from "@shared/contracts/api";
import { createR2Adapter } from "../adapters/r2-adapter";
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

/** POST /admin/assets — 上传资源 */
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
        error: { code: "PAYLOAD_TOO_LARGE", message: `File exceeds ${maxBytes} bytes.` },
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
        error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Not a valid WebP file." },
        requestId,
      }),
      415,
    );
  }

  const key = `${purpose}/${crypto.randomUUID()}.webp`;
  const adapter = createR2Adapter(c.env.R2, c.env);
  await adapter.upload(key, buffer.buffer);

  // 写入 D1
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO assets (id, r2_key, purpose, content_type, byte_length, width, height) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, key, purpose, "image/webp", byteLength, width, height)
    .run();

  // 如果关联群聊，更新群聊的 Logo 字段
  if (groupId && purpose === "logo") {
    const publicUrl = adapter.getPublicUrl(key);
    await c.env.DB.prepare(
      "UPDATE groups SET logo_r2_key = ?, logo_url = ?, logo_width = ?, logo_height = ?, logo_byte_length = ?, updated_at = ? WHERE id = ?",
    )
      .bind(key, publicUrl, width, height, byteLength, new Date().toISOString(), groupId)
      .run();
  }

  return c.json(
    apiSuccessSchema(assetInfoSchema).parse({
      ok: true,
      data: {
        id,
        purpose,
        r2Key: key,
        contentType: "image/webp" as const,
        byteLength,
        width,
        height,
      },
      requestId,
    }),
    201,
  );
});

/** DELETE /admin/assets/:id — 删除资源 */
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

  const row = await c.env.DB.prepare("SELECT r2_key FROM assets WHERE id = ?")
    .bind(id)
    .first<{ r2_key: string }>();
  if (!row) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "NOT_FOUND", message: "Asset not found." },
        requestId,
      }),
      404,
    );
  }

  const adapter = createR2Adapter(c.env.R2, c.env);
  await adapter.delete(row.r2_key);
  await c.env.DB.prepare("DELETE FROM assets WHERE id = ?").bind(id).run();

  return c.json(apiSuccessSchema(assetInfoSchema).parse({ ok: true, data: { id }, requestId }));
});
