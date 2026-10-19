# AGENTS.md

Instructions for every coding agent in this repo (Claude Code reads this via `CLAUDE.md`; Codex, Devin, Cursor and others read it directly). Keep it under 12 KiB. Procedures live in skills (`.agents/skills/`, linked from `.claude/skills/`); human setup lives in `README.md`.

## Working principles

- **Think before coding.** State assumptions; if a request has several readings, say so instead of picking silently; if something is unclear, stop and ask.
- **Simplicity first.** The minimum code that solves the problem: no speculative features, abstractions or configurability, no handling for impossible cases.
- **Surgical changes.** Touch only what the task needs and match the surrounding style. Remove what *your* change orphaned; mention other dead code rather than deleting it.
- **Goal-driven.** Turn tasks into verifiable checks ("write a failing test, then make it pass") and loop until they pass. For multi-step work, state a short plan with a verify step per item. When a test is meant to catch a bug, prove it: break the code, watch it fail, restore.

## Start of a session

Read `docs/PROJECT.md` (objective, V1 scope, data model, success criteria) and evaluate every change against it. If it doesn't exist and the user is starting a project, suggest the `new-project` skill before writing code. Planned work lives in `docs/plans/` with the board in `docs/README.md`; execute a plan with the `execute-plan` skill.

## Branching

`staging` holds release candidates; `main` is production. Branch off `staging`, PR into `staging`, then promote with a `staging` → `main` PR (a merge commit, never squash). The git hooks block commits and pushes to `main` and `staging`; never use `--no-verify`. Promote small and often; work awaiting sign-off ships switched off rather than waiting on `staging`. Details: `docs/DEPLOYMENTS.md`.

## Stack and layout

Express 5 + TypeScript API with an in-process pg-boss worker (Railway, Dockerfile) · web and admin apps on React 19 + Vite 8 + Tailwind 4 + TanStack Router/Query (Vercel) · PostgreSQL + Drizzle · pnpm 12 workspace, Node 24.

```
artifacts/api-server  web  admin   deployable apps
lib/db                Drizzle schema + client (@repo/db), migrations in lib/db/migrations
lib/api-spec          openapi.yaml: the API source of truth
lib/api-zod           generated Zod schemas (server validation)
lib/api-client-react  generated React Query hooks + hand-written client, errors, query-client
lib/env               typed, validated server env (@repo/env)
e2e/                  Playwright full-stack tests
.railway/railway.ts   Railway infrastructure (IaC)
docs/                 PROJECT.md, ARCHITECTURE.md, DEPLOYMENTS.md, board + plans/
```

## API contract

`lib/api-spec/openapi.yaml` is the source of truth. After editing it run `pnpm codegen` and commit the output; `lib/api-zod/src/index.ts` and `lib/api-client-react/src/index.ts` are generated, never hand-edited (CI fails if stale). React apps use the generated hooks, never raw `fetch`; hand-written client code is in `lib/api-client-react/src/{client,errors,query-client}` (subpath exports). To add a feature end to end, use the `new-feature` skill.

## Database and tenancy

- Edit `lib/db/src/schema.ts`, run `pnpm db:generate` (no DB needed), commit schema and migration together; CI fails on drift. Deploys run migrations before the new API starts. **Migrations are additive**: never drop or rename what the running API reads in the same release.
- Every table has `org_id TEXT NOT NULL`, and every query filters by it. Single-record queries match `id` **and** `orgId`, so another org's record is a 404. (`orgId` is client-supplied: there's no auth yet, so add it before handling real tenants.)
- Timestamps use `precision: 3` so they round-trip through JS Dates (cursors depend on it).

## Code patterns

- **Env:** read config via `env` from `@repo/env`, never `process.env`. Declare each variable once in its Zod schema (`lib/env/src/index.ts`) with a getter, and add it to `.env.example`. API entry points import `./validate-env.js` first, so a bad deploy fails at startup listing every problem.
- **App factory:** `createApp(db, queue)`; tests pass a PGlite db and `createFakeQueue()`.
- **Validation:** routes validate with `validate({ params, query, body })` using the generated schemas (handlers get typed, coerced values; every 400 is `{ error: { fieldErrors, formErrors } }`) and respond with `sendValidated(res, XResponse, data)`, which strips anything the spec doesn't declare.
- **Errors and logs:** log from handlers with `req.log` (carries the request id). Unexpected errors answer `{ error: "Internal server error", requestId }`, never `err.message`. Never log secrets, tokens or query strings.
- **Lists:** `limit` (default 20, max 100) + opaque `cursor` → `{ items, nextCursor }`, newest first, via `src/lib/pagination.ts`. React pages with the generated `use…Infinite` hook (enable per operation in `orval.config.ts`).
- **Jobs:** define each in `src/jobs/registry.ts` (name, handler, optional cron `schedule`, retry options) and add it to `jobs`. Routes enqueue through the injected `JobQueue`, never pg-boss directly. The worker runs in the API process unless `RUN_WORKER=false`.
- **Routing:** code-based TanStack routes in each app's `src/router.tsx`, pages in `src/pages/`. Declare every route as its own `const` (inline `createRoute()` in `addChildren` silently loses the types). Validate search params with Zod, prefetch in loaders via `context.queryClient`, read route state with `getRouteApi()`, navigate with `<Link>`/`useNavigate`.
- **Frontend errors:** `createQueryClient()`; crashes reported via `@repo/api-client-react/errors` to `POST /api/client-errors`; route errors use the router's `defaultOnCatch`/`defaultErrorComponent` (`CrashScreen`).
- **Theming:** only semantic tokens from each app's `src/index.css` (`bg-brand text-brand-fg rounded-button`, `text-text-muted`, `bg-surface-raised`, `border-border`, `bg-success`/`destructive`/`warning`, `px-page-x`, `rounded-card`…), never raw Tailwind scales like `bg-blue-600`. Dark mode comes from the tokens; no `dark:` prefixes.
- **Dependencies:** `workspace:*` for internal packages, shared versions in the pnpm `catalog`, React pinned exactly. `minimumReleaseAge` (1 day) stays on; Renovate opens weekly update PRs into `staging`.

## Commands

```bash
pnpm dev                       # api-server, web, admin in parallel
pnpm db:generate | db:migrate | db:seed | db:studio
pnpm codegen                   # Zod schemas + React Query hooks from openapi.yaml
pnpm lint | format             # Biome
pnpm typecheck                 # strict TS everywhere (incl. .railway)
pnpm test | test:coverage      # vitest; test:coverage enforces coverage floors (CI runs it)
pnpm knip                      # unused files, exports, dependencies
pnpm --filter @repo/e2e e2e    # Playwright: real API (in-process Postgres) + both apps
pnpm build
```

## Quality gates and testing

CI must pass: lint, typecheck, migration drift, codegen check, tests with coverage floors, knip, build, E2E, and the promotion-source rule; `CI passed` is the one required check. Use `biome-ignore` only with a reason.

Tests are vitest in each package's `src/__tests__/`. API tests use supertest against `createApp()` with PGlite (in-process Postgres running the real migrations) and pg-boss on the same PGlite for job tests. Component tests use Testing Library + jsdom, rendering through the router with memory history and mocking generated hooks at the module boundary. E2E tests seed data through the API, one org per test. Coverage floors live in each `vitest.config.ts` and only go up.

## Infrastructure and operations

- Railway is defined by `.railway/railway.ts`: never change it in the dashboard. After editing, `railway config plan` then `apply`, staging first, production after promotion (`docs/DEPLOYMENTS.md`). New projects set up GitHub, Railway and Vercel with the `provision-github`, `provision-railway` and `provision-vercel` skills, in that order.
- **Agents don't change deployed infrastructure or data** (Railway/Vercel variables, GitHub settings, databases) without the user's explicit go-ahead. Verify read-only afterwards: deploy status, health endpoints, variable names (never print secret values).
