---
name: execute-plan
description: Execute a numbered plan from docs/plans end to end — status updates, one task per commit, verification, a PR into staging, and closing the plan. Use when asked to "execute/run/pick up plan NN", or to finish a plan.
---

# Execute a plan

Plans live in `docs/plans/NN-topic.md`; the board is `docs/README.md`. Work only from a plan. If the work isn't in one yet, write it first (`Status: proposal`) and have the user approve it.

## Start
1. Read `AGENTS.md`, `docs/PROJECT.md`, the board, and the whole plan, including its decisions and exit criteria.
2. Branch off an up-to-date `staging`: `git switch staging && git pull --ff-only && git switch -c <type>/plan-NN-<topic>`.
3. In the first commit, set `Status: in-progress` in the plan header **and** on the board row.

## Each task
- Work tasks in order: **one task = one commit**, using the plan's commit message when it gives one.
- Run the task's verify step plus the gates for what you touched: `pnpm lint`, `pnpm typecheck`, `pnpm knip`, `pnpm test:coverage`; `pnpm codegen` + `pnpm codegen:check` for spec changes; `pnpm db:generate` for schema changes; `pnpm --filter @repo/e2e e2e` for user-facing flows.
- If a test is meant to catch a bug, prove it: break the code, watch it fail, restore.
- If a task's premise no longer matches the code, verify that and note it in the PR instead of redoing it.

## Steps that aren't yours
Steps tagged for a person (infrastructure, provider settings, production data): don't do them. List them in the PR with exact instructions. Afterwards, verify read-only: deploy status, health endpoints, variable names (never print secret values).

## Ship
1. Push and open a PR into **`staging`**. The description says what changed, how it was verified, and what's left for a person.
2. Wait for CI. A failing check is information: read the log and fix the cause, never bypass it.
3. If `.railway/railway.ts` changed, run `railway config plan` against staging and show the user before anyone applies it.
4. After the merge, confirm the staging API deploy is healthy (`/health/ready`, and `/health` reports the new commit).

## Finish
When every exit criterion holds, **delete the plan file** in the completing PR, mark the board row `done`, and move leftovers into an open plan or a new one. Git is the archive.
