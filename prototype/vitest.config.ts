import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const prototypeRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: prototypeRoot,
  plugins: [vue()],
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/*.spec.ts"],
    css: true,
  },
  resolve: {
    alias: {
      "@prototype": resolve(prototypeRoot),
    },
  },
});
