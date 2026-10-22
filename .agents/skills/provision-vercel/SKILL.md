---
name: provision-vercel
description: Create the web and admin Vercel projects with per-environment API URLs and Clerk keys, the deploy hooks that release them after the API, CORS_ORIGIN on Railway, and the deploy check's targets. Use once per new project, after provision-railway.
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

Do steps 5–9 for `web`, then repeat them for `admin`. `<app>` is `web` or `admin`. Run every
command from `artifacts/<app>` (where the project is linked) until step 9.

5. Create and link the project, and set its Root Directory **before anything deploys**: without it,
   Vercel builds the app folder on its own, and the build hangs installing the workspace:
   ```
   vercel project add <base-name>-<app>
   cd artifacts/<app> && vercel link --yes --project <base-name>-<app>
   rm -f .gitignore    # vercel link writes one; the root .gitignore already ignores .vercel
   vercel api /v9/projects/<base-name>-<app> -X PATCH -F rootDirectory=artifacts/<app>
   echo '{"gitProviderOptions":{"createDeployments":"enabled"}}' \
     | vercel api /v9/projects/<base-name>-<app> -X PATCH --input -
   ```
   Build, install and output settings stay blank: `vercel.json` sets them. The second call makes
   Vercel report each deployment to GitHub, which is what starts the post-deploy check
   (`deploy-check.yml` runs on those reports). Projects created from the CLI have it off, and the
   check then never runs, silently.

6. Connect the GitHub repo, so deploy hooks can build its branches. Pass the repo URL: run from
   the app folder without one, the CLI finds no `.git` and stops:
   ```
   vercel git connect https://github.com/<repo>
   ```

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

   Ask the user where vulnerability reports should go (an address or page they watch; a `mailto:`
   or `https:` URL). Set it for production, and both sites serve it at
   `/.well-known/security.txt`; skip it if they have none yet (no file is served):
   ```
   vercel env add VITE_SECURITY_CONTACT production --value mailto:security@<domain> --yes
   ```

8. Vercel never deploys `main` or `staging` by itself (`git.deploymentEnabled` in `vercel.json`):
   `.github/workflows/deploy-sites.yml` triggers each site through a deploy hook once the API
   serves the commit (`docs/DEPLOYMENTS.md`). Create the two hooks and store them as GitHub secrets
   without printing them (`<APP>` is `WEB` or `ADMIN`). Each `create` prints the hook's
   `https://api.vercel.com/v1/integrations/deploy/…` URL: capture it from the output into
   `gh secret set` rather than echoing it, since anyone with a hook URL can trigger a deploy.
   ```
   vercel deploy-hooks create deploy-sites-main --ref main         # → VERCEL_HOOK_<APP>_PRODUCTION
   vercel deploy-hooks create deploy-sites-staging --ref staging   # → VERCEL_HOOK_<APP>_STAGING
   ```
   Then make the first deploys by posting each hook once (`curl -fsS -X POST "$url" -o /dev/null`):
   Vercel builds `main` and `staging` from GitHub, as every later release does. Don't use
   `vercel deploy`: it uploads the local folder, not the repo.

9. Return to the repo root (`cd ../..`).

## Check the projects and find the sites

10. Wait for the four deployments to be Ready (`vercel ls <base-name>-<app>`), then check each
    project's settings (`vercel api /v9/projects/<base-name>-<app>`): `rootDirectory` is
    `artifacts/<app>`, `link.productionBranch` is `main` and `gitProviderOptions.createDeployments`
    is `enabled`. Record the addresses:
    - `<prod-<app>-url>`: `https://<base-name>-<app>.vercel.app` (or the project's domain);
    - `<staging-<app>-url>`: the staging deployment's branch alias,
      `https://<base-name>-<app>-git-staging-<team>.vercel.app` (`vercel api
      /v2/deployments/<staging deployment id>/aliases` lists it).

11. The staging sites are Vercel previews, which Vercel protects by default. The post-deploy check
    reads them with a **Protection Bypass for Automation** secret. Generate one per project and
    store it without printing it:
    ```
    s=$(openssl rand -hex 16)
    vercel project protection enable <base-name>-<app> --protection-bypass --protection-bypass-secret "$s"
    printf %s "$s" | gh secret set VERCEL_BYPASS_<APP>
    ```
    Without one, the check skips that staging site with a warning.

## Connect the API

12. Allow each environment's sites to call its API (from the repo root, which `/provision-railway` linked to the Railway project):
    ```
    railway variable set --service api --environment production 'CORS_ORIGIN=<prod-web-url>,<prod-admin-url>'
    railway variable set --service api --environment staging 'CORS_ORIGIN=<staging-web-url>,<staging-admin-url>'
    ```
    Use full origins (`https://…`, no trailing slash). Setting a variable redeploys that environment's API.

    Then tell the deploy workflow where each API is, so it can check the API serves a commit
    before releasing the sites:
    ```
    gh variable set API_URL_PRODUCTION --body <prod-api-url>
    gh variable set API_URL_STAGING --body <staging-api-url>
    ```

    Finally, replace the template's entries in `lib/ci/src/deploy-targets.ts`: set `DEPLOY_REPO`
    to `<repo>` (`gh repo view --json nameWithOwner --jq .nameWithOwner`) and fill in both
    environments (API URL, site URLs, and `clerkKey`: `"live"` for production, `"test"` for
    staging). Commit it on a branch, in a PR into `staging`: the post-deploy check
    (`.github/workflows/deploy-check.yml`) reads each live site against it, and fails on every
    deploy until `DEPLOY_REPO` names this repo. Check the production entries against the live
    sites first: `ENVIRONMENT=production GITHUB_REPOSITORY=<repo> node lib/ci/src/bin/deploy-check.ts`.

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
    ✓ Deploy hooks stored (VERCEL_HOOK_*), API_URL_PRODUCTION / API_URL_STAGING set:
      sites deploy only after the API serves their commit
    ✓ Staging bypass secrets stored (VERCEL_BYPASS_*), so the check can read the staging sites
    ✓ lib/ci/src/deploy-targets.ts filled in (PR into staging): every site deploy is checked against it

    Next steps:
    - Add custom domains in Vercel if needed; then update CORS_ORIGIN on Railway,
      lib/ci/src/deploy-targets.ts, and the Clerk instance's allowed origins.
    - The sites' Content-Security-Policy follows VITE_API_URL and the Clerk key by itself
      (lib/csp); a new third-party script or API host goes in lib/csp/src/index.ts.
    - Feature work goes through PRs into staging; promote staging → main to release.
      See docs/DEPLOYMENTS.md.
    ```
