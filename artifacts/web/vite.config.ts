import { csp, securityTxtFile } from "@repo/csp";
import { localPort } from "@repo/env/ports";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Local ports come from the repo-root .env too (lib/env/src/ports.ts, `pnpm ports`).
  const rootEnv = loadEnv(mode, "../..", "");
  // The API the dev server proxies /api (and /health) to.
  const apiTarget = `http://localhost:${localPort("PORT", rootEnv)}`;

  return {
    // csp(): the Content-Security-Policy <meta> tag, in production builds (lib/csp).
    // securityTxtFile(): /.well-known/security.txt, when VITE_SECURITY_CONTACT is set.
    plugins: [react(), tailwindcss(), csp(), securityTxtFile()],
    // VITE_* variables (e.g. VITE_CLERK_PUBLISHABLE_KEY) come from the repo-root .env, like the API's.
    envDir: "../..",
    server: {
      port: localPort("WEB_PORT", rootEnv),
      // Fail rather than move to the next port: the API only accepts the origins it was told.
      strictPort: true,
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
  };
});
