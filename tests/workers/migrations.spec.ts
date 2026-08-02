import { applyD1Migrations, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("D1 migrations", () => {
  it("upgrades a 0003 database to 0004 without rebuilding the schema", async () => {
    await applyD1Migrations(env.MIGRATION_DB, env.TEST_MIGRATIONS.slice(0, 3));

    const before = await env.MIGRATION_DB.prepare("PRAGMA table_info(groups)").all<{
      name: string;
    }>();
    expect(before.results.some((column) => column.name === "last_published_at")).toBe(false);
    const boardsBefore = await env.MIGRATION_DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'boards'",
    ).first();
    expect(boardsBefore).toBeNull();

    await applyD1Migrations(env.MIGRATION_DB, env.TEST_MIGRATIONS);

    const after = await env.MIGRATION_DB.prepare("PRAGMA table_info(groups)").all<{
      name: string;
    }>();
    expect(after.results.some((column) => column.name === "last_published_at")).toBe(true);

    const boards = await env.MIGRATION_DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('boards', 'board_groups') ORDER BY name",
    ).all<{ name: string }>();
    expect(boards.results.map(({ name }) => name)).toEqual(["board_groups", "boards"]);

    const applied = await env.MIGRATION_DB.prepare(
      "SELECT name FROM d1_migrations ORDER BY id",
    ).all<{ name: string }>();
    expect(applied.results.map(({ name }) => name)).toEqual([
      "0001_initial.sql",
      "0002_admin_group_management.sql",
      "0003_group_mutation_token.sql",
      "0004_board_management.sql",
    ]);
  });

  it("creates exactly one default board and keeps existing last_published_at NULL", async () => {
    await applyD1Migrations(env.MIGRATION_DB, env.TEST_MIGRATIONS);

    const count = await env.MIGRATION_DB.prepare("SELECT COUNT(*) AS count FROM boards").first<{
      count: number;
    }>();
    expect(count?.count).toBe(1);

    const board = await env.MIGRATION_DB.prepare(
      "SELECT id, title, is_enabled, position, sort_mode FROM boards LIMIT 1",
    ).first<{
      id: string;
      title: string;
      is_enabled: number;
      position: number;
      sort_mode: string;
    }>();
    expect(board).toMatchObject({
      id: "00000000-0000-4000-8000-000000000001",
      title: "自定板块",
      is_enabled: 1,
      position: 0,
      sort_mode: "manual_asc",
    });

    // 已有群组的 last_published_at 保持 NULL（不回填）
    const existing = await env.MIGRATION_DB.prepare(
      "SELECT COUNT(*) AS count FROM groups WHERE last_published_at IS NOT NULL",
    ).first<{ count: number }>();
    expect(existing?.count).toBe(0);
  });

  it("does not create a second default board when the insert is re-run", async () => {
    await applyD1Migrations(env.MIGRATION_DB, env.TEST_MIGRATIONS);

    // 模拟重复执行默认板块插入语句
    await env.MIGRATION_DB.prepare(
      `INSERT INTO boards (id, title, is_enabled, position, sort_mode, version)
       SELECT '00000000-0000-4000-8000-000000000001', '自定板块', 1, 0, 'manual_asc', 1
       WHERE NOT EXISTS (SELECT 1 FROM boards)`,
    ).run();

    const count = await env.MIGRATION_DB.prepare("SELECT COUNT(*) AS count FROM boards").first<{
      count: number;
    }>();
    expect(count?.count).toBe(1);
  });

  it("enforces board_groups primary key and foreign key cascade", async () => {
    await applyD1Migrations(env.MIGRATION_DB, env.TEST_MIGRATIONS);

    const groupId = crypto.randomUUID();
    await env.MIGRATION_DB.prepare(
      `INSERT INTO groups (id, title, description, kind, platform, status, rotation_key, created_at, updated_at)
       VALUES (?, '级联测试', '', 'interest', 'qq', 'published', ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    )
      .bind(groupId, crypto.randomUUID())
      .run();

    const boardId = "00000000-0000-4000-8000-000000000001";
    await env.MIGRATION_DB.prepare(
      "INSERT INTO board_groups (board_id, group_id, position) VALUES (?, ?, 0)",
    )
      .bind(boardId, groupId)
      .run();

    // 复合主键防重
    let duplicateRejected = false;
    try {
      await env.MIGRATION_DB.prepare(
        "INSERT INTO board_groups (board_id, group_id, position) VALUES (?, ?, 1)",
      )
        .bind(boardId, groupId)
        .run();
    } catch {
      duplicateRejected = true;
    }
    expect(duplicateRejected).toBe(true);

    // 删除板块级联清理成员
    await env.MIGRATION_DB.prepare("DELETE FROM boards WHERE id = ?").bind(boardId).run();
    const leftover = await env.MIGRATION_DB.prepare(
      "SELECT COUNT(*) AS count FROM board_groups WHERE group_id = ?",
    )
      .bind(groupId)
      .first<{ count: number }>();
    expect(leftover?.count).toBe(0);
  });
});
