---
name: provision-github
description: Set up the GitHub side of the merge and promotion process: a staging branch and rulesets protecting staging and main. Use once per new project, before provision-railway.
---

Set up this repo's GitHub side of the merge and promotion process (see `docs/DEPLOYMENTS.md`): a `staging` branch and rulesets that protect `staging` and `main`. Work through the steps below in order, stopping and reporting clearly if any step fails. Run this once, before `/provision-railway` and `/provision-vercel`.

## Pre-flight Checks

1. Verify the `gh` CLI is installed by running `gh --version`. If not found, tell the user:
   > "GitHub CLI not found. Install it from https://cli.github.com, then re-run /provision-github."
   Then stop.

2. Verify authentication with `gh auth status`. If not logged in, tell the user:
   > "Not authenticated. Run 'gh auth login' first, then re-run /provision-github."
   Then stop.

3. Resolve the repo with `gh repo view --json nameWithOwner,defaultBranchRef,visibility`. If it fails, the repo has no GitHub remote yet; tell the user:
   > "No GitHub repo found for this directory. Create one (e.g. 'gh repo create <name> --private --source . --push'), then re-run /provision-github."
   Then stop. If the default branch is not `main`, stop and ask the user before continuing: Railway and Vercel treat the default branch as production.

4. Confirm `.github/workflows/ci.yml` on `main` contains the `CI passed` job (`grep -n 'name: CI passed' .github/workflows/ci.yml`). The rulesets require that check by name.

Use `<repo>` below for the `nameWithOwner` value.

## Branch

5. Check whether `staging` exists: `gh api repos/<repo>/branches/staging`. If it does not, create it from `main` through the API (the local pre-push hook blocks pushing to `staging`):
   ```bash
   sha=$(gh api repos/<repo>/commits/main --jq .sha)
   gh api repos/<repo>/git/refs -f ref=refs/heads/staging -f sha="$sha"
   ```

## Merge settings

6. Allow merge commits (promotions) and squash merges (feature PRs), delete merged branches:
   ```bash
   gh api -X PATCH repos/<repo> -F allow_merge_commit=true -F allow_squash_merge=true \
     -F allow_rebase_merge=false -F delete_branch_on_merge=true --silent
   ```

## Rulesets

7. Create (or update) two rulesets. Both require a PR and the `CI passed` check from GitHub Actions (`integration_id` 15368), block force-pushes and deletion, and have no bypass actors, so admins follow them too. `main` accepts only merge commits, so a promotion keeps `staging`'s commits; `staging` accepts only squash merges, one commit per feature.

   For each `(name, branch, method)` in `("Protect main", main, merge)` and `("Protect staging", staging, squash)`, write this JSON to a temp file with the values filled in:
   ```json
   {
     "name": "<name>",
     "target": "branch",
     "enforcement": "active",
     "bypass_actors": [],
     "conditions": { "ref_name": { "include": ["refs/heads/<branch>"], "exclude": [] } },
     "rules": [
       { "type": "deletion" },
       { "type": "non_fast_forward" },
       {
         "type": "pull_request",
         "parameters": {
           "allowed_merge_methods": ["<method>"],
           "required_approving_review_count": 0,
           "dismiss_stale_reviews_on_push": false,
           "require_code_owner_review": false,
           "require_last_push_approval": false,
           "required_review_thread_resolution": false
         }
       },
       {
         "type": "required_status_checks",
         "parameters": {
           "strict_required_status_checks_policy": false,
           "required_status_checks": [{ "context": "CI passed", "integration_id": 15368 }]
         }
       }
     ]
   }
   ```
   Look up an existing ruleset with that name: `gh api repos/<repo>/rulesets --jq '.[] | select(.name=="<name>") | .id'`. If one exists, `gh api -X PUT repos/<repo>/rulesets/<id> --input <file>`; otherwise `gh api -X POST repos/<repo>/rulesets --input <file>`.

   If GitHub answers 403 with an upgrade message, the account's plan doesn't support rulesets on private repos (GitHub Free only has them on public repos). Tell the user, and stop: the hooks and the `Promotion source` CI job still apply, but nothing enforces them on GitHub.

8. Verify: `gh api repos/<repo>/rulesets --jq '.[] | .name + " " + .enforcement'` lists both rulesets as `active`.

## Summary

9. Print a success summary in this format:
   ```
   ✓ staging branch created from main (or: already existed)
   ✓ Merge settings: merge commits + squash, branches deleted on merge
   ✓ Ruleset "Protect main": PR + CI passed, merge commits only, no bypass
   ✓ Ruleset "Protect staging": PR + CI passed, squash only, no bypass

   From now on:
   - Feature work: branch off staging, open a PR into staging.
   - Promotion: open a PR from staging into main and merge it with a merge commit.
   - See docs/DEPLOYMENTS.md for the full process.

   Next steps:
   - Run /provision-railway, then /provision-vercel.
   ```
