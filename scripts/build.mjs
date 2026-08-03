import { readdir, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

function run(command, args, env = process.env) {
  return new Promise((resolveProcess, reject) => {
    const child = spawn(command, args, { cwd: ROOT, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveProcess();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${code ?? signal}`));
    });
  });
}

await run("pnpm", ["exec", "vue-tsc", "--build", "--force"]);

// The Vite plugin may materialize local .dev.vars beside its preview Worker
// config. Runtime secrets are configured on the deployed Worker and validated
// by Wrangler at deploy time, so remove that generated file from the artifact.
await run("pnpm", ["exec", "vite", "build"], {
  ...process.env,
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
});

const dist = join(ROOT, "dist");
const entries = await readdir(dist, { withFileTypes: true }).catch(() => []);
await Promise.all(
  entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => unlink(join(dist, entry.name, ".dev.vars")).catch(() => {})),
);
