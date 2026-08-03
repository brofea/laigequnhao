import { resolveResources, wrangler } from "./cloudflare-resources.mjs";

const confirmed =
  process.argv.includes("--confirm-production") || process.env.CF_DEPLOY_CONTEXT === "true";

if (!confirmed) {
  console.error(
    "Refusing remote migration. Use pnpm db:migrate:remote -- --confirm-production, or let pnpm deploy invoke it in Workers Builds.",
  );
  process.exit(1);
}

try {
  const resources = await resolveResources({ ensure: false });
  await wrangler([
    "d1",
    "migrations",
    "apply",
    resources.d1Name,
    "--remote",
    "--config",
    "wrangler.jsonc",
    "--env",
    "production",
  ]);
} catch (error) {
  console.error(`remote migration failed: ${error.message}`);
  process.exitCode = 1;
}
