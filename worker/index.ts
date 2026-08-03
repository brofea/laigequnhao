import app from "../functions/_lib/app";
import type { Env } from "../functions/_lib/env";

/**
 * Production Module Worker adapter.
 *
 * Workers Static Assets handles non-API requests according to wrangler.jsonc;
 * the `/api/*` run-worker-first rule sends API requests here. Keeping this
 * adapter intentionally small means the Worker runtime reuses the same Hono
 * routes, bindings, and request context as the test adapter.
 */
const worker = {
  fetch(request: Request, env: Env, context: ExecutionContext): Response | Promise<Response> {
    return app.fetch(request, env, context);
  },
} satisfies ExportedHandler<Env>;

export default worker;
