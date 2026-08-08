import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { relative, resolve } from "node:path";

const workspace = process.cwd();
const stateDir = resolve(workspace, ".e2e-state");
const runtimeLogDir = resolve(workspace, ".e2e-runtime-logs");

function isWithinWorkspace(path) {
  const pathFromWorkspace = relative(workspace, path);
  return (
    pathFromWorkspace !== "" &&
    !pathFromWorkspace.startsWith("..") &&
    !pathFromWorkspace.includes("../")
  );
}

for (const path of [stateDir, runtimeLogDir]) {
  if (!isWithinWorkspace(path)) {
    throw new Error(`Refusing to clear E2E path outside workspace: ${path}`);
  }
  rmSync(path, { recursive: true, force: true });
}

mkdirSync(runtimeLogDir, { recursive: true });
const wranglerLogDir = resolve(runtimeLogDir, "wrangler");
mkdirSync(wranglerLogDir, { recursive: true });

const lifecycleLogPath = resolve(runtimeLogDir, "lifecycle.jsonl");
const migrationLogPath = resolve(runtimeLogDir, "wrangler-migrations.log");
const workerLogPath = resolve(runtimeLogDir, "wrangler-dev.log");
const wrangler = resolve(workspace, "node_modules", "wrangler", "bin", "wrangler.js");
const wranglerEnv = { ...process.env, WRANGLER_LOG_PATH: wranglerLogDir };

function commandText(args) {
  return [process.execPath, ...args].map((argument) => JSON.stringify(argument)).join(" ");
}

function recordLifecycle(event, details = {}) {
  appendFileSync(
    lifecycleLogPath,
    `${JSON.stringify({ timestamp: new Date().toISOString(), event, ...details })}\n`,
  );
}

function writeOutput(stream, chunk, outputPath) {
  appendFileSync(outputPath, chunk);
  stream.write(chunk);
}

const migrationArgs = [
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
];

recordLifecycle("launcher.started", {
  runtimeLogDir: ".e2e-runtime-logs",
  wranglerLogDir: ".e2e-runtime-logs/wrangler",
});
recordLifecycle("migration.started", { command: commandText(migrationArgs) });
const migration = spawnSync(process.execPath, migrationArgs, {
  cwd: workspace,
  encoding: "buffer",
  env: wranglerEnv,
});
writeFileSync(
  migrationLogPath,
  Buffer.concat([migration.stdout ?? Buffer.alloc(0), migration.stderr ?? Buffer.alloc(0)]),
);
if (migration.stdout?.length) process.stdout.write(migration.stdout);
if (migration.stderr?.length) process.stderr.write(migration.stderr);

if (migration.error || migration.status !== 0) {
  const error = migration.error?.message;
  recordLifecycle("migration.failed", {
    code: migration.status ?? null,
    signal: migration.signal ?? null,
    error,
    logPath: ".e2e-runtime-logs/wrangler-migrations.log",
  });
  console.error(
    `[e2e-api] D1 migration failed; inspect ${runtimeLogDir} (code: ${migration.status ?? "none"}, signal: ${migration.signal ?? "none"}).`,
  );
  process.exit(migration.status ?? 1);
}
recordLifecycle("migration.succeeded");

const workerArgs = [
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
];
const server = spawn(process.execPath, workerArgs, {
  cwd: workspace,
  env: wranglerEnv,
  stdio: ["ignore", "pipe", "pipe"],
});

server.stdout.on("data", (chunk) => writeOutput(process.stdout, chunk, workerLogPath));
server.stderr.on("data", (chunk) => writeOutput(process.stderr, chunk, workerLogPath));

let shutdownSignal;
let exited = false;

function complete(event, code, signal, details = {}) {
  if (exited) return;
  exited = true;

  const expectedSignalExitCode = { SIGINT: 130, SIGTERM: 143 }[shutdownSignal];
  const controlledStop =
    shutdownSignal !== undefined &&
    (code === 0 || code === expectedSignalExitCode || (code === null && signal === shutdownSignal));
  const exitCode = controlledStop ? 0 : code && code !== 0 ? code : 1;
  recordLifecycle(controlledStop ? "worker.stopped" : "worker.failed", {
    code: code ?? null,
    signal: signal ?? null,
    shutdownSignal: shutdownSignal ?? null,
    logPath: ".e2e-runtime-logs/wrangler-dev.log",
    wranglerLogDir: ".e2e-runtime-logs/wrangler",
    terminationEvent: event,
    ...details,
  });

  if (!controlledStop) {
    console.error(
      `[e2e-api] Worker exited unexpectedly; inspect ${runtimeLogDir} (code: ${code ?? "none"}, signal: ${signal ?? "none"}).`,
    );
  }
  process.exitCode = exitCode;
}

server.once("error", (error) => complete("error", null, null, { error: error.message }));
server.once("spawn", () => {
  recordLifecycle("worker.started", { pid: server.pid, command: commandText(workerArgs) });
});
server.once("exit", (code, signal) => complete("exit", code, signal));

function requestShutdown(signal) {
  if (shutdownSignal !== undefined) return;
  shutdownSignal = signal;
  recordLifecycle("worker.stop_requested", { signal });
  if (!server.kill(signal)) {
    recordLifecycle("worker.stop_request_not_delivered", { signal });
  }
}

process.on("SIGINT", () => requestShutdown("SIGINT"));
process.on("SIGTERM", () => requestShutdown("SIGTERM"));
process.on("exit", (code) => {
  if (!exited) {
    recordLifecycle("launcher.failed", {
      code,
      reason: "launcher exited before recording the Worker outcome",
      logPath: ".e2e-runtime-logs/wrangler-dev.log",
      wranglerLogDir: ".e2e-runtime-logs/wrangler",
    });
  }
});
