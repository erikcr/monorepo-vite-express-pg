---
name: diagnosing-bugs
description: Disciplined loop for hard bugs, flaky tests and performance regressions — build a red-capable repro first, then hypothesise, instrument, fix with a regression test, and clean up. Use when the user says "debug this"/"diagnose", or reports something broken, throwing, flaky or slow.
---

# Diagnose a bug

## 1. Build a feedback loop first
For a report from a deployed environment, start from what it recorded: the Sentry event (environment, commit, request or job id, stack) and the API's logs for that request id (`railway logs --service api --environment <env>`; every line carries `req.id`).

Before reading code to form a theory, get **one command** that goes red on *this* bug and you've already run: a failing vitest test (supertest + PGlite for the API, Testing Library for UI), a curl against `pnpm dev`, a Playwright script, or a throwaway harness. It must assert the user's exact symptom, be deterministic, and take seconds. For flaky bugs, raise the reproduction rate (loop it 100×, run the full suite in parallel, add load) until it's debuggable. If you can't build a loop, stop and say what you tried and what you need (logs, a captured request, access).

## 2. Reproduce, then minimise
Confirm it's the failure the user described, not a neighbouring one. Then cut inputs, steps and config one at a time until every remaining part is needed to stay red.

## 3. Hypothesise
Write 3–5 ranked, falsifiable hypotheses ("if X is the cause, changing Y makes it disappear"). Show them to the user before testing; they may re-rank them instantly.

## 4. Instrument
One probe per prediction, one variable at a time. Tag temporary logs with a unique prefix (`[DEBUG-a4f2]`) so cleanup is one grep. For performance, measure a baseline first, then bisect.

## 5. Fix with a regression test
Turn the minimised repro into a test at the seam where the bug actually occurs (the layers and helpers are in `docs/TESTING.md`), watch it fail, fix, watch it pass, and re-run the original loop. The test ships in the same commit as the fix. If there's no honest seam for the test, say so: that's a finding.

## 6. Clean up
Remove tagged logs and throwaway scripts, state the confirmed cause in the commit message, and ask what would have prevented it (a type, a test, a lint rule, a simpler design). Suggest that after the fix, not before.
