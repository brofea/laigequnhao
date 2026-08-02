import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const prototypeRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: prototypeRoot,
  plugins: [vue()],
  resolve: {
    alias: {
      "@prototype": prototypeRoot,
    },
  },
  server: {
    host: "127.0.0.1",
    port: 4174,
    strictPort: true,
  },
  build: {
    outDir: resolve(prototypeRoot, "dist"),
    emptyOutDir: true,
    target: "ES2022",
  },
});
