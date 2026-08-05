import { env } from "cloudflare:test";
import app from "../../functions/_lib/app";
import type { AdminGroupDto } from "../../shared/contracts/group";
import { PNG_1X1 } from "./fixtures";

export interface UploadedAsset {
  id: string;
  r2Key: string;
  status: string;
}

export async function loginAdmin(): Promise<Record<string, string>> {
  const response = await app.fetch(
    new Request("http://localhost/api/v1/admin/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": crypto.randomUUID(),
      },
      body: JSON.stringify({ password: env.ADMIN_PASSWORD }),
    }),
    env,
  );
  const cookie = response.headers.get("Set-Cookie")?.match(/session=([^;]+)/)?.[1];
  const json = (await response.json()) as {
    ok: boolean;
    data: { csrfToken: string };
  };
  if (!response.ok || !cookie || !json.ok) {
    throw new Error(`Admin login failed with ${String(response.status)}.`);
  }
  return {
    Cookie: `session=${cookie}`,
    "X-CSRF-Token": json.data.csrfToken,
  };
}

export function apiFetch(
  authHeaders: Record<string, string>,
  method: string,
  path: string,
  body?: FormData | unknown,
): Promise<Response> {
  const headers: Record<string, string> = {
    ...authHeaders,
    "X-Request-Id": crypto.randomUUID(),
  };
  if (!(body instanceof FormData)) headers["Content-Type"] = "application/json";

  return app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
}

export async function uploadQrAsset(authHeaders: Record<string, string>): Promise<UploadedAsset> {
  const formData = new FormData();
  formData.append("file", new Blob([PNG_1X1], { type: "image/png" }), "qr.png");
  formData.append("purpose", "qr_code");
  const response = await apiFetch(authHeaders, "POST", "/api/v1/admin/assets", formData);
  const json = (await response.json()) as { ok: boolean; data: UploadedAsset };
  if (response.status !== 201 || !json.ok) {
    throw new Error(`QR upload failed with ${String(response.status)}.`);
  }
  return json.data;
}

export async function createGroup(
  authHeaders: Record<string, string>,
  overrides: Record<string, unknown> = {},
): Promise<AdminGroupDto> {
  const response = await apiFetch(authHeaders, "POST", "/api/v1/admin", {
    title: `测试群-${crypto.randomUUID().slice(0, 8)}`,
    description: "资源生命周期测试",
    kind: "interest",
    platform: "qq",
    status: "published",
    tags: ["测试"],
    joinMethods: [{ type: "group_number", value: "123456", sortOrder: 0 }],
    ...overrides,
  });
  const json = (await response.json()) as { ok: boolean; data: AdminGroupDto };
  if (response.status !== 201 || !json.ok) {
    throw new Error(`Group creation failed with ${String(response.status)}.`);
  }
  return json.data;
}
