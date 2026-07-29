import { apiResponseSchema, type ApiResponse } from "@shared/contracts/api";
import type { z } from "zod";

const BASE = "/api/v1";

function getDeviceId(): string {
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("deviceId", id);
  }
  return id;
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestInit = {},
  signal?: AbortSignal,
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    "X-Device-Id": getDeviceId(),
    ...(options.headers as Record<string, string> | undefined),
  };
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    signal,
  });

  const json: unknown = await res.json();
  return apiResponseSchema(schema).parse(json);
}

export const api = {
  get: <T>(
    path: string,
    schema: z.ZodType<T>,
    extraHeaders?: Record<string, string>,
    signal?: AbortSignal,
  ) => request(path, schema, { method: "GET", headers: extraHeaders }, signal),

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
