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
import { PNG_1X1, PNG_ALPHA_1X1 } from "./fixtures";

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

  it("rejects non-PNG upload", async () => {
    const formData = new FormData();
    formData.append("file", new Blob(["not-png"], { type: "text/plain" }), "test.txt");
    formData.append("purpose", "logo");
    formData.append("width", "100");
    formData.append("height", "100");
    formData.append("byteLength", "1000");

    const response = await apiFetch("POST", "/api/v1/admin/assets", formData);
    expect(response.status).toBe(415);
  });

  it("rejects a truncated PNG", async () => {
    const truncated = PNG_1X1.slice(0, -1);
    const formData = new FormData();
    formData.append("file", new Blob([truncated], { type: "image/png" }), "truncated.png");
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
    formData.append("file", new Blob(["x"], { type: "image/png" }), "test.png");
    const response = await apiFetch("POST", "/api/v1/admin/assets", formData);
    expect(response.status).toBe(400);
  });

  it("enforces multipart request size independently from the final file size", async () => {
    const formData = new FormData();
    formData.append("file", new Blob([PNG_1X1], { type: "image/png" }), "test.png");
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
    formData.append("file", new Blob([oversizedLogo], { type: "image/png" }), "large.png");
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
    formData.append("file", new Blob([oversizedQr], { type: "image/png" }), "large-qr.png");
    formData.append("purpose", "qr_code");

    const response = await apiFetch("POST", "/api/v1/admin/assets", formData);
    expect(response.status).toBe(413);
    expect((await response.json()) as unknown).toMatchObject({
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
  });

  it("rejects a forged dimension before full WASM decoding", async () => {
    const forged = PNG_1X1.slice();
    // IHDR width is a big-endian uint32 at byte offset 16.
    forged[16] = 0x00;
    forged[17] = 0x00;
    forged[18] = (QR_CODE_MAX_DIMENSION >> 8) as number;
    forged[19] = (QR_CODE_MAX_DIMENSION + 1) & 0xff;

    const formData = new FormData();
    formData.append("file", new Blob([forged], { type: "image/png" }), "wide.png");
    formData.append("purpose", "qr_code");

    const response = await apiFetch("POST", "/api/v1/admin/assets", formData);
    expect(response.status).toBe(400);
    expect((await response.json()) as unknown).toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });
  });

  it("rejects a transparent QR PNG after decoding its pixels", async () => {
    const formData = new FormData();
    formData.append("file", new Blob([PNG_ALPHA_1X1], { type: "image/png" }), "transparent.png");
    formData.append("purpose", "qr_code");

    const response = await apiFetch("POST", "/api/v1/admin/assets", formData);
    expect(response.status).toBe(400);
    expect((await response.json()) as unknown).toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });
  });

  it("preserves alpha-capable PNGs for logos", async () => {
    const formData = new FormData();
    formData.append("file", new Blob([PNG_ALPHA_1X1], { type: "image/png" }), "alpha-logo.png");
    formData.append("purpose", "logo");

    const response = await apiFetch("POST", "/api/v1/admin/assets", formData);
    expect(response.status).toBe(201);
    const json = (await response.json()) as { ok: boolean; data: { contentType: string } };
    expect(json).toMatchObject({ ok: true, data: { contentType: "image/png" } });
  });

  it("rejects a structurally valid but undecodable PNG", async () => {
    const corrupt = PNG_1X1.slice();
    corrupt[62] = 0;
    const formData = new FormData();
    formData.append("file", new Blob([corrupt], { type: "image/png" }), "corrupt.png");
    formData.append("purpose", "logo");

    const response = await apiFetch("POST", "/api/v1/admin/assets", formData);
    expect(response.status).toBe(415);
    expect((await response.json()) as unknown).toMatchObject({
      error: { code: "UNSUPPORTED_MEDIA_TYPE" },
    });
  });

  it("stores a decoded PNG with the fixed R2 content type", async () => {
    const formData = new FormData();
    formData.append("file", new Blob([PNG_1X1], { type: "image/png" }), "logo.png");
    formData.append("purpose", "logo");

    const response = await apiFetch("POST", "/api/v1/admin/assets", formData);
    expect(response.status).toBe(201);
    const json = (await response.json()) as {
      ok: boolean;
      data: {
        id: string;
        r2Key: string;
        publicUrl: string;
        width: number;
        height: number;
        byteLength: number;
      };
    };
    expect(json.ok).toBe(true);
    expect(json.data).toMatchObject({ width: 1, height: 1, byteLength: PNG_1X1.byteLength });
    expect(json.data.publicUrl).toBe(`https://assets.test.invalid/${json.data.r2Key}`);
    const object = await env.R2.head(json.data.r2Key);
    expect(object).not.toBeNull();
    expect(object?.httpMetadata?.contentType).toBe("image/png");
  });

  it("returns a same-origin public URL and serves its complete R2 response when no base URL is configured", async () => {
    const envWithoutPublicBaseUrl = { ...env, R2_PUBLIC_BASE_URL: undefined } as Env;
    const formData = new FormData();
    formData.append("file", new Blob([PNG_1X1], { type: "image/png" }), "logo.png");
    formData.append("purpose", "logo");

    const uploadResponse = await app.fetch(
      new Request("http://localhost/api/v1/admin/assets", {
        method: "POST",
        headers: authHeaders,
        body: formData,
      }),
      envWithoutPublicBaseUrl,
    );

    expect(uploadResponse.status).toBe(201);
    const uploadJson = (await uploadResponse.json()) as {
      ok: boolean;
      data: { publicUrl: string; r2Key: string };
    };
    expect(uploadJson.ok).toBe(true);
    expect(uploadJson.data.publicUrl).toBe(`/api/v1/assets/${uploadJson.data.r2Key}`);

    const assetResponse = await app.fetch(
      new Request(`http://localhost${uploadJson.data.publicUrl}`),
      envWithoutPublicBaseUrl,
    );
    expect(assetResponse.status).toBe(200);
    expect(new Uint8Array(await assetResponse.arrayBuffer())).toEqual(PNG_1X1);
    expect(assetResponse.headers.get("Content-Type")).toBe("image/png");
    expect(assetResponse.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(assetResponse.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("returns 404 for a missing public asset", async () => {
    const response = await app.fetch(
      new Request("http://localhost/api/v1/assets/logo/missing.png"),
      env,
    );

    expect(response.status).toBe(404);
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
    formData.append("file", new Blob([PNG_1X1], { type: "image/png" }), "qr.png");
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
    formData.append("file", new Blob([PNG_1X1], { type: "image/png" }), "qr.png");
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
