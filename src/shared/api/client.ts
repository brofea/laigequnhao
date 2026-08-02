import { apiResponseSchema, type ApiErrorDetail, type ApiSuccess } from "@shared/contracts/api";
import type { z } from "zod";

const BASE = "/api/v1";
/** 默认请求超时（毫秒）；业务可覆盖 */
const DEFAULT_TIMEOUT_MS = 12_000;

// ─── 客户端错误归一化 ─────────────────────────────────────
//
// 服务端 error code → 有限的前端错误类别（T05 PRD §8）。
// 禁止在各 composable 中复制错误判断；统一按稳定 code 映射。

export type ClientErrorKind =
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "conflict"
  | "not_found"
  | "network"
  | "server"
  | "unknown";

export type ClientError = ApiErrorDetail & {
  kind: ClientErrorKind;
  retryable: boolean;
};

export type ClientApiResponse<T> =
  | ApiSuccess<T>
  | {
      ok: false;
      error: ClientError;
      requestId?: string;
    };

function kindForCode(code: string): { kind: ClientErrorKind; retryable: boolean } {
  switch (code) {
    case "VALIDATION_FAILED":
    case "PAYLOAD_TOO_LARGE":
    case "UNSUPPORTED_MEDIA_TYPE":
      return { kind: "validation", retryable: false };
    case "AUTH_REQUIRED":
    case "AUTH_FAILED":
      return { kind: "unauthorized", retryable: false };
    case "FORBIDDEN":
      return { kind: "forbidden", retryable: false };
    case "VERSION_CONFLICT":
    case "STATE_CONFLICT":
      return { kind: "conflict", retryable: false };
    case "NOT_FOUND":
      return { kind: "not_found", retryable: false };
    case "RATE_LIMITED":
      return { kind: "network", retryable: true };
    case "DEPENDENCY_UNAVAILABLE":
    case "INTERNAL_ERROR":
      return { kind: "server", retryable: true };
    default:
      return { kind: "unknown", retryable: false };
  }
}

/** 把已解析的错误信封扩展为带 kind 的客户端错误信息 */
export function toClientError(error: {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
}): ClientError {
  const { kind, retryable } = kindForCode(error.code);
  return { ...error, kind, retryable };
}

function getDeviceId(): string {
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("deviceId", id);
  }
  return id;
}

/** 组合外部 signal 与超时，任一触发即中止；返回是否由超时触发 */
function withTimeoutAndSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cancel: () => void; isTimeout: () => boolean } {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onOuterAbort = () => {
    controller.abort();
  };
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onOuterAbort, { once: true });
  }
  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onOuterAbort);
    },
    isTimeout: () => timedOut,
  };
}

function networkError(message: string): Extract<ClientApiResponse<never>, { ok: false }> {
  return {
    ok: false,
    error: { code: "INTERNAL_ERROR", message, kind: "network", retryable: true },
  };
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestInit = {},
  signal?: AbortSignal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ClientApiResponse<T>> {
  const headers: Record<string, string> = {
    "X-Device-Id": getDeviceId(),
    ...(options.headers as Record<string, string> | undefined),
  };
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const { signal: combinedSignal, cancel, isTimeout } = withTimeoutAndSignal(signal, timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      headers,
      signal: combinedSignal,
    });
  } catch (e) {
    cancel();
    if (isTimeout()) {
      return networkError("请求超时，请稍后重试");
    }
    if (e instanceof DOMException && e.name === "AbortError") {
      // 外部取消：调用方通过 AbortError 识别，不视为错误
      throw e;
    }
    return networkError("网络请求失败，请检查网络连接");
  }
  cancel();

  // 非 JSON 响应（如网关错误页）不能进入 schema 解析
  const contentType = res.headers.get("content-type") ?? "";
  const rawText = await res.text();
  let json: unknown;
  if (contentType.includes("application/json")) {
    try {
      json = JSON.parse(rawText);
    } catch {
      return networkError("服务器返回了无法解析的响应");
    }
  } else {
    return networkError("服务器返回了无法解析的响应");
  }

  const parsed = apiResponseSchema(schema).safeParse(json);
  if (!parsed.success) {
    return networkError("服务器响应不符合接口约定");
  }
  const envelope = parsed.data as
    | { ok: true; data: T; requestId: string }
    | { ok: false; error: ApiErrorDetail; requestId: string };
  if (!envelope.ok) {
    return {
      ok: false,
      error: toClientError(envelope.error),
      requestId: envelope.requestId,
    };
  }
  return envelope as ApiSuccess<T>;
}

export const api = {
  get: <T>(
    path: string,
    schema: z.ZodType<T>,
    extraHeaders?: Record<string, string>,
    signal?: AbortSignal,
    timeoutMs?: number,
  ) => request(path, schema, { method: "GET", headers: extraHeaders }, signal, timeoutMs),

  post: <T>(
    path: string,
    schema: z.ZodType<T>,
    body: unknown,
    extraHeaders?: Record<string, string>,
    signal?: AbortSignal,
  ) =>
    request(
      path,
      schema,
      { method: "POST", body: JSON.stringify(body), headers: extraHeaders },
      signal,
    ),

  postForm: <T>(
    path: string,
    schema: z.ZodType<T>,
    body: FormData,
    extraHeaders?: Record<string, string>,
    signal?: AbortSignal,
  ) => request(path, schema, { method: "POST", body, headers: extraHeaders }, signal),

  put: <T>(
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    extraHeaders?: Record<string, string>,
    signal?: AbortSignal,
  ) =>
    request(
      path,
      schema,
      { method: "PUT", body: body ? JSON.stringify(body) : undefined, headers: extraHeaders },
      signal,
    ),

  delete: <T>(
    path: string,
    schema: z.ZodType<T>,
    extraHeaders?: Record<string, string>,
    signal?: AbortSignal,
  ) => request(path, schema, { method: "DELETE", headers: extraHeaders }, signal),

  patch: <T>(
    path: string,
    schema: z.ZodType<T>,
    body: unknown,
    extraHeaders?: Record<string, string>,
    signal?: AbortSignal,
  ) =>
    request(
      path,
      schema,
      { method: "PATCH", body: JSON.stringify(body), headers: extraHeaders },
      signal,
    ),
};
