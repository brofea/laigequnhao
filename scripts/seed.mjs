/**
 * Stable public entry point for local-only seed data.
 * The implementation remains in seed-local.mjs while the old filename is retired.
 */
import { runSeedCli } from "./seed-local.mjs";

await runSeedCli();
