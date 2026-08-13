---
description: Turn the approved breakdown into child issues written for a cold agent, then exit plan mode
---

Create one child issue per task in the approved breakdown, then exit plan mode.

## The standard every child issue must meet

Assume the implementer is **a cold agent with no memory of this conversation**,
possibly running unattended at 3am. It cannot ask a question. If the issue is
missing something, the work stalls or, worse, gets guessed at.

Before creating each issue, reread it and ask: *could I implement this having
read nothing else?* If not, it is not ready.

Every child issue body must contain:

- **`<!-- ec-wf kind=child parent=<n> -->`** marker
- **Context** — what this is part of, and the one-line why. Link the parent.
- **Exactly what to build**, in specifics: file paths, function or data shapes,
  the behaviour expected. Not "add validation" but what is validated and what
  happens when it fails.
- **Where to find more context** — which files to read first, which parent-issue
  decisions bind this work, which `knowledge/` documents apply. Name them.
- **The TDD entry point** — the first failing test to write, and what it asserts.
  Tests come before implementation; it demonstrably cuts review cycles.
- **Acceptance criteria** — checkable, not vibes. "`node --check` passes on every
  changed file" is checkable. "Code is clean" is not.
- **Explicitly out of scope** — the neighbouring work this issue must *not* do,
  so a keen agent does not wander into the next issue's territory.
- **Dependencies**, if genuine, and what breaks if started early.

## Creating them

```
.claude/scripts/wf-child-new.sh <parent#> "<title>" <body-file> [depends-on-csv]
```

Each call: creates the issue, links it as a real GitHub sub-issue of the parent,
puts it on the board as Todo, and cross-references dependencies from both ends.

## Then

1. Verify: `.claude/scripts/wf-context.sh` should list every child under the parent.
2. Confirm the parent is still **In Progress** — it stays there until all
   children are Done.
3. Report the created issues as a table with their numbers and dependencies.
4. **Exit plan mode** with ExitPlanMode.

Work starts with `/wf-work <child#>`, which cuts the issue branch from the
integration branch. Nothing is implemented on this turn.
