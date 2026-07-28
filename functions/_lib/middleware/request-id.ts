import { createMiddleware } from "hono/factory";
import { randomUUID } from "node:crypto";

export function requestId() {
  return createMiddleware(async (c, next) => {
    const id = c.req.header("X-Request-Id") ?? randomUUID();
    c.set("requestId", id);
    c.res.headers.set("X-Request-Id", id);
    await next();
  });
}
