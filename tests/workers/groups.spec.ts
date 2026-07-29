import { describe, it, expect, beforeAll } from "vitest";
import app from "../../functions/_lib/app";
import type { Env } from "../../functions/_lib/env";
import { env as testEnv } from "cloudflare:test";

const env = testEnv as Env;

beforeAll(async () => {
  // Seed test data
  const db = env.DB;
  const ids = Array.from({ length: 5 }, () => crypto.randomUUID());
  const batch: D1PreparedStatement[] = [];
  for (const id of ids) {
    batch.push(
      db
        .prepare(
          `INSERT INTO groups (id, title, description, kind, platform, status, rotation_key, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          `测试群 ${id.slice(0, 4)}`,
          "描述",
          "interest",
          "qq",
          "published",
          crypto.randomUUID(),
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:00.000Z",
        ),
    );
    batch.push(
      db
        .prepare("INSERT INTO group_tags (id, group_id, tag, sort_order) VALUES (?, ?, ?, ?)")
        .bind(crypto.randomUUID(), id, "游戏", 0),
    );
    batch.push(
      db
        .prepare(
          "INSERT INTO join_methods (id, group_id, type, value, sort_order) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(crypto.randomUUID(), id, "group_number", "123456", 0),
    );
  }
  await db.batch(batch);
});

function apiFetch(
  method: string,
  path: string,
  headers?: Record<string, string>,
  body?: unknown,
): Promise<Response> {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: {
      "X-Request-Id": crypto.randomUUID(),
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return app.fetch(req, env);
}

describe("GET /api/v1/groups", () => {
  it("returns published groups with pagination", async () => {
    const response = await apiFetch("GET", "/api/v1/groups?limit=3");
    const json = (await response.json()) as {
      ok: boolean;
      data: { items: unknown[]; nextCursor: string | null };
    };
    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.items.length).toBeGreaterThan(0);
    expect(json.data.items.length).toBeLessThanOrEqual(3);
    expect(json.data.nextCursor).toBeDefined();
  });

  it("returns only published/delisted groups (no pending/rejected)", async () => {
    const response = await apiFetch("GET", "/api/v1/groups");
    const json = (await response.json()) as {
      ok: boolean;
      data: {
        items: Array<{
          status: string;
          submissionContact?: unknown;
          auditNotes?: unknown;
          version?: unknown;
        }>;
      };
    };
    expect(json.ok).toBe(true);
    for (const item of json.data.items) {
      expect(["published", "delisted"]).toContain(item.status);
      expect(item.submissionContact).toBeUndefined();
      expect(item.auditNotes).toBeUndefined();
      expect(item.version).toBeUndefined();
    }
  });

  it("rejects invalid limit", async () => {
    const response = await apiFetch("GET", "/api/v1/groups?limit=999");
    expect(response.status).toBe(400);
  });

  it("includes rotationWindow in response", async () => {
    const response = await apiFetch("GET", "/api/v1/groups");
    const json = (await response.json()) as { ok: boolean; data: { rotationWindow: string } };
    expect(json.ok).toBe(true);
    expect(json.data.rotationWindow).toBeDefined();
  });

  it("paginates a Chinese fuzzy-search query without duplicates", async () => {
    const ids = new Set<string>();
    let cursor: string | null = null;

    do {
      const params = new URLSearchParams({ q: "测试", limit: "2" });
      if (cursor) params.set("cursor", cursor);
      const response = await apiFetch("GET", `/api/v1/groups?${params.toString()}`);
      expect(response.status).toBe(200);
      const json = (await response.json()) as {
        data: { items: Array<{ id: string }>; nextCursor: string | null };
      };
      for (const item of json.data.items) {
        expect(ids.has(item.id)).toBe(false);
        ids.add(item.id);
      }
      cursor = json.data.nextCursor;
    } while (cursor);

    expect(ids.size).toBe(5);
  });

  it("treats SQL LIKE metacharacters as literal search text", async () => {
    const id = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO groups (id, title, description, kind, platform, status, rotation_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        "100% 兴趣群",
        "特殊字符搜索",
        "interest",
        "qq",
        "published",
        crypto.randomUUID(),
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z",
      ),
      env.DB.prepare(
        "INSERT INTO join_methods (id, group_id, type, value, sort_order) VALUES (?, ?, ?, ?, ?)",
      ).bind(crypto.randomUUID(), id, "group_number", "100100", 0),
    ]);

    const response = await apiFetch("GET", "/api/v1/groups?q=%25&limit=50");
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      data: { items: Array<{ title: string }> };
    };
    expect(json.data.items.map(({ title }) => title)).toEqual(["100% 兴趣群"]);
  });
});
