import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(resolve(__dirname, "migrations"));

  return {
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "shared"),
      },
    },
    test: {
      include: ["tests/workers/**/*.{test,spec}.{ts,tsx}"],
      pool: "@cloudflare/vitest-pool-workers" as const,
      poolOptions: {
        workers: {
          isolatedStorage: true,
          singleWorker: true,
          wrangler: { configPath: "./wrangler.test.jsonc" },
          miniflare: {
            d1Databases: ["DB", "MIGRATION_DB"],
            bindings: {
              TEST_MIGRATIONS: migrations,
              ADMIN_PASSWORD: "test-admin-password",
              SESSION_SECRET: "test-session-secret",
              LIKE_PEPPER: "test-like-pepper",
              DEV_LIKE_PEPPER: "test-like-pepper",
              SECURE_COOKIE: "true",
              LOGIN_MAX_ATTEMPTS: "100",
              LOGIN_WINDOW_MINUTES: "5",
              LIKE_LIMIT_PER_TEN_MINUTE: "1000",
              R2_PUBLIC_BASE_URL: "https://assets.test.invalid",
            },
          },
        },
      },
      setupFiles: ["./tests/workers/setup.ts"],
      fileParallelism: false,
      sequence: {
        concurrent: false,
      },
      testTimeout: 15000,
    },
  };
});
