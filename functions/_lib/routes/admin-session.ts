import { Hono } from "hono";
import {
  loginRequestSchema,
  sessionResponseSchema,
  sessionStatusSchema,
} from "@shared/contracts/auth";
import { apiSuccessSchema, apiErrorSchema } from "@shared/contracts/api";
import { createAuthService } from "../services/auth-service";
import { createRateLimitRepository } from "../repositories/rate-limit-repository";
import { authRequired, csrfProtection } from "../middleware/auth";
import { dependencyUnavailable } from "../api-error";
import { getAdminAuthSecrets, type Env } from "../env";

type Vars = { requestId: string; sessionId: string };
export const adminSessionRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

const COOKIE_NAME = "session";
const SESSION_DURATION = 8 * 60 * 60;

/** 构建 Set-Cookie header，本地开发跳过 Secure */
function setSessionCookie(c: { env: Env }, value: string, maxAge: number) {
  const secure = c.env.SECURE_COOKIE === "true" ? "; Secure" : "";
  return `${COOKIE_NAME}=${value}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

/** POST /admin/session — 登录 */
adminSessionRoute.post("/session", async (c) => {
  const requestId = c.get("requestId");
  const adminSecrets = getAdminAuthSecrets(c.env);
  if (!adminSecrets) {
    return c.json(
      dependencyUnavailable(
        requestId,
        "管理员功能尚未配置：请设置 ADMIN_PASSWORD 和 SESSION_SECRET。",
      ),
      503,
    );
  }

  const body = await c.req.json<unknown>();
  const parsed = loginRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "VALIDATION_FAILED", message: "Invalid request." },
        requestId,
      }),
      400,
    );
  }

  const auth = createAuthService({
    ...adminSecrets,
    LOGIN_MAX_ATTEMPTS: c.env.LOGIN_MAX_ATTEMPTS,
    LOGIN_WINDOW_MINUTES: c.env.LOGIN_WINDOW_MINUTES,
  });

  // 限流检查
  const clientKey = c.req.header("CF-Connecting-IP") ?? "unknown";
  const rateLimitRepo = createRateLimitRepository(c.env.DB);
  const allowed = await rateLimitRepo.checkLimit(
    `login:${clientKey}`,
    auth.loginMaxAttempts,
    auth.loginWindowMs,
  );
  if (!allowed) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "RATE_LIMITED", message: "登录尝试过于频繁，请 15 分钟后重试。" },
        requestId,
      }),
      429,
    );
  }

  // 密码校验
  const valid = await auth.verifyPassword(parsed.data.password);
  if (!valid) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "AUTH_FAILED", message: "Invalid credentials." },
        requestId,
      }),
      401,
    );
  }

  // 创建会话
  const session = await auth.createSession();
  const cookieValue = `${session.sessionId}.${session.signature}`;

  c.header("Set-Cookie", setSessionCookie(c, cookieValue, SESSION_DURATION));

  return c.json(
    apiSuccessSchema(sessionResponseSchema).parse({
      ok: true,
      data: { csrfToken: session.csrfToken, expiresAt: session.expiresAt },
      requestId,
    }),
  );
});

/** GET /admin/session — 会话状态 */
adminSessionRoute.get("/session", authRequired(), async (c) => {
  const requestId = c.get("requestId");
  const sessionId = c.get("sessionId");
  const adminSecrets = getAdminAuthSecrets(c.env);
  if (!adminSecrets) {
    return c.json(
      dependencyUnavailable(
        requestId,
        "管理员功能尚未配置：请设置 ADMIN_PASSWORD 和 SESSION_SECRET。",
      ),
      503,
    );
  }
  const auth = createAuthService({
    ...adminSecrets,
    LOGIN_MAX_ATTEMPTS: c.env.LOGIN_MAX_ATTEMPTS,
    LOGIN_WINDOW_MINUTES: c.env.LOGIN_WINDOW_MINUTES,
  });
  const csrfToken = await auth.deriveCsrfToken(sessionId);
  const expiresAt = new Date(Date.now() + SESSION_DURATION * 1000).toISOString();

  return c.json(
    apiSuccessSchema(sessionStatusSchema).parse({
      ok: true,
      data: { authenticated: true as const, csrfToken, expiresAt },
      requestId,
    }),
  );
});

/** DELETE /admin/session — 退出 */
adminSessionRoute.delete("/session", authRequired(), csrfProtection(), async (c) => {
  const requestId = c.get("requestId");

  c.header("Set-Cookie", setSessionCookie(c, "", 0));

  return c.json({
    ok: true,
    data: { authenticated: false, csrfToken: "", expiresAt: new Date().toISOString() },
    requestId,
  });
});
