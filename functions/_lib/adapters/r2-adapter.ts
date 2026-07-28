import type { Env } from "../env";

/** Logo 上传硬上限 */
const LOGO_MAX_BYTES = 100 * 1024;
/** 二维码上传硬上限 */
const QR_CODE_MAX_BYTES = 300 * 1024;

/** R2 自定义域名（从环境变量读取，不硬编码 r2.dev） */
function getPublicBaseUrl(env: Env): string {
  // 生产环境应通过 wrangler secret put R2_PUBLIC_BASE_URL 设置
  return (env.R2_PUBLIC_BASE_URL as string | undefined) ?? "";
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
      return `${baseUrl}/${key}`;
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
      return byteLength > 0 && byteLength <= QR_CODE_MAX_BYTES;
    },
  };
}

export type R2Adapter = ReturnType<typeof createR2Adapter>;
