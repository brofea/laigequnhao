import { createR2Adapter, type R2Adapter } from "../adapters/r2-adapter";
import type { Env } from "../env";
import { ASSET_CONTENT_TYPE, type AdminAssetDto, type AssetInfo } from "@shared/contracts/asset";
import type { ValidatedImageUpload } from "./image-validation";

// ─── 内部行类型 ──────────────────────────────────────────

interface AssetRow {
  id: string;
  r2_key: string;
  purpose: string;
  content_type: string;
  byte_length: number;
  width: number;
  height: number;
  status: string;
  ref_count: number;
  delete_attempts: number;
  delete_last_error: string | null;
  delete_last_error_code: string | null;
  created_at: string;
  updated_at: string;
}

function mapToAdminDto(row: AssetRow, publicUrl: string): AdminAssetDto {
  return {
    id: row.id,
    purpose: row.purpose as AdminAssetDto["purpose"],
    r2Key: row.r2_key,
    contentType: ASSET_CONTENT_TYPE,
    byteLength: row.byte_length,
    width: row.width,
    height: row.height,
    status: row.status as AdminAssetDto["status"],
    refCount: row.ref_count,
    deleteAttempts: row.delete_attempts,
    deleteLastError: row.delete_last_error,
    deleteLastErrorCode: row.delete_last_error_code,
    createdAt: row.created_at,
    publicUrl,
  };
}

// ─── Asset Service ───────────────────────────────────────

export function createAssetService(
  db: D1Database,
  r2: R2Bucket,
  env: Env,
  adapterOverride?: R2Adapter,
) {
  const r2Adapter = adapterOverride ?? createR2Adapter(r2, env);

  return {
    /**
     * 先写入 D1 staged 行，再上传 R2。
     * 这样任何 R2 部分失败都有可追踪的 D1 记录，可由 cleanup 重试。
     */
    async uploadStaged(
      uploadOrBuffer: ValidatedImageUpload | ArrayBuffer,
      purpose?: "logo" | "qr_code",
      legacyMeta?: { width: number; height: number; byteLength: number },
    ): Promise<AssetInfo> {
      const isValidatedUpload = (
        value: ValidatedImageUpload | ArrayBuffer,
      ): value is ValidatedImageUpload => {
        if (!(typeof value === "object" && value !== null && "bytes" in value)) return false;
        const candidate = value as {
          bytes: unknown;
          purpose?: unknown;
          width?: unknown;
          height?: unknown;
          byteLength?: unknown;
        };
        return (
          candidate.bytes instanceof Uint8Array &&
          typeof candidate.purpose === "string" &&
          typeof candidate.width === "number" &&
          typeof candidate.height === "number" &&
          typeof candidate.byteLength === "number"
        );
      };

      let bytes: Uint8Array;
      let uploadPurpose: "logo" | "qr_code";
      let width: number;
      let height: number;

      if (isValidatedUpload(uploadOrBuffer)) {
        bytes = uploadOrBuffer.bytes;
        uploadPurpose = uploadOrBuffer.purpose;
        width = uploadOrBuffer.width;
        height = uploadOrBuffer.height;
        if (uploadOrBuffer.byteLength !== bytes.byteLength) {
          throw new AssetServiceError("VALIDATION_FAILED", "Asset byte length is inconsistent.");
        }
      } else {
        if (!purpose || !legacyMeta) {
          throw new AssetServiceError("VALIDATION_FAILED", "Asset upload metadata is required.");
        }
        bytes = new Uint8Array(uploadOrBuffer);
        uploadPurpose = purpose;
        width = legacyMeta.width;
        height = legacyMeta.height;
        if (legacyMeta.byteLength !== bytes.byteLength) {
          throw new AssetServiceError("VALIDATION_FAILED", "Asset byte length is inconsistent.");
        }
      }

      const byteLength = bytes.byteLength;
      const id = crypto.randomUUID();
      const key = `${uploadPurpose}/${id}.png`;

      // 1. 先写 D1 staged 行，避免出现无法追踪的 R2 孤儿。
      try {
        await db
          .prepare(
            `INSERT INTO assets (id, r2_key, purpose, content_type, byte_length, width, height, status)
             VALUES (?, ?, ?, 'image/png', ?, ?, ?, 'staged')`,
          )
          .bind(id, key, uploadPurpose, byteLength, width, height)
          .run();
      } catch {
        throw new AssetServiceError("D1_WRITE_FAILED", "Failed to save asset metadata.");
      }

      // 2. 上传 R2；失败时保留可重试状态。
      try {
        // Copy the view so a caller cannot accidentally upload bytes outside
        // the validated Uint8Array slice.
        await r2Adapter.upload(key, bytes.slice().buffer, ASSET_CONTENT_TYPE);
      } catch {
        try {
          await db
            .prepare(
              `UPDATE assets SET
                 status = 'delete_failed',
                 delete_attempts = delete_attempts + 1,
                 delete_last_error = ?,
                 delete_last_error_code = ?,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
               WHERE id = ?`,
            )
            .bind("Asset upload did not complete.", "R2_UPLOAD_FAILED", id)
            .run();
        } catch {
          // 即使状态更新失败，staged 行仍可被超时清理扫描发现。
        }
        throw new AssetServiceError("R2_UPLOAD_FAILED", "Failed to upload file to storage.");
      }

      return {
        id,
        purpose: uploadPurpose,
        r2Key: key,
        contentType: ASSET_CONTENT_TYPE,
        byteLength,
        width,
        height,
        status: "staged",
        publicUrl: r2Adapter.getPublicUrl(key),
      };
    },

    /**
     * 尝试删除 R2 对象 + D1 行。
     * 幂等：R2 对象已不存在视为删除成功。
     * 失败时更新 delete_attempts/delete_last_error → delete_failed。
     * 返回 true 表示清理完成（资源已删除），false 表示仍然存在。
     */
    async deleteIfUnreferenced(id: string): Promise<boolean> {
      const row = await db
        .prepare("SELECT id, r2_key, ref_count, status FROM assets WHERE id = ?")
        .bind(id)
        .first<AssetRow>();

      if (!row) return true; // 已删除
      if (row.status !== "delete_pending" && row.status !== "delete_failed") {
        return false; // 不可删除
      }
      if (row.ref_count > 0) return false; // 仍有引用
      const actualRefCount = await db
        .prepare("SELECT COUNT(*) AS count FROM join_methods WHERE asset_id = ?")
        .bind(id)
        .first<{ count: number }>();
      if ((actualRefCount?.count ?? 0) > 0) return false;

      // 尝试 R2 删除
      let r2Error: string | null = null;
      let r2ErrorCode: string | null = null;
      try {
        await r2Adapter.delete(row.r2_key);
      } catch (e) {
        r2Error = e instanceof Error ? e.message : "Unknown R2 error";
        r2ErrorCode = "R2_DELETE_FAILED";
      }

      // 检查 R2 对象是否真的不存在（幂等处理）
      // 区分：对象明确不存在 (404) vs 网络/依赖错误（必须保留 delete_failed）
      if (r2Error) {
        let objectDefinitelyGone = false;
        try {
          const head = await r2Adapter.head(row.r2_key);
          objectDefinitelyGone = head === null;
        } catch (headErr: unknown) {
          // head() 本身也失败了 → 无法确认状态 → 保留 delete_failed
          const headMsg = headErr instanceof Error ? headErr.message : "Unknown";
          await db
            .prepare(
              `UPDATE assets SET
                 status = 'delete_failed',
                 delete_attempts = delete_attempts + 1,
                 delete_last_error = ?,
                 delete_last_error_code = ?,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
               WHERE id = ?`,
            )
            .bind(headMsg, "R2_HEAD_FAILED", id)
            .run();
          return false;
        }

        if (objectDefinitelyGone) {
          // 对象已不存在 → 视为成功
          r2Error = null;
          r2ErrorCode = null;
        }
      }

      if (r2Error) {
        // R2 删除失败 → 标记 delete_failed 可重试，返回 false
        await db
          .prepare(
            `UPDATE assets SET
               status = 'delete_failed',
               delete_attempts = delete_attempts + 1,
               delete_last_error = ?,
               delete_last_error_code = ?,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?`,
          )
          .bind(r2Error, r2ErrorCode, id)
          .run();
        return false;
      }

      // R2 删除成功 → 移除 D1 行
      await db.prepare("DELETE FROM assets WHERE id = ?").bind(id).run();
      return true;
    },

    /** 重试所有 delete_pending/delete_failed asset，返回实际清理成功的数量。 */
    async retryFailedDeletes(): Promise<number> {
      const rows = await db
        .prepare("SELECT id FROM assets WHERE status IN ('delete_pending', 'delete_failed')")
        .all<{ id: string }>();

      let cleaned = 0;
      for (const r of rows.results) {
        try {
          const deleted = await this.deleteIfUnreferenced(r.id);
          if (deleted) cleaned++;
        } catch {
          /* 单独失败不阻塞其他 */
        }
      }
      return cleaned;
    },

    /**
     * 清理超过 N 分钟的 staged asset（未在超时内被 adopt 的孤立上传）。
     * 返回清理数量。
     */
    async cleanupStaged(olderThanMinutes: number): Promise<number> {
      const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();

      const rows = await db
        .prepare("SELECT id, r2_key FROM assets WHERE status = 'staged' AND created_at < ?")
        .bind(cutoff)
        .all<{ id: string; r2_key: string }>();

      let cleaned = 0;
      for (const r of rows.results) {
        let r2Deleted = false;
        try {
          await r2Adapter.delete(r.r2_key);
          r2Deleted = true;
        } catch {
          // R2 删除失败 → 留下供重试，不删除 D1 记录
        }
        if (r2Deleted) {
          try {
            await db.prepare("DELETE FROM assets WHERE id = ?").bind(r.id).run();
            cleaned++;
          } catch {
            /* D1 删除失败则保留 */
          }
        }
      }
      return cleaned;
    },

    /** 按 ID 查询 asset（管理员视图） */
    async getById(id: string): Promise<AdminAssetDto | null> {
      const row = await db.prepare("SELECT * FROM assets WHERE id = ?").bind(id).first<AssetRow>();

      if (!row) return null;
      return mapToAdminDto(row, r2Adapter.getPublicUrl(row.r2_key));
    },

    /** 按 R2 key 查询 asset（Logo 聚合写入校验使用） */
    async getByR2Key(r2Key: string): Promise<AdminAssetDto | null> {
      const row = await db
        .prepare("SELECT * FROM assets WHERE r2_key = ?")
        .bind(r2Key)
        .first<AssetRow>();

      if (!row) return null;
      return mapToAdminDto(row, r2Adapter.getPublicUrl(row.r2_key));
    },

    /** 获取 asset 的公开 URL。非 ready 状态返回 null。 */
    async getPublicUrl(id: string): Promise<string | null> {
      const row = await db
        .prepare("SELECT r2_key, status FROM assets WHERE id = ?")
        .bind(id)
        .first<{ r2_key: string; status: string }>();

      if (!row || row.status !== "ready") return null;
      return r2Adapter.getPublicUrl(row.r2_key);
    },

    /** 获取公开资源展示元数据（URL + 宽高 + 体积）。非 ready 返回 null。 */
    async getPublicMeta(id: string): Promise<{
      url: string;
      width: number;
      height: number;
      byteLength: number;
    } | null> {
      const row = await db
        .prepare("SELECT r2_key, width, height, byte_length, status FROM assets WHERE id = ?")
        .bind(id)
        .first<{
          r2_key: string;
          width: number;
          height: number;
          byte_length: number;
          status: string;
        }>();

      if (!row || row.status !== "ready") return null;

      return {
        url: r2Adapter.getPublicUrl(row.r2_key),
        width: row.width,
        height: row.height,
        byteLength: row.byte_length,
      };
    },

    /** 检查 asset 是否被其他记录引用（用于永久删除前的安全检查） */
    async countExternalRefs(id: string, excludeGroupId?: string): Promise<number> {
      let sql = "SELECT COUNT(*) as cnt FROM join_methods WHERE asset_id = ?";
      const bindings: unknown[] = [id];

      if (excludeGroupId) {
        sql += " AND group_id != ?";
        bindings.push(excludeGroupId);
      }

      const row = await db
        .prepare(sql)
        .bind(...bindings)
        .first<{ cnt: number }>();
      return row?.cnt ?? 0;
    },

    /** 暴露 R2 adapter 供路由直接使用 */
    r2Adapter,
  };
}

// ─── 自定义错误 ──────────────────────────────────────────

export class AssetServiceError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AssetServiceError";
  }
}

export type AssetService = ReturnType<typeof createAssetService>;
