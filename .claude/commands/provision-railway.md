Provision a new Railway project for this monorepo's API server, with a `production` environment deploying `main` and a `staging` environment deploying `staging` (see `docs/DEPLOYMENTS.md`). Work through the steps below in order, stopping and reporting clearly if any step fails.

## Pre-flight Checks

1. Verify the `railway` CLI is installed by running `railway --version`. If the command is not found, tell the user:
   > "Railway CLI not found. Install it with: npm install -g @railway/cli"
   Then stop.

2. Verify the user is authenticated by running `railway whoami`. If the output indicates they are not logged in, tell the user:
   > "Not authenticated. Run 'railway login' first, then re-run /provision-railway."
   Then stop.

3. Resolve the GitHub repo with `gh repo view --json nameWithOwner --jq .nameWithOwner` (call it `<repo>`), and check that the `staging` branch exists: `gh api repos/<repo>/branches/staging`. If either fails, tell the user:
   > "Run /provision-github first: Railway deploys staging from the staging branch."
   Then stop.

## Project Setup

4. Ask the user: "What should the Railway project be named? (press Enter to use the git repo name as default)"
   - If they press Enter or provide no name, derive the default by running `basename $(git rev-parse --show-toplevel)` and appending `-api`.

5. Create the project. This links the current directory to its default `production` environment:
   ```
   railway init --name <project-name> --json
   ```

6. Add PostgreSQL:
   ```
   railway add --database postgres --json
   ```
   Note the database service name in the output (normally `Postgres`); wait a few seconds for it to provision.

7. Add the API service from the GitHub repo, deploying `main`, with `DATABASE_URL` referencing the database:
   ```
   railway add --service api --repo <repo> --branch main \
     --variables 'DATABASE_URL=${{Postgres.DATABASE_URL}}' \
     --variables NODE_ENV=production --variables PORT=3000 --json
   ```
   Keep the single quotes so the shell doesn't expand `${{…}}`; Railway resolves the reference. Build, start, pre-deploy (migrations) and health-check settings come from `railway.toml`. If this fails with a GitHub access error, tell the user to install the Railway GitHub app on the repo (Railway dashboard → Account → GitHub) and re-run from this step.

8. Generate the production domain and record it as `<prod-api-url>`:
   ```
   railway domain --service api --port 3000 --json
   ```

## Staging Environment

9. Create `staging` as a copy of `production` (its own Postgres and API service), with the API deploying the `staging` branch:
   ```
   railway environment new staging --duplicate production \
     --service-config api source.branch staging --json
   ```

10. Generate the staging domain and record it as `<staging-api-url>`:
    ```
    railway domain --service api --environment staging --port 3000 --json
    ```

11. Confirm both environments: `railway environment config --environment staging --json` shows the api service's `source.branch` as `staging`; the same for `production` shows `main`.

## Dashboard Settings (manual)

12. Tell the user to do these in the Railway dashboard, **for the api service in both environments** (switch environment at the top of the project):
    - **Settings → Source → Wait for CI: on.** Railway then holds each deploy until the commit's GitHub Actions finish, and skips it if CI failed.
    - **Settings → Build → Root Directory: blank**, and **Settings → Deploy → Start Command: blank** (see README for why).
    Wait for them to confirm.

## Summary

13. Print a success summary in this format:
    ```
    ✓ Railway project created: <project-name>
    ✓ production: Postgres + api (deploys main)    → <prod-api-url>
    ✓ staging:    Postgres + api (deploys staging) → <staging-api-url>
    ✓ Wait for CI on in both environments

    Your local .env keeps pointing at local Postgres (docker compose); the
    Railway databases are only reachable from Railway.

    Next steps:
    - Run /provision-vercel. It needs both API URLs above and sets
      CORS_ORIGIN on Railway once the Vercel URLs exist.
    ```
