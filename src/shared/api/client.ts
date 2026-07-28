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
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Device-Id": getDeviceId(),
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });

  const json: unknown = await res.json();
  return apiResponseSchema(schema).parse(json);
}

export const api = {
  get: <T>(path: string, schema: z.ZodType<T>, extraHeaders?: Record<string, string>) =>
    request(path, schema, { method: "GET", headers: extraHeaders }),

  post: <T>(path: string, schema: z.ZodType<T>, body: unknown, extraHeaders?: Record<string, string>) =>
    request(path, schema, { method: "POST", body: JSON.stringify(body), headers: extraHeaders }),

  put: <T>(path: string, schema: z.ZodType<T>, body?: unknown, extraHeaders?: Record<string, string>) =>
    request(path, schema, { method: "PUT", body: body ? JSON.stringify(body) : undefined, headers: extraHeaders }),

  delete: <T>(path: string, schema: z.ZodType<T>, extraHeaders?: Record<string, string>) =>
    request(path, schema, { method: "DELETE", headers: extraHeaders }),

  patch: <T>(path: string, schema: z.ZodType<T>, body: unknown, extraHeaders?: Record<string, string>) =>
    request(path, schema, { method: "PATCH", body: JSON.stringify(body), headers: extraHeaders }),
};
