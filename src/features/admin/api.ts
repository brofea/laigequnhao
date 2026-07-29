import { api } from "@/shared/api/client";
import type { ApiResponse } from "@shared/contracts/api";
import { assetInfoSchema, type AssetInfo } from "@shared/contracts/asset";
import { sessionResponseSchema, sessionStatusSchema } from "@shared/contracts/auth";
import { z } from "zod";

const assetDeleteResponseSchema = z.object({ id: z.string().uuid() });

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

export async function uploadQrAsset(
  blob: Blob,
  csrfToken: string,
): Promise<ApiResponse<AssetInfo>> {
  const formData = new FormData();
  formData.append("file", blob, "qr.webp");
  formData.append("purpose", "qr_code");
  return api.postForm("/admin/assets", assetInfoSchema, formData, {
    "X-CSRF-Token": csrfToken,
  });
}

export async function purgeStagedAsset(
  assetId: string,
  csrfToken: string,
): Promise<ApiResponse<{ id: string }>> {
  return api.delete(
    `/admin/assets/${encodeURIComponent(assetId)}?mode=purge`,
    assetDeleteResponseSchema,
    { "X-CSRF-Token": csrfToken },
  );
}
