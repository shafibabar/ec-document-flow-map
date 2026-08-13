---
description: Close out a clean child issue — merge to the integration branch and move it to Done
argument-hint: <child issue number>
---

Close out child issue #$ARGUMENTS.

**Precondition:** the last recorded review cycle must be `clean`. `wf-finish.sh`
refuses otherwise, and that refusal is not an obstacle to route around — it means
the review cycles are not finished.

## Write the closing narrative first

To a file, covering:

- What was built, and how it differs from what the issue originally described —
  and why it differs, if it does
- Every review cycle: how many, what each found, how each was fixed
- Anything discovered during the work that affects other issues. If this changed
  an assumption a sibling issue depends on, say so explicitly and comment on
  that issue too — a stale assumption is how the next agent gets misled.
- Anything deliberately left undone, and why

## Then

```
.claude/scripts/wf-finish.sh $ARGUMENTS <narrative-file>
```

This merges the issue branch into the integration branch with `--no-ff`, moves
the issue to Done, closes it, mirrors the narrative to the parent, and reports
how many sibling issues remain open.

## Next

- **Children still open** → pick the next unblocked one with `/wf-work <n>`.
- **All children Done** → the parent moves to In Review and gets its own review
  cycles across the whole integration branch: `/wf-parent-review <parent#>`.
