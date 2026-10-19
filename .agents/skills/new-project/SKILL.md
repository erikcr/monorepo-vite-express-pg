---
name: new-project
description: Structured planning session that writes and commits docs/PROJECT.md (objective, users, V1 features, data model, success criteria, out of scope, brand color) and clears the template's own docs. Use when starting a new project from this template, before any code.
---

Guide the user through a structured project planning session and produce a committed `docs/PROJECT.md`. This must be run **before any code changes** when starting a new project from the template.

## Pre-flight Check

First, check whether `docs/PROJECT.md` already exists (run `ls docs/PROJECT.md 2>/dev/null`). If it exists, tell the user:
> "docs/PROJECT.md already exists. Review or edit it directly rather than re-running /new-project."
Then stop.

## Instructions

Work through the six sections below **one at a time**. Ask each question, wait for the user's response, then proceed to the next. Do not batch questions. Record answers exactly as given — do not paraphrase.

---

### Section 1 — Product Name & Objective

Ask:
> "What is the name of this product? Then in 1–2 sentences: what problem does it solve, and who is it for?"

---

### Section 2 — Users

Ask:
> "Who are the primary users? Describe their role, context, or the job they're trying to get done."

---

### Section 3 — V1 Feature List

Ask:
> "List the features that must be in V1 for this to be worth shipping. Be specific — each item should describe a concrete action a user can take."

If the user lists vague items (e.g. "user management", "dashboard"), prompt once:
> "Can you be more specific about that one? What exactly can the user do?"

---

### Section 4 — Data Model

Ask:
> "What are the core data entities (database tables) in this product? For each, give its name and 3–5 key fields."

Example: `User (id, email, orgId, role, createdAt)`

---

### Section 5 — Success Criteria

Ask:
> "How will you know V1 is done? Give 2–4 concrete, testable statements."

Example: "A user can sign up, create a record, and share it with a teammate — all without errors in a staging environment."

---

### Section 6 — Out of Scope

Ask:
> "What are you deliberately NOT building in V1? List 3–5 things to keep scope tight."

---

### Section 7 — Brand Color

Ask:
> "What is your brand color? Provide a hex code (e.g. `#3B82F6`) or a color name (indigo, teal, rose, orange…). Press Enter to keep the neutral slate placeholder and update it later."

If the user provides a color:
- Convert it to an oklch value. Use your knowledge of color science to find the closest perceptually accurate oklch equivalent. Aim for `lightness ~50%, chroma ~0.18–0.25` for saturated colors, lower chroma for muted tones.
- Derive a light-mode dark variant (same hue, `lightness ~68%, chroma slightly higher`) for the dark mode override.
- Derive `--color-brand-subtle` (same hue, `lightness ~94%, chroma ~0.02–0.03`) for light mode and (`lightness ~22%, chroma ~0.04`) for dark mode.
- Edit both `artifacts/web/src/index.css` and `artifacts/admin/src/index.css` and replace the three `--color-brand*` values in the `@theme` block and the corresponding dark mode overrides.

If the user skips: leave the slate placeholder in place. Note that they can update it anytime by editing the `--color-brand` line in each app's `src/index.css`.

---

## Write the Output

After collecting all six sections, create `docs/PROJECT.md` with this exact structure:

```markdown
# <Product Name> — Project Definition

> Last updated: <today's date> · Template: erikcr/monorepo-vite-express-pg as of <today's date>

## Objective
<Section 1 answer — objective only, name is in the heading>

## Users
<Section 2 answer>

## V1 Features
<Section 3 answer as a bulleted list>

## Data Model
<Section 4 answer — one entity per line>

## Success Criteria
<Section 5 answer as a numbered list>

## Out of Scope (V1)
<Section 6 answer as a bulleted list>
```

The template line records where the project came from: to see what the template has gained since, run `git log --since=<that date>` in the template repo.

Remove the template's own maintenance docs, which don't apply to this project:
```bash
git rm -r -q docs/template
```

Then commit on a branch (the git hooks block commits on `main` and `staging`):
```bash
git switch -c docs/project-definition   # skip if already on a feature branch
git add docs/PROJECT.md docs/template
git commit -m "docs: define project scope and V1 objectives for <Product Name>"
```

If the `staging` branch exists on GitHub (`/provision-github` has run), push and open a PR into it:
```bash
git push -u origin docs/project-definition
gh pr create --base staging --fill
```
Otherwise tell the user to run `/provision-github` first, then push the branch and open the PR into `staging`.

Confirm to the user:
> "PROJECT.md committed on a branch. You now have a clear scope document at docs/PROJECT.md.
>
> When you're ready to start building, describe the first feature you want to implement and I'll write a plan for it in `docs/plans/` (listed on the board in `docs/README.md`) before touching any code."
