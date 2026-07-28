import type { AdminGroupDto } from "@shared/contracts/group";
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

// ─── 行 → DTO 映射 ──────────────────────────────────────

function mapToAdminDto(
  group: GroupRow,
  tags: TagRow[],
  methods: JoinMethodRow[],
  detail: SubmissionDetailRow | null,
  assetLookup: Map<string, AssetJoinRow>,
): AdminGroupDto {
  const hasLogo = group.logo_url !== null;
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
          m.type === "qr_code"
            ? asset?.r2_key
              ? `asset:${m.asset_id}` // placeholder — routes resolve via asset service
              : (m.value ?? undefined)
            : undefined,
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
  };
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
      const pattern = `%${normalized}%`;
      conditions.push(
        "(g.title LIKE ? COLLATE NOCASE OR g.description LIKE ? COLLATE NOCASE OR EXISTS (SELECT 1 FROM group_tags gt WHERE gt.group_id = g.id AND gt.tag LIKE ? COLLATE NOCASE))",
      );
      bindings.push(pattern, pattern, pattern);
    }
  }

  return {
    sql: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    bindings,
  };
}

// ─── 查询 ────────────────────────────────────────────────

export function createGroupRepository(db: D1Database) {
  return {
    /** 分页列出已发布/已下架的群聊 */
    async listPublished(params: {
      q?: string;
      cursor?: string | null;
      limit: number;
      rotationOrdinal: number;
      skip?: number;
    }): Promise<{ items: AdminGroupDto[]; total: number }> {
      const { q, limit, rotationOrdinal, skip = 0 } = params;

      let whereClause = `g.status IN ('published', 'delisted') AND g.deleted_at IS NULL`;
      const bindings: unknown[] = [];

      if (q) {
        const normalized = normalizeSearchQuery(q);
        if (normalized) {
          const pattern = `%${normalized}%`;
          whereClause += ` AND (g.title LIKE ? COLLATE NOCASE OR g.description LIKE ? COLLATE NOCASE OR g.id IN (SELECT DISTINCT gt.group_id FROM group_tags gt WHERE gt.tag LIKE ? COLLATE NOCASE))`;
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

      // 内存中循环位移 + 分页
      const allItems = allRows.results;
      const baseOffset = rotationOrdinal % total;
      const startIdx = (baseOffset + skip) % total;
      let sliced: GroupRow[];
      if (startIdx + limit <= total) {
        sliced = allItems.slice(startIdx, startIdx + limit);
      } else {
        sliced = [...allItems.slice(startIdx), ...allItems.slice(0, (startIdx + limit) % total)];
      }

      // 批量加载标签、加群方式、提交详情
      const groupIds = sliced.map((r) => r.id);
      if (groupIds.length === 0) return { items: [], total };

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

      // 按 group_id 分组
      const tagsByGroup = new Map<string, TagRow[]>();
      for (const r of tagsResult.results) {
        if (!tagsByGroup.has(r.group_id)) tagsByGroup.set(r.group_id, []);
        tagsByGroup.get(r.group_id)!.push({ tag: r.tag, sort_order: r.sort_order });
      }

      const methodsByGroup = new Map<string, JoinMethodRow[]>();
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

      const detailsByGroup = new Map<string, SubmissionDetailRow>();
      for (const r of detailsResult.results) {
        detailsByGroup.set(r.group_id, { contact: r.contact, notes: r.notes });
      }

      // 批量加载 asset 数据
      const assetLookup = new Map<string, AssetJoinRow>();
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

      const items = sliced.map((g) =>
        mapToAdminDto(
          g,
          tagsByGroup.get(g.id) ?? [],
          methodsByGroup.get(g.id) ?? [],
          detailsByGroup.get(g.id) ?? null,
          assetLookup,
        ),
      );

      return { items, total };
    },

    /** 按 ID 查询单个群聊 */
    async getById(id: string): Promise<AdminGroupDto | null> {
      const group = await db
        .prepare("SELECT * FROM groups WHERE id = ?")
        .bind(id)
        .first<GroupRow>();

      if (!group) return null;

      const [tagsResult, methodsResult, detail] = await Promise.all([
        db
          .prepare(
            "SELECT tag, sort_order FROM group_tags WHERE group_id = ? ORDER BY sort_order ASC",
          )
          .bind(id)
          .all<TagRow>(),
        db
          .prepare(
            "SELECT type, value, sort_order, asset_id FROM join_methods WHERE group_id = ? ORDER BY sort_order ASC",
          )
          .bind(id)
          .all<JoinMethodRow>(),
        db
          .prepare("SELECT contact, notes FROM submission_details WHERE group_id = ?")
          .bind(id)
          .first<SubmissionDetailRow>(),
      ]);

      // 加载 asset 数据
      const assetLookup = new Map<string, AssetJoinRow>();
      const assetIds = methodsResult.results.filter((m) => m.asset_id).map((m) => m.asset_id!);
      if (assetIds.length > 0) {
        const assetRows = await db
          .prepare(
            `SELECT id as asset_id, r2_key, purpose, content_type, byte_length, width, height, status, ref_count
             FROM assets WHERE id IN (${assetIds.map(() => "?").join(",")})`,
          )
          .bind(...assetIds)
          .all<AssetJoinRow>();
        for (const a of assetRows.results) {
          assetLookup.set(a.asset_id, a);
        }
      }

      return mapToAdminDto(
        group,
        tagsResult.results,
        methodsResult.results,
        detail ?? null,
        assetLookup,
      );
    },

    /** 创建群聊 + 关联数据（在 D1 batch 中原子写入） */
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
    }): Promise<AdminGroupDto> {
      const id = crypto.randomUUID();
      const rotationKey = crypto.randomUUID();
      const now = new Date().toISOString();
      const status = input.status ?? "pending";

      const batch: D1PreparedStatement[] = [
        db
          .prepare(
            `INSERT INTO groups (id, title, description, kind, platform, status, rotation_key, logo_r2_key, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            input.title,
            input.description ?? "",
            input.kind,
            input.platform,
            status,
            rotationKey,
            input.logoR2Key ?? null,
            now,
            now,
          ),
      ];

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
        batch.push(
          db
            .prepare(
              "INSERT INTO join_methods (id, group_id, type, value, sort_order, asset_id) VALUES (?, ?, ?, ?, ?, ?)",
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
              sortOrder,
              m.type === "qr_code" ? (m.assetId ?? null) : null,
            ),
        );
      }

      // 提交详情（auditNotes 写入 notes，contact 留空）
      batch.push(
        db
          .prepare(
            "INSERT INTO submission_details (id, group_id, contact, notes) VALUES (?, ?, ?, ?)",
          )
          .bind(crypto.randomUUID(), id, null, input.auditNotes ?? null),
      );

      await db.batch(batch);

      return (await this.getById(id))!;
    },

    // ─── 管理员方法 ────────────────────────────────────────

    /** 管理员全量列表（多状态筛选 + 全文搜索 + 多列排序 + keyset 游标分页） */
    async listAll(params: {
      statuses: GroupStatus[];
      deleted: boolean;
      q?: string;
      sortBy?: "title" | "kind" | "status" | "platform" | "tags" | "likeCount";
      sortDir: "asc" | "desc";
      cursor?: string | null;
      limit: number;
    }): Promise<{ items: AdminGroupDto[]; total: number; nextCursor: string | null }> {
      const { statuses, deleted, q, sortBy, sortDir, cursor, limit } = params;

      // ── 共享 WHERE 子句（COUNT 与 items 查询共用） ──
      const { sql: whereSql, bindings: whereBindings } = buildWhereClause({
        statuses,
        deleted,
        q,
      });

      // COUNT
      const countResult = await db
        .prepare(`SELECT COUNT(*) as total FROM groups g ${whereSql}`)
        .bind(...whereBindings)
        .first<{ total: number }>();
      const total = countResult?.total ?? 0;

      if (total === 0) return { items: [], total: 0, nextCursor: null };

      // ── ORDER BY ──
      let orderBy: string;
      switch (sortBy) {
        case "title":
          orderBy = `g.title COLLATE NOCASE ${sortDir}, g.id ${sortDir}`;
          break;
        case "kind":
          orderBy = `CASE g.kind WHEN 'official' THEN 0 ELSE 1 END ${sortDir}, g.id ${sortDir}`;
          break;
        case "status":
          orderBy = `CASE g.status WHEN 'pending' THEN 0 WHEN 'published' THEN 1 WHEN 'rejected' THEN 2 WHEN 'delisted' THEN 3 END ${sortDir}, g.id ${sortDir}`;
          break;
        case "platform":
          orderBy = `g.platform COLLATE NOCASE ${sortDir}, g.id ${sortDir}`;
          break;
        case "tags":
          orderBy = `COALESCE((SELECT gt.tag FROM group_tags gt WHERE gt.group_id = g.id ORDER BY gt.sort_order ASC LIMIT 1), '') COLLATE NOCASE ${sortDir}, g.id ${sortDir}`;
          break;
        case "likeCount":
          orderBy = `g.like_count ${sortDir}, g.id ${sortDir}`;
          break;
        default:
          orderBy = "g.created_at DESC, g.id DESC";
      }

      // ── keyset 游标 ──
      const cursorBindings: unknown[] = [];
      let cursorSql = "";

      if (cursor) {
        try {
          const decoded = JSON.parse(atob(cursor)) as { k: string };
          if (decoded.k) {
            if (!sortBy) {
              // 默认排序 (created_at DESC)：需游标项的 created_at
              const cursorItem = await db
                .prepare("SELECT created_at FROM groups WHERE id = ?")
                .bind(decoded.k)
                .first<{ created_at: string }>();
              if (cursorItem) {
                cursorSql = " AND (g.created_at < ? OR (g.created_at = ? AND g.id < ?))";
                cursorBindings.push(cursorItem.created_at, cursorItem.created_at, decoded.k);
              }
            } else if (sortDir === "asc") {
              cursorSql = " AND g.id > ?";
              cursorBindings.push(decoded.k);
            } else {
              cursorSql = " AND g.id < ?";
              cursorBindings.push(decoded.k);
            }
          }
        } catch {
          /* 无效游标，忽略 */
        }
      }

      // ── items 查询 ──
      const allBindings = [...whereBindings, ...cursorBindings, limit];
      const rows = await db
        .prepare(`SELECT g.* FROM groups g ${whereSql}${cursorSql} ORDER BY ${orderBy} LIMIT ?`)
        .bind(...allBindings)
        .all<GroupRow>();

      const groupIds = rows.results.map((r) => r.id);
      if (groupIds.length === 0) return { items: [], total, nextCursor: null };

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

      const tagsByGroup = new Map<string, TagRow[]>();
      for (const r of tagsResult.results) {
        if (!tagsByGroup.has(r.group_id)) tagsByGroup.set(r.group_id, []);
        tagsByGroup.get(r.group_id)!.push({ tag: r.tag, sort_order: r.sort_order });
      }
      const methodsByGroup = new Map<string, JoinMethodRow[]>();
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
      const detailsByGroup = new Map<string, SubmissionDetailRow>();
      for (const r of detailsResult.results) {
        detailsByGroup.set(r.group_id, { contact: r.contact, notes: r.notes });
      }

      // 批量加载 asset 数据
      const assetLookup = new Map<string, AssetJoinRow>();
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

      const items = rows.results.map((g) =>
        mapToAdminDto(
          g,
          tagsByGroup.get(g.id) ?? [],
          methodsByGroup.get(g.id) ?? [],
          detailsByGroup.get(g.id) ?? null,
          assetLookup,
        ),
      );

      // nextCursor
      const lastItem = items[items.length - 1];
      const nextCursor =
        items.length === limit && lastItem ? btoa(JSON.stringify({ k: lastItem.id })) : null;

      return { items, total, nextCursor };
    },

    /** 原子更新（乐观锁） */
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
        version: number;
        /** 需要 adopt 的 asset ID 列表（staged → ready） */
        adoptAssetIds?: string[];
      },
    ): Promise<{ dto: AdminGroupDto | null; versionConflict: boolean }> {
      const now = new Date().toISOString();

      // ── 步骤 1：乐观锁更新 groups 主表 ──
      const setters: string[] = ["updated_at = ?"];
      const bindings: unknown[] = [now];

      const stringFields: (keyof typeof input)[] = [
        "title",
        "description",
        "kind",
        "platform",
        "status",
      ];
      for (const key of stringFields) {
        if (input[key] !== undefined) {
          setters.push(`${key} = ?`);
          bindings.push(input[key]);
        }
      }

      // 版本递增作为乐观锁
      bindings.push(id, input.version);

      const updateResult = await db
        .prepare(
          `UPDATE groups SET ${setters.join(", ")}, version = version + 1 WHERE id = ? AND version = ?`,
        )
        .bind(...bindings)
        .run();

      // 版本冲突：没有行被更新
      if (updateResult.meta.changes === 0) {
        // 确认是版本冲突还是群聊不存在
        const exists = await db
          .prepare("SELECT id FROM groups WHERE id = ?")
          .bind(id)
          .first<{ id: string }>();
        if (!exists) return { dto: null, versionConflict: false };
        return { dto: null, versionConflict: true };
      }

      // ── 步骤 2：adopt 新引用的 staged asset ──
      if (input.adoptAssetIds && input.adoptAssetIds.length > 0) {
        for (const assetId of input.adoptAssetIds) {
          await db
            .prepare(
              `UPDATE assets SET status = 'ready', ref_count = ref_count + 1, updated_at = ? WHERE id = ? AND status = 'staged'`,
            )
            .bind(now, assetId)
            .run();
        }
      }

      // ── 步骤 3：标签完全替换 ──
      if (input.tags !== undefined) {
        await db.prepare("DELETE FROM group_tags WHERE group_id = ?").bind(id).run();

        const validTags = input.tags.filter((t) => t.trim().length > 0);
        for (let i = 0; i < validTags.length; i++) {
          await db
            .prepare("INSERT INTO group_tags (id, group_id, tag, sort_order) VALUES (?, ?, ?, ?)")
            .bind(crypto.randomUUID(), id, validTags[i]!, i)
            .run();
        }
      }

      // ── 步骤 4：加群方式完全替换 ──
      if (input.joinMethods !== undefined) {
        await db.prepare("DELETE FROM join_methods WHERE group_id = ?").bind(id).run();

        for (let i = 0; i < input.joinMethods.length; i++) {
          const m = input.joinMethods[i]!;
          const sortOrder = m.sortOrder ?? i;
          await db
            .prepare(
              "INSERT INTO join_methods (id, group_id, type, value, sort_order, asset_id) VALUES (?, ?, ?, ?, ?, ?)",
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
              sortOrder,
              m.type === "qr_code" ? (m.assetId ?? null) : null,
            )
            .run();
        }
      }

      // ── 步骤 5：审核备注 upsert ──
      if (input.auditNotes !== undefined) {
        const existing = await db
          .prepare("SELECT id FROM submission_details WHERE group_id = ?")
          .bind(id)
          .first<{ id: string }>();

        if (existing) {
          await db
            .prepare("UPDATE submission_details SET notes = ? WHERE group_id = ?")
            .bind(input.auditNotes, id)
            .run();
        } else {
          await db
            .prepare(
              "INSERT INTO submission_details (id, group_id, contact, notes) VALUES (?, ?, ?, ?)",
            )
            .bind(crypto.randomUUID(), id, null, input.auditNotes)
            .run();
        }
      }

      // ── 步骤 6：返回权威 DTO ──
      const dto = await this.getById(id);
      return { dto, versionConflict: false };
    },

    /** 软删除 */
    async softDelete(id: string): Promise<void> {
      const now = new Date().toISOString();
      await db
        .prepare(
          "UPDATE groups SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(now, now, id)
        .run();
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
        const batch: D1PreparedStatement[] = [
          db.prepare("DELETE FROM likes WHERE group_id = ?").bind(id),
          db.prepare("DELETE FROM group_tags WHERE group_id = ?").bind(id),
          db.prepare("DELETE FROM join_methods WHERE group_id = ?").bind(id),
          db.prepare("DELETE FROM submission_details WHERE group_id = ?").bind(id),
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
