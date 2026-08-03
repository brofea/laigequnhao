import type { Env } from "../env";
import { LOGO_MAX_BYTES, QR_CODE_TARGET_BYTES } from "@shared/contracts/asset";

/** R2 自定义域名；未配置时回退到同源 Worker asset route。 */
function getPublicBaseUrl(env: Env): string {
  return (env.R2_PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
}

function encodeObjectKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

/** R2 适配器 — 资源上传/删除/公开 URL */
export function createR2Adapter(r2: R2Bucket, env: Env) {
  const baseUrl = getPublicBaseUrl(env);

  return {
    /** 上传最终 WebP 到 R2，返回 key */
    async upload(
      key: string,
      body: ArrayBuffer | ReadableStream,
      contentType = "image/webp",
    ): Promise<string> {
      await r2.put(key, body as ArrayBuffer, {
        httpMetadata: { contentType },
      });
      return key;
    },

    /** 删除 R2 对象 */
    async delete(key: string): Promise<void> {
      await r2.delete(key);
    },

    /** 获取公开访问 URL */
    getPublicUrl(key: string): string {
      const encodedKey = encodeObjectKey(key);
      return `${baseUrl || "/api/v1/assets"}/${encodedKey}`;
    },

    /** 获取对象元数据 */
    async head(key: string) {
      return r2.head(key);
    },

    /** 验证 Logo 大小限制 */
    validateLogoSize(byteLength: number): boolean {
      return byteLength > 0 && byteLength <= LOGO_MAX_BYTES;
    },

    /** 验证二维码大小限制 */
    validateQrCodeSize(byteLength: number): boolean {
      return byteLength > 0 && byteLength <= QR_CODE_TARGET_BYTES;
    },
  };
}

export type R2Adapter = ReturnType<typeof createR2Adapter>;
