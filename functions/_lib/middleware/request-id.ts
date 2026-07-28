import { createMiddleware } from "hono/factory";

export function requestId() {
  return createMiddleware(async (c, next) => {
    const id = c.req.header("X-Request-Id") ?? crypto.randomUUID();
    c.set("requestId", id);
    await next();
  });
}
