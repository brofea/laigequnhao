export function createRateLimitRepository(db: D1Database) {
  return {
    /** 滑动窗口限流检查。返回 true 表示允许，false 表示超出限制 */
    async checkLimit(key: string, maxRequests: number, windowMs: number): Promise<boolean> {
      const now = Date.now();
      const windowStart = now - windowMs;

      // 清理过期记录
      const existing = await db
        .prepare("SELECT count, window_start FROM rate_limits WHERE key = ?")
        .bind(key)
        .first<{ count: number; window_start: number }>();

      if (!existing || existing.window_start < windowStart) {
        // 新窗口
        await db
          .prepare(
            "INSERT OR REPLACE INTO rate_limits (key, count, window_start, expires_at) VALUES (?, 1, ?, ?)",
          )
          .bind(key, now, now + windowMs * 2)
          .run();
        return true;
      }

      if (existing.count >= maxRequests) {
        return false;
      }

      await db.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").bind(key).run();
      return true;
    },
  };
}

export type RateLimitRepository = ReturnType<typeof createRateLimitRepository>;
