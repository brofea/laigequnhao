import { applyD1Migrations, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("D1 migrations", () => {
  it("upgrades a 0002 database to 0003 without rebuilding the schema", async () => {
    await applyD1Migrations(env.MIGRATION_DB, env.TEST_MIGRATIONS.slice(0, 2));

    const before = await env.MIGRATION_DB.prepare("PRAGMA table_info(groups)").all<{
      name: string;
    }>();
    expect(before.results.some((column) => column.name === "mutation_token")).toBe(false);

    await applyD1Migrations(env.MIGRATION_DB, env.TEST_MIGRATIONS);

    const after = await env.MIGRATION_DB.prepare("PRAGMA table_info(groups)").all<{
      name: string;
    }>();
    expect(after.results.some((column) => column.name === "mutation_token")).toBe(true);

    const applied = await env.MIGRATION_DB.prepare(
      "SELECT name FROM d1_migrations ORDER BY id",
    ).all<{ name: string }>();
    expect(applied.results.map(({ name }) => name)).toEqual([
      "0001_initial.sql",
      "0002_admin_group_management.sql",
      "0003_group_mutation_token.sql",
    ]);
  });
});
