import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveResources, wrangler, writeGeneratedConfig } from "./cloudflare-resources.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

async function findPluginConfig() {
  const dist = join(ROOT, "dist");
  const entries = await readdir(dist, { withFileTypes: true }).catch(() => []);
  const configs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(dist, entry.name, "wrangler.json"));
  for (const candidate of configs) {
    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch {
      // Continue searching; the build may use a different generated worker name.
    }
  }
  throw new Error(
    "Missing Vite Plugin generated Wrangler config. Run pnpm build before pnpm deploy.",
  );
}

async function main() {
  const baseConfig = await findPluginConfig();
  const resources = await resolveResources({ ensure: true });
  const generatedConfig = await writeGeneratedConfig(baseConfig, resources);

  console.log("Applying unapplied production D1 migrations...");
  await wrangler([
    "d1",
    "migrations",
    "apply",
    resources.d1Name,
    "--remote",
    "--config",
    generatedConfig,
  ]);

  console.log("Deploying Worker and Static Assets...");
  await wrangler(["deploy", "--config", generatedConfig]);
  console.log(`Deployment complete for Worker ${resources.workerName}.`);
}

main().catch((error) => {
  console.error(`deploy failed: ${error.message}`);
  process.exitCode = 1;
});
