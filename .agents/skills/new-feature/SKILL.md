---
name: new-feature
description: Checklist for adding a feature across the stack — schema/migration, OpenAPI spec, codegen, API route, job, generated hooks in the apps, and tests. Use when adding an endpoint, table, background job, or user-facing feature.
---

# Add a feature

Follow `routes/example.ts`, `src/jobs/registry.ts` and admin's `DashboardPage.tsx` as the worked example of every step.

1. **Schema (if needed):** edit `lib/db/src/schema.ts` (uuid PK, `org_id text not null`, timestamps with `precision: 3`), run `pnpm db:generate`, and commit the migration in `lib/db/migrations/` with it. Keep it additive: no drops or renames of anything the running API reads.
2. **Contract:** add the endpoint and its schemas to `lib/api-spec/openapi.yaml`. Reuse `#/components/parameters/OrgId`, the `BadRequest`/`NotFound` responses, and the `{ items, nextCursor }` page shape for lists.
3. **Codegen:** `pnpm codegen`, and commit the generated `lib/api-zod` and `lib/api-client-react` output. Never hand-edit it. For a paginated list, enable `useInfinite` for the operation in `lib/api-spec/orval.config.ts`.
4. **Route:** add a router in `artifacts/api-server/src/routes/` and mount it in `src/app.ts`. Validate with `validate({ params, query, body })` using the generated schemas, respond with `sendValidated()`, filter every query by `orgId` (single records by `id` **and** `orgId`, 404 otherwise), and page lists with `src/lib/pagination.ts`. New config goes in `lib/env` (schema + getter + `.env.example`).
5. **Background work:** define the job in `src/jobs/registry.ts`, add it to `jobs`, and enqueue it from the route through the injected `queue`.
6. **UI:** add a page in `src/pages/` and a route const in `src/router.tsx` (search params via `validateSearch`, prefetch in a `loader`), and use the generated hook. Semantic theme tokens only.
7. **Tests:** API tests with supertest + PGlite (include the cross-org 404 and the 400s), a job test with pg-boss on PGlite if there's a job, component tests through the router, and an E2E test in `e2e/tests/` for the main flow. Prove each new test fails without the change.
8. **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage`, `pnpm knip`, `pnpm codegen:check`, `pnpm --filter @repo/e2e e2e`, then a PR into `staging`.
