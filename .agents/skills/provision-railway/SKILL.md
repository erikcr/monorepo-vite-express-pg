---
name: provision-railway
description: Create the Railway project and apply .railway/railway.ts (Infrastructure as Code) to production and staging, with Clerk keys and webhook, database backups, the Sentry DSN, an uptime monitor and email (Resend). Use once per new project, after provision-github.
---

Provision a new Railway project for this monorepo's API server from `.railway/railway.ts` (Railway Infrastructure as Code): a `production` environment deploying `main` and a `staging` environment deploying `staging`, each with its own Postgres (see `docs/DEPLOYMENTS.md`). Work through the steps below in order, stopping and reporting clearly if any step fails.

## Pre-flight Checks

1. Verify the `railway` CLI is installed and recent enough for Infrastructure as Code by running `railway --version`. If the command is not found, or the version is below 5.42.1, tell the user:
   > "Railway CLI 5.42.1 or newer is required. Install or upgrade it with: npm install -g @railway/cli"
   Then stop.

2. Verify the user is authenticated by running `railway whoami`. If the output indicates they are not logged in, tell the user:
   > "Not authenticated. Run 'railway login' first, then re-run /provision-railway."
   Then stop.

3. Resolve the GitHub repo with `gh repo view --json nameWithOwner --jq .nameWithOwner` (call it `<repo>`), and check that the `staging` branch exists: `gh api repos/<repo>/branches/staging`. If either fails, tell the user:
   > "Run /provision-github first: Railway deploys staging from the staging branch."
   Then stop.

4. Point the IaC file at this repo: in `.railway/railway.ts`, set `const REPO = "<repo>";`. (The template ships with its own repo name there.)

## Project Setup

5. Ask the user: "What should the Railway project be named? (press Enter to use the git repo name as default)"
   - If they press Enter or provide no name, derive the default by running `basename $(git rev-parse --show-toplevel)` and appending `-api`.

6. Create the project. This links the current directory to its default `production` environment:
   ```
   railway init --name <project-name> --json
   ```

## Production

7. Preview what the file will create:
   ```
   railway config plan
   ```
   Expect `Create database Postgres` and `Create service api`, and nothing destructive. If the plan shows anything else, stop and show it to the user.

8. Apply it:
   ```
   railway config apply --yes
   ```
   This creates Postgres and the `api` service deploying `main`, with the build, migrations, health check, draining time, Wait for CI and variables from the file. If it fails with a GitHub access error, tell the user to install the Railway GitHub app on the repo (Railway dashboard → Account → GitHub) and re-run from step 7.

   If your permissions don't let you run `apply`, give the user each `apply` as a single command to
   run (`! railway config apply --yes --environment <env>`), one at a time, and check the plan
   yourself after each: chained commands hide which step failed.

   Then run `railway config plan` again. Railway doesn't save Wait for CI (`source.checkSuites`) on a service it is creating, so the plan typically still shows `source.checkSuites (null → true)`. Run `railway config apply --yes` once more, and repeat `railway config plan` until it says `Your Railway configuration is already up to date.` Without this, deploys don't wait for CI.

9. Generate the production domain and record it as `<prod-api-url>`:
   ```
   railway domain --service api --json
   ```

## Staging

10. Create an empty `staging` environment (this also switches the link to it, so the commands below
    name their environment explicitly):
    ```
    railway environment new staging --json
    ```

11. Preview and apply the same file there. The file deploys `staging` in every environment except `production`:
    ```
    railway config plan --environment staging
    railway config apply --yes --environment staging
    ```
    Expect the same two creations as in production. As there, run `railway config plan --environment staging` again, and apply once more if it still shows `source.checkSuites`, until the plan is up to date.

12. Generate the staging domain and record it as `<staging-api-url>`:
    ```
    railway domain --service api --environment staging --json
    ```

13. Switch the link back to production: `railway environment production`.

## Clerk

14. Ask the user for two Clerk secret keys (dashboard.clerk.com → the application → API keys):
    > "Paste the Clerk secret key of your **development** instance (sk_test_…) for staging, and of your **production** instance (sk_live_…) for production. Create the production instance first if needed (Clerk asks for your domain)."

    Check the prefixes (`sk_test_` for staging, `sk_live_` for production) before using them, and never print the values back. Set them (each redeploys that environment's API):
    ```
    railway variable set --service api --environment staging CLERK_SECRET_KEY=<sk_test_…>
    railway variable set --service api --environment production CLERK_SECRET_KEY=<sk_live_…>
    ```
    `.railway/railway.ts` declares the variable with `preserve()`, so `railway config apply` keeps these values. Until a key is set, the API answers 401 to everything that needs a session. If the user has no production instance yet, set only staging and list production as a follow-up.

## Backups

15. Schedule backups of each database (daily kept 6 days, weekly kept a month; the restore runbook is in `docs/DEPLOYMENTS.md`). Railway's IaC can't declare these yet, so they're set with the CLI:
    ```
    railway postgres pitr schedule set --daily --weekly --service Postgres --environment production
    railway postgres pitr schedule set --daily --service Postgres --environment staging
    railway postgres pitr schedule list --service Postgres --environment production
    ```
    The list shows the schedules. If Railway refuses (for example, the account's plan doesn't include backups), tell the user and list it as a follow-up: without them, a bad migration or a deleted row can't be undone.

## Error tracking and uptime

16. Ask the user whether to set up Sentry now (free Developer plan: one user, a monthly error quota):
    > "Errors are only logged until a Sentry DSN is set. Create a Node.js project at sentry.io (one project covers the API, its jobs and both sites' crash reports) and paste its DSN, or say 'later'."

    If they paste one, check it looks like `https://<key>@<host>/<project id>` and set it in both environments (each redeploys its API; Sentry tags every event with the environment and commit):
    ```
    railway variable set --service api --environment staging SENTRY_DSN=<dsn>
    railway variable set --service api --environment production SENTRY_DSN=<dsn>
    ```
    `.railway/railway.ts` declares it with `preserve()`, like the Clerk key.

17. Ask the user to add an **uptime monitor** on `<prod-api-url>/health/ready` (in Sentry: Alerts → Create alert → Uptime monitor; or any uptime service), alerting them by email. It answers 503 when the database is unreachable, so the monitor catches both a down API and a down database. Nothing else tells anyone the API is down.

## Email and the Clerk webhook

18. Ask the user whether to set up email now:
    > "Emails are only logged until a Resend API key is set. Create one at resend.com (API keys → sending access), verify your sending domain there (Domains), and paste the key and the sender (e.g. `App <hello@yourdomain.com>`), or say 'later'."

    Check the key starts with `re_` and never print it back. One key can serve both environments: every email names the environment that sent it, and each API ignores the other's events. Set both variables in each environment:
    ```
    railway variable set --service api --environment staging RESEND_API_KEY=<re_…> 'EMAIL_FROM=<sender>'
    railway variable set --service api --environment production RESEND_API_KEY=<re_…> 'EMAIL_FROM=<sender>'
    ```
    Then, per environment, ask the user to add a webhook in Resend (Webhooks → Add endpoint) at `<api-url>/api/webhooks/resend` for the `email.bounced`, `email.complained`, `email.failed` and `email.delivery_delayed` events, and paste its signing secret (`whsec_…`) into `RESEND_WEBHOOK_SECRET` the same way. Production refuses unsigned webhook events, so without it the API never hears about undelivered emails.

19. Ask the user to add a webhook in each Clerk instance (dashboard.clerk.com → Webhooks → Add endpoint), subscribed to `user.updated` and `user.deleted`: the development instance's at `<staging-api-url>/api/webhooks/clerk`, the production instance's at `<prod-api-url>/api/webhooks/clerk`. Each one's signing secret (`whsec_…`) goes into `CLERK_WEBHOOK_SECRET` in its environment:
    ```
    railway variable set --service api --environment staging CLERK_WEBHOOK_SECRET=<whsec_…>
    railway variable set --service api --environment production CLERK_WEBHOOK_SECRET=<whsec_…>
    ```
    When someone deletes their Clerk account, the API then deletes their user and org grants, and disables any staff grant. Until it's set, the webhook refuses every event and deleted accounts' rows stay (they grant nothing, since the account can't sign in).

## Summary

20. Tell the user to commit the `REPO` change in `.railway/railway.ts` on a feature branch and open a PR into `staging`.

21. Print a success summary in this format:
    ```
    ✓ Railway project created: <project-name>
    ✓ production: Postgres + api (deploys main)    → <prod-api-url>
    ✓ staging:    Postgres + api (deploys staging) → <staging-api-url>
    ✓ Clerk secret keys set (staging: development instance, production: production instance)
    ✓ Backups: production daily + weekly, staging daily (or: follow-up)
    ✓ Sentry DSN set in both environments (or: follow-up); uptime monitor on /health/ready (or: follow-up)
    ✓ Email: Resend key, sender and webhook secret in both environments (or: follow-up)
    ✓ Clerk webhook (user.updated, user.deleted) and CLERK_WEBHOOK_SECRET in both environments (or: follow-up)
    ✓ Settings come from .railway/railway.ts (change the file, then `railway config apply`)

    Your local .env keeps pointing at local Postgres (docker compose); the
    Railway databases are only reachable from Railway.

    Next steps:
    - Run /provision-vercel. It needs both API URLs above and sets
      CORS_ORIGIN on Railway once the Vercel URLs exist.
    ```
