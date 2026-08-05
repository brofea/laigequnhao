import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "./middleware/request-id";
import { errorHandler } from "./middleware/error-handler";
import { groupsRoute } from "./routes/groups";
import { discoverRoute } from "./routes/discover";
import { tagsRoute } from "./routes/tags";
import { boardsRoute } from "./routes/boards";
import { submissionsRoute } from "./routes/submissions";
import { publicConfigRoute } from "./routes/public-config";
import { likesRoute } from "./routes/likes";
import { adminSessionRoute } from "./routes/admin-session";
import { adminGroupsRoute } from "./routes/admin-groups";
import { adminBoardsRoute } from "./routes/admin-boards";
import { adminAssetsRoute } from "./routes/admin-assets";
import { adminHealthRoute } from "./routes/admin-health";
import { adminDashboardRoute } from "./routes/admin-dashboard";
import { adminAnalyticsRoute } from "./routes/admin-analytics";
import type { Env } from "./env";

type Variables = {
  requestId: string;
  sessionId: string;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", cors());
app.use("*", requestId());
app.onError(errorHandler());

// Health check
app.get("/api/v1/health", (c) => {
  return c.json({
    ok: true,
    data: {
      status: "healthy",
      version: "0.0.0",
      timestamp: new Date().toISOString(),
    },
    requestId: c.get("requestId"),
  });
});

// R2 asset serving (public, no auth — used by both local dev and production)
app.get("/api/v1/assets/:key{.+}", async (c) => {
  const key = c.req.param("key");
  if (!key) {
    return c.notFound();
  }

  const object = await c.env.R2.get(key);
  if (!object) {
    return c.notFound();
  }

  const contentType = key.startsWith("qr_code/") ? "image/jpeg" : "image/png";
  c.header("Content-Type", contentType);
  c.header("Cache-Control", "public, max-age=31536000, immutable");
  c.header("X-Content-Type-Options", "nosniff");
  return c.body(object.body);
});

// API routes
app.route("/api/v1/groups", groupsRoute);
app.route("/api/v1/discover", discoverRoute);
app.route("/api/v1/tags", tagsRoute);
app.route("/api/v1/boards", boardsRoute);
app.route("/api/v1/submissions", submissionsRoute);
app.route("/api/v1/config", publicConfigRoute);
app.route("/api/v1/groups", likesRoute);
app.route("/api/v1/admin", adminSessionRoute);
app.route("/api/v1/admin", adminGroupsRoute);
app.route("/api/v1/admin", adminBoardsRoute);
app.route("/api/v1/admin", adminAssetsRoute);
app.route("/api/v1/admin", adminHealthRoute);
app.route("/api/v1/admin", adminDashboardRoute);
app.route("/api/v1/admin", adminAnalyticsRoute);

export default app;
