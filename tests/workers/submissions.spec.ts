import { describe, it, expect } from "vitest";
import app from "../../functions/_lib/app";
import type { Env } from "../../functions/_lib/env";
import { env as testEnv } from "cloudflare:test";

const env = testEnv as Env;

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

describe("POST /api/v1/submissions", () => {
  const validBody = {
    title: "测试提交群",
    kind: "interest" as const,
    platform: "qq",
    groupNumber: "123456",
    turnstileToken: "test-skip",
  };

  it("accepts valid submission (Turnstile skipped in local)", async () => {
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
});
