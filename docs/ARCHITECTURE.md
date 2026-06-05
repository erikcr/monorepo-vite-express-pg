# Architecture

Key technical decisions and their rationale. Add an entry here whenever a non-obvious choice is made so future contributors understand the why.

---

## Stack Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| API framework | Express 5 | Stable, minimal, wide ecosystem |
| ORM | Drizzle | Type-safe, schema-as-code, no magic |
| DB driver | postgres.js | Fast, modern ESM-native |
| Background jobs | pg-boss | Uses existing Postgres, no extra infra |
| Frontend | React 19 + Vite 6 | Best-in-class DX, fast builds |
| Styling | Tailwind CSS 4 | Utility-first, no runtime overhead |
| Data fetching | TanStack Query v5 | Cache management, loading/error states |
| Validation | Zod | Runtime safety at API boundaries |
| Linting/formatting | Biome | Single tool, Rust speed, zero config |
| Testing | vitest + supertest + Playwright | Fast, ESM-native, no config overhead |
| Monorepo | pnpm workspaces | Fast installs, strict isolation |

---

## Key Patterns

### orgId multi-tenancy
Every table includes `org_id TEXT NOT NULL`. All queries filter by `orgId`. This enforces tenant isolation at the query level rather than relying on middleware.

### createApp(db) factory
The Express app is created by a factory function that accepts a `Db` instance. Production uses the real postgres-js driver; tests use a pg-mem-backed drizzle instance. No mocking required.

### Env loading
All env vars are accessed through `@repo/env`, which throws at access time if a required var is missing. Variables are never read via `process.env` directly in application code.

### API data flow
`lib/api-spec` (OpenAPI) → `lib/api-zod` (Zod schemas) → `lib/api-client-react` (hooks) → React apps

---

## Project-Specific Decisions

_Add entries here as decisions are made during development._

| Date | Decision | Rationale |
|------|----------|-----------|
| — | — | — |
