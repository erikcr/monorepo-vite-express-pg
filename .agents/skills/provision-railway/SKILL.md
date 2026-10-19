---
name: provision-railway
description: Create the Railway project and apply .railway/railway.ts (Infrastructure as Code) to production and staging. Use once per new project, after provision-github.
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

   Then run `railway config plan` again. Railway doesn't save Wait for CI (`source.checkSuites`) on a service it is creating, so the plan typically still shows `source.checkSuites (null → true)`. Run `railway config apply --yes` once more, and repeat `railway config plan` until it says `Your Railway configuration is already up to date.` Without this, deploys don't wait for CI.

9. Generate the production domain and record it as `<prod-api-url>`:
   ```
   railway domain --service api --json
   ```

## Staging

10. Create an empty `staging` environment and switch the link to it:
    ```
    railway environment new staging --json
    railway environment staging
    ```

11. Preview and apply the same file there. The file deploys `staging` in every environment except `production`:
    ```
    railway config plan
    railway config apply --yes
    ```
    Expect the same two creations as in production. As there, run `railway config plan` again, and apply once more if it still shows `source.checkSuites`, until the plan is up to date.

12. Generate the staging domain and record it as `<staging-api-url>`:
    ```
    railway domain --service api --json
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

## Summary

15. Tell the user to commit the `REPO` change in `.railway/railway.ts` on a feature branch and open a PR into `staging`.

16. Print a success summary in this format:
    ```
    ✓ Railway project created: <project-name>
    ✓ production: Postgres + api (deploys main)    → <prod-api-url>
    ✓ staging:    Postgres + api (deploys staging) → <staging-api-url>
    ✓ Clerk secret keys set (staging: development instance, production: production instance)
    ✓ Settings come from .railway/railway.ts (change the file, then `railway config apply`)

    Your local .env keeps pointing at local Postgres (docker compose); the
    Railway databases are only reachable from Railway.

    Next steps:
    - Run /provision-vercel. It needs both API URLs above and sets
      CORS_ORIGIN on Railway once the Vercel URLs exist.
    ```
