import type { D1Migration } from "@cloudflare/vitest-pool-workers/config";
import type { Env } from "../../functions/_lib/env";

declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {
    MIGRATION_DB: D1Database;
    TEST_MIGRATIONS: D1Migration[];
  }
}
