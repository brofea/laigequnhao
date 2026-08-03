import { Hono } from "hono";
import { publicConfigSchema } from "@shared/contracts/public-config";
import { apiSuccessSchema } from "@shared/contracts/api";
import { getSubmissionLimitPerHour } from "../env";
import type { Env } from "../env";

type Vars = { requestId: string };
export const publicConfigRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

/** GET /api/v1/config — 公开运行配置（前端展示用，无鉴权） */
publicConfigRoute.get("/", (c) => {
  return c.json(
    apiSuccessSchema(publicConfigSchema).parse({
      ok: true,
      data: { submissionLimitPerHour: getSubmissionLimitPerHour(c.env) },
      requestId: c.get("requestId"),
    }),
  );
});
