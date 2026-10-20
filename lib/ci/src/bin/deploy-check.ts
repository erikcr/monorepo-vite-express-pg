// Run by .github/workflows/deploy-check.yml: checks the live sites of ENVIRONMENT (production,
// staging, or all; only SITE when set) against src/deploy-targets.ts. VERCEL_BYPASS_<SITE> lets
// it past Vercel's deployment protection (staging sites are previews, protected by default).
import { checkSite, type Environment, type FetchText } from "../deploy-check.ts";
import { DEPLOY_TARGETS } from "../deploy-targets.ts";

const fetchText: FetchText = async (url, headers) => {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  return {
    status: res.status,
    text: await res.text(),
    headers: Object.fromEntries(res.headers.entries()),
  };
};

const wanted = process.env.ENVIRONMENT ?? "all";
const environments = (Object.keys(DEPLOY_TARGETS) as Environment[]).filter(
  (e) => wanted === "all" || e === wanted
);
if (environments.length === 0) {
  console.log(
    `No deploy targets for '${wanted}' in lib/ci/src/deploy-targets.ts; nothing to check.`
  );
}
const allApis = Object.values(DEPLOY_TARGETS).map((t) => t.api);

let failed = false;
for (const environment of environments) {
  const target = DEPLOY_TARGETS[environment];
  if (!target) continue;
  for (const [site, url] of Object.entries(target.sites)) {
    if (process.env.SITE && site !== process.env.SITE) continue;
    const bypass = process.env[`VERCEL_BYPASS_${site.toUpperCase()}`] || undefined;
    const result = await checkSite(site, url, target, allApis, fetchText, bypass);
    if ("skipped" in result) {
      console.log(`::warning::${environment} ${site} (${url}): skipped, ${result.skipped}`);
    } else if (result.problems.length > 0) {
      failed = true;
      for (const problem of result.problems) {
        console.log(`::error::${environment} ${site} (${url}) ${problem}`);
      }
    } else {
      console.log(
        `${environment} ${site} (${url}): built for ${target.api}, pk_${target.clerkKey}, no secrets, security headers and CSP in place.`
      );
    }
  }
}
if (failed) process.exitCode = 1;
