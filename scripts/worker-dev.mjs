import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const generatedDir = join(ROOT, ".wrangler/worker-dev");
const configPath = join(generatedDir, "wrangler.json");
const assetsDir = join(generatedDir, "assets");

await mkdir(assetsDir, { recursive: true });
await writeFile(
  configPath,
  `${JSON.stringify(
    {
      $schema: "./node_modules/wrangler/config-schema.json",
      name: "laigequnhao-local",
      main: "../../worker/index.ts",
      compatibility_date: "2025-01-01",
      compatibility_flags: ["nodejs_compat"],
      assets: {
        directory: "./assets",
        binding: "ASSETS",
        not_found_handling: "single-page-application",
        run_worker_first: ["/api/*"],
      },
      d1_databases: [
        { binding: "DB", database_name: "lgqh-dev", migrations_dir: "../../migrations" },
      ],
      r2_buckets: [{ binding: "R2", bucket_name: "lgqh-dev" }],
      vars: { ENVIRONMENT: "local", SKIP_TURNSTILE: "true", SECURE_COOKIE: "false" },
    },
    null,
    2,
  )}\n`,
  "utf8",
);

const child = spawn(
  "pnpm",
  [
    "exec",
    "wrangler",
    "dev",
    "--config",
    configPath,
    "--local",
    "--persist-to",
    join(ROOT, ".wrangler/state"),
    "--port",
    "8788",
  ],
  { cwd: ROOT, stdio: "inherit", env: process.env },
);

const forward = (signal) => child.kill(signal);
process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGTERM", () => forward("SIGTERM"));
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
