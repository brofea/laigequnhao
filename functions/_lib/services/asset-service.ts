import { createR2Adapter } from "../adapters/r2-adapter";
import type { Env } from "../env";
import type { AdminAssetDto, AssetInfo } from "@shared/contracts/asset";

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
    contentType: "image/webp" as const,
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

export function createAssetService(db: D1Database, r2: R2Bucket, env: Env) {
  const r2Adapter = createR2Adapter(r2, env);

  return {
    /**
     * 上传文件到 R2 → 写入 staged asset。
     * D1 写入失败时补偿删除 R2 对象。
     */
    async uploadStaged(
      buffer: ArrayBuffer,
      purpose: "logo" | "qr_code",
      meta: { width: number; height: number; byteLength: number },
    ): Promise<AssetInfo> {
      const id = crypto.randomUUID();
      const key = `${purpose}/${id}.webp`;

      // 1. 先写 R2
      try {
        await r2Adapter.upload(key, buffer);
      } catch (e) {
        throw new AssetServiceError(
          "R2_UPLOAD_FAILED",
          "Failed to upload file to storage.",
        );
      }

      // 2. 写 D1 staged 行
      try {
        await db
          .prepare(
            `INSERT INTO assets (id, r2_key, purpose, content_type, byte_length, width, height, status)
             VALUES (?, ?, ?, 'image/webp', ?, ?, ?, 'staged')`,
          )
          .bind(id, key, purpose, meta.byteLength, meta.width, meta.height)
          .run();
      } catch {
        // 补偿：删除刚上传的 R2 对象
        try {
          await r2Adapter.delete(key);
        } catch {
          /* 尽力而为 */
        }
        throw new AssetServiceError(
          "D1_WRITE_FAILED",
          "Failed to save asset metadata.",
        );
      }

      return {
        id,
        purpose,
        r2Key: key,
        contentType: "image/webp" as const,
        byteLength: meta.byteLength,
        width: meta.width,
        height: meta.height,
        status: "staged",
      };
    },

    /**
     * 采纳 staged asset → ready（群聊保存成功后调用）。
     * ref_count 自增。
     */
    async adopt(id: string): Promise<void> {
      const result = await db
        .prepare(
          `UPDATE assets SET status = 'ready', ref_count = ref_count + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND status = 'staged'`,
        )
        .bind(id)
        .run();

      if (result.meta.changes === 0) {
        const existing = await db
          .prepare("SELECT status FROM assets WHERE id = ?")
          .bind(id)
          .first<{ status: string }>();
        if (!existing) {
          throw new AssetServiceError("NOT_FOUND", "Asset not found.");
        }
        throw new AssetServiceError(
          "STATE_CONFLICT",
          `Asset is ${existing.status}, not staged.`,
        );
      }
    },

    /**
     * 为已 ready 的 asset 增加一次引用（多个 join_method 引用同一 asset 时使用）。
     */
    async addRef(id: string): Promise<void> {
      await db
        .prepare(
          `UPDATE assets SET ref_count = ref_count + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND status = 'ready'`,
        )
        .bind(id)
        .run();
    },

    /**
     * 解除一次引用。ref_count 降为 0 且 status=ready 时标记 delete_pending 并触发异步清理。
     */
    async release(id: string): Promise<void> {
      const result = await db
        .prepare(
          `UPDATE assets SET ref_count = MAX(0, ref_count - 1), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND ref_count > 0`,
        )
        .bind(id)
        .run();

      if (result.meta.changes === 0) return;

      const row = await db
        .prepare("SELECT ref_count, status FROM assets WHERE id = ?")
        .bind(id)
        .first<{ ref_count: number; status: string }>();

      if (row && row.ref_count === 0 && row.status === "ready") {
        await db
          .prepare(
            `UPDATE assets SET status = 'delete_pending', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
          )
          .bind(id)
          .run();

        // 异步尝试删除（不阻塞主流程）
        this.deleteIfUnreferenced(id).catch(() => {
          /* 后台任务，失败后 delete_failed 状态可重试 */
        });
      }
    },

    /**
     * 尝试删除 R2 对象 + D1 行。
     * 幂等：R2 对象已不存在视为删除成功。
     * 失败时更新 delete_attempts/delete_last_error/delete_last_error_code → delete_failed。
     */
    async deleteIfUnreferenced(id: string): Promise<void> {
      const row = await db
        .prepare(
          "SELECT id, r2_key, ref_count, status FROM assets WHERE id = ?",
        )
        .bind(id)
        .first<AssetRow>();

      if (!row) return; // 已删除
      if (row.status !== "delete_pending" && row.status !== "delete_failed") {
        return; // 不可删除
      }
      if (row.ref_count > 0) return; // 仍有引用

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
      if (r2Error) {
        const head = await r2Adapter.head(row.r2_key).catch(() => null);
        if (head === null) {
          // 对象已不存在 → 视为成功
          r2Error = null;
          r2ErrorCode = null;
        }
      }

      if (r2Error) {
        // R2 删除失败 → 标记 delete_failed 可重试
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
        return;
      }

      // R2 删除成功 → 移除 D1 行
      await db.prepare("DELETE FROM assets WHERE id = ?").bind(id).run();
    },

    /**
     * 重试所有 delete_failed 的 asset。返回成功清理的数量。
     */
    async retryFailedDeletes(): Promise<number> {
      const rows = await db
        .prepare("SELECT id FROM assets WHERE status = 'delete_failed'")
        .all<{ id: string }>();

      let cleaned = 0;
      for (const r of rows.results) {
        try {
          await this.deleteIfUnreferenced(r.id);
          cleaned++;
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
      const cutoff = new Date(
        Date.now() - olderThanMinutes * 60 * 1000,
      ).toISOString();

      const rows = await db
        .prepare(
          "SELECT id, r2_key FROM assets WHERE status = 'staged' AND created_at < ?",
        )
        .bind(cutoff)
        .all<{ id: string; r2_key: string }>();

      let cleaned = 0;
      for (const r of rows.results) {
        try {
          await r2Adapter.delete(r.r2_key);
        } catch {
          /* 尽力而为 */
        }
        try {
          await db.prepare("DELETE FROM assets WHERE id = ?").bind(r.id).run();
          cleaned++;
        } catch {
          /* D1 删除失败则保留 */
        }
      }
      return cleaned;
    },

    /** 按 ID 查询 asset（管理员视图） */
    async getById(id: string): Promise<AdminAssetDto | null> {
      const row = await db
        .prepare("SELECT * FROM assets WHERE id = ?")
        .bind(id)
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
    async getPublicMeta(
      id: string,
    ): Promise<{
      url: string;
      width: number;
      height: number;
      byteLength: number;
    } | null> {
      const row = await db
        .prepare(
          "SELECT r2_key, width, height, byte_length, status FROM assets WHERE id = ?",
        )
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
    async countExternalRefs(
      id: string,
      excludeGroupId?: string,
    ): Promise<number> {
      let sql =
        "SELECT COUNT(*) as cnt FROM join_methods WHERE asset_id = ?";
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
