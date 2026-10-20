---
name: execute-plan
description: Execute a numbered plan from docs/plans end to end — status updates, one task per commit, verification, a PR into staging, and closing the plan. Use when asked to "execute/run/pick up plan NN", or to finish a plan.
---

# Execute a plan

Plans live in `docs/plans/NN-topic.md`; the board is `docs/README.md`. Work only from a plan. If the work isn't in one yet, write it first (`Status: proposal`) and have the user approve it.

## Start
1. Read `AGENTS.md`, `docs/PROJECT.md`, `docs/TESTING.md`, the board, and the whole plan, including its decisions and exit criteria.
   Every task needs a **Tests:** line. If one is missing or thinner than the required-tests table in `TESTING.md` asks for, add it to the plan and show the user before starting.
2. Branch off an up-to-date `staging`: `git switch staging && git pull --ff-only && git switch -c <type>/plan-NN-<topic>`.
3. In the first commit, set `Status: in-progress` in the plan header **and** on the board row.

## Each task
- Work tasks in order: **one task = one commit**, using the plan's commit message when it gives one.
- **The task's tests are part of the task:** write them alongside the code (the `new-feature` skill says which layer owns which), in the same commit. A task is not done while a test on its **Tests:** line is missing.
- **Prove each new test:** break the behaviour, watch the test fail for the right reason, restore. For a bug, the test fails before the fix.
- Run the task's verify step plus the gates for what you touched: `pnpm lint`, `pnpm typecheck`, `pnpm knip`, `pnpm test:coverage`; `pnpm codegen` + `pnpm codegen:check` for spec changes; `pnpm db:generate` for schema changes; `pnpm --filter @repo/e2e e2e` for user-facing flows. After adding tests, `pnpm coverage:ratchet` and commit the raised floors.
- Never weaken a test, a structural test's table or a coverage floor to get a task through. If a test is wrong, say why in the commit.
- If a task's premise no longer matches the code, verify that and note it in the PR instead of redoing it.

## Steps that aren't yours
Steps tagged for a person (infrastructure, provider settings, production data): don't do them. List them in the PR with exact instructions. Afterwards, verify read-only: deploy status, health endpoints, variable names (never print secret values).

## Ship
1. Push and open a PR into **`staging`**. The description follows the PR template: what changed, the **Tests** section (each test added and how it was proven), and what's left for a person.
2. Wait for CI. A failing check is information: read the log and fix the cause, never bypass it.
3. If `.railway/railway.ts` changed, run `railway config plan` against staging and show the user before anyone applies it.
4. After the merge, confirm the staging API deploy is healthy (`/health/ready`, and `/health` reports the new commit).

## Finish
When every exit criterion holds, each backed by a passing test or check, **delete the plan file** in the completing PR, mark the board row `done`, and move leftovers into an open plan or a new one. Git is the archive.
