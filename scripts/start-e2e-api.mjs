import { rmSync } from "node:fs";
import { resolve, sep } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const workspace = process.cwd();
const stateDir = resolve(workspace, ".e2e-state");
if (!stateDir.startsWith(`${workspace}${sep}`)) {
  throw new Error(`Refusing to clear E2E state outside workspace: ${stateDir}`);
}
rmSync(stateDir, { recursive: true, force: true });

const wrangler = resolve(workspace, "node_modules", "wrangler", "bin", "wrangler.js");
const migration = spawnSync(
  process.execPath,
  [
    wrangler,
    "d1",
    "migrations",
    "apply",
    "lgqh-test-local",
    "--local",
    "--config",
    "wrangler.test.jsonc",
    "--persist-to",
    ".e2e-state",
  ],
  { cwd: workspace, stdio: "inherit" },
);
if (migration.error) throw migration.error;
if (migration.status !== 0) process.exit(migration.status ?? 1);

const server = spawn(
  process.execPath,
  [
    wrangler,
    "dev",
    "tests/e2e/worker.ts",
    "--local",
    "--port",
    "8788",
    "--config",
    "wrangler.test.jsonc",
    "--persist-to",
    ".e2e-state",
    "--env-file",
    "tests/e2e/.dev.vars",
    "--log-level",
    "warn",
  ],
  { cwd: workspace, stdio: "inherit" },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => process.exit(code ?? 0));
