import { Hono } from "hono";
import { z } from "zod";
import { apiSuccessSchema } from "@shared/contracts/api";
import { authRequired } from "../middleware/auth";
import type { Env } from "../env";

type Vars = { requestId: string; sessionId: string };
export const adminDashboardRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

adminDashboardRoute.use("*", authRequired());

const statusCountSchema = z.object({
  pending: z.number(),
  published: z.number(),
  rejected: z.number(),
  delisted: z.number(),
});

adminDashboardRoute.get("/dashboard", async (c) => {
  const requestId = c.get("requestId");

  try {
    // 各状态计数
    const counts = await c.env.DB.prepare(
      "SELECT status, COUNT(*) as cnt FROM groups WHERE deleted_at IS NULL GROUP BY status",
    ).all<{ status: string; cnt: number }>();

    const statusCounts = { pending: 0, published: 0, rejected: 0, delisted: 0 };
    for (const row of counts.results) {
      if (row.status in statusCounts) {
        statusCounts[row.status as keyof typeof statusCounts] = row.cnt;
      }
    }

    // 总点赞
    const likeRow = await c.env.DB.prepare(
      "SELECT SUM(like_count) as total FROM groups WHERE deleted_at IS NULL",
    ).first<{ total: number }>();

    // 近 7 天新增提交
    const recentRow = await c.env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM groups WHERE created_at > datetime('now', '-7 days')",
    ).first<{ cnt: number }>();

    // Top 10 点赞
    const topLiked = await c.env.DB.prepare(
      "SELECT id, title, like_count FROM groups WHERE deleted_at IS NULL ORDER BY like_count DESC LIMIT 10",
    ).all<{ id: string; title: string; like_count: number }>();

    return c.json(
      apiSuccessSchema(
        z.object({
          statusCounts: statusCountSchema,
          totalLikes: z.number(),
          recentSubmissions: z.number(),
          topLiked: z.array(z.object({ id: z.string(), title: z.string(), likeCount: z.number() })),
        }),
      ).parse({
        ok: true,
        data: {
          statusCounts,
          totalLikes: likeRow?.total ?? 0,
          recentSubmissions: recentRow?.cnt ?? 0,
          topLiked: topLiked.results.map((r) => ({
            id: r.id,
            title: r.title,
            likeCount: r.like_count,
          })),
        },
        requestId,
      }),
    );
  } catch {
    return c.json({
      ok: true,
      data: {
        statusCounts: { pending: 0, published: 0, rejected: 0, delisted: 0 },
        totalLikes: 0,
        recentSubmissions: 0,
        topLiked: [],
      },
      requestId,
    });
  }
});
