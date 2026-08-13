---
description: Rewrite the parent issue description now that the plan is settled — decisions on top, rejected alternatives at the bottom
---

The breakdown is approved. Rewrite the parent issue's **description** (not a
comment) so it reads as a finished decision record rather than a transcript.

Get the parent issue number from `.claude/scripts/wf-context.sh`.

## Required shape

The order matters. Someone opening this issue must hit the answers before the
deliberation.

1. `<!-- ec-wf kind=parent integration-branch=... -->` marker
2. **Title and one-paragraph statement** of what this delivers and why
3. **Final decisions** — numbered, each with the reasoning that produced it.
   These go at the **top**. Anything a cold agent must not contradict lives here.
4. **Verified constraints** — facts confirmed by probing, with what each one
   forces. Mark clearly anything assumed rather than verified.
5. **The task breakdown** as approved, with the dependency table
6. **Scope checklist** — what this parent covers, as checkboxes
7. **Known limits** — what this deliberately does not do or protect against
8. **Considered and rejected** — at the **bottom**, each with:
   - what it was
   - its genuine tradeoff, stated fairly rather than strawmanned
   - **why it lost, now** — and what would make it win later

Write to a file, then:

```
gh issue edit <parent#> --repo shafibabar/ec-document-flow-map --body-file <file>
```

## Then cut the integration branch

If `wf-parent-new.sh` already cut it, confirm it exists and is linked. Otherwise
cut it now from `main`, linked to the parent issue.

Then verify and report: the branch name, that the issue is In Progress, and that
the description now leads with the decisions.

Do not create child issues yet — that is `/wf-children`, and it runs last,
immediately before leaving plan mode.
