/** Cloudflare Worker 运行环境绑定类型 */

export interface Env {
  /** Workers Static Assets binding（非 API 请求由平台直接处理） */
  ASSETS?: Fetcher;
  /** D1 数据库 */
  DB: D1Database;
  /** R2 存储桶 */
  R2: R2Bucket;
  /** R2 自定义域名（用于生成公开 URL，不返回 r2.dev） */
  R2_PUBLIC_BASE_URL?: string;
  /** 环境变量 / Secrets */
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
  LIKE_PEPPER?: string;
  TURNSTILE_SECRET_KEY?: string;
  /** 本地开发跳过 Turnstile 验证 */
  SKIP_TURNSTILE?: string;
  /** 本地开发用固定 pepper（测试确定性 hash） */
  DEV_LIKE_PEPPER?: string;
  /** Cloudflare Analytics 只读 Token */
  ANALYTICS_TOKEN?: string;
  /** 是否启用 Secure Cookie（生产环境设为 true） */
  SECURE_COOKIE?: string;
  /** 登录最大尝试次数（默认 5） */
  LOGIN_MAX_ATTEMPTS?: string;
  /** 登录限流窗口（分钟，默认 15） */
  LOGIN_WINDOW_MINUTES?: string;
}

export interface AdminAuthSecrets {
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
}

/** Secret 配置只能由部署者提供；空值和未绑定值都视为未配置。 */
export function isConfiguredSecret(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** 窄化管理员认证所需的 Secret，不提供任何默认值。 */
export function getAdminAuthSecrets(
  env: Pick<Env, "ADMIN_PASSWORD" | "SESSION_SECRET">,
): AdminAuthSecrets | undefined {
  if (!isConfiguredSecret(env.ADMIN_PASSWORD) || !isConfiguredSecret(env.SESSION_SECRET)) {
    return undefined;
  }

  return {
    ADMIN_PASSWORD: env.ADMIN_PASSWORD,
    SESSION_SECRET: env.SESSION_SECRET,
  };
}

/** 点赞必须配置正式 pepper；测试/本地覆盖只能替换已配置的正式值。 */
export function getLikePepper(
  env: Pick<Env, "LIKE_PEPPER" | "DEV_LIKE_PEPPER">,
): string | undefined {
  if (!isConfiguredSecret(env.LIKE_PEPPER)) return undefined;
  return isConfiguredSecret(env.DEV_LIKE_PEPPER) ? env.DEV_LIKE_PEPPER : env.LIKE_PEPPER;
}
