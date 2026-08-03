/**
 * 构建时注入的公开运行配置。
 *
 * Sitekey 不是 Secret，可以进入前端 bundle；对应的 Turnstile Secret
 * 只在 Worker Runtime secret 中配置，绝不能从这里读取。
 */
export const turnstileSiteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "").trim();
