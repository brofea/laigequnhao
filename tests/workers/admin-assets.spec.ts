import { describe, it, expect, beforeAll } from "vitest";
import app from "../../functions/_lib/app";
import type { Env } from "../../functions/_lib/env";
import { getPlatformProxy } from "wrangler";

let env: Env;
let authHeaders: Record<string, string>;

beforeAll(async () => {
  const proxy = await getPlatformProxy<Env>({ configPath: "./wrangler.jsonc" });
  env = proxy.env;

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

function apiFetch(
  method: string,
  path: string,
  body?: FormData | unknown,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const headers: Record<string, string> = { ...authHeaders, ...extraHeaders };
  if (!(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const req = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  return app.fetch(req, env);
}

describe("POST /api/v1/admin/assets", () => {
  it("returns 401 without auth", async () => {
    const req = new Request("http://localhost/api/v1/admin/assets", {
      method: "POST",
      headers: { "X-Request-Id": crypto.randomUUID() },
    });
    const response = await app.fetch(req, env);
    expect(response.status).toBe(401);
  });

  it("rejects non-WebP upload", async () => {
    const formData = new FormData();
    formData.append("file", new Blob(["not-webp"], { type: "text/plain" }), "test.txt");
    formData.append("purpose", "logo");
    formData.append("width", "100");
    formData.append("height", "100");
    formData.append("byteLength", "1000");

    const response = await apiFetch("POST", "/api/v1/admin/assets", formData);
    expect(response.status).toBe(415);
  });

  it("rejects missing fields", async () => {
    const formData = new FormData();
    // Missing purpose, width, height, byteLength
    formData.append("file", new Blob(["x"], { type: "image/webp" }), "test.webp");
    const response = await apiFetch("POST", "/api/v1/admin/assets", formData);
    expect(response.status).toBe(400);
  });
});

describe("GET /api/v1/admin/health", () => {
  it("returns health status with auth", async () => {
    const response = await apiFetch("GET", "/api/v1/admin/health");
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.api).toBeDefined();
    expect(json.data.d1).toBeDefined();
  });

  it("returns 401 without auth", async () => {
    const req = new Request("http://localhost/api/v1/admin/health", {
      headers: { "X-Request-Id": crypto.randomUUID() },
    });
    const response = await app.fetch(req, env);
    expect(response.status).toBe(401);
  });
});

describe("GET /api/v1/admin/dashboard", () => {
  it("returns dashboard data with auth", async () => {
    const response = await apiFetch("GET", "/api/v1/admin/dashboard");
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.statusCounts).toBeDefined();
    expect(json.data.totalLikes).toBeDefined();
  });
});
