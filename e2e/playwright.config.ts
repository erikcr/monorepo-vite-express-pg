import { defineConfig, devices } from "@playwright/test";
import { clerkKeys, E2E_USERS } from "./clerk-env";

// Full-stack E2E: the real API (on an in-process Postgres, see artifacts/api-server/src/
// e2e-server.ts) behind both real frontends. Own ports, so a dev stack you're running (and its
// database) is never reused.
export const API = "http://localhost:3100";
const WEB = "http://localhost:5174";
const ADMIN = "http://localhost:3002";
const keys = clerkKeys();
// Without keys (local runs only; CI requires them), a well-formed but fake key lets the apps
// render: public pages work, and the signed-in tests skip themselves.
const PLACEHOLDER_CLERK_KEY = "pk_test_ZTJlLXBsYWNlaG9sZGVyLmNsZXJrLmFjY291bnRzLmRldiQ=";
const frontendEnv = {
  API_PROXY_TARGET: API,
  VITE_CLERK_PUBLISHABLE_KEY: keys?.publishableKey ?? PLACEHOLDER_CLERK_KEY,
};

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: { trace: "on-first-retry" },
  projects: [
    { name: "web", testMatch: "web.spec.ts", use: { ...devices["Desktop Chrome"], baseURL: WEB } },
    {
      name: "admin",
      testMatch: "admin.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: ADMIN },
    },
  ],
  webServer: [
    {
      // The E2E database starts empty on every run, so the staff test user is granted at startup.
      command: `pnpm --filter @repo/api-server e2e:server --staff ${E2E_USERS.staff}`,
      url: `${API}/health/ready`,
      env: {
        PORT: "3100",
        RATE_LIMIT_MAX: "0",
        CLERK_SECRET_KEY: keys?.secretKey ?? "",
        // Session tokens must come from these origins (Clerk's authorizedParties).
        CORS_ORIGIN: `${WEB},${ADMIN}`,
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @repo/web exec vite --port 5174 --strictPort",
      url: WEB,
      env: frontendEnv,
      reuseExistingServer: false,
    },
    {
      command: "pnpm --filter @repo/admin exec vite --port 3002 --strictPort",
      url: ADMIN,
      env: frontendEnv,
      reuseExistingServer: false,
    },
  ],
});
