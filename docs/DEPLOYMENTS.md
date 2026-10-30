# Deployments

How a change gets from a branch to production, what gates each step, and what to do when one fails.

## Setting up a new project

Run these once, in order, after creating the GitHub repo from this template:

0. Create a [Clerk](https://dashboard.clerk.com) application: its **development** instance serves
   local work, staging, PR previews and E2E; its **production** instance (needs your domain) serves
   production. Keep both instances' keys at hand.
1. `pnpm install` — also points git at `.githooks/`. Then `cp .env.example .env`, put the
   development keys in it, and run `pnpm ports assign` to give this project its own local ports, so
   it never shares them with another project on the machine (README, "Several projects at once").
2. `/provision-github` — creates `staging` and the rulesets that protect `staging` and `main`, and
   stores the development instance's keys as the E2E job's secrets.
3. `/provision-railway` — API + Postgres in `production` (deploys `main`) and `staging` (deploys
   `staging`), with each environment's Clerk secret key and webhook, scheduled backups, the Sentry
   DSN, an uptime monitor and email (Resend).
4. `/provision-vercel` — web + admin, production on `main`, staging on the `staging` branch, with the
   matching Clerk publishable keys and the deploy hooks that release them after the API; sets
   `CORS_ORIGIN` on Railway.
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
- **Waiting on someone? Ship it switched off.** A feature that needs sign-off goes to production behind a switch (an environment variable such as `FEATURE_X_ENABLED`), and turning it on is the release. On the API that's a Railway variable (setting it redeploys); a site's `VITE_*` variable is fixed per build, so flipping it means redeploying the site (**Deploy sites** by hand). Parked on `staging`, it would block every promotion after it.
- **Big features ship in phases**, each backward compatible on its own (rules below), so each can be promoted without the next.
- **Hotfixes take the same path, quickly:** a branch off `staging`, a PR into `staging`, then an immediate promotion. That only stays fast if `staging` has nothing else waiting.
- **No third branch** (`develop`) and no merging one branch into both `staging` and `main`: the first adds a promotion step with the same batching one level up, the second puts on `main` a combination `staging` never ran.
- **Promotions use merge commits, never squash**, so `main` keeps `staging`'s commits.

## Infrastructure changes

`.railway/railway.ts` defines the Railway services, database, build/deploy settings and variables.
Railway doesn't read it on deploy: a change takes effect when someone applies it, per environment,
in the same order as code:

1. Change the file in a feature PR into `staging`; the PR shows the diff.
2. After merging: `railway environment staging && railway config plan`, check it, then `railway config apply`.
3. After the promotion PR merges into `main`: the same against `production`.

Apply before merging code that depends on the change (a new variable, say), so the deploy that
needs it finds it. `plan` is always safe; `apply` marks anything destructive and asks first.

## What gates each step

| # | Step | Where | Gate |
|---|------|-------|------|
| 0 | Commit / push | Local | `.githooks/` refuse commits on, and pushes to, `main` and `staging`; Biome checks staged files |
| 1 | Merge | GitHub | Rulesets on `staging` and `main` require a PR and the **CI passed** check, no bypass (admins included). **Promotion source** fails any PR into `main` that doesn't come from `staging` |
| 2 | CI on the merged commit | GitHub Actions | Runs again on the push to `staging`/`main` |
| 3 | Migrations | Railway pre-deploy (`node dist/migrate.js`) | Railway **Wait for CI** holds the deploy until the commit's workflows finish and skips it if one failed |
| 4 | API | Railway | Starts only if migrations succeeded; traffic switches once `/health/ready` returns 200 (the database answers) |
| 5 | Sites | `deploy-sites.yml`, then Vercel | When Railway reports the API deploy successful, the workflow waits until `/health` reports the deployed commit (`sha`), then triggers each site's deploy hook. Vercel's automatic deploys of `main` and `staging` are off (`git.deploymentEnabled` in each `vercel.json`) |
| 6 | Deploy check | `deploy-check.yml`, after each site deploys | Reads the live site's JavaScript: the environment's API address over https, the right Clerk key type, no secret keys (expectations in `lib/ci/src/deploy-targets.ts`); and its page: the security headers from `vercel.json` and a Content-Security-Policy that allows the API. Alerts; the site is already live |

The same order runs on `staging` (every merged PR) and `main` (every promotion): a site never
goes live before the API it was built for, and never if the migrations or the API failed. Every
commit deploys the API, even a frontend-only one (no `watchPatterns`), so the sites always have an
API deploy to follow. PR previews still deploy straight away; they have no API (below).

**CI passed** needs every other job and runs even when one fails, because GitHub treats a *skipped* required check as passing. It's the only check the rulesets require; add new jobs to its `needs`.

## Rules this depends on

The API goes live a minute or two before the sites, and migrations run while the previous API is still serving. So:

- **Migrations are additive.** Expand first (add the column, table or index), deploy, and contract (drop or rename) in a later release. Never drop or rename something the running API reads in the same release.
- **The API keeps working for the previous frontend** for one release. Add fields and endpoints; remove them a release after the frontend stops using them.

## Watching production

- **Errors:** with `SENTRY_DSN` set on the API (`/provision-railway`), Sentry receives the API's
  unexpected errors (500s, failed jobs, crashes) and the sites' crashes, which the browser sends to
  `POST /api/client-errors`. Each event carries the environment, the commit, and a request id or
  job id to find in the logs; never request headers, bodies or query strings
  (`src/lib/error-tracker.ts`). Without a DSN they're only in Railway's logs. An error handled in
  code (caught, not rethrown) that still shouldn't happen goes to `trackError(err, { tags })`.
  Browser stacks point into minified bundles; read them with the build's source next to you.
- **Uptime:** a monitor on the production API's `/health/ready` (Sentry or any uptime service)
  emails when it stops answering 200. It answers 503 when the database is unreachable.
- **Dependency advisories:** CI's **Dependency audit** job fails on a high or critical advisory in
  a production dependency; GitHub's Dependabot alerts list every advisory, dev dependencies included.

## Granting access by hand

The first staff member, and any fix-up of someone's access, goes through the API's scripts. The person must have signed in once.

```bash
pnpm staff:grant <email> <staff_admin|staff_support>
pnpm staff:revoke <email>
pnpm org:grant <email> <org id> <org_admin|org_member>
```

Locally they use your `.env`. On a deployed environment, run them in the API's container: `railway ssh --service api --environment <env> -- node dist/scripts/<name>.js <args>` (`staff-grant`, `staff-revoke`, `org-grant`). This changes production data, so an agent needs the user's go-ahead first.

## Backups and restoring the database

Railway takes volume backups of each Postgres on a schedule (`/provision-railway` sets production
to daily, kept 6 days, and weekly, kept a month). IaC can't declare schedules yet, so check them
with `railway postgres pitr schedule list --service Postgres --environment production`.

- **Before a risky migration or a data fix**, take one by hand:
  `railway postgres pitr backup create --service Postgres --environment production --name before-<change>`.
- **To restore** (a bad migration, deleted rows): a restore replaces the whole database with the
  backup, so everything written since is lost.
  1. Take a backup of the current state first (above), so the restore can itself be undone.
  2. `railway postgres pitr backup list --service Postgres --environment production` and pick one.
  3. `railway postgres pitr backup restore <id> --service Postgres --environment production`.
  4. Check `<api>/health/ready` answers 200, and that the data is back.
  5. The schema is the backup's: if migrations ran after it, redeploy the API (its pre-deploy step
     runs them again).
- **Losing less than a day:** Railway's point-in-time recovery (`railway postgres pitr enable`)
  restores to any moment, into a new service. Turn it on once production holds data that matters.
- Restores are destructive and need the user's go-ahead (`AGENTS.md`); practise one on staging
  before you need it in production.

## When a step fails

| Fails at | What's live afterwards | What to do |
|----------|------------------------|------------|
| Hooks | Nothing changes | Fix locally; `--no-verify` exists but bypasses the checks, so don't |
| Dependency audit | Nothing deploys, on any branch, until it passes | Update the package (`pnpm update <name>`, or an `overrides` entry in `pnpm-workspace.yaml` for a transitive one). If no fixed version exists and the advisory doesn't apply to how you use the package, waive it: append `--ignore <GHSA id>` to the `deps:audit` script in `package.json`, with the reason in the commit message |
| CI on a PR | Nothing changes | Fix the PR |
| CI on the merged commit | Nothing deploys (Wait for CI skips it) | Fix forward with a new PR |
| Migration | Previous API keeps serving | Read the pre-deploy log; fix the migration in a new PR (migrations only go forward) |
| API health check | Previous API keeps serving; no site changes | Read the deploy log |
| Deploy sites | The new API is live; the sites keep their previous build | Read the run. If `/health` serves the commit now, re-run it. If there's no run (Railway never reported success, below), run **Deploy sites** by hand (Actions → Deploy sites → Run workflow, on the branch) |
| A site's build | That site keeps its previous build, against an API that still supports it | Fix forward |
| Deploy check | Everything is live, but a site was built or served wrong | The failed run names the site and problem (never a key's value). Fix the Vercel variable or `vercel.json`, then redeploy that site (run **Deploy sites** by hand). A secret key in a bundle is public: rotate it |
| Deploy check never runs (only skipped runs) | The sites deployed, unchecked | The Vercel project doesn't report deployments to GitHub: enable `gitProviderOptions.createDeployments` (`provision-vercel` step 5), then run **Deploy sites** by hand |

**Rollback:** Railway's rollback for the API, Vercel's instant rollback for a site. A database can't be rolled back by redeploying, which is why migrations stay additive.

## Things that are not obvious

- **Wait for CI needs CI to run on push** to the deployed branch (it does: `ci.yml` triggers on pushes to `main` and `staging`), and never cancels those runs, because a cancelled run can block a deploy.
- **Deploy sites reacts to Railway instead of waiting for it.** Wait for CI waits for *every* workflow on the commit, so a workflow that waited for the API deploy would deadlock with it.
- **Deploy sites only deploys the branch's latest commit.** A deploy hook builds the branch head, so if the branch has moved on, the run stops and leaves the release to the newer commit's API deploy. If that newer commit fails CI, nothing deploys until a commit passes.
- **Railway doesn't always report a deploy to GitHub.** If the deploy shows SUCCESS in Railway and `/health` serves the commit but no **Deploy sites** run started, run it by hand (above). It still checks the API first.
- **The deploy hooks are secrets** (`VERCEL_HOOK_{WEB,ADMIN}_{PRODUCTION,STAGING}`), alongside the repository variables `API_URL_PRODUCTION` and `API_URL_STAGING`. Anyone with a hook URL can trigger a deploy of that branch.
- **Removing a setting from `.railway/railway.ts` doesn't clear it on the service**: the plan shows `→ null` and apply leaves the old value. To clear one, apply its empty value once (`watchPatterns: []`), then remove the line; Railway stores the empty value as unset, so keeping it shows a `null → []` change on every plan.
- **Railway settings live in `.railway/railway.ts`, not the dashboard.** A dashboard edit lasts only until the next `railway config apply`. Vercel's build settings stay blank so `vercel.json` controls them.
- **`CORS_ORIGIN` also decides whose sign-ins the API accepts**: Clerk session tokens must come
  from one of those origins (`authorizedParties`). Set it in production; until it is, the API
  logs a warning and doesn't check the origin.
- **Production and staging use different Clerk instances**, so production users never mix with
  test accounts. A user who signs up in staging doesn't exist in production.
- **PR previews on Vercel have no API.** Only the `staging` branch gets `VITE_API_URL`, because `CORS_ORIGIN` lists exact origins and preview URLs change per PR.
- **Rulesets on private repos need a paid GitHub plan.** Without one, the hooks and the Promotion source job still apply, but GitHub doesn't enforce the PR requirement.
- **The sites' Content-Security-Policy is built in, not configured.** `lib/csp` adds it to each
  site's `index.html` at build time, from the same `VITE_API_URL` and Clerk key the site uses, so
  it follows the environment by itself. A new script, API, image or frame host goes in
  `lib/csp/src/index.ts`; until then the browser blocks it (and E2E fails). Headers a `<meta>` tag
  can't carry (`frame-ancestors`, HSTS, …) are in each `vercel.json`.
- **security.txt comes from `VITE_SECURITY_CONTACT`.** Set on a Vercel environment (a `mailto:` or
  `https:` URL), both sites' builds serve it at `/.well-known/security.txt` with an `Expires` 360
  days out; every deploy renews it, so a site not deployed for a year serves an expired one.
  Unset, there is no security.txt.
