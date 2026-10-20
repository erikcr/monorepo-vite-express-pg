---
name: new-feature
description: Checklist for adding a feature across the stack — schema/migration, OpenAPI spec, codegen, API route, job, generated hooks in the apps — with each layer's tests written alongside it. Use when adding an endpoint, table, background job, or user-facing feature.
---

# Add a feature

Follow `routes/example.ts` (with `__tests__/example.test.ts`), `src/jobs/registry.ts` (with `jobs.test.ts`) and web's `AppPage.tsx` (with `app-page.test.tsx`) as the worked example of every step.

**Tests are written with each layer, not at the end.** Before starting, list the tests the feature needs from the required-tests table in `docs/TESTING.md` (if a plan task has a **Tests:** line, start from it). Each step below says which ones it owns. Prove every new test red: break the behaviour, watch it fail for the right reason, restore.

1. **Schema (if needed):** edit `lib/db/src/schema.ts` (uuid PK, `org_id` uuid not null referencing `orgs` with cascade, timestamps with `precision: 3`), run `pnpm db:generate`, and commit the migration in `lib/db/migrations/` with it. Keep it additive: no drops or renames of anything the running API reads.
   - *Tests:* `tenancy-schema.test.ts` checks a new table automatically (a table that isn't org data goes in its `GLOBAL_TABLES`, explained in the PR). A migration that changes or removes existing data gets a case in `migrations.test.ts` using `createTestDbAt(tag)`.
2. **Contract:** add the endpoint and its schemas to `lib/api-spec/openapi.yaml`. Reuse `#/components/parameters/OrgId`, the `BadRequest`/`NotFound` responses, and the `{ items, nextCursor }` page shape for lists.
3. **Codegen:** `pnpm codegen`, and commit the generated `lib/api-zod` and `lib/api-client-react` output. Never hand-edit it. For a paginated list, enable `useInfinite` for the operation in `orval.config.ts`.
4. **Route, test first:** start `__tests__/<feature>.test.ts` with the endpoint's required cases and watch them fail (404: no route yet). Then add a router in `artifacts/api-server/src/routes/` taking `access`, and add it to `createRouters()` in `src/app.ts`. Each route's **first** handler is its access rule: `access.requireOrg("<permission>")` (add the permission to `src/lib/authz/policy.ts` and decide which roles get it), `access.signedIn`, `access.requireStaff(...)` or `publicRoute`. Read the org from `req.ctx.org`, never the request; filter every query by it (single records by `id` **and** org, 404 otherwise). Validate with `validate({ params, query, body })`, respond with `sendValidated()`, page lists with `src/lib/pagination.ts`. New config goes in `lib/env` (schema + getter + `.env.example`).
   - *Tests:* happy path with the exact body, 401, 403 (role without the permission, and someone outside the org), the cross-org 404 (writes leave the record unchanged), the 400s; for lists, empty page, limits, paging through ties, bad cursor. Add the route to `route-access.test.ts`; `contract.test.ts` fails until spec and route agree. A new permission gets its cases in `policy.test.ts`; a new env variable in `lib/env`'s test.
5. **Background work:** define the job in `src/jobs/registry.ts`, add it to `jobs`, and enqueue it from the route through the injected `queue`.
   - *Tests:* the route test asserts the enqueue with `createFakeQueue()`; `jobs.test.ts` runs the handler on pg-boss + PGlite and asserts its effect (and a fixed clock for a scheduled job).
6. **UI:** add a page in `src/pages/` and a route const in `src/router.tsx` (search params via `validateSearch`, prefetch in a `loader`), and use the generated hook. Semantic theme tokens only.
   - *Tests:* a component test through `renderAt(path)` (`src/test-helpers/render.tsx`) with the generated hooks mocked: loading, empty, error and success states, the guard, search params, and each interaction's effect.
7. **The flow:** if a person can now do something new, add an E2E test in `e2e/tests/` for it (signed in with `signIn()`, its own org, data set up through the API). If it delivers a V1 success criterion from `docs/PROJECT.md`, name the test after the criterion.
8. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage`, `pnpm knip`, `pnpm codegen:check`, `pnpm --filter @repo/e2e e2e`. Then `pnpm coverage:ratchet` and commit the raised floors.
9. **PR into `staging`:** fill in the template's **Tests** section: each test added and how it was proven red.
