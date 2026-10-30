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

In the web app the org is in the address: `/o/<handle>`, where the handle is chosen when the org
is created and fixed after (rules and reserved words in the API's `src/lib/handles.ts`). The org's
layout resolves the handle through `/me` and sends that org's id as `X-Org-Id`, so a link or a
refresh restores it and each tab keeps its own. The API still keys requests by id, and checks it
against the person's grants as before.

### Access: identity vs. grants
Clerk verifies the session; `org_users` (a role per org) and `platform_staff` grant access, and
`src/lib/authz/policy.ts` maps roles to permissions. Every route declares exactly one access rule
as its first handler (`route-access.test.ts` lists them all). People join an org by creating it or
by accepting an emailed invitation (single use, 7 days, only for the invited email, verified and checked with Clerk on accepting; at
most 50 sent per person a day, since anyone can create an org and email from it;
`src/routes/members.ts`). Memberships change only through `src/lib/memberships.ts`, which locks the
org's row and never leaves an org without an org_admin. A product that sets orgs up for its
customers instead has staff create them, with self-serve creation switched off (`CAPABILITIES.md`).

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

### Pages and the settings dialog
The work people come for is a page; what they set up and revisit now and then (their profile, the
org's members, leaving or deleting it) is a section of one settings dialog, opened from the account
menu over any page at `?settings=<section>` (`artifacts/web/src/settings/`). Closing it returns
people to where they were. Which one a feature gets, and the dialog's rules: `UI.md`.

### What the template assumes
Orgs are private: only their members, and staff, see an org or its data, and people do their work
inside an org. Most business products fit this. A marketplace, a directory or a community bends
it in four places, each listed in `CAPABILITIES.md` with when to build it:
- public org profiles;
- reading across orgs, which needs a second, public read path;
- people without an org, and data a person owns, which needs a third kind of table;
- pages search engines can read, since the app renders in the browser.

Plan for none of them until a product needs them. The decisions that are hard to change later
are already being made with them in mind: every route declares who may call it, and the org's
address (`/o/<handle>`, `UI.md`'s scope layer) is a fixed, human-readable handle that can also be
its public address.

### One product, many ways of working
Orgs on one product run their business differently: how they price, pay, approve and schedule.
Record what happened the same way for every org, and keep how an org reads it in rules the org
owns:
- **Facts** have one shape everywhere: who did what, when, how many, how long. They're stored once
  and never reshaped to fit one org's rule.
- **Rules** are per org and dated (a rate from a given day, a pay basis per kind of work). Costs,
  pay and totals are computed from the facts through the rules in force at the time. A result
  someone relied on (an approved estimate, an invoice) is kept as a version, not recomputed.
- **Build the first customer's rules first**, behind a shape that allows others. Add a second kind
  of rule when a second org needs it; a setting nobody asked for is a guess that still has to be
  supported.

When an org's way of working doesn't fit the facts, change the facts' shape for everyone rather
than branching for that org.

### Web first; a native app is a second codebase
The sites run in a browser, including on phones and tablets, and that covers most products.
Decide early, for each app, whether it stays in the browser, becomes installable (a PWA), or also
needs a native app (the `new-project` skill asks). None is the default:
- **Installable (PWA)** is the same site with a manifest and icons, and optionally a service worker
  for offline use. Cheap without offline, real work with it (`CAPABILITIES.md`, "An installable web
  app (PWA)"). Usually only `web`; `admin` stays in the browser.
- **A native app** doesn't reuse `web`'s pages: it means building and maintaining a second set of
  screens.

- **Native shells around `web` (Tauri, Capacitor) aren't supported** while Clerk is the identity
  provider. Tested on an iPad simulator on 2026-10-27: Clerk has no SDK for either; sign-in inside
  one lands back on "/" until the shell's URL scheme is allowed as a redirect; and the session is
  lost when the app restarts, because Clerk keeps it in cookies and WebKit keeps none for the
  `tauri://` or `capacitor://` page. Each has a workaround, but none is one Clerk supports.
- **A native app is built with Expo and Clerk's Expo SDK** (`@clerk/expo`). Tested the same day:
  sign-in, a session that survives restarting the app and the simulator, and the generated
  React Query hooks calling the API all work. What it takes is in `CAPABILITIES.md`, "A native
  app (Expo)".

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
