# Template Improvements — Implementation Plan

Working document tracking the gap-analysis findings and their implementation.
Each item is implemented **one at a time**. Update the status checkbox as items complete so
any session can resume from this file.

Statuses: `[ ]` not started · `[~]` in progress · `[x]` done (merged)

Sources: the original gap analysis (2026-06-10) and a comparison with a production monorepo
(2026-10-18). That app is a reference, not a source of shared code: each of its patterns is
re-evaluated for a template, and adopted only where it is the best default for a new project.

---

## Decisions (2026-10-18)

| Decision | Choice | Why |
|----------|--------|-----|
| Scope | The template itself only. No product features from other apps. | Product work happens in projects spun up from the template. |
| Routing | **TanStack Router** (code-based routes) | Type-checked links, params and search params, so a broken link fails `pnpm typecheck` like every other contract in this repo. Search params validate with Zod, and route loaders integrate with the TanStack Query cache the apps already use. Code-based routes avoid a second generated file. Wouter is lighter but has no typed links, loaders or search-param handling. |
| Branching | `feature → PR → staging → promotion PR (merge commit) → main` | A proven model. `staging` holds release candidates only; `main` is production. No `develop` branch. |
| Gates | Git hooks block commits/pushes to `main` and `staging`; GitHub rulesets require a PR and the CI gate check on both, no bypass. | The hooks catch mistakes locally; the rulesets enforce it. CI, not the pre-push hook, runs the full suite. |
| Auth | Last. Port the reference app's authorization design once its access work settles; identity provider still to decide. | Its design is still changing. |
| Test DB | Keep PGlite and `createApp(db)`. | Better for a template than a global db + Docker Postgres. |

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

### 0.4 `[x]` Liveness vs readiness split
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

### P.2 `[x]` CI hardening
**Change:** Run on push/PR for `main` and `staging`. One gate job (`CI passed`) that needs every
other job, including e2e, runs with `if: always()` and fails unless every needed job succeeded
(a *skipped* required check counts as passing). `concurrency` cancels superseded PR runs, never
`main`/`staging` runs. `permissions: contents: read`. Actions pinned to commit SHAs with a version
comment.
**Files:** `.github/workflows/ci.yml`.
**Accept:** A failing job makes the gate fail; the gate is the only check rulesets need.

### P.3 `[x]` Branch protection + `staging` branch
**Change:** New `/provision-github` command: creates `staging` from `main` (via the API, since the
pre-push hook blocks pushing it), sets merge settings, and creates rulesets via `gh api` — both
branches require a PR and the `CI passed` check, no bypass (admins included), no force-push or
deletion. `main` allows only merge commits; `staging` only squash. The default branch stays
`main` (Railway and Vercel treat it as production); instead a `Promotion source` CI job, part of
`CI passed`, fails any PR into `main` whose head isn't `staging`.
**Files:** `.claude/commands/provision-github.md` (new), `.github/workflows/ci.yml`, README.
**Accept:** Run against a scratch repo (not this one: the template repo doesn't use its own
process); a direct push and a feature PR into `main` are both refused.
**Verified 2026-10-18** on a private scratch repo: direct push to `main` rejected (GH013); feature
PR into `main` blocked by Promotion source → CI passed; merge commit refused on `staging`, squash
accepted; squash refused on the promotion PR, merge commit accepted; re-run updates in place.

### P.4 `[x]` Staging environment in the provisioning commands
**Change:** `/provision-railway` creates the API service from the repo and a `staging`
environment duplicated from `production` (own Postgres, deploys `staging`); Wait for CI is a
dashboard step. It no longer writes the production `DATABASE_URL` into the local `.env`.
`/provision-vercel` sets `VITE_API_URL` for production and for the `staging` branch (preview
scope), then `CORS_ORIGIN` per Railway environment. `/new-project` commits on a branch.
**Files:** `.claude/commands/provision-railway.md`, `.claude/commands/provision-vercel.md`,
`.claude/commands/new-project.md`.
**Not verified live:** no Railway/Vercel projects were created; CLI flags checked against
Railway CLI 5.70 / Vercel CLI 54.10 help and Railway's docs. Verify on the first real project.

### P.5 `[x]` Document the process
**Change:** `docs/DEPLOYMENTS.md`: new-project setup order, branch model, promotion rules, gates,
hotfix path, rollback, and the rules that make it safe: **migrations are additive** and **the
API stays compatible with the previous frontend for one release**. Linked from CLAUDE.md (new
Git workflow section) and README.
**Files:** `docs/DEPLOYMENTS.md` (new), `CLAUDE.md`, `README.md`.

### P.7 `[x]` Migrate `railway.toml` to Railway Infrastructure as Code — deadline 2026-12-01
Railway (docs checked 2026-10-18): Config as Code is deprecated, existing files stop being read on
2026-12-01, and **new services can't use it at all** — so projects provisioned from the template
were already getting none of its settings.
**Done:** `.railway/railway.ts` defines Postgres + the `api` service: Dockerfile build, watch
patterns, pre-deploy migrations, `/health/ready`, `drainingSeconds: 30`, restart policy, Wait for
CI (`checkSuites`, previously a manual dashboard step), variables (`DATABASE_URL` reference;
`CORS_ORIGIN` preserved, set per environment by `/provision-vercel`). `production` deploys `main`,
other environments `staging`. `railway.toml` removed; `/provision-railway` creates the project and
applies the file to both environments; README/DEPLOYMENTS/CLAUDE.md updated; `pnpm typecheck` covers it.
**Template's own deployment migrated (2026-10-18):** service renamed `@repo/api-server` → `api`,
plan showed updates only (no deletes, no variable changes), applied; `main` without
`railway.toml` deployed after CI and serves `/health/ready` 200. Caught first: the file set
`PORT=3000` while the service's domains route to Railway's injected port (8080) — now unset.
**`/provision-railway` tested end to end** on a throwaway project + scratch repo: production
(`main`) and staging (`staging`) each got Postgres + api, healthy in about a minute, separate
databases, a staging-only push redeployed only staging, and a CI-failing commit was SKIPPED.
Found: Railway drops `checkSuites` when it creates the service (a second apply sets it; the
command now re-plans until clean). `ON_FAILURE` restart policy reads back as unset (removed).
**Later (optional):** Railway's `railwayapp/config` GitHub Action plans on PRs and applies on
merge, which would replace the manual apply step.

### P.6 `[ ]` (Decide later) Deploy sequencing
Vercel Deployment Checks can hold the production deploys until the API reports the new commit
live. It works around several Railway/Vercel quirks and is
a lot of machinery for a new project. Revisit once P.1–P.5 have been used for a while; 0.4's
`sha` is the prerequisite.

---

## Phase U — Dependency upgrades

Before porting the reference app's patterns, which assume current versions (e.g. pg-boss v12's `createQueue`).

### U.1 `[x]` Upgrade the toolchain
**Done (2026-10-18), each layer verified locally + CI + Vercel previews:**
- **Node 24 + pnpm 12.** CI reads pnpm from `packageManager` and Node from `.nvmrc`; Dockerfile
  installs the pinned pnpm. `onlyBuiltDependencies` → `allowBuilds`. Removed `.npmrc`
  (`node-linker=hoisted`, ignored since pnpm 11): the repo now uses pnpm's isolated layout, which
  exposed two undeclared-dependency bugs (fixed).
- **Biome 2** (`biome migrate`; CSS now checked, Tailwind directives enabled).
- **Vite 8, plugin-react 6, Vitest 5, jsdom 30**, Testing Library (+ `@testing-library/dom`, a
  jest-dom 7 peer), Playwright 1.64.
- **Zod 4 + Orval 8.** PascalCase schema names; fetch-style `apiFetch(url, init)` mutator; hooks
  return the body (`includeHttpResponseReturnType: false`). Also fixed web/admin `typecheck`, which
  was a no-op (`tsc --noEmit` on a references-only tsconfig → `tsc -b`).
- **TypeScript 7** (native; full typecheck < 1s). `lib/api-spec` keeps TypeScript 6 for orval's
  typedoc (needs the JS API, due in 7.1); Renovate holds it below 7. TS 7 no longer auto-includes
  `@types/*`, so Node packages list `types: ["node"]`.
- **Server:** express 5.3, pino 10, pg-boss 12 (`createQueue` before `work`), drizzle-orm 0.45 /
  drizzle-kit 0.31, PGlite 0.5. dotenv replaced by Node's `process.loadEnvFile()`.
- **React 19.3.1** pinned exactly; `pnpm audit` clean (lockfile updates + one scoped esbuild
  override for drizzle-kit's `@esbuild-kit` loader); docker-compose Postgres 16 → 18 (an existing
  local pg16 volume won't start under 18: `docker compose down -v` to reset).
- **Found while verifying:** bundled `dist/*.js` crashed outside production (in-process pino-pretty
  transport); dev now pipes through the pino-pretty CLI.

### U.2 `[x]` Pin Node for local dev (was 2.6)
`"engines": { "node": ">=24" }` + `.nvmrc` (`24`, the active LTS).

### U.3 `[x]` Renovate config (was 2.5)
`renovate.json`: weekly, non-major grouped, majors separate, React grouped, 1-day release age,
GitHub Action digests pinned, PRs target `staging`. Validated with `renovate-config-validator`.
Projects install the Renovate GitHub app themselves.

---

## Phase 1 — Tier 1 (every project needs these on day one)

### 1.1 `[ ]` Auth + authorization (last — waits for the reference app's access work to settle)
**Problem:** No identity layer; `orgId` is client-supplied (honor-system tenancy).
**Direction (from the reference app):** org membership lives in our own tables and is never trusted from
the client; routes ask for a *permission*, never a role, through one policy module; a test fails
any route that has no access rule; only one file knows the identity provider. A dev-mode token
keeps local work and tests provider-free. Example route reads orgId from `req.auth`.
**Decide at implementation:** identity provider (Clerk, Better Auth, …), and whether multi-user
orgs are in the template.
**Accept:** Unauthenticated → 401; org A cannot read org B; a route without an access rule fails CI.

### 1.2 `[x]` Client-side routing + SPA rewrites
**Done:** TanStack Router (code-based) in both apps: `src/router.tsx` with a root layout + nav,
`src/pages/`, a placeholder second route (`/about`, `/settings`) and a 404 page. The router context
carries the QueryClient. Admin's org filter is a Zod-validated search param (`/?orgId=…`) whose
loader prefetches the first page. Verified a typo'd `<Link to>` and a misspelled search param both
fail typecheck — which first required declaring routes as separate consts (inline `createRoute()`
in `addChildren` silently degrades to `string`). Checked in headless Chromium against the real
API: filter → URL, Load more, deep links, 404, no console errors. SPA rewrites already existed.

### 1.3 `[x]` Complete CRUD example + pagination convention
**Done:** `GET/PATCH/DELETE /api/example/{id}` (404 when missing or another org's; 400 for a bad id
or body) and a paginated list: `limit` (1–100, default 20) + opaque `cursor` →
`{ items, nextCursor }`, newest first, keyset on `(createdAt, id)` via `src/lib/pagination.ts`.
Timestamps moved to millisecond precision (migration 0001) so cursors round-trip exactly through
JS Dates. Shared `OrgId`/`ExampleId` parameters and `BadRequest`/`NotFound` responses in the spec;
Orval coerces numeric query params and generates `useListExamplesInfinite`; `apiFetch` handles
204. Admin table pages with it ("Load more"). Tests cover ordering, ties, every row visited once
(mutation-checked: dropping the id tiebreak fails it), bounds, cross-org 404s.

### 1.4 `[x]` Make the worker real
**Done:** `src/jobs/` — a registry of job definitions (name, handler, optional cron schedule,
queue options), `startBoss()` (creates every queue: required since pg-boss v11), a `JobQueue`
the API gets injected (`createApp(db, queue)`; tests use `createFakeQueue()`), and
`startWorker()` with a wrapper that logs failures before pg-boss retries. POST /api/example
enqueues `example-created`; `example-daily-count` runs on a cron. The worker runs in the API
process unless `RUN_WORKER=false`, then `node dist/worker.js` runs it as a second service (same
image) — so no separate compose service or dev script is needed.
**Tests:** pg-boss runs on PGlite in-process (custom `executeSql` adapter), so the worker is
tested end to end: processing, failure logging, schedules. Also verified against Postgres: in-process
and split modes both process jobs.

### 1.5 `[x]` Graceful shutdown
**Done:** `onShutdown()` on SIGTERM/SIGINT: close the HTTP server (in-flight requests finish), stop
pg-boss gracefully (active jobs finish), close the DB pool; force-exit after 25s. Railway's default
draining time is 0 (immediate SIGKILL), so `railway.toml` sets `drainingSeconds = 30`. Verified:
`docker stop` → exit code 0 after "shutdown complete".

---

## Phase 2 — Tier 2 (strongly recommended defaults)

### 2.1 `[x]` Validation helper middleware
**Change:** `validate(schema)` Express middleware (body/query/params variants) replacing
hand-rolled `safeParse` blocks; consistent 400 shape `{ error: { fieldErrors, formErrors } }`.
**Files:** `artifacts/api-server/src/middleware/validate.ts` (new), routes, tests.

### 2.2 `[x]` Request logging + request IDs
**Change:** `pino-http` with request-id generation (accept inbound `x-request-id`), wired to the
existing pino logger. Logged URLs drop query strings; `authorization` and `cookie` headers redacted.
**Files:** `app.ts`, `logger.ts`, `package.json`, tests for redaction.

### 2.3 `[x]` helmet, rate limiting, request limits
**Change:** `helmet()`, `express-rate-limit` (env-tunable, off in tests), `trust proxy` set for
Railway (so rate limits key on the client IP), explicit JSON body size limit.
**Files:** `app.ts`, `@repo/env`, `package.json`, tests.

### 2.4 `[x]` React ErrorBoundary + QueryClient defaults + client error reports
**Change:** A crash screen in each app; reports posted to `POST /api/client-errors` (spec'd,
rate-limited, logged server-side). QueryClient with explicit defaults (retry: 1, staleTime 30s,
refetchOnWindowFocus false). Shared code lives in `@repo/api-client-react`.
**Files:** both apps' `main.tsx`, `lib/api-client-react`, route + spec + codegen, tests.

### 2.5 `[x]` Typed server env
**Change:** `@repo/env` becomes a Zod schema validated once at startup (`validateServerEnv()` in
`index.ts`/`migrate.ts`), reporting every bad variable at once, with a list of variables required
only in production. Replaces the per-getter checks.
**Done:** one Zod schema; typed getters (`PORT` number, `CORS_ORIGIN` list, `RUN_WORKER` boolean);
`validateServerEnv()` lists every problem, run first by each entry point via `validate-env.ts`.
**Decided against "required only in production":** the only candidate, `CORS_ORIGIN`, can't be
set until after the first deploy (Vercel URLs come later), so requiring it would fail every fresh
provision. Instead production defaults to no allowed origins and the API logs a warning.

### 2.6 `[x]` Validated responses
**Change:** `sendValidated(res, schema, data)` parses each response through the generated Zod
schema, stripping fields the spec doesn't declare, so returning a full DB row can't leak a
server-only column. Example routes use it.
**Files:** `artifacts/api-server/src/lib/send-validated.ts` (new), routes, tests.

### 2.7 `[x]` Stricter TypeScript
**Change:** `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`,
`noImplicitReturns` in the base tsconfig; fix what they flag.

### 2.8 `[x]` knip + coverage thresholds
**Change:** `knip.json` + `pnpm knip` CI job (unused files, exports, deps, catalog entries);
coverage thresholds in each package's vitest config, enforced in CI.

### 2.9 `[x]` (Decided 2026-10-18: not in the template) Error recording + audit log
One option records errors in Postgres (grouped by fingerprint, emails/IDs scrubbed) instead of a
third-party service, and has an `audit_events` table + helper. Both add schema to every project.
Decide whether they ship in the template or stay a documented pattern.
**Decision:** leave both out. Server and client errors already reach the logs with request ids
(and the error handler marks where an error tracker plugs in); an audit log's events and
retention are product decisions, so a project that needs one designs it as a feature.

---

## Phase 3 — Tier 3 (nice to have)

### 3.1 `[x]` Serve API reference at /docs
**Change:** Serve `openapi.yaml` + Scalar API reference from the API server (non-production only,
or always — decide at implementation).
**Done:** Scalar at `/docs` (spec at `/docs/openapi.yaml`, copied into the image). `API_DOCS`
defaults to on except in production; `.railway/railway.ts` turns it on for every non-production
environment, so staging has docs. Scalar's CDN bundle is pinned (its default URL serves the
latest release); only `/docs` drops helmet's CSP (the page needs an inline bootstrap script).

### 3.2 `[x]` Real full-stack E2E
**Change:** Playwright test hitting the real server (PGlite-backed `createApp` via a test boot
script) instead of stubbed routes; cache Playwright browsers; add admin smoke test.
(CI concurrency moved to P.2.)

### 3.3 `[x]` Typed frontend env
**Change:** Validate `VITE_API_URL` at app boot in production builds.
**Done:** a malformed value (not absolute http(s), or a trailing slash) throws at load; a missing
one in a production build logs a console error instead of silently calling the site's own
origin. Not a hard failure when missing: PR previews deliberately have no API URL. Typed in each
app's `ImportMetaEnv`. Live sites' values checked first (valid).

### 3.4 `[x]` (Decided: no action) Shared UI package
Theme CSS + small components are duplicated between web and admin. Fine at 2 apps.
**No action by default.**
**Decision (2026-10-18):** no action; revisit at a third app.

### 3.5 `[x]` (Decided) Template changelog/versioning
`docs/TEMPLATE-CHANGELOG.md` so spun-up projects know what they're behind on. Also decide where
template-only docs (like this plan) live so they aren't copied into new projects.
**Decision:** no separate changelog — commit messages already describe each change. Template-only
docs live in `docs/template/`, which `/new-project` deletes, and `PROJECT.md` records the template
and the date it was created from (a commit hash wouldn't survive GitHub's "Use this template").
`git log --since=<date>` in the template lists what a project is behind on.

### 3.6 `[x]` Agent setup
**Change:** `AGENTS.md` holds the instructions with `CLAUDE.md` pointing to it; project skills
for diagnosing bugs, executing a plan and adding a feature (written for the template, not copied);
a `docs/plans/` + status-board layout that `/new-project` sets up.
**Done:** `AGENTS.md` (8 KB; `CLAUDE.md` imports it); skills in `.agents/skills/` with
`.claude/skills` linked to it: the four commands became skills, plus `new-feature`,
`execute-plan`, `diagnosing-bugs` and `grilling`, written for this template. `docs/README.md` is
the board, plans go in `docs/plans/`.

---

## Session Log

| Date | Items completed | Notes |
|------|-----------------|-------|
| 2026-06-10 | Plan created; 0.1, 0.2, 0.3 | orgId required on list; README quickstart; seed was entirely broken (CJS top-level await + missing root deps) — now fixed and idempotent |
| 2026-10-18 | Plan revised | Added Phase P (merge/promotion) and Phase U (upgrades) from the reference-app comparison; routing → TanStack Router; folded its patterns into 0.4, 1.1, 1.4, 2.2–2.9 |
| 2026-10-18 | P.1–P.5 | Hooks, CI gate + Promotion source, `/provision-github` (verified on a scratch repo), staging in provisioning commands (not verified live), `docs/DEPLOYMENTS.md`. Template repo itself doesn't use the process |
| 2026-10-18 | U.1–U.3 | Full toolchain upgrade (see U.1); Renovate. The flaky api-server test seen once under Orval 8 didn't recur in later runs |
| 2026-10-18 | 0.4, 1.2–1.5 | Health split, routing, CRUD + pagination, real worker, graceful shutdown. Found: Railway draining defaults to 0s (SIGKILL), config-as-code deprecated (P.7) |
| 2026-10-18 | 2.1, 2.2, 2.3, 2.5, 2.6 | Typed env, validate()/sendValidated(), pino-http + request ids, helmet/rate limit/trust proxy. Fixed: 500s leaked err.message; API tests' PGlite cold start could exceed vitest's 5s timeout under load (the earlier flake) |
| 2026-10-18 | 2.9 (decided: out), 3.1–3.6 | API reference at /docs, full-stack E2E, VITE_API_URL validation, AGENTS.md + skills, docs/template + plan board. CI's coverage floor caught untested env additions |
