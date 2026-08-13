---
description: Review the whole integration branch once every child issue is Done
argument-hint: <parent issue number>
---

Every child of #$ARGUMENTS is Done. Review the integration branch as a whole.

```
.claude/scripts/wf-status.sh $ARGUMENTS "In Review"
.claude/scripts/wf-cycles.sh $ARGUMENTS
```

## Why this pass exists

Each child was reviewed alone, against its own issue. This pass looks for what
that structurally cannot catch:

- **Interactions between separately-reviewed changes** — two individually correct
  changes that are wrong together
- **Drift from the parent's decisions** — the estate as built versus as decided
- **Seams**: interfaces where one issue's producer meets another's consumer, and
  each assumed something slightly different
- **Whole-branch consistency**: does it run end to end, not just in unit tests?
  Open the thing. Exercise it.
- **Anything a child issue deferred** with "the next issue handles this" — verify
  some issue actually did

Same rules as `/wf-review`: a new agent per cycle, told which cycle it is and
everything previous cycles found; findings recorded as it goes; review completes
before fixing; cap at 5 then escalate.

Review range: `origin/main..origin/<integration-branch>`.

```
.claude/scripts/wf-review-log.sh $ARGUMENTS <cycle-n> <clean|bugs-found> <narrative-file>
```

## When a cycle comes back clean

**Stop.** Do not merge to main. Run `/wf-handoff $ARGUMENTS` and hand to the repo
owner for manual review. Main is theirs to authorise, and that is the last gate
in the system.
