/** 管理员认证服务 — HMAC-SHA256 签名 + CSRF token */

const SESSION_DURATION = 8 * 60 * 60; // 8 小时
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 分钟

/** Web Crypto HMAC-SHA256 */
async function hmac(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/** 常量时间字符串比较 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function createAuthService(env: { ADMIN_PASSWORD: string; SESSION_SECRET: string }) {
  return {
    /** 常量时间密码校验 */
    async verifyPassword(input: string): Promise<boolean> {
      return timingSafeEqual(input, env.ADMIN_PASSWORD);
    },

    /** 创建会话：返回 { sessionId, signature, csrfToken, expiresAt } */
    async createSession(): Promise<{
      sessionId: string;
      signature: string;
      csrfToken: string;
      expiresAt: string;
    }> {
      const sessionId = crypto.randomUUID();
      const signature = await hmac(env.SESSION_SECRET, sessionId);
      const csrfToken = await hmac(env.SESSION_SECRET, `${sessionId}:csrf`);
      const expiresAt = new Date(Date.now() + SESSION_DURATION * 1000).toISOString();
      return { sessionId, signature, csrfToken, expiresAt };
    },

    /** 验证 session cookie */
    async verifySession(cookieValue: string): Promise<{ valid: boolean }> {
      const parts = cookieValue.split(".");
      if (!parts[0] || !parts[1]) return { valid: false };
      const [sessionId, sig] = parts;
      const expected = await hmac(env.SESSION_SECRET, sessionId!);
      return { valid: timingSafeEqual(sig!, expected) };
    },

    /** 推导 CSRF token */
    async deriveCsrfToken(sessionId: string): Promise<string> {
      return hmac(env.SESSION_SECRET, `${sessionId}:csrf`);
    },

    /** 验证 CSRF token */
    async verifyCsrfToken(sessionId: string, token: string): Promise<boolean> {
      const expected = await hmac(env.SESSION_SECRET, `${sessionId}:csrf`);
      return timingSafeEqual(token, expected);
    },

    get sessionDuration() {
      return SESSION_DURATION;
    },
    get loginMaxAttempts() {
      return LOGIN_MAX_ATTEMPTS;
    },
    get loginWindowMs() {
      return LOGIN_WINDOW_MS;
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
