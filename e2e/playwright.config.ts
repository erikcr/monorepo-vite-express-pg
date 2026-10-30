import { defineConfig, devices } from "@playwright/test";
import { localPort } from "@repo/env/ports";
import { clerkKeys, E2E_USERS } from "./clerk-env";

// Full-stack E2E: the real API (on an in-process Postgres, see artifacts/api-server/src/
// e2e-server.ts) behind both real frontends. Own ports, so a dev stack you're running (and its
// database) is never reused; `pnpm ports e2e` moves any another program holds (lib/env/src/ports.ts).
const ports = {
  api: localPort("E2E_API_PORT"),
  web: localPort("E2E_WEB_PORT"),
  admin: localPort("E2E_ADMIN_PORT"),
};
export const API = `http://localhost:${ports.api}`;
export const WEB = `http://localhost:${ports.web}`;
const ADMIN = `http://localhost:${ports.admin}`;
const keys = clerkKeys();
// Without keys (local runs only; CI requires them), a well-formed but fake key lets the apps
// render: public pages work, and the signed-in tests skip themselves.
const PLACEHOLDER_CLERK_KEY = "pk_test_ZTJlLXBsYWNlaG9sZGVyLmNsZXJrLmFjY291bnRzLmRldiQ=";
// The sites run as production builds (with their Content-Security-Policy) calling the API
// directly, cross-origin, as they do when deployed.
const frontendEnv = {
  VITE_API_URL: API,
  VITE_CLERK_PUBLISHABLE_KEY: keys?.publishableKey ?? PLACEHOLDER_CLERK_KEY,
};
const site = (filter: string, port: number) =>
  `pnpm --filter ${filter} exec vite build --outDir dist-e2e --logLevel warn && ` +
  `pnpm --filter ${filter} exec vite preview --outDir dist-e2e --port ${port} --strictPort`;

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // A test that passes only on retry is flaky, and fails the run (docs/TESTING.md): the one
  // retry exists to record a trace of the failure, not to get to green.
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: !!process.env.CI,
  workers: process.env.CI ? 1 : undefined,
  // In CI, also an HTML report with each failure's trace (uploaded by ci.yml on private repos).
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
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
        PORT: String(ports.api),
        RATE_LIMIT_MAX: "0",
        CLERK_SECRET_KEY: keys?.secretKey ?? "",
        // Session tokens must come from these origins (Clerk's authorizedParties).
        CORS_ORIGIN: `${WEB},${ADMIN}`,
        // Links in emails (invitations) point at the E2E web site.
        WEB_URL: WEB,
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: site("@repo/web", ports.web),
      url: WEB,
      env: frontendEnv,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: site("@repo/admin", ports.admin),
      url: ADMIN,
      env: frontendEnv,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
