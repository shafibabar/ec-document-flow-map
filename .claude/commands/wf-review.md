---
description: Run one cold review cycle on an issue branch with a freshly spawned agent
argument-hint: <issue number>
---

Run the next review cycle on issue #$ARGUMENTS.

## First, find out where the cycles stand

```
.claude/scripts/wf-cycles.sh $ARGUMENTS
```

This reads the history back out of the issue comments — how many cycles have run,
what each concluded, and whether the cap has been hit. **Never assume this is
cycle 1.** If it says the cap is reached, stop and escalate to the repo owner
instead of starting another cycle.

## Spawn a genuinely cold reviewer

Use the Agent tool to spawn a **new** agent for each cycle. Never reuse the
previous reviewer and never review your own work in the same context — the point
is a reader who has not already convinced themselves the code is correct.

The agent's prompt must contain, spelled out rather than referenced:

- The issue number, its full text, and the parent's binding decisions
- The branch, and the exact diff range to review (`origin/<integration>..HEAD`)
- **Which cycle this is, and every bug found in previous cycles** — so it does
  not rediscover fixed problems or miss a regression in a previous fix
- Instruction to **write a stub or driver** where something cannot otherwise be
  exercised, rather than reasoning about correctness from the armchair
- Instruction to record findings **as it goes**, before moving on — a bug noticed
  and not written down is a bug lost
- Instruction to finish reviewing *first*, then fix. Fixing mid-review loses the
  thread and produces half-reviewed code.

## What the reviewing agent must record in the issue

Not a verdict — a narrative. For each bug: what it is, how it was found, what
caused it, the fix, and how the fix was verified. Plus what was checked and found
sound, so the next cycle does not redo it.

```
.claude/scripts/wf-review-log.sh $ARGUMENTS <cycle-n> <clean|bugs-found> <narrative-file>
```

## Then

- **bugs-found** → the fixes are committed on the same branch, and the next cycle
  starts with another new agent. Repeat.
- **clean** → the issue is ready for `/wf-done $ARGUMENTS`.
- **cap reached without a clean pass** → stop. Write a summary of every cycle,
  every bug, and what remains open, then hand back to the repo owner. Do not
  merge, and do not quietly declare it clean.
