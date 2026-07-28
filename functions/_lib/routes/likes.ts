import { Hono } from "hono";
import { z } from "zod";
import { likeToggleResponseSchema } from "@shared/contracts/like";
import { apiSuccessSchema, apiErrorSchema } from "@shared/contracts/api";
import { createLikeRepository } from "../repositories/like-repository";
import { createRateLimitRepository } from "../repositories/rate-limit-repository";
import { hashDeviceId } from "../adapters/hash-adapter";
import type { Env } from "../env";

const deviceIdSchema = z.string().uuid();

type Vars = { requestId: string };
export const likesRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

/** PUT /groups/:id/like — 点赞 */
likesRoute.put("/:id/like", async (c) => {
  const groupId = c.req.param("id");
  if (!groupId) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "NOT_FOUND", message: "Group not found." },
        requestId: c.get("requestId"),
      }),
      404,
    );
  }

  const deviceIdHeader = c.req.header("X-Device-Id");
  const parsed = deviceIdSchema.safeParse(deviceIdHeader);
  if (!parsed.success) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "VALIDATION_FAILED", message: "Missing or invalid X-Device-Id header." },
        requestId: c.get("requestId"),
      }),
      400,
    );
  }

  return toggleLike(c, groupId, parsed.data, "like");
});

/** DELETE /groups/:id/like — 取消点赞 */
likesRoute.delete("/:id/like", async (c) => {
  const groupId = c.req.param("id");
  if (!groupId) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "NOT_FOUND", message: "Group not found." },
        requestId: c.get("requestId"),
      }),
      404,
    );
  }

  const deviceIdHeader = c.req.header("X-Device-Id");
  const parsed = deviceIdSchema.safeParse(deviceIdHeader);
  if (!parsed.success) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "VALIDATION_FAILED", message: "Missing or invalid X-Device-Id header." },
        requestId: c.get("requestId"),
      }),
      400,
    );
  }

  return toggleLike(c, groupId, parsed.data, "unlike");
});

async function toggleLike(
  c: {
    env: Env;
    get: (key: string) => unknown;
    json: (body: unknown, status?: number) => Response;
  },
  groupId: string,
  deviceId: string,
  action: "like" | "unlike",
) {
  const requestId = c.get("requestId");

  // 限流
  const rateLimitRepo = createRateLimitRepository(c.env.DB);
  const allowed = await rateLimitRepo.checkLimit(`like:${deviceId}`, 30, 10 * 60 * 1000);
  if (!allowed) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "RATE_LIMITED", message: "Too many like actions." },
        requestId,
      }),
      429,
    );
  }

  // Hash device ID
  const pepper = c.env.DEV_LIKE_PEPPER ?? c.env.LIKE_PEPPER;
  const voterHash = await hashDeviceId(deviceId, pepper);

  // 执行
  const likeRepo = createLikeRepository(c.env.DB);
  const result = await likeRepo.toggleLike({ groupId, voterHash, action });

  return c.json(
    apiSuccessSchema(likeToggleResponseSchema).parse({
      ok: true,
      data: { liked: result.liked, likeCount: result.likeCount },
      requestId,
    }),
  );
}
