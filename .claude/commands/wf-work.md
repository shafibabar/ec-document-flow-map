---
description: Pick up a child issue — cut its branch from the integration branch and implement it test-first
argument-hint: <child issue number>
---

Pick up child issue #$ARGUMENTS.

## Start

```
.claude/scripts/wf-start.sh $ARGUMENTS
```

This cuts `issue/<n>-<slug>` from the **parent's integration branch** (never from
main), links the branch to the issue on GitHub, and moves it to In Progress. It
warns if a dependency is not Done — read the warning rather than skimming past it.

## Then read before writing

- The child issue in full, including every comment
- The parent issue's **Final decisions** section. Those bind this work. If the
  issue seems to contradict a parent decision, stop and say so — do not pick a
  winner silently.
- The files the issue names

## Implement test-first

Write the failing test named in the issue's TDD entry point, watch it fail for
the right reason, then make it pass. This is not ceremony: review cycles are
expensive here, and the cycles that find nothing are the ones where tests already
caught it.

## Commit as you go

Commit messages must be **detailed** — subject line plus a body explaining what
changed and *why*, what you tried that did not work, and anything a reviewer
should look at closely. They are mirrored automatically onto both the child and
parent issues, so they are part of the permanent record, not throwaway text.

Every JS file must pass `node --check` before you commit it.

## When the implementation is done

Move the issue to In Review and start the review cycles:

```
.claude/scripts/wf-status.sh $ARGUMENTS "In Review"
```

then `/wf-review $ARGUMENTS`.

Do **not** merge anything yourself. Merging happens only after a review cycle
comes back clean, via `/wf-done`.
