import { describe, it, expect, beforeAll } from "vitest";
import app from "../../functions/_lib/app";
import type { Env } from "../../functions/_lib/env";
import { getPlatformProxy } from "wrangler";

let env: Env;
let authHeaders: Record<string, string>;

beforeAll(async () => {
  const proxy = await getPlatformProxy<Env>({ configPath: "./wrangler.jsonc" });
  env = proxy.env;

  // Login to get auth cookie + csrf token
  const password = env.ADMIN_PASSWORD || "dev-admin-password";
  const loginResp = await app.fetch(
    new Request("http://localhost/api/v1/admin/session", {
      method: "POST",
      headers: { "X-Request-Id": crypto.randomUUID(), "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }),
    env,
  );
  const cookie = loginResp.headers.get("Set-Cookie")?.match(/session=([^;]+)/)?.[1] ?? "";
  const json = (await loginResp.json()) as { ok: boolean; data: { csrfToken: string } };
  authHeaders = {
    Cookie: `session=${cookie}`,
    "X-CSRF-Token": json.data.csrfToken,
    "X-Request-Id": crypto.randomUUID(),
  };
});

function apiFetch(method: string, path: string, body?: unknown): Promise<Response> {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
  return app.fetch(req, env);
}

describe("Admin Groups CRUD", () => {
  it("returns 401 without auth", async () => {
    const req = new Request("http://localhost/api/v1/admin/groups", {
      headers: { "X-Request-Id": crypto.randomUUID() },
    });
    const response = await app.fetch(req, env);
    expect(response.status).toBe(401);
  });

  it("lists groups with auth", async () => {
    const response = await apiFetch("GET", "/api/v1/admin/groups?limit=10&status=pending");
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.data.items)).toBe(true);
    expect(typeof json.data.total).toBe("number");
  });

  it("creates a new group", async () => {
    const response = await apiFetch("POST", "/api/v1/admin/groups", {
      title: "管理员测试群",
      kind: "interest",
      platform: "qq",
      joinMethods: [{ type: "group_number", value: "999999" }],
      tags: ["测试"],
    });
    const json = await response.json();
    expect(response.status).toBe(201);
    expect(json.data.id).toBeDefined();
    expect(json.data.status).toBe("pending");
  });

  it("patches group status", async () => {
    // Create first
    const createResp = await apiFetch("POST", "/api/v1/admin/groups", {
      title: "状态测试群",
      kind: "interest",
      platform: "qq",
      joinMethods: [{ type: "group_number", value: "888888" }],
    });
    const group = (await createResp.json()).data;

    const response = await apiFetch("PATCH", `/api/v1/admin/groups/${group.id}`, {
      status: "published",
      version: group.version,
    });
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.data.status).toBe("published");
    expect(json.data.version).toBe(group.version + 1);
  });

  it("returns 409 on version conflict", async () => {
    const createResp = await apiFetch("POST", "/api/v1/admin/groups", {
      title: "冲突测试群",
      kind: "interest",
      platform: "qq",
      joinMethods: [{ type: "group_number", value: "777777" }],
    });
    const group = (await createResp.json()).data;

    // First edit
    await apiFetch("PATCH", `/api/v1/admin/groups/${group.id}`, {
      status: "published",
      version: group.version,
    });
    // Second edit with stale version
    const response = await apiFetch("PATCH", `/api/v1/admin/groups/${group.id}`, {
      status: "delisted",
      version: group.version,
    });
    expect(response.status).toBe(409);
  });
});

describe("Soft Delete / Restore / Permanent Delete", () => {
  it("soft deletes a group", async () => {
    const createResp = await apiFetch("POST", "/api/v1/admin/groups", {
      title: "删除测试群",
      kind: "interest",
      platform: "qq",
      joinMethods: [{ type: "group_number", value: "666666" }],
    });
    const group = (await createResp.json()).data;

    const response = await apiFetch("DELETE", `/api/v1/admin/groups/${group.id}`);
    expect(response.status).toBe(200);

    // Verify it's in trash
    const listResp = await apiFetch("GET", "/api/v1/admin/groups?deleted=true");
    const listJson = await listResp.json();
    expect(listJson.data.items.some((g: { id: string }) => g.id === group.id)).toBe(true);
  });

  it("restores a soft-deleted group", async () => {
    const createResp = await apiFetch("POST", "/api/v1/admin/groups", {
      title: "恢复测试群",
      kind: "interest",
      platform: "qq",
      joinMethods: [{ type: "group_number", value: "555555" }],
    });
    const group = (await createResp.json()).data;

    await apiFetch("DELETE", `/api/v1/admin/groups/${group.id}`);
    const response = await apiFetch("POST", `/api/v1/admin/groups/${group.id}/restore`);
    expect(response.status).toBe(200);
  });

  it("permanently deletes a group", async () => {
    const createResp = await apiFetch("POST", "/api/v1/admin/groups", {
      title: "永久删除测试",
      kind: "interest",
      platform: "qq",
      joinMethods: [{ type: "group_number", value: "444444" }],
    });
    const group = (await createResp.json()).data;

    // Soft delete first, then permanent
    await apiFetch("DELETE", `/api/v1/admin/groups/${group.id}`);
    const response = await apiFetch("DELETE", `/api/v1/admin/trash/groups/${group.id}`);
    expect(response.status).toBe(200);
  });
});
