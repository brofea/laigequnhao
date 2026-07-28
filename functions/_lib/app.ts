import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "./middleware/request-id";
import { errorHandler } from "./middleware/error-handler";
import { groupsRoute } from "./routes/groups";
import { submissionsRoute } from "./routes/submissions";
import { likesRoute } from "./routes/likes";
import { adminSessionRoute } from "./routes/admin-session";
import { adminGroupsRoute } from "./routes/admin-groups";
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

// API routes
app.route("/api/v1/groups", groupsRoute);
app.route("/api/v1/submissions", submissionsRoute);
app.route("/api/v1/groups", likesRoute);
app.route("/api/v1/admin", adminSessionRoute);
app.route("/api/v1/admin", adminGroupsRoute);
app.route("/api/v1/admin", adminAssetsRoute);
app.route("/api/v1/admin", adminHealthRoute);
app.route("/api/v1/admin", adminDashboardRoute);
app.route("/api/v1/admin", adminAnalyticsRoute);

export default app;
