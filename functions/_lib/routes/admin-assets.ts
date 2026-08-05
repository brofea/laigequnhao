import { Hono } from "hono";
import type { Context } from "hono";
import {
  assetInfoSchema,
  ASSET_CONTENT_TYPE,
  ASSET_UPLOAD_REQUEST_MAX_BYTES,
} from "@shared/contracts/asset";
import { assetPurposeSchema } from "@shared/domain/group";
import { apiSuccessSchema, apiErrorSchema } from "@shared/contracts/api";
import { createAssetService } from "../services/asset-service";
import {
  ImageValidationError,
  isUploadBodyTooLarge,
  isUploadRequestTooLarge,
  validatePngUpload,
} from "../services/image-validation";
import { authRequired, csrfProtection } from "../middleware/auth";
import type { Env } from "../env";

type Vars = { requestId: string; sessionId: string };
type AssetContext = Context<{ Bindings: Env; Variables: Vars }>;
type UploadFile = { arrayBuffer: () => Promise<ArrayBuffer>; type?: string };
export const adminAssetsRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

adminAssetsRoute.use("*", authRequired());

function validationErrorResponse(c: AssetContext, error: ImageValidationError) {
  return c.json(
    apiErrorSchema.parse({
      ok: false,
      error: { code: error.code, message: error.message },
      requestId: c.get("requestId"),
    }),
    error.status,
  );
}

/** POST /admin/assets — 上传资源（返回 staged asset） */
adminAssetsRoute.post("/assets", csrfProtection(), async (c) => {
  const requestId = c.get("requestId");

  if (isUploadRequestTooLarge(c.req.header("Content-Length") ?? null)) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: `multipart 请求不得超过 ${ASSET_UPLOAD_REQUEST_MAX_BYTES} 字节。`,
        },
        requestId,
      }),
      413,
    );
  }

  const contentType = c.req.header("Content-Type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "VALIDATION_FAILED", message: "资源上传必须使用 multipart/form-data。" },
        requestId,
      }),
      400,
    );
  }

  let rawBody: ArrayBuffer;
  try {
    rawBody = await c.req.raw.clone().arrayBuffer();
  } catch {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "无法读取 multipart 请求。",
        },
        requestId,
      }),
      400,
    );
  }

  if (isUploadBodyTooLarge(rawBody.byteLength)) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: `multipart 请求不得超过 ${ASSET_UPLOAD_REQUEST_MAX_BYTES} 字节。`,
        },
        requestId,
      }),
      413,
    );
  }

  let formData: FormData;
  try {
    const parserRequest = new Request(c.req.raw.url, {
      method: c.req.raw.method,
      headers: c.req.raw.headers,
      body: rawBody,
    });
    formData = await parserRequest.formData();
  } catch {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "multipart 请求格式无效。",
        },
        requestId,
      }),
      400,
    );
  }

  const fileEntries = formData.getAll("file");
  const fileEntry: unknown = fileEntries.length === 1 ? fileEntries[0] : null;
  const purposeResult = assetPurposeSchema.safeParse(formData.get("purpose"));
  const file =
    typeof fileEntry === "object" &&
    fileEntry !== null &&
    "arrayBuffer" in fileEntry &&
    typeof fileEntry.arrayBuffer === "function"
      ? (fileEntry as UploadFile)
      : null;
  if (!file || !purposeResult.success) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "VALIDATION_FAILED", message: "缺少文件或资源用途。" },
        requestId,
      }),
      400,
    );
  }

  if (file.type?.toLowerCase() !== ASSET_CONTENT_TYPE) {
    return validationErrorResponse(
      c,
      new ImageValidationError("UNSUPPORTED_MEDIA_TYPE", 415, "文件 MIME 类型必须是 image/png。"),
    );
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const validated = validatePngUpload(bytes, purposeResult.data);
    const assetService = createAssetService(c.env.DB, c.env.R2, c.env);
    const asset = await assetService.uploadStaged(validated);

    c.header("Cache-Control", "no-store");
    return c.json(
      apiSuccessSchema(assetInfoSchema).parse({
        ok: true,
        data: asset,
        requestId,
      }),
      201,
    );
  } catch (error) {
    if (error instanceof ImageValidationError) {
      return validationErrorResponse(c, error);
    }
    throw error;
  }
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
