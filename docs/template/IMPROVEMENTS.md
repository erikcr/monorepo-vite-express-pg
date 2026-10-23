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
| Auth (2026-10-19) | Clerk for identity; our own tables for access (users, orgs, org grants, staff grants), one permission policy, server-side org resolution; staff on the same Clerk application with their own grants and a required second factor; invitations later. | Reviewed the reference app's access design and kept only its general core: the access layer is ~250 lines and closes the client-supplied `orgId` gap for any multi-tenant app. Its product-specific rules stay out. A separate staff Clerk application doubles setup for every project; the same `requireStaff()` can move to one later. |
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

### P.6 `[x]` Deploy sequencing (done 2026-10-19)
CI → migrations → API → sites, on `staging` and `main` alike. A common alternative holds production with
Vercel Deployment Checks and triggers staging with deploy hooks; the template uses deploy hooks for
both, so one mechanism and no Vercel token:
- `.github/workflows/deploy-sites.yml` + `.github/scripts/deploy-sites.sh`: on Railway's successful
  `deployment_status`, poll `/health` until it reports the commit, then trigger each site's deploy
  hook. Skips if the branch has moved on (a hook builds the head). `workflow_dispatch` releases by
  hand when Railway never reports success.
- `vercel.json`: `git.deploymentEnabled` off for `main` and `staging`; PR previews unchanged.
- `.railway/railway.ts`: no `watchPatterns` (clearing the live ones took one apply of `[]`), so every commit has an API deploy for the sites to follow.
- `/provision-vercel` creates the hooks and stores them (secrets `VERCEL_HOOK_*`) with the
  `API_URL_*` repository variables.

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

### 1.1 `[x]` Auth + authorization
**Problem:** No identity layer; `orgId` is client-supplied (honor-system tenancy).
**Decided (2026-10-19, after reviewing the reference app's access design):** Clerk proves identity; our database
alone grants access; staff use the same Clerk application with their own grants; invitations wait
for an email provider (1.6). Not taken: the reference app's product-specific rules; a separate staff Clerk app.

**Design**
- **Tables:** `users` (uuid id, `clerk_user_id` unique, primary verified email, name), `orgs`
  (uuid id, name), `org_users` (org, user, role; PK org+user), `platform_staff` (email unique
  case-insensitive, `clerk_user_id` linked on first sign-in, role, status). `example.org_id` becomes
  a uuid FK to `orgs` (migration drops the demo `org_1`-style rows).
- **One identity module** (`src/lib/identity.ts`) verifies the Clerk session token
  (`authorizedParties` = the allowed origins) and returns `{ clerkUserId, factorAge }`. Under
  `NODE_ENV=test` it also accepts `test:<json claims>` tokens, so API tests stay provider-free.
  Nothing else imports Clerk on the server.
- **Policy** (`src/lib/authz/policy.ts`): org roles `org_admin` / `org_member`; staff roles
  `staff_admin` / `staff_support`; each maps to permissions (`example.read`, `example.write`,
  `org.settings.write`, `platform.orgs.read`, …). Routes declare a permission, never a role.
- **Pipeline:** `authenticate` (any `/api` route; 401 without a valid session) → `requireOrg(permission)`:
  load grants (one query), resolve the org from `X-Org-Id` **checked against the grants** (one org:
  header optional; several: required, else 400 `org_required`), check the permission (403), hand
  the handler `req.ctx = { user, org, role, permissions }`. `signedIn` for person-level routes
  (`/api/me`, creating an org). `requireStaff(permission)` for `/api/admin/*`: an active
  `platform_staff` grant plus a completed second factor (`fva` claim; `MFA_REQUIRED=false` only
  for local/test).
- **Route coverage test:** walks the routers; every route under `/api` must declare
  `requireOrg`/`signedIn`/`requireStaff`, and the expected permission per route is one table.
- **Self-serve:** `GET /api/me` (user + their orgs and roles), `POST /api/orgs` (create an org;
  the creator becomes `org_admin`). First staff grant via `pnpm staff:grant <email> <role>`.
- **Example routes** drop the `orgId` query/body param and read `req.ctx.org`. Spec: bearer
  security scheme + an `X-Org-Id` header parameter; codegen.
- **Frontends:** Clerk React in both apps; `apiFetch` attaches the session token and the selected
  org (`X-Org-Id`); web gets sign-in, an org picker/creator and a sign-out; admin requires a staff
  grant (403 screen otherwise). Env: `CLERK_SECRET_KEY` (server, required in production),
  `VITE_CLERK_PUBLISHABLE_KEY` (apps); IaC `preserve()`s the secret; provisioning gains a Clerk step
  (dev instance for local/staging, production instance for production).

**Tasks** (one PR each)
1. `[x]` Schema + migration: users, orgs, org_users, platform_staff (additive). The
   `example.org_id` → uuid FK conversion moved to task 3, so each PR stays green on its own.
2. `[x]` Identity module + `authenticate` + test tokens; env vars (`CLERK_SECRET_KEY`,
   `STAFF_MFA_REQUIRED`: on by default in production only).
3. `[x]` Policy, grants loader, `resolveTenant`, `requireOrg` / `signedIn` / `requireStaff`, route
   coverage test; example routes on `req.ctx`; `example.org_id` → uuid FK to `orgs` (drops the
   demo rows); seed creates real orgs; spec + codegen. Admin's org filter removed (task 5 moves
   admin to staff endpoints and brings back a validated search param); the two admin E2E data
   tests are `fixme` until tasks 5–6.
4. `[x]` `GET /api/me`, `POST /api/orgs`, `GET /api/admin/orgs` (staff; paginated, member counts,
   `q` name search); `pnpm staff:grant` / `staff:revoke` / `org:grant`, also bundled into the image
   for `railway ssh`.
5. `[x]` Frontends: `@clerk/react` (Core 3) in both apps; `configureApiClient()` plugs the token and
   org into `apiFetch` (which throws `ApiError`; Orval's `ErrorType` makes hooks say so). Web:
   `/sign-in`, `/app` (create org, switch org, records list/add). Admin: staff-only, orgs list with a
   Zod-validated `?q=` search, 403 → staff-required / second-factor screens. Found: a failing
   Clerk load made `getToken` throw, breaking even public API calls; now it falls back to signed
   out. E2E uses a placeholder Clerk key until task 6 (3 sign-in tests are `fixme`).
6. `[x]` E2E + provisioning: E2E signs in through a real Clerk development instance with
   `@clerk/testing` (decided 2026-10-19): test users created by the global setup, the E2E API
   verifies real tokens and grants the staff user per run; CI gets the development keys as secrets
   and fails without them. IaC preserves `CLERK_SECRET_KEY`; provisioning sets keys per environment
   (development instance for staging/previews, production instance for production); DEPLOYMENTS,
   AGENTS.md and the new-feature skill updated. Template's own deploy: development keys (decided).

**Accept:** unauthenticated → 401; a user without a grant in org B gets 403 there; another org's
record is 404; a route without an access rule fails CI; staff routes refuse non-staff and staff
without a second factor; a client-supplied org id is only ever checked, never trusted.

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

### 1.6 `[x]` Invitations + email provider (after 1.1)
Several users per org needs invitations: single-use, stored hashed, expiring (7 days), accepted
only by a signed-in user whose **primary verified** email matches; an org users page (list,
change role, remove; never remove the last `org_admin`). Needs an email provider in the template
(decide: e.g. Resend) and its provisioning step.

**Done (2026-10-22):** decided with Erik: every member sees the member list and pending
invitations (`org.members.read`); org admins invite, revoke, change roles and remove
(`org.members.manage`); a page of its own, `/app/members`; inviting an email again replaces its
pending invitation (and so resends). Tokens are 32 random bytes, stored as SHA-256, in the link's
`#` (never sent to a server); accepting is single use (row-locked delete), only for the invited
email (`users.email`, the primary verified one), 410 when expired; an existing member keeps their
role. `src/lib/memberships.ts` locks the org's row for every membership change (leave, remove,
role) and refuses to leave an org without an org_admin. Links need the API's new `WEB_URL`
(`/provision-vercel` sets it). E2E: an inviter invites, the invitee follows the emailed link (the
E2E server stands in for Resend) and joins. Not covered by E2E: following a link while signed out
(Clerk's sign-in redirect back to `/invite#…`).

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

## Phase T — Testing framework (2026-10-19)

The layers exist (API on PGlite, jobs, components, real-Clerk E2E, coverage floors, the
route-access table), but what a change must test was one line in each of three places, plans had
no test lines, and nothing noticed code arriving without tests. The template writes tests with the code from the
first commit, rather than adding them in waves afterwards.

**Decisions (Erik, 2026-10-19):** CI enforces tests-with-code, with an explicit opt-out line in
the PR description; a post-deploy check layer is included.

### T.1 `[x]` Test infrastructure gaps
- Contract parity: every `openapi.yaml` operation has a mounted route, and every mounted route is in the spec.
- Shared component render helper per app (`src/test/render.tsx`), used by the existing tests.
- `pnpm test:coverage` summary of current coverage against each floor, to make raising floors routine.
- Playwright: no retries in CI (they hide flakes); fail on a flaky pass.
**Done:** `contract.test.ts` (spec ↔ mounted routes, sharing `test-helpers/mounted-routes.ts`
with the route-access test); `src/test-helpers/render.tsx` (`renderAt(path)`) in web and admin;
`pnpm coverage:ratchet` (Vitest's `autoUpdate`, rounded down) — its first run raised every floor,
which had drifted 10–20 points below actual (API 80→95 statements); Playwright keeps one CI retry
only to record a trace, with `failOnFlakyTests`.

### T.2 `[x]` `docs/TESTING.md`
The one standard: layers and what each is for, what is never mocked, the required-tests matrix by
change type, conventions (helpers, isolation, determinism, naming), proving tests, coverage
ratchet, flaky-test policy.
**Done:** plus two structural tests the matrix needed: `tenancy-schema.test.ts` (every table but
`GLOBAL_TABLES` has `org_id uuid NOT NULL` → `orgs`) and `migrations.test.ts` with
`createTestDbAt(tag)` (a migration run on old-shape data; covers 0003, which was only checked by
hand during 1.1). Both proven red.

### T.3 `[x]` Tests in every workflow
`AGENTS.md` testing section; plan template with a **Tests:** line per task; `execute-plan`
(tests in the task's commit), `new-feature` (tests at each layer, not last), `new-project`
(success criteria map to E2E acceptance tests), `diagnosing-bugs` (link); PR template.

### T.4 `[x]` `testing` skill
Choose the tests a change needs from the matrix, write them with the template's helpers, prove
them red, and audit a diff or branch for missing tests.

### T.5 `[x]` CI: tests come with the code
A PR job: a package whose source changed without its tests changing fails, unless the PR
description has `Tests: none needed — <reason>`. Part of **CI passed**.
**Done:** new `@repo/ci` package (`lib/ci`, no dependencies; CI runs its `src/bin/*.ts` with
Node 24's type stripping, no install). Rules and tests in `tests-with-code.ts`; a package's tests
can live elsewhere (`lib/db` → API tests, pages → E2E too). Fetches the description instead of
reading the event, so editing it and re-running the job works. In `ci.yml`, PRs into `staging`
only; not exercised on a live PR (the template repo has no `staging`), but its API calls were run
against the repo's PRs #1 and #2. Proving the tests red found that the HTML-comment case passed
without the stripping it was meant to test; fixed.

### T.6 `[x]` Post-deploy check
After **Deploy sites**: each live site's JavaScript has the environment's API address (https),
the right Clerk key type, and no secret keys; the API's `/health/ready` passes. Alerts, doesn't
block. Tested with fixtures of known misconfigurations.
**Done:** `lib/ci/src/deploy-check.ts` (+ `deploy-targets.ts`, `bin/deploy-check.ts`) and
`.github/workflows/deploy-check.yml`, on each Vercel production deploy (staging: a preview built
from `staging`'s head), checking only the site that deployed. Fixtures for common build
misconfigurations (missing / http / other environment's API, wrong Clerk instance, secret key in
the publishable key's variable) plus other secret kinds; Clerk keys are recognised by decoding
them, so Clerk's own prefix strings don't count. Dropped the `/health/ready` part: Deploy sites
already waits for the API to serve the commit. No daily schedule: a site's build config only
changes when it deploys. Both live sites pass. Staging sites need a Vercel bypass secret
(`VERCEL_BYPASS_<SITE>`), otherwise skipped with a warning.

## Phase O — Operations and hardening (2026-10-20)

What a real project needs once people use it: hearing about errors and outages, getting data back,
and the browser-side protections the API already had. **Decisions (Erik, 2026-10-20):** do
O.1–O.3 and O.5–O.7; feature switches (the `ship it switched off` pattern for `VITE_*` builds)
wait for a project that needs them.

### O.1 `[x]` Error tracking and uptime
**Done:** Sentry on the API only (`src/lib/error-tracker.ts`, `@sentry/node` 11), on when
`SENTRY_DSN` is set. The sites already sent their crashes to `POST /api/client-errors`, which now
forwards them, so one DSN covers the API, jobs and both sites and no SDK ships to browsers. 500s,
failed jobs, uncaught crashes; tagged with environment, commit, request or job id. Sentry's
defaults attached the request (body, query string, IP): the test caught it, so the SDK runs with
an explicit integration list and `dataCollection` off. Bundling it broke the API build (Sentry
imports `createRequire`, which the esbuild banner also declared); `build.ts` now parses every
bundle with `node --check`, which fails the build on that bug (proven). Uptime monitor and the DSN
are `/provision-railway` steps; `SENTRY_DSN` is `preserve()`d in `railway.ts`.

### O.2 `[x]` Database backups and restore runbook
**Done:** Railway's IaC can't declare backup schedules (checked `railway@3.16.0`'s types), so
`/provision-railway` sets them with `railway postgres pitr schedule set`; the restore runbook is in
`docs/DEPLOYMENTS.md`. The template's own database has no schedule (one manual backup from
2026-08-22); not changed. The restore steps haven't been run.

### O.3 `[x]` Security headers and Content-Security-Policy on the sites
**Done:** `vercel.json` headers (frame-ancestors/X-Frame-Options, nosniff, Referrer-Policy,
Permissions-Policy, HSTS). The CSP is generated at build time by `lib/csp` (a Vite plugin) from the
site's own `VITE_API_URL` and Clerk key (decoded to its Frontend API host), so nothing per
project or environment is edited by hand. No `unsafe-inline`/`unsafe-eval` for scripts. The deploy
check verifies the headers and that the CSP allows the environment's API.

### O.4 `[ ]` Feature switches (deferred)
A switch the API and both sites read at runtime (e.g. via `/me`), since `VITE_*` variables are
fixed per build. Add when a project first ships something switched off.

### O.5 `[x]` Accessibility checks
**Done:** `expectAccessible(page)` (axe, WCAG 2.1 A/AA, light and dark mode) on every page the E2E
suite visits. Its first run failed every page on contrast: muted text 4.47:1, success 3.0:1,
destructive 4.26:1, and in dark mode the brand button 2.8:1. Tokens fixed in both apps (all ≥ 4.6:1).
E2E now runs production builds (`vite build` + `vite preview`) calling the API cross-origin, and
fails on any CSP violation (both proven red).

### O.6 `[x]` Security scanning
**Done:** CI's `Dependency audit` job (`pnpm deps:audit`: high/critical advisories in production
dependencies, from the lockfile; proven against a vulnerable lodash); `/provision-github` turns on
Dependabot alerts and secret scanning + push protection. On this repo, secret scanning and push
protection were already on; Dependabot alerts were turned on (0 alerts).

### O.7 `[x]` Playwright reports in CI
**Done:** in CI, an HTML report with each failure's trace, uploaded as an artifact on failure,
**private repos only**: traces record the test users' Clerk session cookies, and a public repo's
artifacts are public. So this repo (public) never uploads them.

### O.8 `[x]` Email and account webhooks
**Done:** email through Resend, sent only by the `send-email` job (an idempotency key per job, so
a retry never sends twice); `html` tag that escapes what it inserts; subjects forced to one line;
every email tagged with its environment. `POST /api/webhooks/resend` logs undelivered emails and
ignores other environments' events; `POST /api/webhooks/clerk` deletes a deleted account's user
and grants and disables its staff grant. Both check Svix signatures on the raw body. Each design
point answers a failure seen in the reference app: a rejected send counted as sent, a subject
with a line break refused, links cut at a bare `&`, staging and production recording each
other's events. Not verified live (no Resend account or webhooks on the template's deployment).

---

## Phase A — Addresses (2026-10-23)

### A.1 `[ ]` The org in the address

**Status:** not started. Proposed 2026-10-23; D1 and D2 decided by Erik the same day. **Origin:** Trust XP's Plan 51 ("Everything in the address"). This would be the template's version, built here first so Trust XP can port it.

**Why.** Today the org a person works in lives in browser storage (`selectedOrgId`, `artifacts/web/src/org.ts`) and travels as `X-Org-Id`, which the API checks against their grants. That keeps access safe, but the address doesn't say which org is on screen:
- a link can't point at an org's data;
- a refresh relies on storage;
- someone in two orgs can't keep one in each tab after a refresh, since the last tab to switch wins.

Every project built from the template inherits this. Moving it later is a breaking change for its users, which is what Trust XP is paying for now, so the template is the cheapest place to decide it. (Unlike Trust XP, the template doesn't mix orgs across open tabs: each tab keeps the org it loaded in memory.)

**The shape.**
- **Addresses:**
  - `/o/<handle>` is the org scope; its places sit under it. Today's `/app` becomes `/o/<handle>`, and later places become `/o/<handle>/<place>`.
  - Overlays stay query parameters (`docs/UI.md`, "Layers"): `/o/acme?settings=members`.
  - `/app` becomes home: the last org used, if the person still reaches it, else their first, else the create form.
- **The scope layout** resolves the handle through `/me`, and the API client takes `X-Org-Id` from it instead of from storage. The API's access checks don't change.
  - A handle the person can't reach, or that doesn't exist, shows one "Not found, or you don't have access" screen that doesn't say which. It never silently switches org.
- **Switching org** is a link to `/o/<other>`. Every cached response except `/me` is dropped, as today.
- **Settings over a page with no org** (`/about?settings=`) show only "You". Org settings open from inside the org, so they're always for the org on screen (Trust XP's Plan 48 D4).

**Decisions.**
- **D1 (decided 2026-10-23): B, a chosen, human-readable handle.**

  | Option | Looks like | For | Against |
  |---|---|---|---|
  | A. Generated from the name plus a suffix | `/o/acme-k3f9a2` | Nothing to choose; never collides | Reads as machine-made |
  | **B. Chosen, like GitHub, Slack or Linear** | `/o/acme` | Reads like the org's name; prefilled from the name, so most people just accept it | A field in the create form, checked as typed; rules; a "taken" answer shows that a handle exists, as GitHub's does |
  | C. The id | `/o/0f8c…` | Nothing to build | Unreadable |

  B's rules: 3–40 characters, lowercase letters, digits and single hyphens, no hyphen at either end. Reserved words (`new`, `settings`, `api`, `admin`, `app`, `invite`, `sign-in`, …) aren't allowed.
- **D2 (decided 2026-10-23): fixed once chosen, for now.** Renaming, with the old handles kept as redirects, goes in `docs/CAPABILITIES.md` until a project needs it.
- **D3 (proposed): the API keeps `X-Org-Id`.** Requests stay keyed by id, and `OrgMembership` gains `handle`, which covers `/me`, `POST /orgs` and accepting an invitation in one place. Added fields only, so the previous frontend keeps working during a deploy.
- **D4 (proposed): settings in the path or the query?** Trust XP puts them in the path (`/o/<org>/settings/<section>`). The template keeps the query, since it's an overlay that opens over any place. No change.

**Tasks** (one commit each, every test shown red):
1. **Schema:** `orgs.handle text`, unique, added as nullable. The migration backfills existing orgs from their names: lowercased, hyphenated, deduplicated with a counter, reserved words suffixed. New orgs always get one. A later release makes it `NOT NULL`, since the running API inserts orgs without it during the deploy.
   **Tests:** `migrations.test.ts` with `createTestDbAt(tag)`: orgs named alike, a reserved name, a name with no letters. The rows the API writes, through the API.
2. **API:**
   - `OrgMembership.handle`.
   - `POST /orgs` takes `handle` and answers 409 `handle_taken` or 400 for one breaking the rules.
   - `GET /orgs/handle-available?handle=` for checking as the person types; signed in and rate-limited.
   - Spec, then codegen.

   **Tests:** API: happy paths with exact bodies, 401, each 400 class, 409 taken (including a different case), a reserved word, and `/me` and accepting an invitation returning the handle. `route-access.test.ts` row.
3. **Web, the scope:**
   - The `/o/$org` layout route resolves the handle, then provides the org to requests and to `useActiveOrg`.
   - The not-found-or-no-access screen.
   - `/app` redirects home.
   - The org switcher, the create form (handle field, prefilled, checked as typed) and the invite page navigate to `/o/<handle>`.
   - `org.ts` only remembers the last org, for home.

   **Tests:** component tests through `renderAt`:
   - each address resolves;
   - an unknown handle and an unreachable one show the same screen;
   - switching drops the cache;
   - home's three cases;
   - settings over `/about` show only "You";
   - the create form's handle field and its four states.
4. **E2E:**
   - the existing flows through addresses;
   - a deep link to `/o/<handle>?settings=members` after a refresh;
   - two tabs on two orgs, each saving to its own after a refresh;
   - an invitee lands on `/o/<handle>`.

   **Tests:** these, with `expectAccessible` on the not-found screen.
5. **Docs:**
   - `docs/UI.md`'s layers table: Scope moves into the path.
   - AGENTS.md's tenancy line: the client's `X-Org-Id` comes from the address.
   - `ARCHITECTURE.md`.
   - Renaming handles added to `CAPABILITIES.md`.

   **Tests:** none, as these are docs.

**Exit criteria.**
- Every org screen worth sharing is an address, and a refresh or a link restores it exactly (E2E).
- No request's org comes from browser storage (a component test with storage holding another org).
- Two tabs on two orgs each read and write their own (E2E).
- An unknown handle and one without access look identical (component test).
- `/me`, creating an org and accepting an invitation return the handle (API tests).

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
| 2026-10-19 | 1.1 (auth, tasks 1–6) | Reviewed the reference app's access design and took its general core; Clerk + own grant tables + permission policy + server-side org + route-access test; web workspace and staff-only admin; E2E through real Clerk in CI. Found: Clerk load failure broke public API calls; admin /health proxy; Vercel preview env needs an explicit branch arg |
| 2026-10-19 | P.6, T.1–T.6 | Deploy sequencing (CI → migrations → API → sites), live-verified twice; Railway leaves a setting removed from railway.ts in place (clear with its empty value). Testing framework: TESTING.md, workflows, `testing` skill, Tests-with-code CI check, post-deploy check. Ratchet found floors 10–20 points under actual; proving tests red found two that passed without the code they covered. First CI run of T: `lib/env`'s coverage depended on the machine having a `.env` (ratcheted locally to 100%, 97.7% in CI); `loadEnvFiles()` is now tested against temp dirs |
| 2026-10-20 | O.1–O.3, O.5–O.7 | Sentry (API-only, request data off), backups runbook, CSP + headers, axe in E2E (found contrast failures on every page), dependency audit, report upload. Found: Sentry's bundle broke the API build (now caught by `node --check`); Sentry 11 collects request bodies by default |
| 2026-10-20 | Final QA + alignment | Phase O verified live (deploy checks pass with headers + CSP; live sites load Clerk with no CSP violations). Found: a project made from the template would run the deploy check against the *template's* sites and pass (now fails until `DEPLOY_REPO` names the repo); `/provision-vercel`'s deploy-targets PR and `/new-project`'s brand-color PR would both fail Tests-with-code (deploy-targets excluded as data; new-project's PR carries the opt-out line); `/new-project` never committed its brand-color edits. `ARCHITECTURE.md` rewritten (still described TEXT org ids and `createApp(db)`); README gets a "start a project" path; skill descriptions match what they do |
| 2026-10-20 | End-to-end run on a scratch project | `erikcr/template-scratch` taken through all three provisioning skills, `/new-project`, a feature PR with a migration, and a promotion; then deleted. Worked as documented: hooks, rulesets, Tests-with-code (failed the feature until its tests were added; accepted the brand-color opt-out and the deploy-targets data file), Promotion source (blocked a feature branch into `main`), backups, deploy order (CI → migration → API → sites → check) on staging and production, staging checks through the bypass secrets, live sites clean. Found, in `/provision-vercel`: the first deploy hung (Root Directory was a dashboard step *after* it; now set by `vercel api` first, and first deploys go through the hooks); `vercel git connect` needs the repo URL from the app folder; `vercel link` leaves an app `.gitignore`; **CLI-created projects don't report deployments to GitHub, so the deploy check never ran** (now enabled in step 5, with a DEPLOYMENTS row); bypass secrets and settings checks now CLI, not dashboard. `/provision-railway` uses `--environment` for staging. Not template issues: a Railway build pause delayed the run; `railway.ts` pins no region (the workspace default applies) |
| 2026-10-21 | O.8 | Email (Resend) and the Resend and Clerk webhooks, from the reference app's recent email fixes. Every new test shown red against a broken version of its behaviour; one (the signature version check) passed broken at first and was rewritten |
| 2026-10-22 | Review fixes | A review found, and this fixed (each test shown red first): crafted pagination cursors answered 500 (ids that aren't uuids, dates Postgres rejects); the error handler passed through any error's `status`, so Clerk's 429/401 reached users as our 4xx and never reached Sentry (now only `expose`d errors keep theirs); every non-staff request to `/api/admin` called Clerk's API (now only while a grant awaits linking); `/health` queried the DB on every unthrottled call (now one shared, single-flight check); no statement timeout (now 30s; migrations use their own client without it, verified on Postgres 18 in Docker); the image ran as root (now `node`, verified migrate + serve); `NODE_ENV=test` on Railway now fails at startup; example names capped at 100. Still open from the review: `users.email`/`name` never sync from Clerk (`user.updated`), unverified accounts call Clerk on every request, `Cache-Control: no-store` on API responses, a staff second-factor max age, org deletion/leaving, `security.txt` |
| 2026-10-22 | Review follow-ups | The rest of the review's open items, decided with Erik: `Cache-Control: no-store` on every API response; staff second factors count for 12 hours (the admin app's sign-in-again screen handles the rest); an account without a verified email is checked with Clerk at most once per 30s; `users.email`/`name` stored at first sign-in and kept current by Clerk's `user.updated` webhook (the webhook must subscribe to it; `/provision-railway` says so); `security.txt` from `VITE_SECURITY_CONTACT` (unset: none, as on the template's own sites); deleting the current org (org_admin, name repeated) and leaving it (never the last org_admin), API + web + E2E. The org row lock on leaving can't be shown by PGlite, which runs one transaction at a time: on Postgres 18, two admins leaving at once stranded 99/100 orgs without it, 0/100 with it. `tenancy-schema` now requires `ON DELETE CASCADE`. Found and fixed: `admin.test.ts` was flaky (two orgs created in the same millisecond tie on `created_at` and order by random id; 1 in 10 coverage runs). Still open: invitations and member management (1.6) |
| 2026-10-22 | 1.6 | Invitations and member management (see 1.6). Found while proving tests red: the new members and invitations list tests had the same-millisecond tie as `admin.test.ts` (fixed before commit). The template's own production needs `WEB_URL=https://web.template.erikcr.com` on Railway before invitations work there |
| 2026-10-22 | Security review | A security review (`security-review` skill) found one exploitable issue: anyone signed in could create an org, name it with phishing text, and invite any address, so our domain emailed that text with only the per-IP rate limit in the way. Fixed: at most 50 invitations per person a day across their orgs, counted on `users` (`invitations_sent`, `invitations_window_start`) rather than from `org_invitations`, so revoking them or deleting the org gives none back; 429 `invitation_limit`. Each test shown red three ways (no cap, a day that never ends, nothing counted). Also fixed (the review's one item to verify): accepting an invitation trusted `users.email`, only as current as Clerk's last `user.updated` webhook, so an address someone gave up (and someone else then claimed) still let them accept invitations to it. Accepting now checks the current verified email with Clerk (`req.identity.profile()`, attached by `signedIn`/`requireOrg`) and brings the row up to date; shown red three ways |
| 2026-10-22 | `security-review` skill | Sentry's `security-review` skill (`getsentry/skills`, CC BY-SA; `skills-lock.json` records the source) is now one of the template's skills, trimmed to this stack: the Python guide dropped, and SKILL.md no longer points to the Go, Rust, Java, Kubernetes, Terraform, CI/CD and cloud guides, which never came with it. Updating it through the skills tool brings the original back |
| 2026-10-23 | Settings dialog | Settings now open as a dialog over whatever page is open, as in Claude and Slack, rather than as pages (`docs/UI.md`, after Trust XP's Plan 48). `?settings=<section>` on any route opens it; the account menu has Settings, and Clerk's own "Manage account" is hidden because Clerk's `<UserProfile>` is the Profile section. Sections are Workspace (Organization: leave or delete; Members: roles and invitations, formerly the `/app/members` page) and You (Profile). An invitation typed but not sent asks before the dialog closes. The rule for which features get a page and which go in settings is in AGENTS.md, `new-feature`, `new-project` and TESTING.md's required-tests table. Every new test was shown red by breaking its behaviour; E2E covers the account menu, a section's own address, and Clerk's pages inside the dialog. Not changed: the admin app's placeholder `/settings` page |
| 2026-10-23 | Settings dialog follow-ups | A review of the settings dialog against current practice. Built: (1) unsaved changes are now held by a router blocker, so Back and links elsewhere ask too, and leaving the site gets the browser's prompt (E2E, since tests' memory history has neither); (2) `Confirmation`, an inline status for what an explicit action did ("Invitation sent to …"); (3) an E2E check that Clerk's own menus work inside the dialog, shown red by stacking the dialog over them; (5) ⌘, / Ctrl+, opens settings. Each new test shown red. Escape inside Clerk's menu never reaches the dialog, so that check passes with or without its guard. Listed for when they're needed, not built: preferences that save as they change, search in settings, a side panel for a record's details, a command palette (`docs/CAPABILITIES.md`) |
| 2026-10-23 | Trust XP review | From Trust XP's new docs (Plan 48 Phase 4, Plans 49–52, `platform-ui.md`). Built: the settings group is named after the org, so nobody changes the wrong org's settings (shown red); a settings section is a container (`@md:`), since the dialog is narrower than the window. `docs/UI.md` gains a second test ("what is it about?") and the layers model, "the address is the state", with its history rule. Six entries added to `CAPABILITIES.md`: a row's "…" menu, one explicit save for a group of fields, a small dialog for short creation forms (the template's "New organization" already fits), an attention queue, a hosted demo, and choosing where someone lands after sign-in. The org in the address is proposed as A.1. Checked and not needed: one org per tab (the template keeps the org in page memory, so tabs don't mix) and naming the avatar button (Clerk's is "Open user menu"). Two notes for Trust XP: the template's router blocker fixes Plan 48's Back limit, and Plan 51's "switching section adds history" contradicts Plan 48's replace |
