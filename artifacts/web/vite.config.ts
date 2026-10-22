import { csp, securityTxtFile } from "@repo/csp";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The API the dev server proxies /api (and /health) to.
const apiTarget = "http://localhost:3000";

export default defineConfig({
  // csp(): the Content-Security-Policy <meta> tag, in production builds (lib/csp).
  // securityTxtFile(): /.well-known/security.txt, when VITE_SECURITY_CONTACT is set.
  plugins: [react(), tailwindcss(), csp(), securityTxtFile()],
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
