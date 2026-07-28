import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "shared"),
    },
  },
  test: {
    include: ["tests/workers/**/*.{test,spec}.{ts,tsx}"],
    pool: "forks",
    sequence: {
      concurrent: false,
    },
    testTimeout: 15000,
  },
});
