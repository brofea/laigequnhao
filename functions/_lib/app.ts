import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "./middleware/request-id";
import { errorHandler } from "./middleware/error-handler";

const app = new Hono();

app.use("*", cors());
app.use("*", requestId());
app.onError(errorHandler());

const v1 = new Hono();

v1.get("/health", (c) => {
  return c.json({
    ok: true,
    data: {
      status: "healthy",
      version: "0.0.0",
      timestamp: new Date().toISOString(),
    },
    requestId: c.get("requestId") as string,
  });
});

app.route("/api/v1", v1);

export default app;
