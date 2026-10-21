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
| Frontend | React 19 + Vite 8 | Best-in-class DX, fast builds |
| Styling | Tailwind CSS 4 | Utility-first, no runtime overhead |
| Data fetching | TanStack Query v5 | Cache management, loading/error states |
| Routing | TanStack Router (code-based) | Links, params and search params are type-checked, so a broken link fails `pnpm typecheck`; Zod-validated search params; loaders prefetch into the Query cache. Code-based routes avoid another generated file |
| Validation | Zod | Runtime safety at API boundaries |
| Linting/formatting | Biome | Single tool, Rust speed, zero config |
| Testing | vitest + supertest + Playwright | Fast, ESM-native, no config overhead |
| Monorepo | pnpm workspaces |
| Identity | Clerk | Sign-in, MFA and sessions bought, not built. Clerk only proves who someone is: access comes from our own tables, so changing provider touches one file (`src/lib/identity.ts`) |
| Hosting | Railway (API + Postgres), Vercel (sites) | Railway runs a long-lived process for the API and its in-process job worker; Vercel serves static builds. Railway is defined in code (`.railway/railway.ts`) |
| Email | Resend, through a job | Sent only by the `send-email` job, so a request never waits on the provider and a failed send retries; an idempotency key per job keeps a retry from sending twice. Resend's HTTP API is called directly (one request), no SDK. Off until `RESEND_API_KEY` is set |
| Error tracking | Sentry, API only | One DSN covers the API, jobs and both sites (the browsers report crashes to the API), and no SDK ships to browsers. Off until `SENTRY_DSN` is set |

---

## Key Patterns

### Org tenancy
Every org-scoped table has `org_id uuid NOT NULL` referencing `orgs` (`tenancy-schema.test.ts`
enforces it; `orgs`, `users` and `platform_staff` are the only global tables). Routes read the org
from `req.ctx.org`, set by `access.requireOrg(permission)` after checking the person's grant,
never from the request; every query filters by it, so another org's record is a 404.

### Access: identity vs. grants
Clerk verifies the session; `org_users` (a role per org) and `platform_staff` grant access, and
`src/lib/authz/policy.ts` maps roles to permissions. Every route declares exactly one access rule
as its first handler (`route-access.test.ts` lists them all).

### createApp(db, queue) factory
The Express app takes its database and job queue as arguments. Production passes postgres-js and
pg-boss; tests pass PGlite (in-process Postgres, real migrations) and a fake queue. Nothing of
ours is mocked.

### Env loading
Server config is read through `@repo/env` (Zod schema per variable), never `process.env`. Entry
points validate every variable at startup, so a bad deploy fails listing all its problems.

### API data flow
`lib/api-spec` (OpenAPI) → `lib/api-zod` (Zod schemas, server validation) →
`lib/api-client-react` (React Query hooks) → React apps. `contract.test.ts` keeps the server and
the spec identical; responses are stripped to what the spec declares.

### Deploys in order
CI → migrations (Railway pre-deploy) → API (switches traffic on `/health/ready`) → sites (deploy
hooks, once the API serves the commit) → deploy check (reads each live site's build). Migrations
are additive so the previous API and frontend keep working during the switch. Details in
`DEPLOYMENTS.md`.

### Browser security
Each site's Content-Security-Policy is generated at build time from its own API address and Clerk
key (`lib/csp`), so it follows the environment without configuration; the other security headers
are in each `vercel.json`. E2E runs the production builds, so a blocked request fails a test.

---

## Project-Specific Decisions

_Add entries here as decisions are made during development._

| Date | Decision | Rationale |
|------|----------|-----------|
| — | — | — |
