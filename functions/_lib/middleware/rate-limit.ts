import { createMiddleware } from "hono/factory";
import type { RateLimitRepository } from "../repositories/rate-limit-repository";

interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
  keyPrefix: string;
  keyFn?: (c: { req: { header: (name: string) => string | undefined } }) => string;
}

/**
 * 通用滑动窗口限流中间件
 * 使用 D1 rate_limits 表实现
 */
export function rateLimit(repo: RateLimitRepository, options: RateLimitOptions) {
  return createMiddleware(async (c, next) => {
    const key = options.keyFn ? options.keyFn(c) : (c.req.header("CF-Connecting-IP") ?? "unknown");
    const fullKey = `${options.keyPrefix}:${key}`;

    const allowed = await repo.checkLimit(fullKey, options.maxRequests, options.windowMs);
    if (!allowed) {
      return c.json(
        {
          ok: false,
          error: { code: "RATE_LIMITED", message: "Too many requests." },
          requestId: c.get("requestId") as string,
        },
        429,
      );
    }

    await next();
  });
}
