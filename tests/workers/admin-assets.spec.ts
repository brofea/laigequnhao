import { describe, it, expect, beforeAll } from "vitest";
import app from "../../functions/_lib/app";
import type { Env } from "../../functions/_lib/env";
import { env as testEnv } from "cloudflare:test";
import {
  ASSET_UPLOAD_REQUEST_MAX_BYTES,
  LOGO_MAX_BYTES,
  QR_CODE_MAX_DIMENSION,
  QR_CODE_TARGET_BYTES,
} from "../../shared/contracts/asset";
import { WEBP_1X1 } from "./fixtures";

const env = testEnv as Env;
let authHeaders: Record<string, string>;

beforeAll(async () => {
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

  it("rejects a truncated WebP whose RIFF length no longer matches", async () => {
    const truncated = WEBP_1X1.slice(0, -1);
    const formData = new FormData();
    formData.append("file", new Blob([truncated], { type: "image/webp" }), "truncated.webp");
    formData.append("purpose", "logo");

    const response = await apiFetch("POST", "/api/v1/admin/assets", formData);
    expect(response.status).toBe(415);
    expect((await response.json()) as unknown).toMatchObject({
      error: { code: "UNSUPPORTED_MEDIA_TYPE" },
    });
  });

  it("rejects missing fields", async () => {
    const formData = new FormData();
    // Missing purpose, width, height, byteLength
    formData.append("file", new Blob(["x"], { type: "image/webp" }), "test.webp");
    const response = await apiFetch("POST", "/api/v1/admin/assets", formData);
    expect(response.status).toBe(400);
  });

  it("enforces multipart request size independently from the final file size", async () => {
    const formData = new FormData();
    formData.append("file", new Blob([WEBP_1X1], { type: "image/webp" }), "test.webp");
    formData.append("purpose", "logo");
    formData.append("extra", "x".repeat(ASSET_UPLOAD_REQUEST_MAX_BYTES));

    const response = await apiFetch("POST", "/api/v1/admin/assets", formData);
    expect(response.status).toBe(413);
    expect((await response.json()) as unknown).toMatchObject({
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
  });

  it("enforces the actual final file byte limit before decoding", async () => {
    const oversizedLogo = new Uint8Array(LOGO_MAX_BYTES + 1);
    const formData = new FormData();
    formData.append("file", new Blob([oversizedLogo], { type: "image/webp" }), "large.webp");
    formData.append("purpose", "logo");

    const response = await apiFetch("POST", "/api/v1/admin/assets", formData);
    expect(response.status).toBe(413);
    expect((await response.json()) as unknown).toMatchObject({
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
  });

  it("uses the larger QR final byte limit instead of the logo limit", async () => {
    const oversizedQr = new Uint8Array(QR_CODE_TARGET_BYTES + 1);
    const formData = new FormData();
    formData.append("file", new Blob([oversizedQr], { type: "image/webp" }), "large-qr.webp");
    formData.append("purpose", "qr_code");

    const response = await apiFetch("POST", "/api/v1/admin/assets", formData);
    expect(response.status).toBe(413);
    expect((await response.json()) as unknown).toMatchObject({
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
  });

  it("rejects a forged dimension before full WASM decoding", async () => {
    const forged = WEBP_1X1.slice();
    // VP8L width is width-1 in bits 0..13. Keep the RIFF/chunk lengths valid.
    forged[21] = (QR_CODE_MAX_DIMENSION & 0xff) as number;
    forged[22] = (QR_CODE_MAX_DIMENSION >> 8) as number;
    forged[23] = 0;
    forged[24] = 0x10;

    const formData = new FormData();
    formData.append("file", new Blob([forged], { type: "image/webp" }), "wide.webp");
    formData.append("purpose", "qr_code");

    const response = await apiFetch("POST", "/api/v1/admin/assets", formData);
    expect(response.status).toBe(400);
    expect((await response.json()) as unknown).toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });
  });

  it("rejects a structurally valid but undecodable WebP", async () => {
    const corrupt = WEBP_1X1.slice();
    corrupt[25] = 0;
    const formData = new FormData();
    formData.append("file", new Blob([corrupt], { type: "image/webp" }), "corrupt.webp");
    formData.append("purpose", "logo");

    const response = await apiFetch("POST", "/api/v1/admin/assets", formData);
    expect(response.status).toBe(415);
    expect((await response.json()) as unknown).toMatchObject({
      error: { code: "UNSUPPORTED_MEDIA_TYPE" },
    });
  });

  it("stores a decoded WebP with the fixed R2 content type", async () => {
    const formData = new FormData();
    formData.append("file", new Blob([WEBP_1X1], { type: "image/webp" }), "logo.webp");
    formData.append("purpose", "logo");

    const response = await apiFetch("POST", "/api/v1/admin/assets", formData);
    expect(response.status).toBe(201);
    const json = (await response.json()) as {
      ok: boolean;
      data: { id: string; r2Key: string; width: number; height: number; byteLength: number };
    };
    expect(json.ok).toBe(true);
    expect(json.data).toMatchObject({ width: 1, height: 1, byteLength: WEBP_1X1.byteLength });
    const object = await env.R2.head(json.data.r2Key);
    expect(object).not.toBeNull();
    expect(object?.httpMetadata?.contentType).toBe("image/webp");
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

describe("DELETE /api/v1/admin/assets/:id?mode=purge (real fixture)", () => {
  it("rejects direct reference mutation without purge mode", async () => {
    const formData = new FormData();
    formData.append("file", new Blob([WEBP_1X1], { type: "image/webp" }), "qr.webp");
    formData.append("purpose", "qr_code");
    const uploadResp = await apiFetch("POST", "/api/v1/admin/assets", formData);
    const uploaded = (await uploadResp.json()) as {
      data: { id: string; r2Key: string; status: string };
    };

    const response = await apiFetch("DELETE", `/api/v1/admin/assets/${uploaded.data.id}`);
    expect(response.status).toBe(409);
    expect(
      await env.DB.prepare("SELECT status, ref_count FROM assets WHERE id = ?")
        .bind(uploaded.data.id)
        .first(),
    ).toMatchObject({ status: "staged", ref_count: 0 });
    expect(await env.R2.head(uploaded.data.r2Key)).not.toBeNull();
  });

  it("purges a staged asset: 200, D1 gone, R2 gone", async () => {
    const formData = new FormData();
    formData.append("file", new Blob([WEBP_1X1], { type: "image/webp" }), "qr.webp");
    formData.append("purpose", "qr_code");

    const uploadResp = await apiFetch("POST", "/api/v1/admin/assets", formData);
    expect(uploadResp.status).toBe(201);
    const uploaded = (await uploadResp.json()) as {
      ok: boolean;
      data: { id: string; r2Key: string; status: string };
    };
    expect(uploaded.ok).toBe(true);
    expect(uploaded.data.status).toBe("staged");

    // Purge
    const purgeResp = await apiFetch(
      "DELETE",
      `/api/v1/admin/assets/${uploaded.data.id}?mode=purge`,
    );
    expect(purgeResp.status).toBe(200);

    // D1 gone
    const dbCheck = await env.DB.prepare("SELECT id FROM assets WHERE id = ?")
      .bind(uploaded.data.id)
      .first();
    expect(dbCheck).toBeNull();

    // R2 gone
    const head = await env.R2.head(uploaded.data.r2Key);
    expect(head).toBeNull();
  });
});
