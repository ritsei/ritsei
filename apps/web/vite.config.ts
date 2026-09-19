import { defineConfig } from "vite"
import solid from "@solidjs/vite-plugin"

export default defineConfig({
  root: "apps/web",
  plugins: [solid()],
  resolve: { dedupe: ["solid-js"] },
  server: {
    host: "127.0.0.1",
    // Development only. Production needs a same-origin /api reverse proxy.
    proxy: { "/api": { target: "http://127.0.0.1:8000", rewrite: (path) => path.slice(4) } },
  },
  build: { target: "es2022", sourcemap: false },
})
