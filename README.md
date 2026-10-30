# monorepo-vite-express-pg

Production-ready pnpm monorepo: Express 5 API + React 19 web/admin apps + PostgreSQL via Drizzle ORM.

## Stack

| Layer | Technology |
|-------|-----------|
| API server | Express 5 + TypeScript, deployed to Railway via Dockerfile |
| Web / Admin | React 19 + Vite 8 + Tailwind CSS 4, deployed to Vercel |
| Database | PostgreSQL + Drizzle ORM |
| Background jobs | pg-boss |
| Errors | Sentry (optional: on when `SENTRY_DSN` is set) |
| Email | Resend (optional: on when `RESEND_API_KEY` is set) |
| Package manager | pnpm 12 workspace monorepo |

## Starting a project from this template

Create a repo from this one (GitHub's **Use this template**), clone it, and follow
[Setting up a new project](docs/DEPLOYMENTS.md#setting-up-a-new-project): Clerk keys, then
`/provision-github`, `/provision-railway`, `/provision-vercel` and `/new-project`, in that order.
Each is a skill a coding agent runs with you (Claude Code: type the command; other agents: ask for
the skill by name, from `.agents/skills/`). `/new-project` writes `docs/PROJECT.md` and replaces
this README's heading with your product's.

## Running costs

Estimated monthly cost for one developer on each service's entry paid plan (October 2026; prices
change, so check each pricing page before budgeting):

| Service | Used for | Plan | Est. / month |
|---------|----------|------|--------------|
| Railway | API + worker and Postgres, production and staging; database backups | Pro: $20/seat, includes $20 of usage | $20–40 |
| Vercel | web and admin sites | Pro: $20/user, includes usage credit | $20 |
| Clerk | sign-in (orgs and roles live in our tables, so no Organizations add-on) | Pro: $25 monthly, $20 billed yearly | $20–25 |
| Sentry | error tracking and the `/health/ready` uptime monitor | Team: $26 billed yearly, $29 monthly | $26–29 |
| Resend | email (invitations, notices, job results) | Pro: $20 for 50,000 emails | $20 |
| GitHub | repo, Actions CI, rulesets | Pro/Team: $4/user (Actions free on public repos) | $4 |
| Renovate | weekly dependency PRs | Mend's hosted app | $0 |
| **Total** | | | **~$115–145** |

- **Railway is the variable:** four always-on pieces (API and Postgres in each environment) mostly
  fit inside the $20 credit at low traffic; bigger instances or databases push it past $40.
  Backups need Pro.
- **Each extra developer** adds about $20 (Railway) + $20 (Vercel) + $4 (GitHub); Clerk, Sentry and
  Resend aren't per seat.
- **Before launch**, the free tiers of Clerk, Sentry and Resend (3,000 emails/month, 100/day) are
  usually enough, leaving about $40/month for Railway and Vercel.

## Local development

Requires Node 24 (`nvm use` reads `.nvmrc`), pnpm 12 (`npm install -g pnpm@12`), and Docker (for local Postgres).

```bash
pnpm install
cp .env.example .env              # local config (DATABASE_URL etc.)
pnpm ports assign                 # give this project its own local ports (saved in .env)
docker compose up -d postgres     # start local Postgres
pnpm db:migrate                   # apply migrations
pnpm dev                          # starts api-server, web, and admin in parallel
```

To start one app instead: `pnpm api:dev`, `pnpm web:dev` or `pnpm admin:dev`. Each checks the
ports first, as `pnpm dev` does.

### Several projects at once

Every project made from this template starts out on the same ports: Postgres 5432, the API 3000,
web 5173, admin 3001, and E2E's own 3100, 5174 and 3002. So give each project its own, once, when
you set it up:

```bash
pnpm ports assign
```

It picks a block of seven ports from the project's folder name (21570–21576 for this template, say:
Postgres, API, web, admin, then E2E's three) and saves them to `.env` (`DB_PORT`, `PORT`,
`WEB_PORT`, `ADMIN_PORT`, `E2E_*_PORT`), along with the `localhost` addresses in `DATABASE_URL`,
`CORS_ORIGIN` and `WEB_URL`. The same folder name always gets the same block, so projects stay
apart whether or not they are running; if something else is on the block, it takes the next one.
Afterwards restart anything running, and run `docker compose up -d postgres` to start Postgres
on its new port; the data stays in its volume.

As a safety net, `pnpm dev` and the E2E run check their own ports first and move any another
program holds, and `pnpm ports` does the same for all of them, Postgres included. A port this
project's own servers or Postgres container hold is left alone. The ports are defined once, in
`lib/env/src/ports.ts`.

**A wrong Postgres on the port doesn't look wrong:** if another Postgres answers on `DB_PORT`, with
a database of the same name, `/health` passes and signed-in requests fail with a 500 because the
tables aren't there. `pnpm ports assign` avoids it; `psql "$DATABASE_URL" -c '\dt'` shows it.

Sign-in uses [Clerk](https://clerk.com): create a development instance and put its keys in
`.env` (`CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`). Without them the apps show a setup
message and the API answers 401 to anything that needs a session.

Optionally run `pnpm db:seed` to add sample data (it prints how to give yourself access).

The admin app is for staff, and nobody is staff by default. Give yourself access with
`pnpm staff:grant <your email> staff_admin`; it links to your account the next time you visit
admin. A fresh database needs it again, and `pnpm staff:revoke <your email>` undoes it.

### Git hooks

`pnpm install` points git at `.githooks/`:

- **pre-commit** blocks commits on `main` and `staging`, then runs Biome on the staged files
  (fix with `pnpm exec biome check --write --staged`).
- **pre-push** blocks pushes to `main` and `staging`.

Work on a feature branch and open a PR into `staging`; CI runs the full check suite.

The API reference (from `lib/api-spec/openapi.yaml`) is at `/docs` on the API (`PORT`); deployed,
it's on in staging and off in production (`API_DOCS`).

See [`AGENTS.md`](AGENTS.md) for conventions and the full command reference (shared by every coding
agent; `CLAUDE.md` points to it), [`docs/README.md`](docs/README.md) for the plan board, and
[`docs/TESTING.md`](docs/TESTING.md) for what every change must test: tests ship with the code,
and CI checks that they do.

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
database and the `api` service (Dockerfile build, migrations, health check,
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

`SENTRY_DSN` turns on error tracking (the API's errors and the sites' crash reports); like
`CLERK_SECRET_KEY` it's `preserve()`d, set per environment by `/provision-railway`. Unset, errors
are only logged.

`RESEND_API_KEY` and `EMAIL_FROM` turn on email (sent by the `send-email` job through
[Resend](https://resend.com)); unset, emails are only logged. `RESEND_WEBHOOK_SECRET` and
`CLERK_WEBHOOK_SECRET` are the signing secrets of the webhooks at `/api/webhooks/resend`
(undelivered emails) and `/api/webhooks/clerk` (deleted accounts). All four are `preserve()`d and
set per environment by `/provision-railway`.

---

## Deploying to Vercel (web + admin)

Create two separate Vercel projects — one for `artifacts/web`, one for `artifacts/admin` (the `provision-vercel` skill does all of this from the CLI).

### Required setting

The only project setting that needs to be configured is:

| Setting | Value |
|---------|-------|
| Root Directory | `artifacts/web` or `artifacts/admin` |

Set it before the first deploy: without it, Vercel builds the app folder on its own and the install (`cd ../..`) has no workspace to run in. Leave Build Command, Output Directory, and Install Command as defaults. All three are defined in `vercel.json` inside each app directory and will be picked up automatically once Root Directory is set.

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

`/provision-vercel` sets these per environment: `VITE_API_URL` and `VITE_CLERK_PUBLISHABLE_KEY`.
Set `VITE_API_URL` on each Vercel project to your Railway API server URL:

```
VITE_API_URL=https://your-api.railway.app
```

This value is baked into the JS bundle at build time by Vite. If you add or change it in the Vercel dashboard you must trigger a new deploy — existing deploys will not pick it up.

**Why this is required in production.**
In local development, Vite proxies `/health` and `/api/*` to the local API (`PORT`), so no URL is needed. On Vercel there is no proxy — without `VITE_API_URL` all API calls go to the Vercel domain and fail with a 404.
