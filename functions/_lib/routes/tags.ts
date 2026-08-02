import { Hono } from "hono";
import { tagStatsResponseSchema } from "@shared/contracts/tags";
import { apiSuccessSchema } from "@shared/contracts/api";
import { createTagRepository } from "../repositories/tag-repository";
import type { Env } from "../env";

type Vars = { requestId: string };
export const tagsRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

/** GET /tags — 标签聚合统计（只统计已发布群组，单次聚合） */
tagsRoute.get("/", async (c) => {
  const requestId = c.get("requestId");

  const repo = createTagRepository(c.env.DB);
  const tags = await repo.aggregatePublished();

  return c.json(
    apiSuccessSchema(tagStatsResponseSchema).parse({
      ok: true,
      data: { tags },
      requestId,
    }),
  );
});
