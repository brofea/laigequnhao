import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "./middleware/request-id";
import { errorHandler } from "./middleware/error-handler";
import { groupsRoute } from "./routes/groups";
import { submissionsRoute } from "./routes/submissions";
import { likesRoute } from "./routes/likes";
import type { Env } from "./env";

type Variables = {
  requestId: string;
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

export default app;
