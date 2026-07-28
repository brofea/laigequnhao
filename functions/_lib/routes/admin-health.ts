import { Hono } from "hono";
import { apiSuccessSchema, apiErrorSchema } from "@shared/contracts/api";
import { authRequired } from "../middleware/auth";
import { createR2Adapter } from "../adapters/r2-adapter";
import type { Env } from "../env";

type Vars = { requestId: string; sessionId: string };
export const adminHealthRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

adminHealthRoute.use("*", authRequired());

adminHealthRoute.get("/health", async (c) => {
  const requestId = c.get("requestId");

  let d1Status = "unavailable";
  let r2Status = "unavailable";

  try {
    await c.env.DB.prepare("SELECT 1").first();
    d1Status = "ok";
  } catch {
    /* ignore */
  }

  try {
    const adapter = createR2Adapter(c.env.R2, c.env);
    await adapter.head("health-check");
    r2Status = "ok";
  } catch {
    /* ignore */
  }

  return c.json({
    ok: true,
    data: {
      api: "ok",
      d1: d1Status,
      r2: r2Status,
      version: "0.1.0",
      deployedAt: "", // 部署时由 CI 注入
    },
    requestId,
  });
});
