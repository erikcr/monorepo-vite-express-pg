# Template Improvements — Implementation Plan

Working document tracking the gap-analysis findings and their implementation.
Each item is implemented **one at a time**. Update the status checkbox as items complete so
any session can resume from this file.

Statuses: `[ ]` not started · `[~]` in progress · `[x]` done (merged)

Sources: the original gap analysis (2026-06-10) and a comparison with trustxp-monorepo
(2026-10-18). trustxp is a reference, not a source of shared code: each trustxp pattern is
re-evaluated for a template, and adopted only where it is the best default for a new project.

---

## Decisions (2026-10-18)

| Decision | Choice | Why |
|----------|--------|-----|
| Scope | The template itself only. No product features from trustxp, no Honest Roots work. | Product work happens in projects spun up from the template. |
| Routing | **TanStack Router** (code-based routes) | Type-checked links, params and search params, so a broken link fails `pnpm typecheck` like every other contract in this repo. Search params validate with Zod, and route loaders integrate with the TanStack Query cache the apps already use. Code-based routes avoid a second generated file. trustxp's wouter is lighter but has no typed links, loaders or search-param handling, and trustxp's docs record no reason for choosing it. |
| Branching | `feature → PR → staging → promotion PR (merge commit) → main` | trustxp's model. `staging` holds release candidates only; `main` is production. No `develop` branch. |
| Gates | Git hooks block commits/pushes to `main` and `staging`; GitHub rulesets require a PR and the CI gate check on both, no bypass. | The hooks catch mistakes locally; the rulesets enforce it. CI, not the pre-push hook, runs the full suite. |
| Auth | Last. Port trustxp's authorization design once its access work (Plan 38/39) settles; identity provider still to decide. | Its design is still changing. |
| Test DB | Keep PGlite and `createApp(db)`. | Better for a template than trustxp's global db + Docker Postgres. |

---

## Verification Protocol (run after EVERY item)

Work on a feature branch and open a PR into `staging` (once Phase P lands). Mirror CI locally first:

```bash
pnpm lint
pnpm typecheck
DATABASE_URL=postgres://ignored pnpm db:generate && git diff --exit-code lib/db/migrations  # db:check
pnpm codegen && git status --short lib/api-zod lib/api-client-react   # generated files committed together
pnpm test
pnpm build
```

Rules:
- If an item changes `lib/api-spec/openapi.yaml`, run `pnpm codegen` and commit the regenerated
  `lib/api-zod/src/index.ts` + `lib/api-client-react/src/index.ts` in the **same commit**.
- If an item changes `lib/db/src/schema.ts`, run `pnpm db:generate` and commit the new migration
  in the **same commit**.
- One PR per item (or per coherent sub-step).

---

## Phase 0 — Bug fixes (defects in what already exists)

### 0.1 `[x]` Fix orgId leak in example route
**Problem:** `GET /api/example` returns all rows across all orgs when `orgId` is omitted —
violates the template's own "always filter by orgId" pattern. Admin app calls it this way.
**Change:** Make `orgId` required in the OpenAPI spec and the route (400 if missing). Admin app
gets an orgId filter input (default `org_1`). Update tests.
**Files:** `lib/api-spec/openapi.yaml`, `artifacts/api-server/src/routes/example.ts`,
`artifacts/admin/src/App.tsx`, tests, regenerated codegen files.
**Accept:** Request without orgId → 400. Tests prove org isolation.
**Note:** Item 1.1 (auth) later moves orgId from query param to authenticated context.

### 0.2 `[x]` Fix out-of-box onboarding
**Problem:** Fresh clone + `pnpm dev` crashes — `@repo/db` reads `DATABASE_URL` at import,
no `.env` exists, README quickstart omits Postgres/migrate steps.
**Change:** README quickstart becomes: `pnpm install` → `cp .env.example .env` →
`docker compose up -d postgres` → `pnpm db:migrate` → `pnpm dev`. Improve the missing-env error
message in `@repo/env` to say "copy .env.example to .env".
**Files:** `README.md`, `lib/env/src/index.ts` (+ its test).
**Accept:** Steps work on a fresh clone; error message is actionable.

### 0.3 `[x]` Idempotent seed
**Problem:** Every `pnpm db:seed` run inserts duplicate rows.
**Change:** `onConflictDoNothing` on a natural key — add a unique index on `(org_id, name)` for
the example table (migration) or delete-then-insert. Prefer delete-then-insert (no schema change).
**Files:** `scripts/seed.ts`.
**Accept:** Running seed twice yields same row count.

### 0.4 `[ ]` Liveness vs readiness split
**Problem:** `/health` returns 200 with `db: "error"`; Railway healthcheck passes while DB is down.
**Change:** `/health` stays liveness (200, used by frontends) and also reports the deployed commit
(`sha`, from Railway's `RAILWAY_GIT_COMMIT_SHA`) so a deploy can be confirmed live. Add
`/health/ready`: checks the DB with a timeout, caches the result briefly (~30s) so probes can't
hammer the DB, returns 503 when unreachable. Point `railway.toml` `healthcheckPath` at
`/health/ready`. Add both to the OpenAPI spec.
**Files:** `artifacts/api-server/src/routes/health.ts`, `railway.toml`, `lib/api-spec/openapi.yaml`,
codegen, tests.
**Accept:** Test: ready → 200, broken db → 503; liveness reports `sha`.

---

## Phase P — Merge & promotion process

Lands first: every later item then goes through it. P.1–P.3 merge straight into `main` (the
`staging` branch is created in P.3).

### P.1 `[x]` Git hooks
**Problem:** `simple-git-hooks` runs the full suite on every push (slow, duplicates CI) and
nothing stops a commit or push to `main`.
**Change:** Replace `simple-git-hooks` with a committed `.githooks/` directory
(`"prepare": "git config core.hooksPath .githooks || true"`). `pre-commit`: block commits on
`main` and `staging`, then `biome check --staged`. `pre-push`: block pushes to `main` and
`staging`. Each message says how to fix it (`git switch -c …`); `--no-verify` is the documented
(discouraged) bypass.
**Files:** `.githooks/pre-commit`, `.githooks/pre-push`, root `package.json`, README.
**Accept:** Commit on `main` → blocked; badly formatted staged file → blocked; feature branch → passes.

### P.2 `[ ]` CI hardening
**Change:** Run on push/PR for `main` and `staging`. One gate job (`CI passed`) that needs every
other job, including e2e, runs with `if: always()` and fails unless every needed job succeeded
(a *skipped* required check counts as passing). `concurrency` cancels superseded PR runs, never
`main`/`staging` runs. `permissions: contents: read`. Actions pinned to commit SHAs with a version
comment.
**Files:** `.github/workflows/ci.yml`.
**Accept:** A failing job makes the gate fail; the gate is the only check rulesets need.

### P.3 `[ ]` Branch protection + `staging` branch
**Change:** New `/provision-github` command: creates `staging` from `main`, sets it as the default
PR base, and creates rulesets via `gh api` — both branches require a PR and the `CI passed`
check, no bypass (admins included), no force-push or deletion. `main` allows only merge commits
(promotions keep `staging` and `main` history identical); `staging` allows squash.
**Files:** `.claude/commands/provision-github.md` (new), README.
**Accept:** Run against this repo; a direct push and an unchecked PR are both refused.

### P.4 `[ ]` Staging environment in the provisioning commands
**Change:** `/provision-railway` creates `production` (deploys `main`) and `staging` (deploys
`staging`) environments, each with its own Postgres, and turns on **Wait for CI** so a commit
with failing CI never deploys. `/provision-vercel` maps the `staging` branch to a staging
environment with its own `VITE_API_URL`; `CORS_ORIGIN` per environment on Railway.
**Files:** `.claude/commands/provision-railway.md`, `.claude/commands/provision-vercel.md`, README.
**Accept:** A merge to `staging` deploys only staging; a promotion deploys only production.

### P.5 `[ ]` Document the process
**Change:** `docs/DEPLOYMENTS.md`: the branch model, what a promotion carries (one or two
features, listed in the PR), switched-off features instead of parking work on `staging`, hotfix
path (branch off `staging` → PR → immediate promotion), rollback (Railway/Vercel), and the rules
that make it safe: **migrations are additive** (expand, deploy, contract later) and **the API
stays compatible with the previous frontend for one release**. Link from CLAUDE.md and README.
**Files:** `docs/DEPLOYMENTS.md` (new), `CLAUDE.md`, `README.md`.

### P.6 `[ ]` (Decide later) Deploy sequencing
trustxp holds the Vercel production deploys until the API reports the new commit live
(`api-live.yml` + Vercel Deployment Checks). It works around several Railway/Vercel quirks and is
a lot of machinery for a new project. Revisit once P.1–P.5 have been used for a while; 0.4's
`sha` is the prerequisite.

---

## Phase U — Dependency upgrades

Before porting trustxp patterns, which assume current versions (e.g. pg-boss v12's `createQueue`).

### U.1 `[ ]` Upgrade the toolchain
**Change:** pnpm 9 → 10, Biome 1.9 → 2, Vite 6 → 7, Vitest 2 → current, pg-boss 10 → 12, plus any
other majors that are behind (check each at implementation time). Pin React exactly in the
catalog. Add a `pnpm.overrides` entry for any vulnerable transitive dependency `pnpm audit` flags.
One PR per tool where the migration is non-trivial (Biome config, pg-boss API).
**Files:** `package.json`s, `pnpm-workspace.yaml`, `biome.json`, CI `PNPM_VERSION`, `Dockerfile`,
`worker.ts`.

### U.2 `[ ]` Pin Node for local dev (was 2.6)
**Change:** `"engines": { "node": ">=22" }` in root package.json + `.nvmrc` with `22`.

### U.3 `[ ]` Renovate config (was 2.5)
**Change:** `renovate.json` — pnpm catalog support, group minor/patch, weekly schedule,
separate major PRs, `minimumReleaseAge` matching `pnpm-workspace.yaml`. PRs target `staging`.

---

## Phase 1 — Tier 1 (every project needs these on day one)

### 1.1 `[ ]` Auth + authorization (last — waits for trustxp's access work to settle)
**Problem:** No identity layer; `orgId` is client-supplied (honor-system tenancy).
**Direction (from trustxp):** org membership lives in our own tables and is never trusted from
the client; routes ask for a *permission*, never a role, through one policy module; a test fails
any route that has no access rule; only one file knows the identity provider. A dev-mode token
keeps local work and tests provider-free. Example route reads orgId from `req.auth`.
**Decide at implementation:** identity provider (Clerk, Better Auth, …), and whether multi-user
orgs are in the template.
**Accept:** Unauthenticated → 401; org A cannot read org B; a route without an access rule fails CI.

### 1.2 `[ ]` Client-side routing + SPA rewrites
**Problem:** No router in either app; deep links will 404 on Vercel once routes exist.
**Change:** Add TanStack Router (code-based routes) to web and admin with a minimal two-route
setup (`/` + a placeholder) and a 404 page; one route shows a loader using the Query cache and
a Zod-validated search param. SPA rewrites in both `vercel.json` files:
`{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`. Catalog entry.
**Files:** both apps' `package.json`, `main.tsx`, `router.tsx`, pages, `vercel.json`, tests.
**Accept:** Tests render routes; unknown path shows 404; a typo'd link fails typecheck.

### 1.3 `[ ]` Complete CRUD example + pagination convention
**Problem:** Template only demonstrates list + create; no path params, 404 handling, update,
delete, or pagination pattern.
**Change:** Add `GET /api/example/:id` (404 when missing/wrong org), `PATCH /api/example/:id`,
`DELETE /api/example/:id`, and `limit`/`cursor` pagination on the list endpoint
(`{ items, nextCursor }` envelope). Spec-first → codegen → routes → tests. Touched updatedAt on PATCH.
**Files:** `lib/api-spec/openapi.yaml`, codegen, `routes/example.ts`, tests, admin table.
**Accept:** Tests for 404, cross-org 404, update, delete, pagination ordering.

### 1.4 `[ ]` Make the worker real
**Problem:** `worker.ts` is built but never run; nothing enqueues jobs.
**Change:** A registry of queues (each created with `createQueue`, required by pg-boss v12), a
handler wrapper that logs failures with job context, an example scheduled job, an `enqueue`
helper for the API, and `stopWorker()`. A `WORKER` env flag runs the worker in the API process
(simplest deploy) or as a second Railway service from the same image. `worker` service in
`docker-compose.yaml`; dev script runs it alongside the server. Create-example enqueues a job.
**Files:** `artifacts/api-server/src/worker/` (replaces `worker.ts`), `routes/example.ts`,
`docker-compose.yaml`, `package.json` scripts, `@repo/env`, README.
**Accept:** Create-example enqueues and the worker processes it (test against PGlite if pg-boss
supports it, otherwise compose); failed jobs are logged.

### 1.5 `[ ]` Graceful shutdown
**Problem:** No SIGTERM handling — Railway deploys drop in-flight requests; pg connections and
pg-boss never closed.
**Change:** `index.ts`: on SIGTERM/SIGINT `server.close()`, `stopWorker()`, then `closeDb()`, with
a timeout fallback.
**Files:** `artifacts/api-server/src/index.ts`.
**Accept:** Local manual check: SIGTERM exits 0 cleanly; build passes.

---

## Phase 2 — Tier 2 (strongly recommended defaults)

### 2.1 `[ ]` Validation helper middleware
**Change:** `validate(schema)` Express middleware (body/query/params variants) replacing
hand-rolled `safeParse` blocks; consistent 400 shape `{ error: { fieldErrors, formErrors } }`.
**Files:** `artifacts/api-server/src/middleware/validate.ts` (new), routes, tests.

### 2.2 `[ ]` Request logging + request IDs
**Change:** `pino-http` with request-id generation (accept inbound `x-request-id`), wired to the
existing pino logger. Logged URLs drop query strings; `authorization` and `cookie` headers redacted.
**Files:** `app.ts`, `logger.ts`, `package.json`, tests for redaction.

### 2.3 `[ ]` helmet, rate limiting, request limits
**Change:** `helmet()`, `express-rate-limit` (env-tunable, off in tests), `trust proxy` set for
Railway (so rate limits key on the client IP), explicit JSON body size limit.
**Files:** `app.ts`, `@repo/env`, `package.json`, tests.

### 2.4 `[ ]` React ErrorBoundary + QueryClient defaults + client error reports
**Change:** A crash screen in each app; reports posted to `POST /api/client-errors` (spec'd,
rate-limited, logged server-side). QueryClient with explicit defaults (retry: 1, staleTime 30s,
refetchOnWindowFocus false). Shared code lives in `@repo/api-client-react`.
**Files:** both apps' `main.tsx`, `lib/api-client-react`, route + spec + codegen, tests.

### 2.5 `[ ]` Typed server env
**Change:** `@repo/env` becomes a Zod schema validated once at startup (`validateServerEnv()` in
`index.ts`/`migrate.ts`), reporting every bad variable at once, with a list of variables required
only in production. Replaces the per-getter checks.
**Files:** `lib/env/src/`, `artifacts/api-server/src/index.ts`, tests.

### 2.6 `[ ]` Validated responses
**Change:** `sendValidated(res, schema, data)` parses each response through the generated Zod
schema, stripping fields the spec doesn't declare, so returning a full DB row can't leak a
server-only column. Example routes use it.
**Files:** `artifacts/api-server/src/lib/send-validated.ts` (new), routes, tests.

### 2.7 `[ ]` Stricter TypeScript
**Change:** `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`,
`noImplicitReturns` in the base tsconfig; fix what they flag.

### 2.8 `[ ]` knip + coverage thresholds
**Change:** `knip.json` + `pnpm knip` CI job (unused files, exports, deps, catalog entries);
coverage thresholds in each package's vitest config, enforced in CI.

### 2.9 `[ ]` (Decide) Error recording + audit log
trustxp records errors in Postgres (grouped by fingerprint, emails/IDs scrubbed) instead of a
third-party service, and has an `audit_events` table + helper. Both add schema to every project.
Decide whether they ship in the template or stay a documented pattern.

---

## Phase 3 — Tier 3 (nice to have)

### 3.1 `[ ]` Serve API reference at /docs
**Change:** Serve `openapi.yaml` + Scalar API reference from the API server (non-production only,
or always — decide at implementation).

### 3.2 `[ ]` Real full-stack E2E
**Change:** Playwright test hitting the real server (PGlite-backed `createApp` via a test boot
script) instead of stubbed routes; cache Playwright browsers; add admin smoke test.
(CI concurrency moved to P.2.)

### 3.3 `[ ]` Typed frontend env
**Change:** Validate `VITE_API_URL` at app boot in production builds.

### 3.4 `[ ]` (Decide) Shared UI package
Theme CSS + small components are duplicated between web and admin. Fine at 2 apps.
**No action by default.**

### 3.5 `[ ]` (Decide) Template changelog/versioning
`docs/TEMPLATE-CHANGELOG.md` so spun-up projects know what they're behind on. Also decide where
template-only docs (like this plan) live so they aren't copied into new projects.

### 3.6 `[ ]` Agent setup
**Change:** `AGENTS.md` holds the instructions with `CLAUDE.md` pointing to it; project skills
for diagnosing bugs, executing a plan and adding a feature (written for the template, not copied);
a `docs/plans/` + status-board layout that `/new-project` sets up.

---

## Session Log

| Date | Items completed | Notes |
|------|-----------------|-------|
| 2026-06-10 | Plan created; 0.1, 0.2, 0.3 | orgId required on list; README quickstart; seed was entirely broken (CJS top-level await + missing root deps) — now fixed and idempotent |
| 2026-10-18 | Plan revised | Added Phase P (merge/promotion) and Phase U (upgrades) from the trustxp comparison; routing → TanStack Router; folded trustxp patterns into 0.4, 1.1, 1.4, 2.2–2.9 |
