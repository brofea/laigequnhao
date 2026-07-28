import { Hono } from "hono";
import { z } from "zod";
import { apiSuccessSchema, apiErrorSchema } from "@shared/contracts/api";
import { authRequired } from "../middleware/auth";
import type { Env } from "../env";

type Vars = { requestId: string; sessionId: string };
export const adminAnalyticsRoute = new Hono<{ Bindings: Env; Variables: Vars }>();

adminAnalyticsRoute.use("*", authRequired());

adminAnalyticsRoute.get("/analytics", async (c) => {
  const requestId = c.get("requestId");
  const range = (c.req.query("range") as string) || "7d";

  const token = c.env.ANALYTICS_TOKEN;
  if (!token) {
    return c.json(
      apiErrorSchema.parse({
        ok: false,
        error: { code: "DEPENDENCY_UNAVAILABLE", message: "Analytics token not configured." },
        requestId,
      }),
      503,
    );
  }

  // CF Analytics GraphQL endpoint
  const query = buildQuery(range);

  try {
    const resp = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    const json = (await resp.json()) as { data?: unknown; errors?: unknown[] };
    if (!resp.ok || json.errors) {
      return c.json(
        apiSuccessSchema(z.object({ range: z.string(), data: z.unknown() })).parse({
          ok: true,
          data: { range, data: null },
          requestId,
        }),
      );
    }

    return c.json(
      apiSuccessSchema(z.object({ range: z.string(), data: z.unknown() })).parse({
        ok: true,
        data: { range, data: json.data },
        requestId,
      }),
    );
  } catch {
    return c.json(
      apiSuccessSchema(z.object({ range: z.string(), data: z.null() })).parse({
        ok: true,
        data: { range, data: null },
        requestId,
      }),
    );
  }
});

function buildQuery(range: string): string {
  const since = range === "30d" ? "now-30d" : range === "24h" ? "now-24h" : "now-7d";
  return `{
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        httpRequests1dGroups(limit: 30, filter: { date_gt: "${since}" }) {
          dimensions { date }
          sum { requests pageViews }
          uniq { uniques }
        }
      }
    }
  }`;
}
