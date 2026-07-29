import { describe, it, expect, beforeAll } from "vitest";
import app from "../../functions/_lib/app";
import type { Env } from "../../functions/_lib/env";
import { env as testEnv } from "cloudflare:test";
import { WEBP_1X1 } from "./fixtures";

const env = testEnv as Env;
let authHeaders: Record<string, string>;

beforeAll(async () => {
  // Login to get auth cookie + csrf token
  const password = env.ADMIN_PASSWORD;
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
    const req = new Request("http://localhost/api/v1/admin", {
      headers: { "X-Request-Id": crypto.randomUUID() },
    });
    const response = await app.fetch(req, env);
    expect(response.status).toBe(401);
  });

  it("lists groups with auth", async () => {
    const response = await apiFetch("GET", "/api/v1/admin?limit=10&status=pending");
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.data.items)).toBe(true);
    expect(typeof json.data.total).toBe("number");
  });

  it("creates a new group", async () => {
    const response = await apiFetch("POST", "/api/v1/admin", {
      title: "管理员测试群",
      kind: "interest",
      platform: "qq",
      status: "pending",
      joinMethods: [{ type: "group_number", value: "999999", sortOrder: 0 }],
      tags: ["测试"],
    });
    const json = await response.json();
    expect(response.status).toBe(201);
    expect(json.data.id).toBeDefined();
    expect(json.data.status).toBe("pending");
  });

  it("patches group status", async () => {
    // Create first
    const createResp = await apiFetch("POST", "/api/v1/admin", {
      title: "状态测试群",
      kind: "interest",
      platform: "qq",
      status: "pending",
      joinMethods: [{ type: "group_number", value: "888888", sortOrder: 0 }],
    });
    const group = (await createResp.json()).data;

    const response = await apiFetch("PATCH", `/api/v1/admin/${group.id}`, {
      status: "published",
      version: group.version,
    });
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.data.status).toBe("published");
    expect(json.data.version).toBe(group.version + 1);
  });

  it("returns 409 on version conflict", async () => {
    const createResp = await apiFetch("POST", "/api/v1/admin", {
      title: "冲突测试群",
      kind: "interest",
      platform: "qq",
      status: "pending",
      joinMethods: [{ type: "group_number", value: "777777", sortOrder: 0 }],
    });
    const group = (await createResp.json()).data;

    // First edit
    await apiFetch("PATCH", `/api/v1/admin/${group.id}`, {
      status: "published",
      version: group.version,
    });
    // Second edit with stale version
    const response = await apiFetch("PATCH", `/api/v1/admin/${group.id}`, {
      status: "delisted",
      version: group.version,
    });
    expect(response.status).toBe(409);
  });

  it("sorts the complete result set across pages without duplicates or a phantom cursor", async () => {
    for (const title of ["分页 C", "分页 A", "分页 B"]) {
      const response = await apiFetch("POST", "/api/v1/admin", {
        title,
        kind: "interest",
        platform: "qq",
        status: "pending",
        joinMethods: [{ type: "group_number", value: title, sortOrder: 0 }],
      });
      expect(response.status).toBe(201);
    }

    const firstResponse = await apiFetch(
      "GET",
      "/api/v1/admin?limit=2&status=pending&sortBy=title&sortDir=asc",
    );
    const first = (await firstResponse.json()) as {
      data: {
        items: Array<{ id: string; title: string }>;
        nextCursor: string | null;
        total: number;
      };
    };
    expect(first.data.total).toBe(3);
    expect(first.data.items.map(({ title }) => title)).toEqual(["分页 A", "分页 B"]);
    expect(first.data.nextCursor).not.toBeNull();

    const secondResponse = await apiFetch(
      "GET",
      `/api/v1/admin?limit=2&status=pending&sortBy=title&sortDir=asc&cursor=${encodeURIComponent(first.data.nextCursor!)}`,
    );
    const second = (await secondResponse.json()) as {
      data: {
        items: Array<{ id: string; title: string }>;
        nextCursor: string | null;
        total: number;
      };
    };
    expect(second.data.items.map(({ title }) => title)).toEqual(["分页 C"]);
    expect(second.data.nextCursor).toBeNull();
    expect(new Set([...first.data.items, ...second.data.items].map(({ id }) => id)).size).toBe(3);
  });

  it("keeps untagged groups after tagged groups across tag-sorted pages", async () => {
    for (const [title, tags] of [
      ["无标签", []],
      ["标签 B", ["乙"]],
      ["标签 A", ["甲"]],
    ] as const) {
      const response = await apiFetch("POST", "/api/v1/admin", {
        title,
        kind: "interest",
        platform: "qq",
        status: "pending",
        tags,
        joinMethods: [{ type: "group_number", value: title, sortOrder: 0 }],
      });
      expect(response.status).toBe(201);
    }

    const firstResponse = await apiFetch(
      "GET",
      "/api/v1/admin?limit=2&status=pending&sortBy=tags&sortDir=asc",
    );
    const first = (await firstResponse.json()) as {
      data: {
        items: Array<{ id: string; title: string }>;
        nextCursor: string | null;
      };
    };
    expect(new Set(first.data.items.map(({ title }) => title))).toEqual(
      new Set(["标签 A", "标签 B"]),
    );
    expect(first.data.nextCursor).not.toBeNull();

    const secondResponse = await apiFetch(
      "GET",
      `/api/v1/admin?limit=2&status=pending&sortBy=tags&sortDir=asc&cursor=${encodeURIComponent(first.data.nextCursor!)}`,
    );
    const second = (await secondResponse.json()) as {
      data: {
        items: Array<{ id: string; title: string }>;
        nextCursor: string | null;
      };
    };
    expect(second.data.items.map(({ title }) => title)).toEqual(["无标签"]);
    expect(second.data.nextCursor).toBeNull();
  });

  it("treats SQL LIKE metacharacters as literal admin search text", async () => {
    for (const title of ["100% 管理群", "普通管理群"]) {
      const response = await apiFetch("POST", "/api/v1/admin", {
        title,
        kind: "interest",
        platform: "qq",
        status: "pending",
        joinMethods: [{ type: "group_number", value: title, sortOrder: 0 }],
      });
      expect(response.status).toBe(201);
    }

    const response = await apiFetch("GET", "/api/v1/admin?status=pending&q=%25");
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      data: { items: Array<{ title: string }>; total: number };
    };
    expect(json.data.total).toBe(1);
    expect(json.data.items.map(({ title }) => title)).toEqual(["100% 管理群"]);
  });
});

describe("Soft Delete / Restore / Permanent Delete", () => {
  it("soft deletes a group", async () => {
    const createResp = await apiFetch("POST", "/api/v1/admin", {
      title: "删除测试群",
      kind: "interest",
      platform: "qq",
      status: "pending",
      joinMethods: [{ type: "group_number", value: "666666", sortOrder: 0 }],
    });
    const group = (await createResp.json()).data;

    const response = await apiFetch("DELETE", `/api/v1/admin/${group.id}`);
    expect(response.status).toBe(200);

    // Verify it's in trash
    const listResp = await apiFetch("GET", "/api/v1/admin?deleted=true");
    const listJson = await listResp.json();
    expect(listJson.data.items.some((g: { id: string }) => g.id === group.id)).toBe(true);
  });

  it("restores a soft-deleted group", async () => {
    const createResp = await apiFetch("POST", "/api/v1/admin", {
      title: "恢复测试群",
      kind: "interest",
      platform: "qq",
      status: "pending",
      joinMethods: [{ type: "group_number", value: "555555", sortOrder: 0 }],
    });
    const group = (await createResp.json()).data;

    await apiFetch("DELETE", `/api/v1/admin/${group.id}`);
    const response = await apiFetch("POST", `/api/v1/admin/${group.id}/restore`);
    expect(response.status).toBe(200);
  });

  it("permanently deletes a group", async () => {
    const createResp = await apiFetch("POST", "/api/v1/admin", {
      title: "永久删除测试",
      kind: "interest",
      platform: "qq",
      status: "pending",
      joinMethods: [{ type: "group_number", value: "444444", sortOrder: 0 }],
    });
    const group = (await createResp.json()).data;

    // Soft delete first, then permanent
    await apiFetch("DELETE", `/api/v1/admin/${group.id}`);
    const response = await apiFetch("DELETE", `/api/v1/admin/trash/groups/${group.id}`);
    expect(response.status).toBe(200);
  });
});

describe("Version Conflict", () => {
  it("returns 409 on stale version after successful update", async () => {
    const createResp = await apiFetch("POST", "/api/v1/admin", {
      title: "版本冲突测试",
      kind: "interest",
      platform: "qq",
      status: "pending",
      joinMethods: [{ type: "group_number", value: "111112", sortOrder: 0 }],
    });
    const group = (await createResp.json()).data;

    // First PATCH succeeds
    const r1 = await apiFetch("PATCH", `/api/v1/admin/${group.id}`, {
      title: "已更新",
      version: group.version,
    });
    expect(r1.status).toBe(200);

    // Second PATCH with same stale version → 409
    const r2 = await apiFetch("PATCH", `/api/v1/admin/${group.id}`, {
      title: "冲突更新",
      version: group.version,
    });
    expect(r2.status).toBe(409);
  });
});

describe("Permanent Delete State Machine", () => {
  it("rejects permanent delete on non-deleted group", async () => {
    const createResp = await apiFetch("POST", "/api/v1/admin", {
      title: "非删除永久删除测试",
      kind: "interest",
      platform: "qq",
      status: "pending",
      joinMethods: [{ type: "group_number", value: "333334", sortOrder: 0 }],
    });
    const group = (await createResp.json()).data;

    const response = await apiFetch("DELETE", `/api/v1/admin/trash/groups/${group.id}`);
    expect(response.status).toBe(409);
  });

  it("completes permanent delete in one call", async () => {
    const createResp = await apiFetch("POST", "/api/v1/admin", {
      title: "一次永久删除测试",
      kind: "interest",
      platform: "qq",
      status: "pending",
      joinMethods: [{ type: "group_number", value: "333335", sortOrder: 0 }],
    });
    const group = (await createResp.json()).data;

    await apiFetch("DELETE", `/api/v1/admin/${group.id}`);
    const response = await apiFetch("DELETE", `/api/v1/admin/trash/groups/${group.id}`);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { data?: { purgeState?: string } };
    expect(json.data?.purgeState).toBe("done");
  });
});

describe("QR resource lifecycle (ref_count +1/-1/delete_pending)", () => {
  it("ref_count increments when QR asset is used in group creation", async () => {
    // 1. Upload a staged asset
    const formData = new FormData();
    formData.append("file", new Blob([WEBP_1X1], { type: "image/webp" }), "qr.webp");
    formData.append("purpose", "qr_code");

    const uploadReq = new Request("http://localhost/api/v1/admin/assets", {
      method: "POST",
      headers: authHeaders,
      body: formData,
    });
    const uploadResp = await app.fetch(uploadReq, env);
    expect(uploadResp.status).toBe(201);
    const uploaded = (await uploadResp.json()) as {
      data: { id: string; r2Key: string };
    };

    // 2. Create group with this QR
    const createResp = await apiFetch("POST", "/api/v1/admin", {
      title: "QR引用测试",
      kind: "interest",
      platform: "qq",
      status: "pending",
      joinMethods: [
        { type: "group_number", value: "111999", sortOrder: 0 },
        { type: "qr_code", assetId: uploaded.data.id, sortOrder: 1 },
      ],
      tags: ["qr-test"],
    });
    expect(createResp.status).toBe(201);
    const created = (await createResp.json()).data;

    // 3. Check asset status → ready, exactly one reference
    const asset = await env.DB.prepare("SELECT status, ref_count FROM assets WHERE id = ?")
      .bind(uploaded.data.id)
      .first<{ status: string; ref_count: number }>();
    expect(asset?.status).toBe("ready");
    expect(asset?.ref_count).toBe(1);

    // Cleanup
    await apiFetch("DELETE", `/api/v1/admin/${created.id}`);
  });
});
