# monorepo-vite-express-pg

Production-ready pnpm monorepo: Express 5 API + React 19 web/admin apps + PostgreSQL via Drizzle ORM.

## Stack

| Layer | Technology |
|-------|-----------|
| API server | Express 5 + TypeScript, deployed to Railway via Dockerfile |
| Web / Admin | React 19 + Vite 8 + Tailwind CSS 4, deployed to Vercel |
| Database | PostgreSQL + Drizzle ORM |
| Background jobs | pg-boss |
| Package manager | pnpm 12 workspace monorepo |

## Local development

Requires Node 24 (`nvm use` reads `.nvmrc`), pnpm 12 (`npm install -g pnpm@12`), and Docker (for local Postgres).

```bash
pnpm install
cp .env.example .env              # local config (DATABASE_URL etc.)
docker compose up -d postgres     # start local Postgres
pnpm db:migrate                   # apply migrations
pnpm dev                          # starts api-server, web, and admin in parallel
```

Optionally run `pnpm db:seed` to add sample data.

### Git hooks

`pnpm install` points git at `.githooks/`:

- **pre-commit** blocks commits on `main` and `staging`, then runs Biome on the staged files
  (fix with `pnpm exec biome check --write --staged`).
- **pre-push** blocks pushes to `main` and `staging`.

Work on a feature branch and open a PR into `staging`; CI runs the full check suite.

The API reference (from `lib/api-spec/openapi.yaml`) is at http://localhost:3000/docs; deployed,
it's on in staging and off in production (`API_DOCS`).

See `CLAUDE.md` for the full command reference.

---

## Deploying

Changes flow `feature branch → PR → staging → promotion PR → main`, with staging and
production environments on Railway and Vercel. For a new project run `/provision-github`,
`/provision-railway`, then `/provision-vercel`. The full process, its gates and the
migration rules are in [`docs/DEPLOYMENTS.md`](docs/DEPLOYMENTS.md). The sections below
are the provider gotchas behind those commands.

---

## Deploying to Railway (API server)

### Infrastructure as Code

The Railway project is defined in [`.railway/railway.ts`](.railway/railway.ts): the `Postgres`
database and the `api` service (Dockerfile build, watch patterns, migrations, health check,
draining time, restart policy, Wait for CI, variables), with `production` deploying `main` and
`staging` deploying `staging`. `/provision-railway` creates the project and applies it.

Railway doesn't read this file during deploys. Change it, then apply it to each environment:

```bash
railway environment staging      # or production
railway config plan              # read-only preview of what would change
railway config apply             # applies after confirmation
```

Don't change these settings in the Railway dashboard: the next `apply` puts them back. (Railway's
older `railway.toml` / config-as-code files stop working on 2026-12-01, and new services can't use
them at all.)

### Migrations

`dist/migrate.js` is a standalone migration runner bundled into the image alongside the server.
It runs as the service's pre-deploy command: if migrations fail, Railway aborts the deploy and the
old instance keeps running.

### Background jobs and shutdown

The API process also runs the pg-boss worker, so one Railway service handles requests and jobs.
To scale them separately, set `RUN_WORKER=false` on `api` and add a second service in
`.railway/railway.ts` from the same repo with start command `node dist/worker.js` (no domain or
health check needed).

On redeploy Railway sends SIGTERM; the server stops taking requests, lets in-flight requests and
active jobs finish, then closes the database pool. `drainingSeconds: 30` gives it that time
(Railway's default is 0: an immediate SIGKILL).

### Environment variables

`DATABASE_URL` references the Postgres service. Railway injects `PORT` (and routes the domains to it); the Dockerfile sets `NODE_ENV=production`.

`CORS_ORIGIN` is a comma-separated list of your Vercel app URLs, so the browser can call the API:

```
CORS_ORIGIN=https://your-web-app.vercel.app,https://your-admin-app.vercel.app
```

It differs per environment, so the file keeps whatever Railway has (`preserve()`), and
`/provision-vercel` sets it once the site URLs exist. Without it, browsers block cross-origin
requests from Vercel to Railway with a CORS error even though the API is reachable.

---

## Deploying to Vercel (web + admin)

Create two separate Vercel projects — one for `artifacts/web`, one for `artifacts/admin`.

### Required dashboard setting

The only setting that needs to be configured in the Vercel dashboard is:

| Setting | Value |
|---------|-------|
| Root Directory | `artifacts/web` or `artifacts/admin` |

Leave Build Command, Output Directory, and Install Command as defaults. All three are defined in `vercel.json` inside each app directory and will be picked up automatically once Root Directory is set.

### How the vercel.json works

Each app's `vercel.json` runs install and build from the **repo root** via `cd ../..`:

```json
{
  "installCommand": "cd ../.. && pnpm install --frozen-lockfile",
  "buildCommand": "cd ../.. && pnpm --filter @repo/web build",
  "outputDirectory": "dist"
}
```

This is necessary because the apps depend on workspace packages (`@repo/api-client-react`, `@repo/api-zod`, etc.) that only exist in the monorepo context. If `pnpm install` runs from `artifacts/web/` without workspace context, those packages won't be available and `vite build` will fail silently with no output.

### Common mistakes

**Wrong outputDirectory path.**
`outputDirectory` is resolved relative to Root Directory. Setting it to `artifacts/web/dist` when Root Directory is already `artifacts/web` makes Vercel look for `artifacts/web/artifacts/web/dist`, which doesn't exist. The error:
```
No Output Directory named "dist" found after the Build completed.
```
The correct value is just `"dist"`.

**Overriding build settings in the dashboard.**
If Build Command or Output Directory are manually set in the Vercel dashboard they take precedence over `vercel.json`. Leave them blank so `vercel.json` controls everything.

### Environment variables

Set `VITE_API_URL` on each Vercel project to your Railway API server URL:

```
VITE_API_URL=https://your-api.railway.app
```

This value is baked into the JS bundle at build time by Vite. If you add or change it in the Vercel dashboard you must trigger a new deploy — existing deploys will not pick it up.

**Why this is required in production.**
In local development, Vite proxies `/health` and `/api/*` to `localhost:3000`, so no URL is needed. On Vercel there is no proxy — without `VITE_API_URL` all API calls go to the Vercel domain and fail with a 404.
