import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The API the dev server proxies /api (and /health) to. The E2E suite points it elsewhere.
const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // VITE_* variables (e.g. VITE_CLERK_PUBLISHABLE_KEY) come from the repo-root .env, like the API's.
  envDir: "../..",
  server: {
    port: 3001,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/health": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
