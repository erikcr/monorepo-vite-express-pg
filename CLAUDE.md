# CLAUDE.md

Behavioral guidelines for working in this codebase. Part A covers universal LLM coding principles; Part B covers project-specific context.

---

## Part A — Behavioral Guidelines

Derived from [andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills). Merge with team conventions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

---

## Part B — Project Reference

### Session Start

At the start of every session, check whether `docs/PROJECT.md` exists. If it does, read it before doing anything else — it contains the project's objective, V1 feature scope, data model, and success criteria. Every code change should be evaluated against it.

If `docs/PROJECT.md` does **not** exist and the user appears to be starting a new project, suggest running `/new-project` before writing any code.

### Project Documentation

All project-level documentation lives in `docs/` — not at the root.

```
docs/
  PROJECT.md       # scope, objectives, V1 features, success criteria (created by /new-project)
  ARCHITECTURE.md  # stack decisions and key patterns
  DEPLOYMENTS.md   # branch model, promotion process, deploy gates, migration rules
```

### Stack

| Layer | Technology |
|-------|-----------|
| API server | Express 5 + TypeScript, deployed to Railway via Dockerfile |
| Web app | React 19 + Vite 8 + Tailwind CSS 4 + TanStack Router, deployed to Vercel |
| Admin app | React 19 + Vite 8 + Tailwind CSS 4 + TanStack Router, deployed to Vercel |
| Database | PostgreSQL + Drizzle ORM (`drizzle-orm/postgres-js`) |
| Background jobs | pg-boss (jobs in `artifacts/api-server/src/jobs/registry.ts`) |
| Package manager | pnpm 12 workspace monorepo |

### Workspace Layout

```
artifacts/           Deployable applications
  api-server/        Express API + pg-boss worker
  web/               User-facing React app
  admin/             Internal admin React app
lib/                 Shared packages (imported by artifacts)
  db/                Drizzle schema + client  (@repo/db)
  api-spec/          OpenAPI 3.1 spec
  api-zod/           Zod schemas derived from spec
  api-client-react/  React Query hooks + fetch client
  env/               Typed env var loader
docs/                Project documentation (PROJECT.md, ARCHITECTURE.md)
scripts/             One-off scripts (seed, migrate-and-start)
.claude/commands/    Shared Claude Code skills (committed)
.github/workflows/   CI (lint → typecheck → db-check → codegen-check → test → build → e2e)
```

### Key Patterns

**Workspace deps** — always use `workspace:*`:
```json
{ "@repo/db": "workspace:*" }
```

**Env vars** — always via `@repo/env`, never raw `process.env`. Each variable is declared once in
its Zod schema (`lib/env/src/index.ts`) and read typed; every API entry point imports
`./validate-env.js` first, so a bad deploy fails at startup listing every problem:
```typescript
import { env } from "@repo/env";
const url = env.DATABASE_URL; // string; throws if missing
const port = env.PORT;        // number, default 3000
```
Add new variables to the schema, a getter, and `.env.example`.

**orgId pattern** — every table includes `org_id TEXT NOT NULL`; always filter queries by orgId:
```typescript
await db.select().from(exampleTable).where(eq(exampleTable.orgId, orgId));
```

**App factory** — Express app is created via `createApp(db, queue)` in `src/app.ts` so tests can inject the db and job queue:
```typescript
// production: createApp(db, createJobQueue(boss)) with the real postgres-js driver
// tests:      createApp(testDb, createFakeQueue()) with a PGlite-backed db
```

**Routing** — TanStack Router, code-based routes in each app's `src/router.tsx`, pages in
`src/pages/`. Declare every route as its own `const` (inline `createRoute()` calls in
`addChildren([...])` lose their types and `<Link to>` accepts any string). Links, params and
search params are type-checked; validate search params with Zod (`validateSearch`), and prefetch
with `context.queryClient.prefetch…` in a route `loader`. Read route state in pages through
`getRouteApi("/path")` to avoid importing the router. Navigate with `<Link>`/`useNavigate`, never `<a href>`.

**Validate input, validate output** — routes validate with `validate({ params, query, body })`
(`src/middleware/validate.ts`) using the generated `@repo/api-zod` schemas; handlers then get
typed, coerced `req.params/query/body`, and every 400 is `{ error: { fieldErrors, formErrors } }`.
Send responses with `sendValidated(res, XResponse, data)` (`src/lib/send-validated.ts`): it strips
anything the spec doesn't declare, so returning a full DB row can't leak a column.

**Lists are paginated** — list endpoints take `limit` (default 20, max 100) and an opaque `cursor`,
and return `{ items, nextCursor }` ordered newest first. Use `toPage()`/`decodeCursor()` from
`src/lib/pagination.ts` (keyset on `createdAt desc, id desc`; see `routes/example.ts`), and store
timestamps with `precision: 3` so cursors round-trip exactly. In React, page with the generated
`use…Infinite` hook (enable it per operation in `orval.config.ts`).

**Record routes return 404 across orgs** — single-record queries match both `id` and `orgId`, so
another org's record is indistinguishable from a missing one.

**Background jobs** — define each job in `src/jobs/registry.ts` (name, handler, optional cron
`schedule` and retry options) and add it to `jobs`. Routes enqueue through the injected queue,
never a pg-boss instance, so tests can use `createFakeQueue()`:
```typescript
await queue.enqueue(exampleCreated, { exampleId: row.id, orgId: row.orgId });
```
The worker runs inside the API process unless `RUN_WORKER=false` (then `node dist/worker.js`).

**API client** — consume the API via `@repo/api-client-react` hooks in React apps, not raw fetch.

**Theming** — all colors, spacing, and radii are defined as CSS tokens in `src/index.css` per app using Tailwind 4's `@theme` directive. Always use semantic utility classes; never hard-code Tailwind color scales in components:

```tsx
// ✓ correct — respects the theme, dark mode works automatically
<button className="bg-brand text-brand-fg rounded-button px-4 py-2">
<p className="text-text-muted">

// ✗ wrong — bypasses the theme, breaks when brand changes, ignores dark mode
<button className="bg-blue-600 text-white rounded-md px-4 py-2">
<p className="text-gray-500">
```

Token reference:
- **Brand** — `brand`, `brand-subtle`, `brand-fg`
- **Surfaces** — `surface`, `surface-raised`
- **Text** — `text`, `text-muted`
- **Borders** — `border`, `border-subtle`
- **Status** — `destructive`, `destructive-fg`, `success`, `success-fg`, `warning`, `warning-fg`
- **Layout** — `px-page-x`, `py-page-y`, `rounded-card`, `rounded-button`, `rounded-input`

Dark mode is handled automatically via `@media (prefers-color-scheme: dark)` — no `dark:` prefixes needed for semantic tokens.

### Commands

```bash
# Development
pnpm dev                      # start all artifacts in parallel
pnpm --filter @repo/web dev   # start a single app

# Database
pnpm db:generate              # generate Drizzle migration from schema changes (no DB needed)
pnpm db:migrate               # apply pending migrations to local DB (requires DATABASE_URL)
pnpm db:check                 # verify no uncommitted migrations (runs in CI)
pnpm db:seed                  # seed example data
pnpm db:studio                # open Drizzle Studio

# Code generation
pnpm codegen                  # generate Zod schemas + React Query hooks from openapi.yaml
pnpm codegen:check            # verify generated files match openapi.yaml (runs in CI)

# Lint & format
pnpm lint                     # Biome check (all packages)
pnpm format                   # Biome format --write (all packages)

# Type checking & tests
pnpm typecheck                # all packages
pnpm test                     # all packages (vitest)
pnpm --filter @repo/web e2e   # Playwright E2E (health smoke test)

# Build
pnpm build                    # all artifacts
```

### Testing Approach

- **Unit/integration** — vitest, co-located in `src/__tests__/` per package
- **API tests** — supertest against `createApp(testDb, createFakeQueue())`, db backed by PGlite which runs the actual migration SQL files — schema changes without committed migrations will cause test failures
- **Component tests** — `@testing-library/react` + jsdom environment
- **E2E** — Playwright health-page smoke test in `artifacts/web/e2e/`
- **CI** — GitHub Actions: lint → typecheck → db-check → codegen-check → test → build → e2e on every push/PR

### Git workflow

Never commit to `main` or `staging`, and never use `--no-verify`: the hooks in `.githooks/`
refuse both branches. Work on a feature branch off `staging` and open a PR into `staging`;
releases are promotion PRs from `staging` into `main`, merged with a merge commit. Keep
migrations additive and the API compatible with the previous frontend for one release.
See `docs/DEPLOYMENTS.md`.

### Deployment

Railway is configured by `.railway/railway.ts` (Infrastructure as Code), never the dashboard or
`railway.toml`. After changing it, `railway config plan` then `railway config apply`, staging
first, then production (see `docs/DEPLOYMENTS.md`).

Run once per new project, in order:

```bash
gh auth login
/provision-github    # Claude skill: staging branch + rulesets protecting staging and main
railway login
/provision-railway   # Claude skill: applies .railway/railway.ts to production + staging
vercel login
/provision-vercel    # Claude skill: both Vercel projects, per-environment API URL, CORS
```

### Schema change workflow

**Every time you edit `lib/db/src/schema.ts`:**

```bash
pnpm db:generate   # creates a new SQL file in lib/db/migrations/
pnpm db:migrate    # applies it to your local DB (requires DATABASE_URL in .env)
# commit both schema.ts AND the new migration file together
```

CI runs `pnpm db:check` which re-generates and fails if any new files appear — this
catches schema changes committed without the corresponding migration. On Railway,
the pre-deploy command `node dist/migrate.js` applies pending migrations to production
before the new server starts, so the flow is: push → CI → Railway build → migrate → start.

`pnpm db:generate` never needs a real DB — it only reads `schema.ts` and the
existing migration files to produce the diff SQL.

### Adding a New Feature (checklist)

1. Update `lib/db/src/schema.ts` if a new table is needed → run `pnpm db:generate` and commit the migration
2. Update `lib/api-spec/openapi.yaml` with the new endpoint/schema
3. Run `pnpm codegen` → auto-generates `lib/api-zod/src/index.ts` + `lib/api-client-react/src/index.ts` → commit generated files
4. Add route in `artifacts/api-server/src/routes/` and register in `src/app.ts`
5. Use the generated hook in `artifacts/web` or `artifacts/admin`
6. Add co-located tests for each changed package
