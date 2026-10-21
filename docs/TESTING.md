# Testing

How this project is tested, what every change must include, and how CI holds it to that. Agents
and people follow the same rules; the `testing` skill applies them to a change.

## Principles

- **Tests are part of the change, never a follow-up.** A task, commit or PR that changes behaviour
  carries the tests for it. "Add tests later" doesn't exist: later is when nobody remembers what
  the code was meant to do.
- **Write the test with the code, layer by layer.** The route's test is written with the route,
  the page's with the page. For a bug, the test comes first.
- **A test proves itself.** Watch every new test fail without the change (break the code or
  revert it, run, restore). A test that has never been red may be testing nothing.
- **Test behaviour at the cheapest honest seam.** Assert what a caller or user observes (status
  codes, response bodies, rows, rendered text), not private functions or call order. Pick the
  lowest layer that can see the behaviour; go up a layer only for what that one can't see.
- **Real over fake.** The database, migrations, validation, access rules and our own modules run
  for real in tests. Only what crosses the process boundary is faked (below).

## The layers

| Layer | Tool | Lives in | Use it for |
|---|---|---|---|
| **Unit** | vitest | `<package>/src/__tests__/` | Pure logic with many cases: policy tables, cursors, env parsing, formatting |
| **API** | vitest + supertest + PGlite | `artifacts/api-server/src/__tests__/` | Every endpoint: access, validation, tenancy, responses, rows written. **The main layer** |
| **Job** | vitest + pg-boss on PGlite | `artifacts/api-server/src/__tests__/jobs.test.ts` | Handlers' effects, retries, schedules |
| **Component** | vitest + Testing Library + jsdom | `artifacts/{web,admin}/src/__tests__/` | Pages through the real router: guards, search params, loading/empty/error/success states, interactions |
| **E2E** | Playwright, real API on in-process Postgres, production builds of both sites, real Clerk dev instance | `e2e/tests/` | The main flows a person walks through, across both apps and the API; with them, every page's accessibility (axe, light and dark mode) and the Content-Security-Policy |
| **Structural** | vitest | `route-access.test.ts`, `contract.test.ts`, `tenancy-schema.test.ts` | Rules that hold for every route or table at once: each route declares an access rule; the server implements exactly the spec; every table but the global ones belongs to an org |
| **Post-deploy** | `.github/workflows/deploy-check.yml` | `lib/ci/src/deploy-check.ts`, expectations in `deploy-targets.ts` | What CI can't see: how each live site was built (the environment's API address over https, the right Clerk key type, no secret keys) and served (security headers, a CSP that allows its API), after every site deploy |

**What is faked, and how:**
- **Clerk** (identity). API tests sign in with test tokens (`createMember()`, `bearer()`), which
  only `NODE_ENV=test` accepts; component tests mock `@clerk/react` with `src/__tests__/clerk-mock.tsx`.
  E2E uses the real Clerk development instance.
- **The job queue in route tests:** `createFakeQueue()` records what a route enqueued. Job tests
  run the real pg-boss on PGlite.
- **The API in component tests:** mock the generated hooks (`@repo/api-client-react`) at the
  module boundary, never `fetch`. The hooks are generated from the spec, so their shapes can't drift.
- **Time:** `vi.useFakeTimers()` / `vi.setSystemTime()`, never real waits.

**Never faked:** the database (every API test runs the real migrations on PGlite), validation,
access middleware, the permission policy, our own modules. If code is hard to test without mocking
our own module, change the code's seams instead (inject it, as `createApp(db, queue)` does).

## Required tests by change

Every row applies in addition to the ones above it that match. A PR that adds none of these
explains why in its **Tests** section (below).

| Change | Required tests |
|---|---|
| **Any endpoint** | Happy path with the exact response body; **401** with no session; **403** for a role without the permission (and for someone outside the org); **400** for each invalid input class; the route's row in `route-access.test.ts`; its operation in `openapi.yaml` (`contract.test.ts` fails otherwise) |
| **Endpoint reading or writing org data** | **Another org's record is a 404**, and is left unchanged by writes; lists never include other orgs' rows; the org comes from the session, not the body |
| **List endpoint** | Empty page; default and max `limit`; paging visits every row once, newest first, including timestamp ties; an invalid cursor is a 400 |
| **New permission or role change** | `policy.test.ts`: which roles have it, and that the others don't |
| **Schema change** | The rows the feature writes, asserted through the API; for a migration that changes or removes existing data (a type change, a backfill, a delete), a test in `migrations.test.ts` that runs it against a database holding the old shape (`createTestDbAt(tag)`) |
| **New table** | `tenancy-schema.test.ts` checks it automatically: `org_id uuid NOT NULL` referencing `orgs`. A table that isn't org data goes in its `GLOBAL_TABLES` list, a decision the PR explains |
| **Job** | The handler's effect on the database; that the route enqueues it with the right payload (fake queue); a failure is logged with the job's name and id |
| **Email** | The route or job enqueues `sendEmailJob` with the right recipient, subject and tags (fake queue); its text and HTML for the inputs that vary, asserted on the built strings. Never stub `sendEmail` itself: `email.test.ts` covers sending |
| **Webhook** | A correctly signed event's effect; a bad signature is a 401 and changes nothing; events it ignores still get 200. Sign test requests with `signWebhook()` (`src/lib/webhook-signature.ts`); webhooks are listed in `contract.test.ts`'s `NOT_IN_SPEC` |
| **Scheduled job** | The schedule is registered; the handler with a fixed clock |
| **Env variable** | `lib/env` test: parsed value, default, and the error for an invalid value |
| **Page or route** | Through `renderAt(path)`: loading, empty, error and success states; the guard (signed out, wrong role); search params it reads; each interaction's effect (the mutation called, navigation). Where an E2E test reaches the page, `expectAccessible(page)` once its content shows |
| **User-facing flow** (a person can now do something new) | An E2E test in `e2e/tests/`, one org per test, data set up through the API, with `expectAccessible(page)` on each new page it reaches |
| **New external origin** (a script, API, image or frame host the sites load) | Its directive in `lib/csp/src/index.ts`, with a case in its test; the E2E suite fails on any request the policy blocks |
| **Error handling** (an error caught and handled rather than thrown) | If it's unexpected, it's still reported: `trackError(err, { tags })` (`src/lib/error-tracker.ts`), asserted the way `error-tracker.test.ts` does |
| **Bug fix** | A regression test at the seam where the bug happened, **shown failing before the fix** |
| **V1 success criterion** (`docs/PROJECT.md`) | An E2E acceptance test named after it |
| **Deployed configuration** (new site, environment, or build-time variable) | The post-deploy check's expectations table, `lib/ci/src/deploy-targets.ts`; a new kind of secret or build-time check gets a fixture in `lib/ci/src/__tests__/deploy-check.test.ts` |

No test is needed for: docs, comments, formatting, dependency bumps that CI already exercises,
and pure refactors that keep behaviour (the existing tests are the proof; they must still pass
unchanged).

## Writing tests

- **Names say the behaviour:** `"returns 404 for another org's record, leaving it unchanged"`,
  not `"PATCH test 3"`. A failing name should tell you what broke without opening the file.
- **Isolation:** each test makes its own data (`createMember()` gives a fresh person and org), so
  tests never depend on order or on each other's rows. E2E: one org per test.
- **Determinism:** no `sleep`s, no real clock, no network beyond the test's own servers, no
  randomness without a seed, and nothing from the machine running them: set variables with
  `vi.stubEnv`, and give code that reads files (like `.env`) a temporary directory. A test or
  coverage floor that passes locally but not in CI depends on your machine. Wait for a condition
  (`findBy…`, `expect.poll`, Playwright's auto-waiting assertions), never for time.
- **Assert exactly:** `toEqual` on response bodies and rows over `toBeDefined`. Check the side
  effect too: the row written, the job enqueued, the other org's record untouched.
- **Helpers before copies:** API: `createMember`, `createOrg`, `bearer`, `grantStaff`
  (`src/test-helpers/auth.ts`), `createTestDb`, `createTestDbAt(tag)`, `createTestBoss`, `createFakeQueue`. Frontend:
  `renderAt(path)` (`src/test-helpers/render.tsx`), `clerk-mock.tsx`. E2E: `signIn`,
  `sessionToken`, `requireClerk` (`e2e/tests/signed-in.ts`); every spec imports `test`, `expect` and
  `expectAccessible` from `e2e/tests/fixtures.ts`, never `@playwright/test`. When a test needs setup a second
  test will also need, add it to a helper.
- **Test files mirror the code:** `routes/orders.ts` → `__tests__/orders.test.ts`.

## Proving a test

Before committing a new test, make it fail for the right reason:

1. Break the behaviour it covers (comment out the check, change the status, revert the fix).
2. Run the test: it fails, and the failure message points at the broken behaviour.
3. Restore the code: it passes.

For a bug fix, the order is the other way round: write the test, watch it fail on the current
code, then fix. Mention in the PR how each test was proven.

## Coverage

Each package's `vitest.config.ts` has coverage floors; `pnpm test:coverage` (and CI) fails below
them. **Floors only go up.** After adding tests, run `pnpm coverage:ratchet`: it raises every
floor to the current coverage (rounded down), and the result is committed with the tests.
Coverage is a net for untested code, not the goal: the required tests above matter more than the
percentage, and a test written only to touch lines proves nothing.

## Flaky tests

A test that sometimes fails is a bug, in the test or the code. **Never retry it to green.**

- CI's Playwright run retries once only to record a trace; a test that passes on the retry
  still fails the run (`failOnFlakyTests`). Vitest doesn't retry.
- Diagnose it with the `diagnosing-bugs` skill: loop it until it fails reliably, then fix the cause
  (usually shared data, a real wait, or an unawaited promise).
- If it can't be fixed now, delete it and open a plan to replace it. A skipped test is a test that
  doesn't exist, so it is not allowed on `staging` or `main` (`forbidOnly` already rejects `.only`).

## How CI holds the line

| Check | Fails when |
|---|---|
| **Tests with code** (PRs into `staging`) | A package's source changed and none of its tests did, and the PR description has no `Tests: none needed — <reason>` line (`lib/ci/src/tests-with-code.ts` says what counts as source and where each package's tests live). After editing the description, re-run the failed jobs: `gh run rerun <run id> --failed` |
| **Test** (`pnpm test:coverage`) | A test fails or coverage drops below a floor |
| `route-access.test.ts` | A route has no access rule as its first handler, or its rule changed without the table |
| `contract.test.ts` | The server and `openapi.yaml` disagree about which operations exist |
| `tenancy-schema.test.ts` | A table isn't tied to an org and isn't listed as global |
| **E2E** | A flow breaks in the browser, a page has an accessibility problem axe can see (contrast, labels, names, roles) in light or dark mode, the Content-Security-Policy blocks something, or a test is flaky. On private repos a failed run uploads the HTML report with traces (`playwright-report` artifact) |
| **Dependency audit** | A high or critical advisory affects a production dependency (`pnpm deps:audit`) |
| **Deploy check** (after each site deploys; alerts, doesn't block) | A live site is built with a missing, insecure or other environment's API address, the wrong Clerk key type, or ships a secret key; or it lacks its security headers or a CSP that allows its API. Fix the Vercel variable (or `vercel.json`) and redeploy the site |

The **Tests** section of every PR (`.github/pull_request_template.md`) lists the tests added and
how each was proven, or the one-line reason none are needed. The reason is for a reviewer to
agree with; "no time" isn't one.

## Running tests

```bash
pnpm test                          # every package's unit, API and component tests
pnpm test:coverage                 # the same, with coverage floors (what CI runs)
pnpm coverage:ratchet              # raise the floors to current coverage; commit the result
pnpm --filter @repo/api-server exec vitest run src/__tests__/example.test.ts   # one file
pnpm --filter @repo/web exec vitest    # watch mode in one package
pnpm --filter @repo/e2e e2e        # Playwright; signed-in tests need the Clerk dev keys in .env
```
