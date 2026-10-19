# Deployments

How a change gets from a branch to production, what gates each step, and what to do when one fails.

## Setting up a new project

Run these once, in order, after creating the GitHub repo from this template:

1. `pnpm install` — also points git at `.githooks/`.
2. `/provision-github` — creates `staging` and the rulesets that protect `staging` and `main`.
3. `/provision-railway` — API + Postgres in `production` (deploys `main`) and `staging` (deploys `staging`).
4. `/provision-vercel` — web + admin, production on `main`, staging on the `staging` branch; sets `CORS_ORIGIN` on Railway.
5. `/new-project` — defines the project scope on a branch; its PR into `staging` is the first one through the process.
6. Install the [Renovate GitHub app](https://github.com/apps/renovate) on the repo — `renovate.json` opens weekly dependency PRs into `staging`.

## How changes reach production

Two long-lived branches:

```
feature branch ──PR (squash)──▶ staging ──check on staging──▶ promotion PR (merge commit) ──▶ main
```

| Branch | Deploys to | Receives |
|--------|-----------|----------|
| `staging` | staging API + staging sites | Squash-merged feature PRs |
| `main` | production | Promotion PRs from `staging`, merged with a merge commit |

- **`staging` holds release candidates, not parked work.** Merge only what you'd ship as soon as it checks out on staging. Each promotion carries one or two features, and its PR lists exactly what it carries. Small promotions are quick to verify and quick to roll back.
- **Waiting on someone? Ship it switched off.** A feature that needs sign-off goes to production behind a switch (an environment variable such as `FEATURE_X_ENABLED`), and turning it on is the release. Parked on `staging`, it would block every promotion after it.
- **Big features ship in phases**, each backward compatible on its own (rules below), so each can be promoted without the next.
- **Hotfixes take the same path, quickly:** a branch off `staging`, a PR into `staging`, then an immediate promotion. That only stays fast if `staging` has nothing else waiting.
- **No third branch** (`develop`) and no merging one branch into both `staging` and `main`: the first adds a promotion step with the same batching one level up, the second puts on `main` a combination `staging` never ran.
- **Promotions use merge commits, never squash**, so `main` keeps `staging`'s commits.

## What gates each step

| # | Step | Where | Gate |
|---|------|-------|------|
| 0 | Commit / push | Local | `.githooks/` refuse commits on, and pushes to, `main` and `staging`; Biome checks staged files |
| 1 | Merge | GitHub | Rulesets on `staging` and `main` require a PR and the **CI passed** check, no bypass (admins included). **Promotion source** fails any PR into `main` that doesn't come from `staging` |
| 2 | CI on the merged commit | GitHub Actions | Runs again on the push to `staging`/`main` |
| 3 | Migrations | Railway pre-deploy (`node dist/migrate.js`) | Railway **Wait for CI** holds the deploy until the commit's workflows finish and skips it if one failed |
| 4 | API | Railway | Starts only if migrations succeeded; traffic switches once the health check passes |
| 5 | Sites | Vercel | Build on the same push, independently of the API (see "Rules" below) |

**CI passed** needs every other job and runs even when one fails, because GitHub treats a *skipped* required check as passing. It's the only check the rulesets require; add new jobs to its `needs`.

## Rules this depends on

The API and the sites deploy independently, and migrations run while the previous API is still serving. So:

- **Migrations are additive.** Expand first (add the column, table or index), deploy, and contract (drop or rename) in a later release. Never drop or rename something the running API reads in the same release.
- **The API keeps working for the previous frontend** for one release. Add fields and endpoints; remove them a release after the frontend stops using them.

## When a step fails

| Fails at | What's live afterwards | What to do |
|----------|------------------------|------------|
| Hooks | Nothing changes | Fix locally; `--no-verify` exists but bypasses the checks, so don't |
| CI on a PR | Nothing changes | Fix the PR |
| CI on the merged commit | Nothing deploys (Wait for CI skips it) | Fix forward with a new PR |
| Migration | Previous API keeps serving | Read the pre-deploy log; fix the migration in a new PR (migrations only go forward) |
| API health check | Previous API keeps serving | Read the deploy log |
| A site's build | That site keeps its previous build | Fix forward |

**Rollback:** Railway's rollback for the API, Vercel's instant rollback for a site. A database can't be rolled back by redeploying, which is why migrations stay additive.

## Things that are not obvious

- **Wait for CI needs CI to run on push** to the deployed branch (it does: `ci.yml` triggers on pushes to `main` and `staging`), and never cancels those runs, because a cancelled run can block a deploy.
- **Railway skips deploys whose changes miss `watchPatterns`** in `railway.toml` (frontend-only commits don't redeploy the API). A change to `watchPatterns` only takes effect after one deploy of a commit that contains it; use **Deploy Latest Commit** (Cmd+K) to break the loop.
- **Dashboard settings override `railway.toml` and `vercel.json`.** Keep Railway's Root Directory and Start Command blank, and Vercel's build settings blank.
- **PR previews on Vercel have no API.** Only the `staging` branch gets `VITE_API_URL`, because `CORS_ORIGIN` lists exact origins and preview URLs change per PR.
- **Rulesets on private repos need a paid GitHub plan.** Without one, the hooks and the Promotion source job still apply, but GitHub doesn't enforce the PR requirement.
