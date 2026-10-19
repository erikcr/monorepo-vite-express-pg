import { defineConfig, devices } from "@playwright/test";

// Full-stack E2E: the real API (on an in-process Postgres, see artifacts/api-server/src/
// e2e-server.ts) behind both real frontends. Own ports, so a dev stack you're running (and its
// database) is never reused.
export const API = "http://localhost:3100";
const WEB = "http://localhost:5174";
const ADMIN = "http://localhost:3002";
const proxyToApi = { API_PROXY_TARGET: API };

export default defineConfig({
  testDir: "./tests",
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
      command: "pnpm --filter @repo/api-server e2e:server",
      url: `${API}/health/ready`,
      env: { PORT: "3100", RATE_LIMIT_MAX: "0" },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @repo/web exec vite --port 5174 --strictPort",
      url: WEB,
      env: proxyToApi,
      reuseExistingServer: false,
    },
    {
      command: "pnpm --filter @repo/admin exec vite --port 3002 --strictPort",
      url: ADMIN,
      env: proxyToApi,
      reuseExistingServer: false,
    },
  ],
});
