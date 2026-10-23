# Board

Planned work for this project. Each plan is a file in [`plans/`](plans/); this table is the index.
Execute a plan with the `execute-plan` skill.

| # | Plan | Status | Owner |
|---|------|--------|-------|
| — | _No plans yet. Add the first one below._ | | |

## Writing a plan

Name it `plans/NN-short-topic.md` (next free number) and start it with:

```markdown
# Plan NN — Title

> **Status:** proposal · **Owner:** <who> · **Depends on:** <plan numbers or nothing>

Why this exists, in two or three sentences.

### 1. <task>
What changes, and which files.
**Tests:** the tests this task adds, from the required-tests table in `TESTING.md` (e.g. "API:
401/403/cross-org 404/400s for `POST /api/orders`; component: the orders page's four states;
E2E: placing an order"), or "none — <reason>".

## Exit criteria
Checkable statements that are true when the plan is done, each backed by a named test or check.
```

Every task has a **Tests:** line, written when the plan is, so the tests are designed with the
feature and reviewed with the plan, not invented after the code.

**Statuses:** `proposal` (waiting for approval) → `not-started` → `in-progress` → **deleted when
done**: git is the archive, and the board row becomes `done`. `(deferred)` marks a backlog plan
that blocks nothing. Tag steps a person has to do (provider settings, production data) so agents
leave them alone.

## Other docs

- [`PROJECT.md`](PROJECT.md): scope, V1 features, success criteria (from `/new-project`).
- [`ARCHITECTURE.md`](ARCHITECTURE.md): stack decisions and why.
- [`UI.md`](UI.md): pages versus the settings dialog, which a feature gets, and the dialog's rules.
- [`DEPLOYMENTS.md`](DEPLOYMENTS.md): branches, promotion, deploy gates, migration rules.
- [`TESTING.md`](TESTING.md): test layers, required tests by change, conventions, what CI enforces.
