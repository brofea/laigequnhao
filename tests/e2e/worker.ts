import app from "../../functions/_lib/app";
import type { Env } from "../../functions/_lib/env";

export default {
  fetch(request, env, context) {
    return app.fetch(request, env, context);
  },
} satisfies ExportedHandler<Env>;
