import type { AdminGroupDto } from "@shared/contracts/group";

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
    joinMethods: methods.map((m) => ({
      type: m.type,
      value: m.value ?? undefined,
      url: m.type === "url" ? (m.value ?? undefined) : undefined,
      qrCodeUrl: m.type === "qr_code" ? (m.value ?? undefined) : undefined,
    })),
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
        const pattern = `%${q}%`;
        whereClause += ` AND (g.title LIKE ? OR g.id IN (SELECT DISTINCT gt.group_id FROM group_tags gt WHERE gt.tag LIKE ?))`;
        bindings.push(pattern, pattern);
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
            `SELECT group_id, type, value, sort_order FROM join_methods WHERE group_id IN (${groupIds.map(() => "?").join(",")}) ORDER BY sort_order ASC`,
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
      for (const r of methodsResult.results) {
        if (!methodsByGroup.has(r.group_id)) methodsByGroup.set(r.group_id, []);
        methodsByGroup
          .get(r.group_id)!
          .push({ type: r.type, value: r.value, sort_order: r.sort_order });
      }

      const detailsByGroup = new Map<string, SubmissionDetailRow>();
      for (const r of detailsResult.results) {
        detailsByGroup.set(r.group_id, { contact: r.contact, notes: r.notes });
      }

      const items = sliced.map((g) =>
        mapToAdminDto(
          g,
          tagsByGroup.get(g.id) ?? [],
          methodsByGroup.get(g.id) ?? [],
          detailsByGroup.get(g.id) ?? null,
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
            "SELECT type, value, sort_order FROM join_methods WHERE group_id = ? ORDER BY sort_order ASC",
          )
          .bind(id)
          .all<JoinMethodRow>(),
        db
          .prepare("SELECT contact, notes FROM submission_details WHERE group_id = ?")
          .bind(id)
          .first<SubmissionDetailRow>(),
      ]);

      return mapToAdminDto(group, tagsResult.results, methodsResult.results, detail ?? null);
    },

    /** 创建群聊 + 关联数据（在 D1 batch 中原子写入） */
    async create(input: {
      title: string;
      description?: string;
      kind: string;
      platform: string;
      tags: string[];
      joinMethods: { type: string; value: string }[];
      contact?: string;
      notes?: string;
    }): Promise<AdminGroupDto> {
      const id = crypto.randomUUID();
      const rotationKey = crypto.randomUUID();
      const now = new Date().toISOString();

      const batch: D1PreparedStatement[] = [
        db
          .prepare(
            `INSERT INTO groups (id, title, description, kind, platform, status, rotation_key, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
          )
          .bind(
            id,
            input.title,
            input.description ?? "",
            input.kind,
            input.platform,
            rotationKey,
            now,
            now,
          ),
      ];

      // 标签
      if (input.tags.length > 0) {
        for (let i = 0; i < input.tags.length; i++) {
          batch.push(
            db
              .prepare("INSERT INTO group_tags (id, group_id, tag, sort_order) VALUES (?, ?, ?, ?)")
              .bind(crypto.randomUUID(), id, input.tags[i]!, i),
          );
        }
      }

      // 加群方式
      for (let i = 0; i < input.joinMethods.length; i++) {
        const m = input.joinMethods[i]!;
        batch.push(
          db
            .prepare(
              "INSERT INTO join_methods (id, group_id, type, value, sort_order) VALUES (?, ?, ?, ?, ?)",
            )
            .bind(crypto.randomUUID(), id, m.type, m.value, i),
        );
      }

      // 提交详情
      batch.push(
        db
          .prepare(
            "INSERT INTO submission_details (id, group_id, contact, notes) VALUES (?, ?, ?, ?)",
          )
          .bind(crypto.randomUUID(), id, input.contact ?? null, input.notes ?? null),
      );

      await db.batch(batch);

      return (await this.getById(id))!;
    },

    // ─── 管理员方法 ────────────────────────────────────────

    /** 管理员全量列表 */
    async listAll(params: {
      status?: string;
      deleted?: boolean;
      cursor?: string;
      limit: number;
    }): Promise<{ items: AdminGroupDto[]; total: number }> {
      const { status, deleted, limit } = params;
      const conditions: string[] = [];
      const bindings: unknown[] = [];

      if (status) {
        conditions.push("g.status = ?");
        bindings.push(status);
      }
      if (deleted) {
        conditions.push("g.deleted_at IS NOT NULL");
      } else {
        conditions.push("g.deleted_at IS NULL");
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const countResult = await db
        .prepare(`SELECT COUNT(*) as total FROM groups g ${whereClause}`)
        .bind(...bindings)
        .first<{ total: number }>();
      const total = countResult?.total ?? 0;

      if (total === 0) return { items: [], total: 0 };

      const rows = await db
        .prepare(`SELECT g.* FROM groups g ${whereClause} ORDER BY g.created_at DESC LIMIT ?`)
        .bind(...bindings, limit)
        .all<GroupRow>();

      const groupIds = rows.results.map((r) => r.id);
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
            `SELECT group_id, type, value, sort_order FROM join_methods WHERE group_id IN (${groupIds.map(() => "?").join(",")}) ORDER BY sort_order ASC`,
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
      for (const r of methodsResult.results) {
        if (!methodsByGroup.has(r.group_id)) methodsByGroup.set(r.group_id, []);
        methodsByGroup
          .get(r.group_id)!
          .push({ type: r.type, value: r.value, sort_order: r.sort_order });
      }
      const detailsByGroup = new Map<string, SubmissionDetailRow>();
      for (const r of detailsResult.results) {
        detailsByGroup.set(r.group_id, { contact: r.contact, notes: r.notes });
      }

      const items = rows.results.map((g) =>
        mapToAdminDto(
          g,
          tagsByGroup.get(g.id) ?? [],
          methodsByGroup.get(g.id) ?? [],
          detailsByGroup.get(g.id) ?? null,
        ),
      );

      return { items, total };
    },

    /** 乐观锁更新 */
    async update(id: string, fields: Record<string, unknown>): Promise<AdminGroupDto> {
      const now = new Date().toISOString();
      const setters: string[] = ["updated_at = ?"];
      const bindings: unknown[] = [now];

      const allowedFields = [
        "title",
        "description",
        "kind",
        "platform",
        "status",
        "logo_url",
        "logo_width",
        "logo_height",
        "logo_byte_length",
      ];
      for (const key of allowedFields) {
        if (key in fields) {
          setters.push(`${key} = ?`);
          bindings.push(fields[key]);
        }
      }

      // 版本递增
      setters.push("version = version + 1");
      bindings.push(id);

      await db
        .prepare(`UPDATE groups SET ${setters.join(", ")} WHERE id = ?`)
        .bind(...bindings)
        .run();

      return (await this.getById(id))!;
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

    /** 永久删除 */
    async permanentDelete(id: string): Promise<void> {
      const batch: D1PreparedStatement[] = [
        db.prepare("DELETE FROM likes WHERE group_id = ?").bind(id),
        db.prepare("DELETE FROM group_tags WHERE group_id = ?").bind(id),
        db.prepare("DELETE FROM join_methods WHERE group_id = ?").bind(id),
        db.prepare("DELETE FROM submission_details WHERE group_id = ?").bind(id),
        db.prepare("DELETE FROM groups WHERE id = ?").bind(id),
      ];
      await db.batch(batch);
    },
  };
}

export type GroupRepository = ReturnType<typeof createGroupRepository>;
