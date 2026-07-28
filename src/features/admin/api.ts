import { api } from "@/shared/api/client";
import type { ApiResponse } from "@shared/contracts/api";
import { sessionResponseSchema, sessionStatusSchema } from "@shared/contracts/auth";

export async function login(
  password: string,
): Promise<ApiResponse<{ csrfToken: string; expiresAt: string }>> {
  return api.post("/admin/session", sessionResponseSchema, { password });
}

export async function checkSession(): Promise<
  ApiResponse<{ authenticated: boolean; csrfToken: string; expiresAt: string }>
> {
  return api.get("/admin/session", sessionStatusSchema);
}

export async function logout(): Promise<ApiResponse> {
  return api.delete("/admin/session", sessionStatusSchema);
}
