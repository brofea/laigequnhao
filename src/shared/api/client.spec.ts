// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { api, toClientError } from "@/shared/api/client";
import { z } from "zod";

const itemSchema = z.object({ id: z.string() });

function jsonResponse(body: unknown, status = 200, contentType = "application/json"): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": contentType },
  });
}

describe("toClientError 错误归一化", () => {
  it("按稳定 code 映射类别", () => {
    expect(toClientError({ code: "VALIDATION_FAILED", message: "x" })).toMatchObject({
      kind: "validation",
      retryable: false,
    });
    expect(toClientError({ code: "AUTH_REQUIRED", message: "x" })).toMatchObject({
      kind: "unauthorized",
    });
    expect(toClientError({ code: "FORBIDDEN", message: "x" })).toMatchObject({
      kind: "forbidden",
    });
    expect(toClientError({ code: "VERSION_CONFLICT", message: "x" })).toMatchObject({
      kind: "conflict",
    });
    expect(toClientError({ code: "NOT_FOUND", message: "x" })).toMatchObject({
      kind: "not_found",
    });
    expect(toClientError({ code: "INTERNAL_ERROR", message: "x" })).toMatchObject({
      kind: "server",
      retryable: true,
    });
    expect(toClientError({ code: "RATE_LIMITED", message: "x" })).toMatchObject({
      kind: "network",
      retryable: true,
    });
    expect(toClientError({ code: "UNKNOWN_CODE", message: "x" })).toMatchObject({
      kind: "unknown",
    });
  });

  it("保留 fieldErrors 与 message", () => {
    const error = toClientError({
      code: "VALIDATION_FAILED",
      message: "请求数据无效。",
      fieldErrors: { title: ["标题不能为空"] },
    });
    expect(error.fieldErrors).toEqual({ title: ["标题不能为空"] });
    expect(error.message).toBe("请求数据无效。");
  });
});

describe("api client 请求与错误", () => {
  beforeEach(() => {
    // 环境无关的 localStorage 实现（deviceId 存储）
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("成功响应按 schema 解析", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ ok: true, data: { id: "a" }, requestId: crypto.randomUUID() }),
        ),
    );
    const result = await api.get("/test", itemSchema);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ id: "a" });
  });

  it("服务端错误信封带 kind 与 requestId", async () => {
    const requestId = crypto.randomUUID();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            ok: false,
            error: { code: "VERSION_CONFLICT", message: "版本冲突" },
            requestId,
          },
          409,
        ),
      ),
    );
    const result = await api.get("/test", itemSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("conflict");
      expect(result.error.retryable).toBe(false);
      expect(result.requestId).toBe(requestId);
    }
  });

  it("非 JSON 响应归一化为 network 错误", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Internal Server Error", { status: 500 })),
    );
    const result = await api.get("/test", itemSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("network");
      expect(result.error.retryable).toBe(true);
    }
  });

  it("不符合契约的成功响应归一化为错误而非渲染", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ ok: true, data: { wrong: 1 }, requestId: crypto.randomUUID() }),
        ),
    );
    const result = await api.get("/test", itemSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("不符合接口约定");
  });

  it("网络失败归一化为 network 错误", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const result = await api.get("/test", itemSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("network");
  });

  it("外部取消抛出 AbortError（调用方按取消处理）", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        });
      }),
    );
    const promise = api.get("/test", itemSchema, undefined, controller.signal);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("超时归一化为 network 错误", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        return new Promise((_resolve, reject) => {
          setTimeout(() => {
            reject(new DOMException("timeout", "AbortError"));
          }, 20);
        });
      }),
    );
    const result = await api.get("/test", itemSchema, undefined, undefined, 5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("超时");
  });
});
