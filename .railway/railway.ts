// Railway Infrastructure as Code: the API service and its database, per environment.
// Preview with `railway config plan`, apply with `railway config apply` (see docs/DEPLOYMENTS.md).
// Railway does not read this file during deploys; it changes only when you apply it.
import { defineRailway, github, postgres, preserve, project, service } from "railway/iac";

// GitHub repo the API deploys from. /provision-railway sets this for new projects.
const REPO = "erikcr/monorepo-vite-express-pg";

export default defineRailway((ctx) => {
  const production = ctx.environment === "production";

  const db = postgres("Postgres");

  const api = service("api", {
    // production deploys main, staging deploys staging. checkSuites = "Wait for CI": a commit
    // only deploys once its GitHub Actions finish, and never if CI failed.
    source: github(REPO, { branch: production ? "main" : "staging", checkSuites: true }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
      // No watchPatterns: every commit deploys the API, even a frontend-only one, because the
      // sites deploy only after the API serves their commit (.github/workflows/deploy-sites.yml).
    },
    // Migrations run before the new version starts; if they fail, the old one keeps serving.
    preDeploy: "node dist/migrate.js",
    start: "node dist/index.js",
    // Traffic switches only once the new version can reach the database.
    healthcheck: "/health/ready",
    healthcheckTimeout: 60,
    deploy: {
      // Time between SIGTERM and SIGKILL on redeploy (Railway's default is 0). The server's
      // own shutdown timeout (25s, src/shutdown.ts) stays below it.
      drainingSeconds: 30,
      // Restart on crash (Railway's default policy, ON_FAILURE), at most 3 times.
      restartPolicyMaxRetries: 3,
    },
    // PORT is not set: Railway injects it and routes the service's domains to it. (NODE_ENV comes
    // from the Dockerfile.)
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      // Interactive API reference at /docs everywhere except production.
      API_DOCS: production ? "false" : "true",
      // Set per environment by /provision-vercel once the site URLs exist.
      CORS_ORIGIN: preserve(),
      // Clerk secret: a development instance's (sk_test_) in staging, the production instance's
      // (sk_live_) in production. Set by /provision-railway; never written into this file.
      CLERK_SECRET_KEY: preserve(),
      // Sentry DSN (error tracking), set per environment when a Sentry project exists; unset,
      // errors are only logged. Set by /provision-railway.
      SENTRY_DSN: preserve(),
    },
  });

  // Use the linked project's own name, so applying never renames it. (Undefined only when no
  // project is linked, in which case plan/apply stop before using it.)
  return project(ctx.projectName ?? "unlinked", { resources: [db, api] });
});
