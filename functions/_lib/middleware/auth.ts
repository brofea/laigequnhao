import { createMiddleware } from "hono/factory";
import { createAuthService } from "../services/auth-service";
import { apiErrorSchema } from "@shared/contracts/api";
import { dependencyUnavailable } from "../api-error";
import { getAdminAuthSecrets, type Env } from "../env";

const COOKIE_NAME = "session";

type AuthVars = { requestId: string; sessionId: string };

/** 需要认证的中间件 */
export function authRequired() {
  return createMiddleware<{ Bindings: Env; Variables: AuthVars }>(async (c, next) => {
    const adminSecrets = getAdminAuthSecrets(c.env);
    if (!adminSecrets) {
      return c.json(
        dependencyUnavailable(
          c.get("requestId"),
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
    const cookie = c.req.header("Cookie") ?? "";
    const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`));
    const sessionValue = match?.[1];

    if (!sessionValue) {
      return c.json(
        apiErrorSchema.parse({
          ok: false,
          error: { code: "AUTH_REQUIRED", message: "Authentication required." },
          requestId: c.get("requestId"),
        }),
        401,
      );
    }

    // 解析 sessionId.signature
    const parts = sessionValue.split(".");
    if (!parts[0] || !parts[1]) {
      return c.json(
        apiErrorSchema.parse({
          ok: false,
          error: { code: "AUTH_REQUIRED", message: "Invalid session." },
          requestId: c.get("requestId"),
        }),
        401,
      );
    }

    const result = await auth.verifySession(sessionValue);
    if (!result.valid) {
      return c.json(
        apiErrorSchema.parse({
          ok: false,
          error: { code: "AUTH_REQUIRED", message: "Invalid or expired session." },
          requestId: c.get("requestId"),
        }),
        401,
      );
    }

    // 存储 sessionId 供后续中间件使用
    c.set("sessionId", parts[0]);
    await next();
  });
}

/** CSRF 保护中间件（仅对不安全方法） */
export function csrfProtection() {
  return createMiddleware<{ Bindings: Env; Variables: AuthVars }>(async (c, next) => {
    const method = c.req.method;
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      return next();
    }

    const sessionId = c.get("sessionId");
    const csrfHeader = c.req.header("X-CSRF-Token");
    if (!csrfHeader) {
      return c.json(
        apiErrorSchema.parse({
          ok: false,
          error: { code: "FORBIDDEN", message: "CSRF token required." },
          requestId: c.get("requestId"),
        }),
        403,
      );
    }

    const adminSecrets = getAdminAuthSecrets(c.env);
    if (!adminSecrets) {
      return c.json(
        dependencyUnavailable(
          c.get("requestId"),
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
    const valid = await auth.verifyCsrfToken(sessionId, csrfHeader);
    if (!valid) {
      return c.json(
        apiErrorSchema.parse({
          ok: false,
          error: { code: "FORBIDDEN", message: "Invalid CSRF token." },
          requestId: c.get("requestId"),
        }),
        403,
      );
    }

    await next();
  });
}
