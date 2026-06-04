Provision a new Railway project for this monorepo's API server. Work through the steps below in order, stopping and reporting clearly if any step fails.

## Pre-flight Checks

1. Verify the `railway` CLI is installed by running `railway --version`. If the command is not found, tell the user:
   > "Railway CLI not found. Install it with: npm install -g @railway/cli"
   Then stop.

2. Verify the user is authenticated by running `railway whoami`. If the output indicates they are not logged in, tell the user:
   > "Not authenticated. Run 'railway login' first, then re-run /provision-railway."
   Then stop.

## Project Setup

3. Ask the user: "What should the Railway project be named? (press Enter to use the git repo name as default)"
   - If they press Enter or provide no name, derive the default by running `basename $(git rev-parse --show-toplevel)` and appending `-api`.

4. Create the project:
   ```
   railway init --name <project-name>
   ```

5. Add a PostgreSQL database plugin:
   ```
   railway add --plugin postgresql
   ```
   Wait a moment after this command — the plugin takes a few seconds to provision.

## Environment Variables

6. Read the auto-generated variables by running:
   ```
   railway variables --json
   ```
   Extract `DATABASE_URL` from the JSON output.

7. Set the remaining required variables:
   ```
   railway variables set PORT=3000 NODE_ENV=production
   ```

8. Write the DATABASE_URL to the local `.env` file:
   - If `.env` exists and already contains a `DATABASE_URL=` line, replace that line.
   - If `.env` exists but has no `DATABASE_URL` line, append it.
   - If `.env` does not exist, create it with the line `DATABASE_URL=<value>`.

## Summary

9. Print a success summary in this format:
   ```
   ✓ Railway project created: <project-name>
   ✓ PostgreSQL plugin attached
   ✓ DATABASE_URL written to .env
   ✓ PORT=3000 and NODE_ENV=production set

   Next steps:
   - Link your GitHub repo in the Railway dashboard for automatic deploys, OR
   - Run 'railway up' from the repo root to deploy manually.
   - Run /provision-vercel to set up the frontend apps.
   ```
