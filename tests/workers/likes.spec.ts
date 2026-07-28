import { describe, it, expect, beforeAll } from "vitest";
import app from "../../functions/_lib/app";
import type { Env } from "../../functions/_lib/env";
import { getPlatformProxy } from "wrangler";

let env: Env;

beforeAll(async () => {
  const proxy = await getPlatformProxy<Env>({ configPath: "./wrangler.jsonc" });
  env = proxy.env;
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

describe("PUT/DELETE /api/v1/groups/:id/like", () => {
  let groupId: string;

  beforeAll(async () => {
    const db = env.DB;
    const id = crypto.randomUUID();
    groupId = id;
    await db
      .prepare(
        `INSERT INTO groups (id, title, description, kind, platform, status, rotation_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        "点赞测试群",
        "描述",
        "interest",
        "qq",
        "published",
        crypto.randomUUID(),
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z",
      )
      .run();
  });

  it("creates a like via PUT", async () => {
    const deviceId = crypto.randomUUID();
    const response = await apiFetch("PUT", `/api/v1/groups/${groupId}/like`, {
      "X-Device-Id": deviceId,
    });
    const json = (await response.json()) as {
      ok: boolean;
      data: { liked: boolean; likeCount: number };
    };
    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.liked).toBe(true);
    expect(json.data.likeCount).toBe(1);
  });

  it("is idempotent on repeat PUT", async () => {
    const deviceId = crypto.randomUUID();
    // First like from this device
    const r1 = await apiFetch("PUT", `/api/v1/groups/${groupId}/like`, { "X-Device-Id": deviceId });
    const j1 = (await r1.json()) as { ok: boolean; data: { liked: boolean; likeCount: number } };
    const countAfterFirst = j1.data.likeCount;
    // Repeat — should be idempotent, same count
    const r2 = await apiFetch("PUT", `/api/v1/groups/${groupId}/like`, { "X-Device-Id": deviceId });
    const j2 = (await r2.json()) as { ok: boolean; data: { liked: boolean; likeCount: number } };
    expect(j2.ok).toBe(true);
    expect(j2.data.liked).toBe(true);
    expect(j2.data.likeCount).toBe(countAfterFirst);
  });

  it("unlikes via DELETE", async () => {
    const deviceId = crypto.randomUUID();
    // Like first, then unlike
    const putResp = await apiFetch("PUT", `/api/v1/groups/${groupId}/like`, {
      "X-Device-Id": deviceId,
    });
    const putJson = (await putResp.json()) as {
      ok: boolean;
      data: { liked: boolean; likeCount: number };
    };
    const countBeforeUnlike = putJson.data.likeCount;

    const response = await apiFetch("DELETE", `/api/v1/groups/${groupId}/like`, {
      "X-Device-Id": deviceId,
    });
    const json = (await response.json()) as {
      ok: boolean;
      data: { liked: boolean; likeCount: number };
    };
    expect(json.ok).toBe(true);
    expect(json.data.liked).toBe(false);
    expect(json.data.likeCount).toBe(countBeforeUnlike - 1);
  });

  it("rejects missing X-Device-Id", async () => {
    const response = await apiFetch("PUT", `/api/v1/groups/${groupId}/like`);
    expect(response.status).toBe(400);
  });

  it("rejects invalid UUID X-Device-Id", async () => {
    const response = await apiFetch("PUT", `/api/v1/groups/${groupId}/like`, {
      "X-Device-Id": "not-a-uuid",
    });
    expect(response.status).toBe(400);
  });
});
