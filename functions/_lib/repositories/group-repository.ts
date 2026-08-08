import type { AdminGroupDto } from "@shared/contracts/group";
import { getAssetContentType } from "@shared/contracts/asset";
import type { GroupStatus } from "@shared/domain";
import { normalizeSearchQuery } from "@shared/domain";

// ─── D1 行类型 ──────────────────────────────────────────

interface GroupRow {
  id: string;
  title: string;
  description: string;
  kind: string;
  platform: string;
  status: string;
  rotation_key: string;
  like_count: number;
  version: number;
  logo_r2_key: string | null;
  logo_url: string | null;
  logo_width: number | null;
  logo_height: number | null;
  logo_byte_length: number | null;
  deleted_at: string | null;
  purge_state: string | null;
  purge_started_at: string | null;
  created_at: string;
  updated_at: string;
  last_published_at: string | null;
}

interface TagRow {
  tag: string;
  sort_order: number;
}

interface JoinMethodRow {
  type: "group_number" | "url" | "qr_code";
  value: string | null;
  sort_order: number;
  asset_id: string | null;
}

interface AssetJoinRow {
  asset_id: string;
  r2_key: string;
  purpose: string;
  content_type: string;
  byte_length: number;
  width: number;
  height: number;
  status: string;
  ref_count: number;
}

interface SubmissionDetailRow {
  contact: string | null;
  notes: string | null;
}

/**
 * 投稿 service 经过文件校验后生成的内部资源（logo 或 qr_code）。
 *
 * 这个类型不接受来自 HTTP 的 asset ID、key 或元数据；调用方必须先生成
 * 资源 ID/key，并把共享图片校验器产出的实际尺寸和字节数传入。
 */
export interface SubmissionReadyAssetInput {
  id: string;
  r2Key: string;
  purpose: "logo" | "qr_code";
  byteLength: number;
  width: number;
  height: number;
}

export interface SubmissionAssetCleanupInput extends SubmissionReadyAssetInput {
  requestId: string;
}

// ─── 行 → DTO 映射 ──────────────────────────────────────

function mapToAdminDto(
  group: GroupRow,
  tags: TagRow[],
  methods: JoinMethodRow[],
  detail: SubmissionDetailRow | null,
  assetLookup: Map<string, AssetJoinRow>,
): AdminGroupDto {
  const hasLogo = group.logo_r2_key !== null;
  return {
    id: group.id,
    title: group.title,
    description: group.description,
    kind: group.kind as AdminGroupDto["kind"],
    platform: group.platform,
    tags: tags.map((t) => t.tag),
    status: group.status as AdminGroupDto["status"],
    logoUrl: group.logo_url,
    logoMeta: hasLogo
      ? {
          width: group.logo_width!,
          height: group.logo_height!,
          byteLength: group.logo_byte_length!,
        }
      : null,
    joinMethods: methods.map((m) => {
      const asset = m.asset_id ? assetLookup.get(m.asset_id) : null;
      return {
        type: m.type,
        value: m.value ?? undefined,
        url: m.type === "url" ? (m.value ?? undefined) : undefined,
        qrCodeUrl:
          m.type === "qr_code" ? (asset?.r2_key ? undefined : (m.value ?? undefined)) : undefined,
        qrCodeMeta:
          m.type === "qr_code" && asset
            ? { width: asset.width, height: asset.height, byteLength: asset.byte_length }
            : undefined,
        assetId: m.asset_id ?? undefined,
        assetUrl: asset?.r2_key ? null : null, // resolved in route layer
        assetWidth: asset?.width ?? undefined,
        assetHeight: asset?.height ?? undefined,
        assetByteLength: asset?.byte_length ?? undefined,
        assetStatus:
          (asset?.status as AdminGroupDto["joinMethods"][number]["assetStatus"]) ?? undefined,
      };
    }),
    likeCount: group.like_count,
    createdAt: group.created_at,
    updatedAt: group.updated_at,
    submissionContact: detail?.contact ?? null,
    auditNotes: detail?.notes ?? null,
    deletedAt: group.deleted_at,
    deleteProgress: group.purge_state as AdminGroupDto["deleteProgress"],
    logoR2Key: group.logo_r2_key,
    version: group.version,
    lastPublishedAt: group.last_published_at,
  };
}

// ─── 关联数据批量加载 ────────────────────────────────────
// 标签、加群方式、提交详情、asset 元数据一次性批量读取，避免 N+1。

async function loadRelated(
  db: D1Database,
  groupIds: string[],
): Promise<{
  tagsByGroup: Map<string, TagRow[]>;
  methodsByGroup: Map<string, JoinMethodRow[]>;
  detailsByGroup: Map<string, SubmissionDetailRow>;
  assetLookup: Map<string, AssetJoinRow>;
}> {
  const tagsByGroup = new Map<string, TagRow[]>();
  const methodsByGroup = new Map<string, JoinMethodRow[]>();
  const detailsByGroup = new Map<string, SubmissionDetailRow>();
  const assetLookup = new Map<string, AssetJoinRow>();

  if (groupIds.length === 0) {
    return { tagsByGroup, methodsByGroup, detailsByGroup, assetLookup };
  }

  const [tagsResult, methodsResult, detailsResult] = await Promise.all([
    db
      .prepare(
        `SELECT group_id, tag, sort_order FROM group_tags WHERE group_id IN (${groupIds.map(() => "?").join(",")}) ORDER BY sort_order ASC`,
      )
      .bind(...groupIds)
      .all<{ group_id: string } & TagRow>(),
    db
      .prepare(
        `SELECT group_id, type, value, sort_order, asset_id FROM join_methods WHERE group_id IN (${groupIds.map(() => "?").join(",")}) ORDER BY sort_order ASC`,
      )
      .bind(...groupIds)
      .all<{ group_id: string } & JoinMethodRow>(),
    db
      .prepare(
        `SELECT group_id, contact, notes FROM submission_details WHERE group_id IN (${groupIds.map(() => "?").join(",")})`,
      )
      .bind(...groupIds)
      .all<{ group_id: string } & SubmissionDetailRow>(),
  ]);

  for (const r of tagsResult.results) {
    if (!tagsByGroup.has(r.group_id)) tagsByGroup.set(r.group_id, []);
    tagsByGroup.get(r.group_id)!.push({ tag: r.tag, sort_order: r.sort_order });
  }

  const allAssetIds = new Set<string>();
  for (const r of methodsResult.results) {
    if (!methodsByGroup.has(r.group_id)) methodsByGroup.set(r.group_id, []);
    methodsByGroup.get(r.group_id)!.push({
      type: r.type,
      value: r.value,
      sort_order: r.sort_order,
      asset_id: r.asset_id,
    });
    if (r.asset_id) allAssetIds.add(r.asset_id);
  }

  for (const r of detailsResult.results) {
    detailsByGroup.set(r.group_id, { contact: r.contact, notes: r.notes });
  }

  if (allAssetIds.size > 0) {
    const assetRows = await db
      .prepare(
        `SELECT id as asset_id, r2_key, purpose, content_type, byte_length, width, height, status, ref_count
         FROM assets WHERE id IN (${[...allAssetIds].map(() => "?").join(",")})`,
      )
      .bind(...allAssetIds)
      .all<AssetJoinRow>();
    for (const a of assetRows.results) {
      assetLookup.set(a.asset_id, a);
    }
  }

  return { tagsByGroup, methodsByGroup, detailsByGroup, assetLookup };
}

function mapRelatedToDtos(
  rows: GroupRow[],
  related: {
    tagsByGroup: Map<string, TagRow[]>;
    methodsByGroup: Map<string, JoinMethodRow[]>;
    detailsByGroup: Map<string, SubmissionDetailRow>;
    assetLookup: Map<string, AssetJoinRow>;
  },
): AdminGroupDto[] {
  return rows.map((g) =>
    mapToAdminDto(
      g,
      related.tagsByGroup.get(g.id) ?? [],
      related.methodsByGroup.get(g.id) ?? [],
      related.detailsByGroup.get(g.id) ?? null,
      related.assetLookup,
    ),
  );
}

// ─── 共享 WHERE 子句构建器 ───────────────────────────────
// COUNT 与 items 查询必须共用同一条件集合

function buildWhereClause(params: { statuses: string[]; deleted: boolean; q?: string }): {
  sql: string;
  bindings: unknown[];
} {
  const conditions: string[] = [];
  const bindings: unknown[] = [];

  if (params.statuses.length > 0) {
    conditions.push(`g.status IN (${params.statuses.map(() => "?").join(",")})`);
    bindings.push(...params.statuses);
  }

  if (params.deleted) {
    conditions.push("g.deleted_at IS NOT NULL");
  } else {
    conditions.push("g.deleted_at IS NULL");
  }

  if (params.q) {
    const normalized = normalizeSearchQuery(params.q);
    if (normalized) {
      const pattern = toSubstringLikePattern(normalized);
      conditions.push(
        "(g.title LIKE ? ESCAPE '\\' COLLATE NOCASE OR g.description LIKE ? ESCAPE '\\' COLLATE NOCASE OR EXISTS (SELECT 1 FROM group_tags gt WHERE gt.group_id = g.id AND gt.tag LIKE ? ESCAPE '\\' COLLATE NOCASE))",
      );
      bindings.push(pattern, pattern, pattern);
    }
  }

  return {
    sql: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    bindings,
  };
}

function toSubstringLikePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

/** 管理列表 ORDER BY：允许列表 + 固定稳定次排序 id（PRD §21.6） */
function buildAdminOrderBy(
  sortBy: "title" | "kind" | "status" | "platform" | "tags" | "likeCount" | undefined,
  sortDir: "asc" | "desc",
): string {
  const hasTagSql = "EXISTS (SELECT 1 FROM group_tags gt WHERE gt.group_id = g.id)";
  const firstTagSql =
    "COALESCE((SELECT gt.tag FROM group_tags gt WHERE gt.group_id = g.id ORDER BY gt.sort_order ASC LIMIT 1), '') COLLATE NOCASE";
  switch (sortBy) {
    case "title":
      return `g.title COLLATE NOCASE ${sortDir}, g.id ${sortDir}`;
    case "kind":
      return `g.kind COLLATE NOCASE ${sortDir}, g.id ${sortDir}`;
    case "status":
      return `CASE g.status WHEN 'pending' THEN 0 WHEN 'published' THEN 1 WHEN 'rejected' THEN 2 WHEN 'delisted' THEN 3 END ${sortDir}, g.id ${sortDir}`;
    case "platform":
      return `g.platform COLLATE NOCASE ${sortDir}, g.id ${sortDir}`;
    case "tags":
      return `CASE WHEN ${hasTagSql} THEN 0 ELSE 1 END ASC, ${firstTagSql} ${sortDir}, g.id ${sortDir}`;
    case "likeCount":
      return `g.like_count ${sortDir}, g.id ${sortDir}`;
    default:
      return "g.created_at DESC, g.id DESC";
  }
}

// ─── 查询 ────────────────────────────────────────────────

export function createGroupRepository(db: D1Database) {
  return {
    /** 分页列出已发布的群聊（公开边界：只返回 published，不返回 delisted） */
    async listPublished(params: {
      q?: string;
      cursor?: string | null;
      limit: number;
      rotationOrdinal: number;
      skip?: number;
    }): Promise<{ items: AdminGroupDto[]; total: number }> {
      const { q, limit, rotationOrdinal, skip = 0 } = params;

      let whereClause = `g.status = 'published' AND g.deleted_at IS NULL`;
      const bindings: unknown[] = [];

      if (q) {
        const normalized = normalizeSearchQuery(q);
        if (normalized) {
          const pattern = toSubstringLikePattern(normalized);
          whereClause += ` AND (g.title LIKE ? ESCAPE '\\' COLLATE NOCASE OR g.description LIKE ? ESCAPE '\\' COLLATE NOCASE OR g.id IN (SELECT DISTINCT gt.group_id FROM group_tags gt WHERE gt.tag LIKE ? ESCAPE '\\' COLLATE NOCASE))`;
          bindings.push(pattern, pattern, pattern);
        }
      }

      // 总数
      const countResult = await db
        .prepare(`SELECT COUNT(*) as total FROM groups g WHERE ${whereClause}`)
        .bind(...bindings)
        .first<{ total: number }>();
      const total = countResult?.total ?? 0;

      if (total === 0) {
        return { items: [], total: 0 };
      }

      // 查询全部匹配群聊（移除 LIMIT/OFFSET，在内存中做循环位移）
      const allRows = await db
        .prepare(
          `SELECT g.* FROM groups g
           WHERE ${whereClause}
           ORDER BY g.rotation_key ASC, g.id ASC`,
        )
        .bind(...bindings)
        .all<GroupRow>();

      // 内存中循环位移 + 无环绕分页
      const allItems = allRows.results;
      const baseOffset = rotationOrdinal % total;
      // 逻辑剩余量（已跳过的不算）
      const remaining = total - skip;
      const take = Math.min(limit, remaining);
      if (take <= 0) return { items: [], total };
      // 物理起点：从轮换偏移开始，再跳过已翻页的记录
      const physicalStart = (baseOffset + skip) % total;
      let sliced: GroupRow[];
      if (physicalStart + take <= total) {
        sliced = allItems.slice(physicalStart, physicalStart + take);
      } else {
        // 环绕一次：跨越数组尾部，从头部补齐
        sliced = [
          ...allItems.slice(physicalStart),
          ...allItems.slice(0, take - (total - physicalStart)),
        ];
      }

      // 批量加载标签、加群方式、提交详情
      const groupIds = sliced.map((r) => r.id);
      if (groupIds.length === 0) return { items: [], total };

      const related = await loadRelated(db, groupIds);
      const items = mapRelatedToDtos(sliced, related);

      return { items, total };
    },

    /** 发现新群：最近进入 published 的群聊，稳定排序，最多 limit 条 */
    async listRecentPublished(limit = 10): Promise<AdminGroupDto[]> {
      const rows = await db
        .prepare(
          `SELECT g.* FROM groups g
           WHERE g.status = 'published' AND g.deleted_at IS NULL
           ORDER BY g.last_published_at DESC, g.id DESC
           LIMIT ?`,
        )
        .bind(limit)
        .all<GroupRow>();
      const groupIds = rows.results.map((r) => r.id);
      const related = await loadRelated(db, groupIds);
      return mapRelatedToDtos(rows.results, related);
    },

    /** 批量按 ID 取已发布群聊（板块公开成员使用；只返回 published） */
    async listPublishedByIds(ids: string[]): Promise<AdminGroupDto[]> {
      if (ids.length === 0) return [];
      const rows = await db
        .prepare(
          `SELECT g.* FROM groups g
           WHERE g.id IN (${ids.map(() => "?").join(",")})
             AND g.status = 'published' AND g.deleted_at IS NULL`,
        )
        .bind(...ids)
        .all<GroupRow>();
      const related = await loadRelated(
        db,
        rows.results.map((r) => r.id),
      );
      return mapRelatedToDtos(rows.results, related);
    },

    /** 公开详情深链：只返回已发布且未删除的群聊 */
    async getPublishedById(id: string): Promise<AdminGroupDto | null> {
      const group = await db
        .prepare(
          "SELECT * FROM groups WHERE id = ? AND status = 'published' AND deleted_at IS NULL",
        )
        .bind(id)
        .first<GroupRow>();
      if (!group) return null;
      const related = await loadRelated(db, [id]);
      return mapRelatedToDtos([group], related)[0] ?? null;
    },

    /** 按 ID 查询单个群聊 */
    async getById(id: string): Promise<AdminGroupDto | null> {
      const group = await db
        .prepare("SELECT * FROM groups WHERE id = ?")
        .bind(id)
        .first<GroupRow>();

      if (!group) return null;

      const related = await loadRelated(db, [id]);
      return mapRelatedToDtos([group], related)[0] ?? null;
    },

    /** 创建群聊 + 关联数据（在 D1 batch 中原子写入，含 asset adoption） */
    async create(input: {
      title: string;
      description?: string;
      kind: string;
      platform: string;
      status?: string;
      tags: string[];
      joinMethods: { type: string; value?: string; assetId?: string; sortOrder?: number }[];
      auditNotes?: string | null;
      logoR2Key?: string | null;
      logoUrl?: string | null;
      logoMeta?: { width: number; height: number; byteLength: number } | null;
      adoptAssetIds?: string[];
      /** 提交者联系方式（用户提交入口使用） */
      contact?: string | null;
      /** 提交者备注（用户提交入口使用） */
      notes?: string | null;
      /**
       * 投稿 service 传入的已校验、已写入 R2 的内部 ready 资源。
       * 兼容单值（旧调用）与数组（logo + qr_code 多资产）。
       */
      readyAsset?: SubmissionReadyAssetInput | SubmissionReadyAssetInput[];
    }): Promise<AdminGroupDto> {
      const id = crypto.randomUUID();
      const rotationKey = crypto.randomUUID();
      const now = new Date().toISOString();
      const status = input.status ?? "pending";
      // 新建后直接发布：写入服务端时间；其余状态保持 NULL
      const lastPublishedAt = status === "published" ? now : null;

      const readyAssets = Array.isArray(input.readyAsset)
        ? input.readyAsset
        : input.readyAsset
          ? [input.readyAsset]
          : [];
      const logoReadyAsset = readyAssets.find((asset) => asset.purpose === "logo");

      const batch: D1PreparedStatement[] = [];

      // 投稿资源和 pending 群组必须在同一个 D1 batch 中完成聚合写入。
      // 这里的 asset 记录只能来自 service 内部的已校验对象，不能由请求字段构造。
      for (const readyAsset of readyAssets) {
        batch.push(
          db
            .prepare(
              `INSERT INTO assets (
                 id, r2_key, purpose, content_type, byte_length, width, height,
                 status, ref_count
               )
               VALUES (?, ?, ?, ?, ?, ?, ?, 'ready', 1)`,
            )
            .bind(
              readyAsset.id,
              readyAsset.r2Key,
              readyAsset.purpose,
              getAssetContentType(readyAsset.purpose),
              readyAsset.byteLength,
              readyAsset.width,
              readyAsset.height,
            ),
        );
      }

      batch.push(
        db
          .prepare(
            `INSERT INTO groups (
               id, title, description, kind, platform, status, rotation_key,
               logo_r2_key, logo_url, logo_width, logo_height, logo_byte_length,
               created_at, updated_at, last_published_at
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            input.title,
            input.description ?? "",
            input.kind,
            input.platform,
            status,
            rotationKey,
            logoReadyAsset?.r2Key ?? input.logoR2Key ?? null,
            logoReadyAsset ? null : (input.logoUrl ?? null),
            logoReadyAsset?.width ?? input.logoMeta?.width ?? null,
            logoReadyAsset?.height ?? input.logoMeta?.height ?? null,
            logoReadyAsset?.byteLength ?? input.logoMeta?.byteLength ?? null,
            now,
            now,
            lastPublishedAt,
          ),
      );

      // 标签（过滤空值，保留 sort_order）
      const validTags = input.tags.filter((t) => t.trim().length > 0);
      for (let i = 0; i < validTags.length; i++) {
        batch.push(
          db
            .prepare("INSERT INTO group_tags (id, group_id, tag, sort_order) VALUES (?, ?, ?, ?)")
            .bind(crypto.randomUUID(), id, validTags[i]!, i),
        );
      }

      // 加群方式（支持 qr_code 带 asset_id）
      for (let i = 0; i < input.joinMethods.length; i++) {
        const m = input.joinMethods[i]!;
        const sortOrder = m.sortOrder ?? i;
        if (m.type === "qr_code") {
          const hasAsset = m.assetId && m.assetId.length > 0;
          batch.push(
            db
              .prepare(
                hasAsset
                  ? `INSERT INTO join_methods (id, group_id, type, value, sort_order, asset_id)
                     VALUES (?, ?, ?, NULL, ?, COALESCE(
                       (SELECT id FROM assets WHERE id = ? AND status IN ('staged', 'ready')),
                       ?
                     ))`
                  : `INSERT INTO join_methods (id, group_id, type, value, sort_order, asset_id)
                     VALUES (?, ?, ?, NULL, ?, NULL)`,
              )
              .bind(
                ...(hasAsset
                  ? [
                      crypto.randomUUID(),
                      id,
                      m.type,
                      sortOrder,
                      m.assetId ?? "",
                      `invalid-${crypto.randomUUID()}`,
                    ]
                  : [crypto.randomUUID(), id, m.type, sortOrder]),
              ),
          );
        } else {
          batch.push(
            db
              .prepare(
                "INSERT INTO join_methods (id, group_id, type, value, sort_order, asset_id) VALUES (?, ?, ?, ?, ?, NULL)",
              )
              .bind(crypto.randomUUID(), id, m.type, m.value ?? "", sortOrder),
          );
        }
      }

      // 提交详情
      batch.push(
        db
          .prepare(
            "INSERT INTO submission_details (id, group_id, contact, notes) VALUES (?, ?, ?, ?)",
          )
          .bind(
            crypto.randomUUID(),
            id,
            input.contact ?? null,
            input.notes ?? input.auditNotes ?? null,
          ),
      );

      // Asset adoption（与群组创建在同一 batch 中原子执行）
      if (input.adoptAssetIds && input.adoptAssetIds.length > 0) {
        for (const assetId of input.adoptAssetIds) {
          batch.push(
            db
              .prepare(
                "UPDATE assets SET status = 'ready', ref_count = ref_count + 1, updated_at = ? WHERE id = ? AND status IN ('staged', 'ready')",
              )
              .bind(now, assetId),
          );
        }
      }

      await db.batch(batch);

      return (await this.getById(id))!;
    },

    /**
     * 记录投稿 R2 补偿失败的资源，使已有 delete_failed cleanup 能够重试。
     *
     * 只有投稿 service 生成的内部资源对象可以调用此方法；requestId 只用于
     * 日志/审计关联，不写入资源 key 或公开 DTO。
     */
    async recordSubmissionAssetCleanup(input: SubmissionAssetCleanupInput): Promise<void> {
      await db
        .prepare(
          `INSERT INTO assets (
             id, r2_key, purpose, content_type, byte_length, width, height,
             status, ref_count, delete_attempts, delete_last_error, delete_last_error_code
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, 'delete_failed', 0, 1, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             status = 'delete_failed',
             ref_count = 0,
             delete_attempts = MAX(delete_attempts, 1),
             delete_last_error = excluded.delete_last_error,
             delete_last_error_code = excluded.delete_last_error_code,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
        )
        .bind(
          input.id,
          input.r2Key,
          input.purpose,
          getAssetContentType(input.purpose),
          input.byteLength,
          input.width,
          input.height,
          "Submission R2 compensation delete failed.",
          "R2_DELETE_FAILED",
        )
        .run();
    },

    // ─── 管理员方法 ────────────────────────────────────────

    /** 管理员页码分页列表（PRD §21：固定每页 50，排序恒加稳定次排序 id） */
    async listPage(params: {
      statuses: GroupStatus[];
      deleted: boolean;
      q?: string;
      sortBy?: "title" | "kind" | "status" | "platform" | "tags" | "likeCount";
      sortDir: "asc" | "desc";
      page: number;
    }): Promise<{ items: AdminGroupDto[]; totalItems: number; totalPages: number }> {
      const pageSize = 50;
      const { statuses, deleted, q, sortBy, sortDir, page } = params;

      // ── 共享 WHERE 子句（COUNT 与 items 查询共用） ──
      const { sql: whereSql, bindings: whereBindings } = buildWhereClause({
        statuses,
        deleted,
        q,
      });

      // 总数与总页数（与 items 使用同一过滤条件）
      const countResult = await db
        .prepare(`SELECT COUNT(*) as total FROM groups g ${whereSql}`)
        .bind(...whereBindings)
        .first<{ total: number }>();
      const totalItems = countResult?.total ?? 0;
      if (totalItems === 0) {
        return { items: [], totalItems: 0, totalPages: 0 };
      }
      const totalPages = Math.ceil(totalItems / pageSize);

      // ── 稳定排序 + 页码偏移 ──
      const orderBy = buildAdminOrderBy(sortBy, sortDir);
      const offset = (page - 1) * pageSize;
      const rows = await db
        .prepare(`SELECT g.* FROM groups g ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
        .bind(...whereBindings, pageSize, offset)
        .all<GroupRow>();

      const related = await loadRelated(
        db,
        rows.results.map((r) => r.id),
      );
      return {
        items: mapRelatedToDtos(rows.results, related),
        totalItems,
        totalPages,
      };
    },

    /** 原子更新（UUID mutation token + 单 D1 batch） */
    async update(
      id: string,
      input: {
        title?: string;
        description?: string;
        kind?: string;
        platform?: string;
        status?: string;
        tags?: string[];
        joinMethods?: { type: string; value?: string; assetId?: string; sortOrder?: number }[];
        auditNotes?: string | null;
        logoR2Key?: string | null;
        logoAssetId?: string | null;
        logoUrl?: string | null;
        logoMeta?: { width: number; height: number; byteLength: number } | null;
        version: number;
        adoptAssetIds?: string[];
      },
    ): Promise<{ dto: AdminGroupDto | null; versionConflict: boolean }> {
      const now = new Date().toISOString();
      const mutationToken = crypto.randomUUID();

      // 预读当前 join_methods / Logo asset ID（batch 前获取，batch 内引用）
      let oldAssetIds: Set<string> = new Set();
      if (input.joinMethods !== undefined) {
        const oldMethods = await db
          .prepare("SELECT asset_id FROM join_methods WHERE group_id = ? AND asset_id IS NOT NULL")
          .bind(id)
          .all<{ asset_id: string }>();
        oldAssetIds = new Set(oldMethods.results.map((r) => r.asset_id));
      }
      if (input.logoR2Key !== undefined) {
        const oldLogo = await db
          .prepare(
            `SELECT a.id
             FROM groups g
             JOIN assets a ON a.r2_key = g.logo_r2_key
             WHERE g.id = ?`,
          )
          .bind(id)
          .first<{ id: string }>();
        if (oldLogo) oldAssetIds.add(oldLogo.id);
      }
      const newAssetIds = new Set(
        (input.joinMethods ?? [])
          .filter((m) => m.type === "qr_code" && m.assetId)
          .map((m) => m.assetId!),
      );
      if (input.logoAssetId) newAssetIds.add(input.logoAssetId);

      // 审核备注 upsert 预读
      const hasSubmissionDetails = input.auditNotes !== undefined;
      let existingDetailId: string | null = null;
      if (hasSubmissionDetails) {
        const detail = await db
          .prepare("SELECT id FROM submission_details WHERE group_id = ?")
          .bind(id)
          .first<{ id: string }>();
        existingDetailId = detail?.id ?? null;
      }

      // 发布时间语义：只有"非 published → published"的成功转换才写入服务端时间
      let publishTransition = false;
      if (input.status !== undefined && input.status === "published") {
        const current = await db
          .prepare("SELECT status FROM groups WHERE id = ?")
          .bind(id)
          .first<{ status: string }>();
        publishTransition = current !== null && current.status !== "published";
      }

      // Mutation token 守卫：仅当 groups 行持有本次 token 时关联操作生效
      const guardSql = ` AND EXISTS (SELECT 1 FROM groups WHERE id = ? AND mutation_token = ?)`;
      const guard = [id, mutationToken];
      const g = (clause: string, ...bindings: unknown[]) => ({
        sql: ` ${clause}${guardSql}`,
        bindings: [...bindings, ...guard],
      });

      const batch: D1PreparedStatement[] = [];

      // 1. 主表 UPDATE（版本条件 + mutation_token）
      const setters: string[] = ["updated_at = ?", "version = version + 1", "mutation_token = ?"];
      const ub: unknown[] = [now, mutationToken];
      if (publishTransition) {
        setters.push("last_published_at = ?");
        ub.push(now);
      }
      for (const key of ["title", "description", "kind", "platform", "status"] as const) {
        if (input[key] !== undefined) {
          setters.push(`${key} = ?`);
          ub.push(input[key]);
        }
      }
      if (input.logoR2Key !== undefined) {
        setters.push(
          "logo_r2_key = ?",
          "logo_url = ?",
          "logo_width = ?",
          "logo_height = ?",
          "logo_byte_length = ?",
        );
        ub.push(
          input.logoR2Key,
          input.logoUrl ?? null,
          input.logoMeta?.width ?? null,
          input.logoMeta?.height ?? null,
          input.logoMeta?.byteLength ?? null,
        );
      }
      ub.push(id, input.version);
      batch.push(
        db
          .prepare(`UPDATE groups SET ${setters.join(", ")} WHERE id = ? AND version = ?`)
          .bind(...ub),
      );

      // 2. 被移除的 asset：ref_count -1（归零时标记 delete_pending）
      for (const oldId of oldAssetIds) {
        if (newAssetIds.has(oldId)) continue;
        const g1 = g(
          "UPDATE assets SET ref_count = MAX(0, ref_count - 1), updated_at = ? WHERE id = ? AND status = 'ready'",
          now,
          oldId,
        );
        batch.push(db.prepare(g1.sql).bind(...g1.bindings));
        const g2 = g(
          "UPDATE assets SET status = 'delete_pending', updated_at = ? WHERE id = ? AND ref_count = 0 AND status = 'ready'",
          now,
          oldId,
        );
        batch.push(db.prepare(g2.sql).bind(...g2.bindings));
      }

      // 3. 新增的 ready asset（非 staged）：ref_count +1
      for (const newId of newAssetIds) {
        if (oldAssetIds.has(newId)) continue;
        if ((input.adoptAssetIds ?? []).includes(newId)) continue; // staged, handled by adopt
        const g3 = g(
          "UPDATE assets SET ref_count = ref_count + 1, updated_at = ? WHERE id = ? AND status = 'ready'",
          now,
          newId,
        );
        batch.push(db.prepare(g3.sql).bind(...g3.bindings));
      }

      // 4. Adopt staged asset
      if (input.adoptAssetIds && input.adoptAssetIds.length > 0) {
        for (const assetId of input.adoptAssetIds) {
          const g4 = g(
            "UPDATE assets SET status = 'ready', ref_count = ref_count + 1, updated_at = ? WHERE id = ? AND status IN ('staged', 'ready')",
            now,
            assetId,
          );
          batch.push(db.prepare(g4.sql).bind(...g4.bindings));
        }
      }

      // 5. 标签完全替换
      if (input.tags !== undefined) {
        batch.push(
          db
            .prepare(`DELETE FROM group_tags WHERE group_id = ?${g("").sql}`)
            .bind(id, ...g("").bindings),
        );
        const validTags = input.tags.filter((t) => t.trim().length > 0);
        for (let i = 0; i < validTags.length; i++) {
          batch.push(
            db
              .prepare(
                `INSERT INTO group_tags (id, group_id, tag, sort_order) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM groups WHERE id = ? AND mutation_token = ?)`,
              )
              .bind(crypto.randomUUID(), id, validTags[i]!, i, id, mutationToken),
          );
        }
      }

      // 6. 加群方式完全替换
      if (input.joinMethods !== undefined) {
        batch.push(
          db
            .prepare(`DELETE FROM join_methods WHERE group_id = ?${g("").sql}`)
            .bind(id, ...g("").bindings),
        );
        for (let i = 0; i < input.joinMethods.length; i++) {
          const m = input.joinMethods[i]!;
          const hasAsset = m.type === "qr_code" && m.assetId && m.assetId.length > 0;
          const assetIdSql = hasAsset
            ? "COALESCE((SELECT id FROM assets WHERE id = ? AND status IN ('staged', 'ready')), ?)"
            : "NULL";
          const assetBindings = hasAsset ? [m.assetId ?? "", `invalid-${crypto.randomUUID()}`] : [];
          batch.push(
            db
              .prepare(
                `INSERT INTO join_methods (id, group_id, type, value, sort_order, asset_id)
                 SELECT ?, ?, ?, ?, ?, ${assetIdSql}
                 WHERE EXISTS (SELECT 1 FROM groups WHERE id = ? AND mutation_token = ?)`,
              )
              .bind(
                crypto.randomUUID(),
                id,
                m.type,
                m.type === "group_number"
                  ? (m.value ?? "")
                  : m.type === "url"
                    ? (m.value ?? "")
                    : null,
                m.sortOrder ?? i,
                ...assetBindings,
                id,
                mutationToken,
              ),
          );
        }
      }

      // 7. 审核备注 upsert
      if (hasSubmissionDetails) {
        if (existingDetailId) {
          batch.push(
            db
              .prepare(`UPDATE submission_details SET notes = ? WHERE group_id = ?${g("").sql}`)
              .bind(input.auditNotes, id, ...g("").bindings),
          );
        } else {
          batch.push(
            db
              .prepare(
                `INSERT INTO submission_details (id, group_id, contact, notes) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM groups WHERE id = ? AND mutation_token = ?)`,
              )
              .bind(crypto.randomUUID(), id, null, input.auditNotes, id, mutationToken),
          );
        }
      }

      // 8. 清理 mutation_token（作为最后一条语句放入 batch）
      batch.push(
        db
          .prepare("UPDATE groups SET mutation_token = NULL WHERE id = ? AND mutation_token = ?")
          .bind(id, mutationToken),
      );

      // ── 执行 batch ──
      const results = await db.batch(batch);
      // D1 验证: results[0].meta.changes 可靠（1=命中, 0=未命中）
      if (!results[0] || results[0].meta.changes === 0) {
        return { dto: null, versionConflict: true };
      }

      const dto = await this.getById(id);
      return { dto, versionConflict: false };
    },

    /** 软删除（移入回收站）：状态变化与板块关联清理在单 batch 中原子完成 */
    async softDelete(id: string): Promise<void> {
      const now = new Date().toISOString();
      await db.batch([
        db
          .prepare(
            "UPDATE groups SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
          )
          .bind(now, now, id),
        db.prepare("DELETE FROM board_groups WHERE group_id = ?").bind(id),
      ]);
    },

    /** 恢复 */
    async restore(id: string): Promise<AdminGroupDto | null> {
      const now = new Date().toISOString();
      const result = await db
        .prepare(
          "UPDATE groups SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL",
        )
        .bind(now, id)
        .run();

      if (!result.success) return null;

      // 恢复 logo asset 的 ref_count
      const group = await db
        .prepare("SELECT logo_r2_key FROM groups WHERE id = ?")
        .bind(id)
        .first<{ logo_r2_key: string | null }>();
      if (group?.logo_r2_key) {
        await db
          .prepare(
            "UPDATE assets SET ref_count = ref_count + 1, updated_at = ? WHERE r2_key = ? AND status = 'ready'",
          )
          .bind(now, group.logo_r2_key)
          .run();
      }

      return this.getById(id);
    },

    /**
     * 永久删除 — 状态机实现。
     *
     * 流程：
     * 1. 验证软删除记录（非软删除返回 STATE_CONFLICT）
     * 2. none → pending：开始清理
     * 3. pending：检查并清理 Logo/QR（调用方负责 R2 删除）
     * 4. r2_done：D1 batch 删除关联行 + 群聊行
     *
     * 返回 { action, logoR2Key, qrAssetIds } 供调用方协调 R2 操作。
     * 重复调用从当前状态继续。
     */
    async permanentDelete(id: string): Promise<{
      action: "STATE_CONFLICT" | "STARTED" | "R2_CLEANUP" | "DONE";
      logoR2Key: string | null;
      qrAssetIds: string[];
    }> {
      const now = new Date().toISOString();

      // 检查群聊状态
      const group = await db
        .prepare("SELECT deleted_at, purge_state, logo_r2_key FROM groups WHERE id = ?")
        .bind(id)
        .first<{
          deleted_at: string | null;
          purge_state: string | null;
          logo_r2_key: string | null;
        }>();

      if (!group) {
        return { action: "STATE_CONFLICT", logoR2Key: null, qrAssetIds: [] };
      }
      if (!group.deleted_at) {
        return { action: "STATE_CONFLICT", logoR2Key: null, qrAssetIds: [] };
      }

      const state = group.purge_state ?? "none";

      // 状态：none → 启动清理
      if (state === "none") {
        await db
          .prepare(
            `UPDATE groups SET
               purge_state = 'pending',
               purge_started_at = ?,
               purge_attempts = COALESCE(purge_attempts, 0) + 1,
               updated_at = ?
             WHERE id = ?`,
          )
          .bind(now, now, id)
          .run();

        return {
          action: "STARTED",
          logoR2Key: group.logo_r2_key,
          qrAssetIds: [],
        };
      }

      // 状态：pending → 收集需清理的 asset，等待 R2 操作
      if (state === "pending") {
        // 查询本群二维码 asset（排除仍被其他群引用的）
        const qrAssets = await db
          .prepare(
            `SELECT DISTINCT jm.asset_id, a.r2_key
             FROM join_methods jm
             JOIN assets a ON a.id = jm.asset_id
             WHERE jm.group_id = ?
               AND jm.asset_id IS NOT NULL
               AND a.status IN ('ready', 'delete_pending', 'delete_failed')
               AND (
                 SELECT COUNT(*) FROM join_methods jm2
                 WHERE jm2.asset_id = jm.asset_id AND jm2.group_id != ?
               ) = 0`,
          )
          .bind(id, id)
          .all<{ asset_id: string; r2_key: string }>();

        return {
          action: "R2_CLEANUP",
          logoR2Key: group.logo_r2_key,
          qrAssetIds: qrAssets.results.map((r) => r.asset_id),
        };
      }

      // 状态：r2_done → D1 批量删除
      if (state === "r2_done") {
        const exclusiveAssets = await db
          .prepare(
            `SELECT DISTINCT jm.asset_id
             FROM join_methods jm
             WHERE jm.group_id = ?
               AND jm.asset_id IS NOT NULL
               AND NOT EXISTS (
                 SELECT 1
                 FROM join_methods other
                 WHERE other.asset_id = jm.asset_id
                   AND other.group_id != ?
               )`,
          )
          .bind(id, id)
          .all<{ asset_id: string }>();

        const batch: D1PreparedStatement[] = [
          db.prepare("DELETE FROM likes WHERE group_id = ?").bind(id),
          db.prepare("DELETE FROM group_tags WHERE group_id = ?").bind(id),
          db.prepare("DELETE FROM board_groups WHERE group_id = ?").bind(id),
          db
            .prepare(
              `UPDATE assets
               SET ref_count = MAX(0, ref_count - 1),
                   updated_at = ?
               WHERE status = 'ready'
                 AND id IN (
                   SELECT DISTINCT asset_id
                   FROM join_methods
                   WHERE group_id = ? AND asset_id IS NOT NULL
                 )`,
            )
            .bind(now, id),
          db.prepare("DELETE FROM join_methods WHERE group_id = ?").bind(id),
          db.prepare("DELETE FROM submission_details WHERE group_id = ?").bind(id),
          ...exclusiveAssets.results.map((asset) =>
            db
              .prepare(
                "DELETE FROM assets WHERE id = ? AND status = 'delete_pending' AND ref_count = 0",
              )
              .bind(asset.asset_id),
          ),
          db
            .prepare(
              `UPDATE assets
               SET ref_count = MAX(0, ref_count - 1),
                   updated_at = ?
               WHERE r2_key = (SELECT logo_r2_key FROM groups WHERE id = ?)`,
            )
            .bind(now, id),
          db
            .prepare(
              `DELETE FROM assets
               WHERE r2_key = (SELECT logo_r2_key FROM groups WHERE id = ?)
                 AND ref_count = 0`,
            )
            .bind(id),
          db.prepare("DELETE FROM groups WHERE id = ?").bind(id),
        ];
        await db.batch(batch);

        return { action: "DONE", logoR2Key: null, qrAssetIds: [] };
      }

      // 未知状态
      return { action: "STATE_CONFLICT", logoR2Key: null, qrAssetIds: [] };
    },

    /**
     * 标记 R2 清理完成，进入 r2_done 状态。
     */
    async markR2PurgeDone(id: string): Promise<void> {
      await db
        .prepare(
          `UPDATE groups SET
             purge_state = 'r2_done',
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ? AND purge_state = 'pending'`,
        )
        .bind(id)
        .run();
    },

    /**
     * R2 清理失败，递增 attempts 并保存安全错误码。
     */
    async markR2PurgeFailed(id: string, errorCode: string, errorMessage: string): Promise<void> {
      await db
        .prepare(
          `UPDATE groups SET
             purge_attempts = COALESCE(purge_attempts, 0) + 1,
             purge_last_error_code = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?`,
        )
        .bind(errorCode, id)
        .run();
    },
  };
}

export type GroupRepository = ReturnType<typeof createGroupRepository>;
