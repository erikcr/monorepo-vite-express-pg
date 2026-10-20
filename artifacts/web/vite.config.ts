import { csp } from "@repo/csp";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The API the dev server proxies /api (and /health) to.
const apiTarget = "http://localhost:3000";

export default defineConfig({
  // csp(): the Content-Security-Policy <meta> tag, in production builds (lib/csp).
  plugins: [react(), tailwindcss(), csp()],
  // VITE_* variables (e.g. VITE_CLERK_PUBLISHABLE_KEY) come from the repo-root .env, like the API's.
  envDir: "../..",
  server: {
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
