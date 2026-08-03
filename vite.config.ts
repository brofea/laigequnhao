import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => ({
  // The Cloudflare plugin owns the Worker runtime, local bindings, and the
  // client output directory. Do not set build.outDir: the generated
  // wrangler.json uses the plugin's actual client output (for example,
  // dist/client) for Workers Static Assets.
  plugins: [
    vue(),
    ...(mode === "frontend-only" || mode === "e2e"
      ? []
      : [cloudflare({ configPath: "./wrangler.jsonc" })]),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@shared": resolve(__dirname, "shared"),
    },
  },
  ...(mode === "frontend-only" || mode === "e2e"
    ? {
        server: {
          proxy: {
            "/api": {
              // Frontend-only and E2E modes may talk to an explicitly local
              // Worker, never to a remote or production endpoint.
              target: "http://127.0.0.1:8788",
              changeOrigin: true,
            },
          },
          ...(mode === "e2e"
            ? {
                // Playwright runs against a long-lived dev server while the
                // API process owns the test database. An HMR error overlay
                // would become page content and look like a UI failure.
                hmr: { overlay: false },
              }
            : {}),
        },
      }
    : {}),
  build: {
    target: "ES2022",
  },
}));
