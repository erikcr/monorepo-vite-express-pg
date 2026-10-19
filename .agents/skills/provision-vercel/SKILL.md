---
name: provision-vercel
description: Create the web and admin Vercel projects with per-environment API URLs, then set CORS_ORIGIN on Railway. Use once per new project, after provision-railway.
---

Provision two Vercel projects for this monorepo — one for `artifacts/web` and one for `artifacts/admin` — each with production deploying `main` against the production API and the `staging` branch deploying against the staging API (see `docs/DEPLOYMENTS.md`). Work through the steps below in order, stopping and reporting clearly if any step fails. Run `/provision-railway` first.

## Pre-flight Checks

1. Verify the `vercel` CLI is installed by running `vercel --version`. If not found, tell the user:
   > "Vercel CLI not found. Install it with: npm install -g vercel"
   Then stop.

2. Verify the user is authenticated by running `vercel whoami`. If not logged in, tell the user:
   > "Not authenticated. Run 'vercel login' first, then re-run /provision-vercel."
   Then stop.

3. Get both Railway API URLs. If `/provision-railway` ran earlier in this conversation, reuse `<prod-api-url>` and `<staging-api-url>` from its summary; otherwise ask:
   > "What are your Railway API URLs for production and staging? (Railway dashboard → api service → Settings → Networking, in each environment)"
   Wait for their input.

4. Derive the base project name by running `basename $(git rev-parse --show-toplevel)`.

## Provision Each App

Do steps 5–9 for `web`, then repeat them for `admin`. `<app>` is `web` or `admin`.

5. Create and link the project from the app directory:
   ```
   vercel project add <base-name>-<app>
   cd artifacts/<app> && vercel link --yes --project <base-name>-<app>
   ```

6. Connect the GitHub repo so pushes deploy: `vercel git connect` (from `artifacts/<app>`; it uses the repo's `origin` remote).

7. Set `VITE_API_URL` per environment. Vite bakes it into the bundle at build time:
   ```
   vercel env add VITE_API_URL production --value <prod-api-url> --yes
   vercel env add VITE_API_URL preview staging --value <staging-api-url> --yes
   ```
   The second is scoped to the `staging` branch, so the staging site calls the staging API.

   Then the Clerk publishable key, from the same instances as the API's secret keys (production
   instance for production, development instance for the `staging` branch and PR previews):
   ```
   vercel env add VITE_CLERK_PUBLISHABLE_KEY production --value <pk_live_…> --yes
   vercel env add VITE_CLERK_PUBLISHABLE_KEY preview "" --value <pk_test_…> --yes
   ```
   The empty `""` means "all Preview branches": without it the CLI stops with `git_branch_required`
   when it isn't interactive. PR previews get no API URL; their API calls fail until a project adds a CORS rule for preview origins.

8. Trigger the first production deployment and record its URL as `<prod-<app>-url>`:
   ```
   vercel deploy --prod
   ```

9. Return to the repo root (`cd ../..`).

## Dashboard Settings (manual)

10. Tell the user to check, for **both** projects in the Vercel dashboard:
    - **Settings → General → Root Directory:** `artifacts/web` / `artifacts/admin`. Build, install and output settings stay blank; `vercel.json` sets them.
    - **Settings → Git → Production Branch:** `main`.
    Wait for them to confirm.

## Staging Sites

11. The staging sites deploy from the `staging` branch's next push. Trigger one now: open the most recent deployment of each project in the dashboard and **Redeploy** it on the `staging` branch, or push any change to `staging` through a PR. Then find each project's stable staging URL (`<base-name>-<app>-git-staging-<team>.vercel.app`, shown under the staging deployment's Domains), and record them as `<staging-<app>-url>`.

## CORS on Railway

12. Allow each environment's sites to call its API (from the repo root, which `/provision-railway` linked to the Railway project):
    ```
    railway variable set --service api --environment production 'CORS_ORIGIN=<prod-web-url>,<prod-admin-url>'
    railway variable set --service api --environment staging 'CORS_ORIGIN=<staging-web-url>,<staging-admin-url>'
    ```
    Use full origins (`https://…`, no trailing slash). Setting a variable redeploys that environment's API.

## Summary

13. Print a success summary in this format:
    ```
    ✓ Vercel project created: <base-name>-web
      production → <prod-web-url>      staging → <staging-web-url>
    ✓ Vercel project created: <base-name>-admin
      production → <prod-admin-url>    staging → <staging-admin-url>
    ✓ VITE_API_URL: production → <prod-api-url>, staging branch → <staging-api-url>
    ✓ VITE_CLERK_PUBLISHABLE_KEY: production instance (production), development instance (previews)
    ✓ CORS_ORIGIN set on both Railway environments

    Next steps:
    - Add custom domains in Vercel (and update CORS_ORIGIN) if needed.
    - Feature work goes through PRs into staging; promote staging → main to release.
      See docs/DEPLOYMENTS.md.
    ```
