/** Cloudflare Pages Functions 环境绑定类型 */

export interface Env {
  /** D1 数据库 */
  DB: D1Database;
  /** R2 存储桶（本阶段不使用，预留） */
  R2: R2Bucket;
  /** 环境变量 / Secrets */
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
  LIKE_PEPPER: string;
  TURNSTILE_SECRET_KEY: string;
  /** 本地开发跳过 Turnstile 验证 */
  SKIP_TURNSTILE?: string;
  /** 本地开发用固定 pepper（测试确定性 hash） */
  DEV_LIKE_PEPPER?: string;
}
