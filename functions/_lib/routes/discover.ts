import { Hono } from "hono";
import { DISCOVER_LIMIT, discoverResponseSchema } from "@shared/contracts/discover";
import { apiSuccessSchema } from "@shared/contracts/api";
import { createGroupRepository } from "../repositories/group-repository";
import { toPublicGroupDto } from "../services/public-group-mapper";
import type { Env } from "../env";

type Vars = { requestId: string };
export const discoverRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

/** GET /discover — 发现新群：最近进入 published，最多 10 条 */
discoverRoute.get("/", async (c) => {
  const requestId = c.get("requestId");

  const repo = createGroupRepository(c.env.DB);
  const items = await repo.listRecentPublished(DISCOVER_LIMIT);
  const publicItems = await Promise.all(items.map((dto) => toPublicGroupDto(dto, c.env)));

  return c.json(
    apiSuccessSchema(discoverResponseSchema).parse({
      ok: true,
      data: { items: publicItems },
      requestId,
    }),
  );
});
