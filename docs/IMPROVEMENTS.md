# Template Improvements — Implementation Plan

Working document tracking the gap-analysis findings (2026-06-10) and their implementation.
Each item is implemented **one at a time**. Update the status checkbox as items complete so
any session can resume from this file.

Statuses: `[ ]` not started · `[~]` in progress · `[x]` done (committed + pushed)

---

## Verification Protocol (run after EVERY item)

Mirror CI locally before committing:

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
- One commit per item (or per coherent sub-step). Push after each item passes verification.

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
**Change:** Keep `/health` as liveness (200 + db field, used by frontends). Add `/health/ready`
returning 503 when DB unreachable. Point `railway.toml` `healthcheckPath` at `/health/ready`.
Add to OpenAPI spec.
**Files:** `artifacts/api-server/src/routes/health.ts`, `railway.toml`, `lib/api-spec/openapi.yaml`,
codegen, tests.
**Accept:** Test: ready → 200, broken db → 503.

---

## Phase 1 — Tier 1 (every project needs these on day one)

### 1.1 `[x]` Auth scaffold (provider-agnostic)
**Problem:** No identity layer; `orgId` is client-supplied (honor-system tenancy).
**Change:** Add `authMiddleware` to api-server that verifies a Bearer token and attaches
`req.auth = { userId, orgId }`. Ship a dev-mode stub (e.g. token `dev:<userId>:<orgId>` accepted
when `NODE_ENV !== "production"`; production requires a real verifier — documented seam, throw if
unconfigured). Example route reads orgId from `req.auth`, never from the client. Spec: add
bearerAuth security scheme; remove orgId query param. Frontends: api client sends the dev token;
document where a real token provider plugs in. Candidates for real providers documented in
ARCHITECTURE.md (Better Auth fits the self-hosted Postgres ethos).
**Files:** `artifacts/api-server/src/middleware/auth.ts` (new), `app.ts`, `routes/example.ts`,
`lib/api-spec/openapi.yaml`, `lib/api-client-react/src/client.ts`, `@repo/env` (AUTH_SECRET or
similar), tests, `docs/ARCHITECTURE.md`.
**Accept:** Unauthenticated request → 401. Org A token cannot read org B rows (test).

### 1.2 `[x]` Client-side routing + SPA rewrites
**Problem:** No react-router in either app; deep links will 404 on Vercel once routes exist.
**Change:** Add `react-router` (v7, library mode) to web and admin with a minimal two-route setup
(`/` + `/settings` placeholder or similar) and a 404 page. Add SPA rewrites to both `vercel.json`
files: `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`.
**Files:** both apps' `package.json`, `main.tsx`, `App.tsx` (split into pages), `vercel.json`,
component tests, catalog entry in `pnpm-workspace.yaml`.
**Accept:** Tests render routes; unknown path shows 404 page.

### 1.3 `[x]` Complete CRUD example + pagination convention
**Problem:** Template only demonstrates list + create; no path params, 404 handling, update,
delete, or pagination pattern.
**Change:** Add `GET /api/example/:id` (404 when missing/wrong org), `PATCH /api/example/:id`,
`DELETE /api/example/:id`, and `limit`/`cursor` pagination on the list endpoint
(`{ items, nextCursor }` envelope). Spec-first → codegen → routes → tests. Touched updatedAt on PATCH.
**Files:** `lib/api-spec/openapi.yaml`, codegen, `routes/example.ts`, tests, admin table
(use paginated hook).
**Accept:** Tests for 404, cross-org 404, update, delete, pagination ordering.

### 1.4 `[x]` Make the worker real
**Problem:** `worker.ts` is built but never run (no Railway service, no compose service, no dev
script); nothing enqueues jobs.
**Change:** (a) `enqueue` helper in api-server (shared pg-boss instance, lazy-started);
(b) example route or endpoint enqueues `example-job` on create; (c) `worker` service in
`docker-compose.yaml`; (d) dev script runs worker alongside server (`dev:worker` script +
mention in README); (e) README section: deploying the worker as a second Railway service
(same image, `startCommand = "node dist/worker.js"`); (f) graceful `boss.stop()` on SIGTERM
(overlaps 1.5).
**Files:** `artifacts/api-server/src/queue.ts` (new), `worker.ts`, `routes/example.ts` or `app.ts`,
`docker-compose.yaml`, `package.json` scripts, `README.md`.
**Accept:** Compose up runs worker; create-example enqueues; worker test or manual verification.

### 1.5 `[x]` Graceful shutdown
**Problem:** No SIGTERM handling — Railway deploys drop in-flight requests; pg connections and
pg-boss never closed.
**Change:** `index.ts`: capture server handle, on SIGTERM/SIGINT `server.close()` then `closeDb()`,
with a timeout fallback. `worker.ts`: `boss.stop()` then exit.
**Files:** `artifacts/api-server/src/index.ts`, `worker.ts`.
**Accept:** Local manual check: SIGTERM exits 0 cleanly; build passes.

---

## Phase 2 — Tier 2 (strongly recommended defaults)

### 2.1 `[x]` Validation helper middleware
**Change:** `validate(schema)` Express middleware (body/query/params variants) replacing
hand-rolled `safeParse` blocks; consistent 400 shape `{ error: { fieldErrors, formErrors } }`.
**Files:** `artifacts/api-server/src/middleware/validate.ts` (new), routes, tests.

### 2.2 `[x]` Request logging + request IDs + error-tracking seam
**Change:** `pino-http` with request-id generation (accept inbound `x-request-id`), wired to the
existing pino logger; global error handler gets a documented Sentry hookup point (no SDK installed —
commented seam + ARCHITECTURE.md note).
**Files:** `app.ts`, `logger.ts`, `package.json`, `docs/ARCHITECTURE.md`.

### 2.3 `[x]` helmet + rate limiting
**Change:** `helmet()` and `express-rate-limit` (sane defaults, env-tunable window/max, disabled in
tests) on the API.
**Files:** `app.ts`, `@repo/env`, `package.json`, tests.

### 2.4 `[x]` React ErrorBoundary + QueryClient defaults
**Change:** Shared-pattern `ErrorBoundary` component in each app; QueryClient with explicit
defaults (retry: 1, staleTime 30s, refetchOnWindowFocus false) and a global query error log hook.
**Files:** both apps' `main.tsx`, `components/ErrorBoundary.tsx` (new), tests.

### 2.5 `[x]` Renovate config
**Change:** `renovate.json` — pnpm catalog support, group minor/patch, weekly schedule,
separate major PRs. (Renovate reads catalogs natively.)
**Files:** `renovate.json` (new).

### 2.6 `[x]` Pin Node for local dev
**Change:** `"engines": { "node": ">=22" }` in root package.json + `.nvmrc` with `22`.
**Files:** `package.json`, `.nvmrc` (new).

---

## Phase 3 — Tier 3 (nice to have)

### 3.1 `[x]` Serve API reference at /docs
**Change:** Serve `openapi.yaml` + Scalar API reference from the API server (non-production only,
or always — decide at implementation).
**Files:** `app.ts`, asset embedding for the yaml.

### 3.2 `[ ]` Real full-stack E2E + CI improvements
**Change:** Playwright test hitting the real server (PGlite-backed `createApp` via a test boot
script) instead of stubbed routes; add CI `concurrency` cancellation; cache Playwright browsers.
Add admin smoke test.
**Files:** `artifacts/web/e2e/`, `playwright.config.ts`, `.github/workflows/ci.yml`, admin e2e.

### 3.3 `[ ]` Typed frontend env
**Change:** Validate `VITE_API_URL` at app boot in production builds (fail loudly instead of
calling the wrong origin).
**Files:** `lib/api-client-react/src/client.ts` or per-app `env.ts`.

### 3.4 `[ ]` (Decide) Shared UI package
Theme CSS + small components (StatusBadge) are duplicated between web and admin. Fine at 2 apps.
Revisit if a third app appears or divergence hurts. **No action by default.**

### 3.5 `[ ]` (Decide) Template changelog/versioning
`docs/TEMPLATE-CHANGELOG.md` so spun-up projects know what they're behind on. Decide once the
template stabilizes after Phases 0–2.

---

## Session Log

| Date | Items completed | Notes |
|------|-----------------|-------|
| 2026-06-10 | Plan created | — |
