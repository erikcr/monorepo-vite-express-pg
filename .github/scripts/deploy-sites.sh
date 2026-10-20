#!/usr/bin/env bash
# Deploys the web and admin sites for one environment, once its API serves the commit.
# Run by .github/workflows/deploy-sites.yml; see docs/DEPLOYMENTS.md.
#
# Input (environment variables):
#   ENVIRONMENT                   production or staging
#   SHA                           the commit the API deployed (empty: the branch's latest commit)
#   API_URL_<ENV>                 each environment's API origin, e.g. https://api.example.com
#   HOOK_{WEB,ADMIN}_<ENV>        each site's Vercel deploy hook for the environment's branch
#   GITHUB_REPOSITORY, GH_TOKEN   set by GitHub Actions
set -euo pipefail

case "$ENVIRONMENT" in
  production)
    branch=main
    API_URL="${API_URL_PRODUCTION:-}" HOOK_WEB="${HOOK_WEB_PRODUCTION:-}" HOOK_ADMIN="${HOOK_ADMIN_PRODUCTION:-}"
    ;;
  staging)
    branch=staging
    API_URL="${API_URL_STAGING:-}" HOOK_WEB="${HOOK_WEB_STAGING:-}" HOOK_ADMIN="${HOOK_ADMIN_STAGING:-}"
    ;;
  *) echo "::error::Unknown environment '$ENVIRONMENT'"; exit 1 ;;
esac

missing=""
[ -n "$API_URL" ] || missing="$missing API URL,"
[ -n "$HOOK_WEB" ] || missing="$missing web deploy hook,"
[ -n "$HOOK_ADMIN" ] || missing="$missing admin deploy hook,"
if [ -n "$missing" ]; then
  echo "::error::Not configured for $ENVIRONMENT:${missing%,} (repository variable API_URL_*, secrets VERCEL_HOOK_*; see the provision-vercel skill)"
  exit 1
fi

# A deploy hook builds the branch's latest commit. If the branch has moved on, that newer
# commit's API isn't live yet: its own API deploy will release the sites.
head=$(gh api "repos/$GITHUB_REPOSITORY/commits/$branch" --jq .sha)
sha="${SHA:-$head}"
if [ "$sha" != "$head" ]; then
  echo "$branch has moved on from $sha to $head; that commit's API deploy will release the sites."
  exit 0
fi

# Railway reports success once the new API passes its health check, so this normally
# matches at once; the wait covers the switch-over.
for attempt in $(seq 1 30); do
  served=$(curl -fsS --max-time 10 "$API_URL/health" | jq -r '.sha // empty' || true)
  [ "$served" = "$sha" ] && break
  if [ "$attempt" = 30 ]; then
    echo "::error::$API_URL/health did not report $sha within five minutes (it reports '${served:-nothing}'). The sites were not deployed."
    exit 1
  fi
  sleep 10
done
echo "$API_URL serves $sha."

curl -fsS -X POST "$HOOK_WEB" > /dev/null
echo "Triggered the web deploy of $branch."
curl -fsS -X POST "$HOOK_ADMIN" > /dev/null
echo "Triggered the admin deploy of $branch."
