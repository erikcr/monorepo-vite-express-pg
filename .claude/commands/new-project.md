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

## Write the Output

After collecting all six sections, create `docs/PROJECT.md` with this exact structure:

```markdown
# <Product Name> — Project Definition

> Last updated: <today's date>

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

Then commit:
```bash
git add docs/PROJECT.md
git commit -m "docs: define project scope and V1 objectives for <Product Name>"
```

Confirm to the user:
> "PROJECT.md committed. You now have a clear scope document at docs/PROJECT.md.
>
> When you're ready to start building, describe the first feature you want to implement and I'll write a plan before touching any code."
