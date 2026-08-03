import type { BoardDto, BoardMemberDto } from "@shared/contracts/board";
import type { BoardSortMode } from "@shared/domain";

// ─── D1 行类型 ──────────────────────────────────────────

interface BoardRow {
  id: string;
  title: string;
  is_enabled: number;
  position: number;
  sort_mode: string;
  version: number;
  created_at: string;
  updated_at: string;
}

interface MemberRow {
  board_id: string;
  group_id: string;
  position: number;
  created_at: string;
  title: string;
  status: string;
}

function mapBoard(row: BoardRow, memberCount: number): BoardDto {
  return {
    id: row.id,
    title: row.title,
    isEnabled: row.is_enabled === 1,
    position: row.position,
    sortMode: row.sort_mode as BoardSortMode,
    version: row.version,
    memberCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const MEMBER_COUNT_SQL = "(SELECT COUNT(*) FROM board_groups bg WHERE bg.board_id = b.id)";

export type AddMemberResult = "OK" | "NOT_FOUND" | "TRASH" | "INVALID_STATUS" | "DUPLICATE";

export function createBoardRepository(db: D1Database) {
  return {
    /** 板块列表（含成员数量），按 position ASC, id ASC */
    async listBoards(): Promise<BoardDto[]> {
      const rows = await db
        .prepare(
          `SELECT b.*, ${MEMBER_COUNT_SQL} AS member_count
           FROM boards b ORDER BY b.position ASC, b.id ASC`,
        )
        .all<BoardRow & { member_count: number }>();
      return rows.results.map((r) => mapBoard(r, r.member_count));
    },

    /** 单板块详情 */
    async getBoard(id: string): Promise<BoardDto | null> {
      const row = await db
        .prepare(`SELECT b.*, ${MEMBER_COUNT_SQL} AS member_count FROM boards b WHERE b.id = ?`)
        .bind(id)
        .first<BoardRow & { member_count: number }>();
      if (!row) return null;
      return mapBoard(row, row.member_count);
    },

    /** 创建板块：position 追加到末尾 */
    async createBoard(input: { title: string }): Promise<BoardDto> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db
        .prepare(
          `INSERT INTO boards (id, title, is_enabled, position, sort_mode, version, created_at, updated_at)
           SELECT ?, ?, 1, COALESCE((SELECT MAX(position) + 1 FROM boards), 0), 'manual_asc', 1, ?, ?`,
        )
        .bind(id, input.title, now, now)
        .run();
      return (await this.getBoard(id))!;
    },

    /** 更新板块：版本冲突返回 versionConflict，不覆盖他人更新 */
    async updateBoard(
      id: string,
      input: {
        title?: string;
        isEnabled?: boolean;
        sortMode?: BoardSortMode;
        version: number;
      },
    ): Promise<{ board: BoardDto | null; versionConflict: boolean }> {
      const now = new Date().toISOString();
      const setters: string[] = ["updated_at = ?", "version = version + 1"];
      const bindings: unknown[] = [now];
      if (input.title !== undefined) {
        setters.push("title = ?");
        bindings.push(input.title);
      }
      if (input.isEnabled !== undefined) {
        setters.push("is_enabled = ?");
        bindings.push(input.isEnabled ? 1 : 0);
      }
      if (input.sortMode !== undefined) {
        setters.push("sort_mode = ?");
        bindings.push(input.sortMode);
      }
      bindings.push(id, input.version);
      const result = await db
        .prepare(`UPDATE boards SET ${setters.join(", ")} WHERE id = ? AND version = ?`)
        .bind(...bindings)
        .run();
      if (result.meta.changes === 0) {
        const exists = await db.prepare("SELECT 1 FROM boards WHERE id = ?").bind(id).first();
        return { board: null, versionConflict: exists !== null };
      }
      return { board: await this.getBoard(id), versionConflict: false };
    },

    /** 删除板块：成员关联与板块在同一 batch 删除（配合外键级联） */
    async deleteBoard(id: string): Promise<void> {
      await db.batch([
        db.prepare("DELETE FROM board_groups WHERE board_id = ?").bind(id),
        db.prepare("DELETE FROM boards WHERE id = ?").bind(id),
      ]);
    },

    /**
     * 批量更新板块顺序。
     *
     * 等效并发保护：目标列表必须与当前板块集合完全一致（数量、去重、元素），
     * 不一致返回 conflict，不产生部分写入。整批原子执行。
     */
    async reorderBoards(boardIds: string[]): Promise<{ ok: boolean; conflict: boolean }> {
      const existing = await db.prepare("SELECT id FROM boards").all<{ id: string }>();
      const existingIds = existing.results.map((r) => r.id);
      const idSet = new Set(boardIds);
      const valid =
        existingIds.length === boardIds.length &&
        new Set(boardIds).size === boardIds.length &&
        existingIds.every((id) => idSet.has(id));
      if (!valid) {
        return { ok: false, conflict: true };
      }

      const now = new Date().toISOString();
      await db.batch(
        boardIds.map((id, index) =>
          db
            .prepare(
              "UPDATE boards SET position = ?, version = version + 1, updated_at = ? WHERE id = ?",
            )
            .bind(index, now, id),
        ),
      );
      return { ok: true, conflict: false };
    },

    /** 启用板块（公开查询） */
    async listEnabledBoards(): Promise<BoardDto[]> {
      const rows = await db
        .prepare(
          `SELECT b.*, ${MEMBER_COUNT_SQL} AS member_count
           FROM boards b WHERE b.is_enabled = 1 ORDER BY b.position ASC, b.id ASC`,
        )
        .all<BoardRow & { member_count: number }>();
      return rows.results.map((r) => mapBoard(r, r.member_count));
    },

    // ─── 成员 ────────────────────────────────────────────

    /** 板块成员列表（含群组标题与状态），按 position ASC, group_id ASC */
    async listMembers(boardId: string): Promise<BoardMemberDto[]> {
      const rows = await db
        .prepare(
          `SELECT bg.board_id, bg.group_id, bg.position, bg.created_at, g.title, g.status
           FROM board_groups bg JOIN groups g ON g.id = bg.group_id
           WHERE bg.board_id = ? ORDER BY bg.position ASC, bg.group_id ASC`,
        )
        .bind(boardId)
        .all<MemberRow>();
      return rows.results.map((r) => ({
        groupId: r.group_id,
        title: r.title,
        status: r.status as BoardMemberDto["status"],
        position: r.position,
      }));
    },

    /** 批量取多个板块的成员（公开板块查询，避免 N+1） */
    async listMembersByBoards(boardIds: string[]): Promise<MemberRow[]> {
      if (boardIds.length === 0) return [];
      const rows = await db
        .prepare(
          `SELECT bg.board_id, bg.group_id, bg.position, bg.created_at, g.title, g.status
           FROM board_groups bg JOIN groups g ON g.id = bg.group_id
           WHERE bg.board_id IN (${boardIds.map(() => "?").join(",")})
           ORDER BY bg.board_id ASC, bg.position ASC, bg.group_id ASC`,
        )
        .bind(...boardIds)
        .all<MemberRow>();
      return rows.results;
    },

    /**
     * 添加成员。
     *
     * 规则（PRD §15.6）：published/delisted 可加，trash 拒绝，重复成员拒绝；
     * 位置追加到末尾。PK (board_id, group_id) 作为防重兜底。
     */
    async addMember(boardId: string, groupId: string): Promise<AddMemberResult> {
      const board = await db.prepare("SELECT 1 FROM boards WHERE id = ?").bind(boardId).first();
      if (!board) return "NOT_FOUND";

      const group = await db
        .prepare("SELECT status, deleted_at FROM groups WHERE id = ?")
        .bind(groupId)
        .first<{ status: string; deleted_at: string | null }>();
      if (!group) return "NOT_FOUND";
      if (group.deleted_at) return "TRASH";
      if (group.status !== "published" && group.status !== "delisted") return "INVALID_STATUS";

      const now = new Date().toISOString();
      try {
        await db
          .prepare(
            `INSERT INTO board_groups (board_id, group_id, position, created_at)
             SELECT ?, ?, COALESCE((SELECT MAX(position) + 1 FROM board_groups WHERE board_id = ?), 0), ?`,
          )
          .bind(boardId, groupId, boardId, now)
          .run();
        return "OK";
      } catch {
        return "DUPLICATE";
      }
    },

    /** 移除成员关联（不删除群组） */
    async removeMember(boardId: string, groupId: string): Promise<boolean> {
      const result = await db
        .prepare("DELETE FROM board_groups WHERE board_id = ? AND group_id = ?")
        .bind(boardId, groupId)
        .run();
      return result.meta.changes > 0;
    },

    /**
     * 上移/下移成员：相邻位置交换，单 batch 原子执行。
     * 第一项上移 / 最后一项下移返回 NOOP（幂等），不产生负位置或越界。
     */
    async moveMember(
      boardId: string,
      groupId: string,
      direction: "up" | "down",
    ): Promise<"OK" | "NOOP" | "NOT_FOUND"> {
      const members = await db
        .prepare(
          "SELECT group_id, position FROM board_groups WHERE board_id = ? ORDER BY position ASC, group_id ASC",
        )
        .bind(boardId)
        .all<{ group_id: string; position: number }>();
      const index = members.results.findIndex((m) => m.group_id === groupId);
      if (index < 0) return "NOT_FOUND";

      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= members.results.length) return "NOOP";

      const current = members.results[index]!;
      const neighbor = members.results[target]!;
      await db.batch([
        db
          .prepare("UPDATE board_groups SET position = ? WHERE board_id = ? AND group_id = ?")
          .bind(neighbor.position, boardId, current.group_id),
        db
          .prepare("UPDATE board_groups SET position = ? WHERE board_id = ? AND group_id = ?")
          .bind(current.position, boardId, neighbor.group_id),
      ]);
      return "OK";
    },

    /** 永久删除群组时清理其全部板块关联（配合永久删除 batch） */
    async clearGroupFromAllBoards(groupId: string): Promise<void> {
      await db.prepare("DELETE FROM board_groups WHERE group_id = ?").bind(groupId).run();
    },
  };
}

export type BoardRepository = ReturnType<typeof createBoardRepository>;
