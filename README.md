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
2. Add a **PostgreSQL** database service — Railway will inject `DATABASE_URL` automatically
3. Configure the API server service (see gotchas below)

### Service configuration — required settings

When setting up the service in the Railway dashboard, these settings must be correct or the deploy will fail:

| Setting | Location | Required value |
|---------|----------|----------------|
| Root Directory | Settings → Build | **empty** (leave blank) |
| Builder | Settings → Build | Dockerfile (or auto-detect) |
| Start Command | Settings → Deploy | **empty** — let `railway.json` / Dockerfile CMD handle it |

**Why Root Directory must be blank:** Railway looks for the `Dockerfile` starting at the configured root. If you set it to `artifacts/api-server`, Railway won't find the Dockerfile (it lives at the repo root) and falls back to Nixpacks, which tries `pnpm start` in a runtime image that has no pnpm.

**Why Start Command must be blank:** If a start command is set in the dashboard it overrides everything, including `railway.json` and the Dockerfile `CMD`. Clear it so Railway uses `node dist/index.js` from `railway.json`.

### Service auto-detection on import

When importing the repo Railway detects all `package.json` files and offers ~8 services. Keep only the one pointing at the repo root (the Dockerfile service) and delete the rest. This is a one-time step — future pushes deploy automatically without going through the import wizard again.

### Migrations

`dist/migrate.js` is a standalone migration runner bundled into the image. Set it as Railway's **pre-deploy command** so migrations run before the new instance goes live:

```
node dist/migrate.js
```

Set this at: Service → Settings → Deploy → Pre-deploy Command

### Environment variables

Railway injects `DATABASE_URL` automatically when you link the Postgres service. No manual configuration needed for the database connection.

---

## Deploying to Vercel (web + admin)

Create two Vercel projects, one for `artifacts/web` and one for `artifacts/admin`:

| Setting | Value |
|---------|-------|
| Root Directory | `artifacts/web` or `artifacts/admin` |
| Build Command | `pnpm build` |
| Output Directory | `dist` |
| Install Command | `pnpm install` |

Set `VITE_API_URL` on each project to your Railway API URL.
