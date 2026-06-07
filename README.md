# monorepo-vite-express-pg

Production-ready pnpm monorepo: Express 5 API + React 19 web/admin apps + PostgreSQL via Drizzle ORM.

## Stack

| Layer | Technology |
|-------|-----------|
| API server | Express 5 + TypeScript, deployed to Railway via Dockerfile |
| Web / Admin | React 19 + Vite 6 + Tailwind CSS 4, deployed to Vercel |
| Database | PostgreSQL + Drizzle ORM |
| Background jobs | pg-boss |
| Package manager | pnpm 9 workspace monorepo |

## Local development

```bash
pnpm install
pnpm dev          # starts api-server, web, and admin in parallel
```

See `CLAUDE.md` for the full command reference.

---

## Deploying to Railway (API server)

### Initial setup

1. Create a new Railway project and connect your GitHub repo
2. Add a **PostgreSQL** database service — Railway auto-injects `DATABASE_URL` when linked
3. Configure the API server service with the settings below before triggering a deploy

### Required dashboard settings

| Setting | Location | Value |
|---------|----------|-------|
| Root Directory | Settings → Build | **leave blank** |
| Builder | Settings → Build | Dockerfile (or leave on auto-detect) |
| Start Command | Settings → Deploy | **leave blank** |

**Root Directory must be blank.**
The Dockerfile lives at the repo root. If you set Root Directory to `artifacts/api-server`, Railway can't find the Dockerfile and falls back to Nixpacks. Nixpacks detects the `package.json` and uses `pnpm start` as the start command — but pnpm isn't installed in the lean runtime image, so the deploy fails with:
```
The executable 'pnpm' could not be found
```

**Start Command must be blank.**
Any value set in the dashboard overrides `railway.toml` and the Dockerfile `CMD`. If something was previously entered here, clear it. `railway.toml` already sets `startCommand = "node dist/index.js"`.

### Service auto-detection on import

When you import the repo, Railway scans every `package.json` and offers ~8 services. Keep only the one at the repo root (the Dockerfile service) and delete the rest. This is a one-time step — future pushes deploy automatically without going through the import wizard again.

There is no config file that suppresses Railway's detection heuristics during the initial import. The `.dockerignore` controls what files are sent to the Docker build context, not what Railway's UI detects.

### Migrations

`dist/migrate.js` is a standalone migration runner bundled into the image alongside the server. It runs automatically as a pre-deploy step — if migrations fail, Railway aborts the deploy and the old instance keeps running.

This is configured in `railway.toml` via `preDeployCommand = "node dist/migrate.js"` — no dashboard setup needed.

### Environment variables

`DATABASE_URL` is injected automatically when you link the Postgres service to the API service in Railway.

Set `CORS_ORIGIN` to a comma-separated list of your Vercel app URLs so the browser can call the API:

```
CORS_ORIGIN=https://your-web-app.vercel.app,https://your-admin-app.vercel.app
```

Without this, browsers will block cross-origin requests from Vercel to Railway with a CORS error even though the API is reachable. The default only allows localhost.

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
