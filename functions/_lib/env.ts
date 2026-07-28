/** Cloudflare Pages Functions 环境绑定类型 */

export interface Env {
  /** D1 数据库 */
  DB: D1Database;
  /** R2 存储桶 */
  R2: R2Bucket;
  /** R2 自定义域名（用于生成公开 URL，不返回 r2.dev） */
  R2_PUBLIC_BASE_URL?: string;
  /** 环境变量 / Secrets */
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
  LIKE_PEPPER: string;
  TURNSTILE_SECRET_KEY: string;
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
