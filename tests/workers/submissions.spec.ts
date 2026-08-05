import { describe, it, expect } from "vitest";
import app from "../../functions/_lib/app";
import type { Env } from "../../functions/_lib/env";
import { env as testEnv } from "cloudflare:test";
import { PNG_1X1 } from "./fixtures";
import { SUBMISSION_MULTIPART_MAX_BYTES } from "../../shared/contracts/submission";
import {
  createSubmissionService,
  type ValidatedSubmissionLogo,
} from "../../functions/_lib/services/submission-service";
import type { R2Adapter } from "../../functions/_lib/adapters/r2-adapter";
import type { SubmissionRequest } from "../../shared/contracts/submission";

const env = testEnv as Env;

function apiFetch(
  method: string,
  path: string,
  headers?: Record<string, string>,
  body?: unknown,
  runtimeEnv: Env = env,
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
  return app.fetch(req, runtimeEnv);
}

function multipartFetch(
  payload: Record<string, unknown>,
  options: {
    ip?: string;
    logo?: Uint8Array;
    extraFiles?: Uint8Array[];
    totalBody?: Uint8Array;
  } = {},
): Promise<Response> {
  const form = new FormData();
  form.append("payload", JSON.stringify(payload));
  if (options.logo) {
    form.append("logo", new Blob([options.logo], { type: "image/png" }), "logo.png");
  }
  for (const [index, file] of (options.extraFiles ?? []).entries()) {
    form.append(`extra-${String(index)}`, new Blob([file], { type: "image/png" }), "extra.png");
  }

  if (options.totalBody) {
    // This branch is used only to exercise the request-size guard with a raw body.
    return app.fetch(
      new Request("http://localhost/api/v1/submissions", {
        method: "POST",
        headers: {
          "X-Request-Id": crypto.randomUUID(),
          "CF-Connecting-IP": options.ip ?? crypto.randomUUID(),
          "Content-Type": "multipart/form-data; boundary=invalid",
        },
        body: options.totalBody,
      }),
      env,
    );
  }

  return app.fetch(
    new Request("http://localhost/api/v1/submissions", {
      method: "POST",
      headers: {
        "X-Request-Id": crypto.randomUUID(),
        "CF-Connecting-IP": options.ip ?? crypto.randomUUID(),
      },
      body: form,
    }),
    env,
  );
}

describe("POST /api/v1/submissions", () => {
  const validBody = {
    title: "测试提交群",
    kind: "interest" as const,
    platform: "qq",
    groupNumber: "123456",
  };

  it("accepts valid submission", async () => {
    const response = await apiFetch("POST", "/api/v1/submissions", {}, validBody);
    const json = (await response.json()) as {
      ok: boolean;
      data: { id: string; status: string; title: string };
    };
    expect(response.status).toBe(201);
    expect(json.ok).toBe(true);
    expect(json.data.id).toBeDefined();
    expect(json.data.status).toBe("pending");
    expect(json.data.title).toBe("测试提交群");
  });

  it("rejects submission without required fields", async () => {
    const response = await apiFetch("POST", "/api/v1/submissions", {}, { title: "" });
    expect(response.status).toBe(400);
  });

  it("rejects submission with unsafe URL", async () => {
    const response = await apiFetch(
      "POST",
      "/api/v1/submissions",
      {},
      { ...validBody, url: "http://unsafe.com" },
    );
    expect(response.status).toBe(400);
  });

  it("accepts submission with HTTPS URL", async () => {
    const response = await apiFetch(
      "POST",
      "/api/v1/submissions",
      {},
      { ...validBody, groupNumber: undefined, url: "https://example.com/join" },
    );
    expect(response.status).toBe(201);
  });

  it("rejects submission with too many tags", async () => {
    const response = await apiFetch(
      "POST",
      "/api/v1/submissions",
      {},
      {
        ...validBody,
        tags: ["a", "b", "c", "d", "e", "f"],
      },
    );
    expect(response.status).toBe(400);
  });

  it("accepts one logo in multipart and atomically creates a ready asset", async () => {
    const response = await multipartFetch(
      {
        ...validBody,
        assetId: "client-value-must-not-be-trusted",
        r2Key: "client-value-must-not-be-trusted",
        width: 9999,
        height: 9999,
        byteLength: 1,
      },
      { logo: PNG_1X1, ip: crypto.randomUUID() },
    );
    const json = (await response.json()) as {
      ok: boolean;
      data: { id: string; status: string };
    };

    expect(response.status).toBe(201);
    expect(json.ok).toBe(true);
    expect(json.data.status).toBe("pending");

    const group = await env.DB.prepare(
      "SELECT status, logo_r2_key, logo_width, logo_height, logo_byte_length FROM groups WHERE id = ?",
    )
      .bind(json.data.id)
      .first<{
        status: string;
        logo_r2_key: string;
        logo_width: number;
        logo_height: number;
        logo_byte_length: number;
      }>();
    expect(group).toMatchObject({
      status: "pending",
      logo_width: 1,
      logo_height: 1,
      logo_byte_length: PNG_1X1.byteLength,
    });
    expect(group?.logo_r2_key).toMatch(/^logo\/submission\/[0-9a-f-]+\.png$/);

    const asset = await env.DB.prepare(
      "SELECT purpose, status, ref_count, content_type, byte_length, width, height, r2_key FROM assets WHERE r2_key = ?",
    )
      .bind(group?.logo_r2_key)
      .first<{
        purpose: string;
        status: string;
        ref_count: number;
        content_type: string;
        byte_length: number;
        width: number;
        height: number;
        r2_key: string;
      }>();
    expect(asset).toMatchObject({
      purpose: "logo",
      status: "ready",
      ref_count: 1,
      content_type: "image/png",
      byte_length: PNG_1X1.byteLength,
      width: 1,
      height: 1,
    });
    expect(await env.R2.head(asset!.r2_key)).not.toBeNull();
  });

  it("keeps no-image multipart submissions compatible", async () => {
    const response = await multipartFetch({ ...validBody }, { ip: crypto.randomUUID() });
    expect(response.status).toBe(201);
  });

  it("rejects a second public image field", async () => {
    const response = await multipartFetch(validBody, {
      logo: PNG_1X1,
      extraFiles: [PNG_1X1],
      ip: crypto.randomUUID(),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
  });

  it("rejects an invalid final PNG before writing R2 or D1", async () => {
    const response = await multipartFetch(validBody, {
      logo: Uint8Array.from([0x52, 0x49, 0x46, 0x46]),
      ip: crypto.randomUUID(),
    });
    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "UNSUPPORTED_MEDIA_TYPE" },
    });
  });

  it("enforces the multipart request limit separately from final logo bytes", async () => {
    const oversized = new Uint8Array(SUBMISSION_MULTIPART_MAX_BYTES + 1);
    const response = await multipartFetch(validBody, {
      ip: crypto.randomUUID(),
      totalBody: oversized,
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
  });

  it("compensates the R2 object when the D1 aggregate fails", async () => {
    await env.DB.prepare(
      `CREATE TRIGGER submission_failure
       BEFORE INSERT ON groups
       WHEN NEW.title = '强制 D1 投稿失败'
       BEGIN SELECT RAISE(ABORT, 'forced submission failure'); END`,
    ).run();

    try {
      const response = await multipartFetch(
        { ...validBody, title: "强制 D1 投稿失败" },
        { logo: PNG_1X1, ip: crypto.randomUUID() },
      );
      expect(response.status).toBe(503);
      expect(
        await env.DB.prepare("SELECT id FROM groups WHERE title = ?")
          .bind("强制 D1 投稿失败")
          .first(),
      ).toBeNull();
      expect((await env.R2.list({ prefix: "logo/submission/" })).objects).toHaveLength(0);
    } finally {
      await env.DB.prepare("DROP TRIGGER submission_failure").run();
    }
  });

  it("records delete_failed cleanup when R2 compensation itself fails", async () => {
    let cleanupRecord: { id: string; r2Key: string; requestId: string } | undefined;
    const groupRepo = {
      create: async (): Promise<never> => {
        throw new Error("forced D1 failure");
      },
      recordSubmissionAssetCleanup: async (input: {
        id: string;
        r2Key: string;
        requestId: string;
      }) => {
        cleanupRecord = input;
      },
    };
    const rateLimitRepo = { checkLimit: async () => true };
    const r2Adapter = {
      upload: async () => "uploaded",
      compensateDelete: async () => false,
      delete: async () => undefined,
      getPublicUrl: (key: string) => `https://assets.test.invalid/${key}`,
      head: async () => null,
      validateLogoSize: () => true,
      validateQrCodeSize: () => true,
    } as unknown as R2Adapter;
    const service = createSubmissionService(groupRepo, rateLimitRepo, {
      r2Adapter,
      requestId: "00000000-0000-4000-8000-000000000099",
    });
    const input: SubmissionRequest = {
      title: "补偿失败测试群",
      kind: "interest",
      platform: "qq",
      groupNumber: "123456",
    };
    const logo: ValidatedSubmissionLogo = { bytes: PNG_1X1, width: 1, height: 1 };

    await expect(
      service.submit(input, crypto.randomUUID(), 1, {
        logo,
        requestId: "00000000-0000-4000-8000-000000000099",
      }),
    ).rejects.toMatchObject({ name: "SubmissionDependencyError" });
    expect(cleanupRecord).toMatchObject({
      r2Key: expect.stringMatching(/^logo\/submission\/[0-9a-f-]+\.png$/),
      requestId: "00000000-0000-4000-8000-000000000099",
    });
  });
});

describe("GET /api/v1/config", () => {
  it("exposes submission limit with default value", async () => {
    const response = await apiFetch("GET", "/api/v1/config");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { submissionLimitPerHour: 1 },
    });
  });

  it("exposes configured submission limit", async () => {
    const response = await apiFetch("GET", "/api/v1/config", {}, undefined, {
      ...env,
      SUBMISSION_LIMIT_PER_HOUR: "3",
    });
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { submissionLimitPerHour: 3 },
    });
  });

  it("falls back to default when variable is invalid", async () => {
    const response = await apiFetch("GET", "/api/v1/config", {}, undefined, {
      ...env,
      SUBMISSION_LIMIT_PER_HOUR: "abc",
    });
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { submissionLimitPerHour: 1 },
    });
  });
});

describe("POST /api/v1/submissions · configurable rate limit", () => {
  const validBody = {
    title: "限流测试群",
    kind: "interest" as const,
    platform: "qq",
    groupNumber: "654321",
  };

  it("allows up to the configured number per IP, then blocks with RATE_LIMITED", async () => {
    const ip = "203.0.113.77";
    const runtimeEnv = { ...env, SUBMISSION_LIMIT_PER_HOUR: "2" };
    const headers = { "CF-Connecting-IP": ip };

    const first = await apiFetch("POST", "/api/v1/submissions", headers, validBody, runtimeEnv);
    const second = await apiFetch("POST", "/api/v1/submissions", headers, validBody, runtimeEnv);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const third = await apiFetch("POST", "/api/v1/submissions", headers, validBody, runtimeEnv);
    expect(third.status).toBe(429);
    expect(await third.json()).toMatchObject({
      ok: false,
      error: { code: "RATE_LIMITED" },
    });
  });
});
