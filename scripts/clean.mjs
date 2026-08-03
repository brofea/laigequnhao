import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";

const execFileAsync = promisify(execFile);
const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PERSIST_TO = resolve(process.env.WRANGLER_PERSIST_TO ?? join(ROOT, ".wrangler/state"));
const BUCKET = "lgqh-dev";
const CONFIRMATION = "CLEAN LOCAL D1+R2";

async function confirm() {
  if (process.argv.includes("--yes")) return;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      `clean is destructive; interactive confirmation required (${CONFIRMATION}), or pass --yes explicitly.`,
    );
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const first = await rl.question(
      `This clears local D1 application rows AND local R2 objects, but keeps schema, instance and d1_migrations. Type ${CONFIRMATION}: `,
    );
    if (first !== CONFIRMATION) throw new Error("Confirmation text did not match.");
    const second = await rl.question("Confirm the local D1 + R2 cleanup again (yes/no): ");
    if (second.toLowerCase() !== "yes") throw new Error("Cleanup cancelled.");
  } finally {
    rl.close();
  }
}

async function main() {
  await confirm();
  const sql = [
    "PRAGMA foreign_keys = ON",
    "DELETE FROM board_groups",
    "DELETE FROM join_methods",
    "DELETE FROM group_tags",
    "DELETE FROM submission_details",
    "DELETE FROM likes",
    "DELETE FROM assets",
    "DELETE FROM boards",
    "DELETE FROM groups",
    "DELETE FROM rate_limits",
  ].join("; ");
  await execFileAsync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      BUCKET,
      "--local",
      "--persist-to",
      PERSIST_TO,
      "--command",
      sql,
    ],
    { cwd: ROOT, maxBuffer: 5 * 1024 * 1024 },
  );

  const r2BucketPath = join(PERSIST_TO, "v3", "r2", BUCKET);
  if (existsSync(r2BucketPath)) {
    await rm(r2BucketPath, { recursive: true, force: true });
    await mkdir(r2BucketPath, { recursive: true });
  }
  console.log(
    "Local D1 application rows and local R2 objects cleaned; schema, instance and d1_migrations were preserved.",
  );
}

main().catch((error) => {
  console.error(`clean failed: ${error.message}`);
  process.exitCode = 1;
});
