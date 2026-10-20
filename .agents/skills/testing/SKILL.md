---
name: testing
description: Decide which tests a change needs (from docs/TESTING.md's required-tests table), write them with the template's helpers, prove each one red, and audit a diff, branch or PR for missing tests. Use when writing tests, when asked "what should I test", "is this tested enough", "audit the tests", before opening a PR, or when the Tests with code check fails.
---

# Testing a change

`docs/TESTING.md` is the standard; this is how to apply it. Two modes: **write** (tests for a change you're making) and **audit** (find what a diff is missing). Both start the same way.

## 1. List what the change does

Read the diff (`git diff staging...HEAD`, or the plan task) and write down each **behaviour** it adds or changes, in the words a caller or user would use: "a member can archive an order", "archived orders drop out of the list", "a viewer can't archive". Not files, not functions. A change with no behaviour (docs, formatting, a refactor whose tests pass unchanged) needs no tests: say so and stop.

## 2. Map each behaviour to required tests

For each behaviour, take every matching row of the required-tests table in `docs/TESTING.md` and write the concrete test names, at the **lowest layer that can see the behaviour**:

| The behaviour is visible in… | Layer | File |
|---|---|---|
| A response, a row, a permission | API test | `artifacts/api-server/src/__tests__/<feature>.test.ts` |
| A job's effect or schedule | Job test | `jobs.test.ts` (or `<job>.test.ts` beside it) |
| A pure function's output | Unit test | the package's `src/__tests__/` |
| What a page shows or does | Component test | `artifacts/<app>/src/__tests__/<page>.test.tsx` |
| A person completing a flow across pages and the API | E2E | `e2e/tests/<flow>.spec.ts` |

Then the structural tests the change touches: a new route → its row in `route-access.test.ts` (and `contract.test.ts` must pass); a new table → `tenancy-schema.test.ts` (or `GLOBAL_TABLES`, explained); a data-changing migration → `migrations.test.ts`.

In **audit** mode, compare that list with the tests the diff actually adds, and report the gaps as a list of missing test names with their file. Check the tests that exist too: one that asserts `toBeDefined()` where the body is known, uses real time, shares data with another test, or mocks the database or our own module is a gap as well. Stop there unless asked to fill them.

## 3. Write them

- **Start from the nearest existing test** for the layer and copy its setup: `example.test.ts` (API, list paging, cross-org), `jobs.test.ts`, `app-page.test.tsx` (component with mocked hooks), `e2e/tests/web.spec.ts` (signed-in flow).
- **Helpers:** API: `createMember(db, { orgs, role })` gives a person, their org and `headers` (`as(org)` for another org), `createOrg`, `bearer`, `grantStaff`, `createTestDb`, `createTestDbAt(tag)`, `createTestBoss`, `createFakeQueue`. Frontend: `renderAt(path)`, `clerk.signedIn`, generated hooks mocked with `vi.mock("@repo/api-client-react", …)`. E2E: `requireClerk()`, `signIn(page, E2E_USERS.member)`, `sessionToken(page)` for API setup.
- One behaviour per test, named after it. Assert exact bodies and the side effect (the row, the enqueued job, the other org's record untouched).
- For a bug: write the test **before** the fix and see it fail on the current code.

## 4. Prove each one red

For every new test, break exactly the behaviour it covers and run that file:
```bash
pnpm --filter @repo/api-server exec vitest run src/__tests__/<file>.test.ts
pnpm --filter @repo/web exec vitest run src/__tests__/<file>.test.tsx
pnpm --filter @repo/e2e e2e tests/<file>.spec.ts
```
It must fail, **with a message pointing at that behaviour** (a crash in setup doesn't count). Restore the code and watch it pass. Note what you broke: it goes in the PR's **Tests** section. A test you can't make fail is testing nothing: fix it or delete it.

## 5. Gates and coverage

`pnpm test:coverage` (all green, floors hold), then `pnpm coverage:ratchet` and commit the raised floors with the tests. Never lower a floor, loosen a structural test's table, or skip a test to get green; if a test is wrong, fix it and say why in the commit.

## When "Tests with code" fails

It means a package's source changed and none of its tests did. Either the change has untested behaviour (go to step 1), or it genuinely needs none: then add one line to the PR description, `Tests: none needed — <reason>` (e.g. "comment and log wording only", "rename, covered by the existing example tests"), and re-run the failed jobs: `gh run rerun <run id> --failed` (the check reads the description fresh). The reason is for a reviewer to agree with.
