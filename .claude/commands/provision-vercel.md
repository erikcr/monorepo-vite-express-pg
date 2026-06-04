Provision two Vercel projects for this monorepo — one for `artifacts/web` and one for `artifacts/admin`. Work through the steps below in order, stopping and reporting clearly if any step fails.

## Pre-flight Checks

1. Verify the `vercel` CLI is installed by running `vercel --version`. If not found, tell the user:
   > "Vercel CLI not found. Install it with: npm install -g vercel"
   Then stop.

2. Verify the user is authenticated by running `vercel whoami`. If not logged in, tell the user:
   > "Not authenticated. Run 'vercel login' first, then re-run /provision-vercel."
   Then stop.

3. Read the DATABASE_URL from the local `.env` file. If it is not set, ask the user:
   > "Enter your DATABASE_URL (get this from /provision-railway or your database provider):"
   Wait for their input.

4. Ask the user for the Railway API base URL:
   > "What is your Railway API URL? (e.g. https://myapp-api.railway.app — get this from the Railway dashboard)"
   This value will be set as VITE_API_URL on both Vercel projects. Wait for their input.

5. Derive the base project name by running `basename $(git rev-parse --show-toplevel)`.

## Provision Web App

6. Change to the `artifacts/web` directory.

7. Link to a new Vercel project:
   ```
   vercel link --yes
   ```
   When prompted, choose to create a new project and name it `<base-name>-web`.
   Set the root directory to `artifacts/web` and accept other defaults.

8. Add environment variables to the web project (production scope):
   ```
   vercel env add VITE_API_URL production
   ```
   Provide the Railway URL from step 4 as the value.

9. Trigger the first production deployment:
   ```
   vercel deploy --prod
   ```
   Capture and save the deployment URL.

## Provision Admin App

10. Change to the `artifacts/admin` directory.

11. Link to a new Vercel project:
    ```
    vercel link --yes
    ```
    When prompted, create a new project named `<base-name>-admin`.
    Set the root directory to `artifacts/admin` and accept other defaults.

12. Add environment variables to the admin project (production scope):
    ```
    vercel env add VITE_API_URL production
    ```
    Provide the same Railway URL from step 4.

13. Trigger the first production deployment:
    ```
    vercel deploy --prod
    ```
    Capture and save the deployment URL.

## Summary

14. Print a success summary in this format:
    ```
    ✓ Vercel project created: <base-name>-web
      → <web deployment URL>
    ✓ Vercel project created: <base-name>-admin
      → <admin deployment URL>
    ✓ VITE_API_URL set on both projects → <Railway URL>

    Next steps:
    - Add custom domains in the Vercel dashboard if needed.
    - Ensure CORS is configured in the API server for your Vercel domains.
    - Push to your main branch to trigger future auto-deploys.
    ```
