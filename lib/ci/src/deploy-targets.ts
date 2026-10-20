import type { DeployTarget, Environment } from "./deploy-check.ts";

// What each environment's live sites must be built with: the post-deploy check (.github/workflows/
// deploy-check.yml) compares every site's JavaScript against this table. /provision-vercel fills it
// in; change it in the same PR as an API address, Clerk instance or site that changes.

/** The GitHub repo these targets belong to: in any other repo (a project made from this template,
 * before /provision-vercel), the check fails instead of checking someone else's sites. */
export const DEPLOY_REPO = "erikcr/monorepo-vite-express-pg";

export const DEPLOY_TARGETS: Partial<Record<Environment, DeployTarget>> = {
  production: {
    api: "https://api.template.erikcr.com",
    // A real project's production uses its Clerk production instance ("live"); the template's demo
    // deployment signs in through a development instance.
    clerkKey: "test",
    sites: {
      web: "https://web.template.erikcr.com",
      admin: "https://admin.template.erikcr.com",
    },
  },
  // staging: {
  //   api: "https://<staging api>",
  //   clerkKey: "test",
  //   sites: { web: "https://<staging web>", admin: "https://<staging admin>" },
  // },
};
