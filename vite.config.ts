import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import * as vueCompiler from "vue/compiler-sfc";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  // 开发模式默认加载 wrangler.jsonc 的 env.develop（Cloudflare Vite 插件通过
  // CLOUDFLARE_ENV 选择环境；显式设置时尊重外部覆盖）。
  if (mode === "development" && process.env.CLOUDFLARE_ENV === undefined) {
    process.env.CLOUDFLARE_ENV = "develop";
  }
  return {
    // The Cloudflare plugin owns the Worker runtime, local bindings, and the
    // client output directory. Do not set build.outDir: the generated
    // wrangler.json uses the plugin's actual client output (for example,
    // dist/client) for Workers Static Assets.
    plugins: [
      // Inject the compiler eagerly. The Vue plugin otherwise initializes it in
      // buildStart; Cloudflare Vite Plugin can deliver an HMR event before that
      // hook and plugin-vue then reads invalidateTypeCache from null.
      vue({ compiler: vueCompiler }),
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
  };
});
