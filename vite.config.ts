import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const localR2Root = resolve(__dirname, ".wrangler/state/v3/r2/miniflare-R2BucketObject");

function localR2AssetsPlugin(): Plugin {
  return {
    name: "local-r2-assets",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        void (async () => {
          let key: string;
          try {
            const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
            if (!pathname.startsWith("/assets/")) {
              next();
              return;
            }
            key = decodeURIComponent(pathname.slice("/assets/".length));
          } catch {
            response.statusCode = 400;
            response.end("Bad Request");
            return;
          }

          const filePath = resolve(localR2Root, key);
          if (!key || !filePath.startsWith(`${localR2Root}${sep}`)) {
            response.statusCode = 404;
            response.end("Not Found");
            return;
          }

          try {
            if (!(await stat(filePath)).isFile()) {
              next();
              return;
            }
            response.setHeader("Content-Type", "image/webp");
            response.setHeader("Cache-Control", "no-cache");
            response.setHeader("X-Content-Type-Options", "nosniff");
            createReadStream(filePath).pipe(response);
          } catch {
            next();
          }
        })();
      });
    },
  };
}

export default defineConfig({
  plugins: [vue(), localR2AssetsPlugin()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@shared": resolve(__dirname, "shared"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8788",
        changeOrigin: true,
      },
    },
  },
  build: {
    target: "ES2022",
    outDir: "dist",
  },
});
