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
```

### Stack

| Layer | Technology |
|-------|-----------|
| API server | Express 5 + TypeScript, deployed to Railway via Dockerfile |
| Web app | React 19 + Vite 6 + Tailwind CSS 4, deployed to Vercel |
| Admin app | React 19 + Vite 6 + Tailwind CSS 4, deployed to Vercel |
| Database | PostgreSQL + Drizzle ORM (`drizzle-orm/postgres-js`) |
| Background jobs | pg-boss (worker at `artifacts/api-server/src/worker.ts`) |
| Package manager | pnpm 9 workspace monorepo |

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
.github/workflows/   CI (lint → typecheck → test → build → e2e)
```

### Key Patterns

**Workspace deps** — always use `workspace:*`:
```json
{ "@repo/db": "workspace:*" }
```

**Env vars** — always via `@repo/env`, never raw `process.env`:
```typescript
import { env } from "@repo/env";
const url = env.DATABASE_URL; // throws if missing
```

**orgId pattern** — every table includes `org_id TEXT NOT NULL`; always filter queries by orgId:
```typescript
await db.select().from(exampleTable).where(eq(exampleTable.orgId, orgId));
```

**App factory** — Express app is created via `createApp(db)` in `src/app.ts` to support db injection in tests:
```typescript
// production: createApp(db) with real postgres-js driver
// tests:      createApp(testDb) with pg-mem-backed db
```

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
pnpm db:generate              # generate Drizzle migration from schema changes
pnpm db:migrate               # run pending migrations
pnpm db:seed                  # seed example data
pnpm db:studio                # open Drizzle Studio

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
- **API tests** — supertest against `createApp(testDb)`, db backed by PGlite (real PostgreSQL WASM, no external DB needed)
- **Component tests** — `@testing-library/react` + jsdom environment
- **E2E** — Playwright health-page smoke test in `artifacts/web/e2e/`
- **CI** — GitHub Actions: lint → typecheck → test → build → e2e on every push/PR

### Deployment

**Railway (API):**
```bash
railway login
/provision-railway   # Claude skill: creates project, attaches Postgres, sets env vars
```

**Vercel (web + admin):**
```bash
vercel login
/provision-vercel    # Claude skill: creates both Vercel projects, sets env vars
```

### Adding a New Feature (checklist)

1. Update `lib/db/src/schema.ts` if a new table is needed → run `pnpm db:generate`
2. Add/update Zod schemas in `lib/api-zod/src/index.ts`
3. Add route in `artifacts/api-server/src/routes/` and register in `src/app.ts`
4. Add React Query hook in `lib/api-client-react/src/index.ts`
5. Use the hook in `artifacts/web` or `artifacts/admin`
6. Add co-located tests for each changed package
7. Update `lib/api-spec/openapi.yaml`
