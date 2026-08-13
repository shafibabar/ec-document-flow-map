---
description: Hand a clean integration branch to the repo owner for manual review before main
argument-hint: <parent issue number>
---

The integration branch for #$ARGUMENTS has passed a clean review cycle. Prepare
the handoff. **Do not merge to main** — that is the owner's call, and the guard
will block it anyway without an explicit override.

## Post a handoff comment on the parent issue

Covering:

- **What this branch delivers**, against the parent's Final decisions — decision
  by decision, whether each was met, and any that were revised during the work
  along with why
- **Every child issue**, its outcome, and its review-cycle count
- **Every bug found across all cycles**, child and integration, grouped by theme.
  Themes matter more than the list: three bugs of one kind says something about
  the design that three unrelated bugs does not.
- **What changed from the original plan**, and what forced each change
- **What is deliberately not done**, and what would trigger doing it
- **How to verify it by hand** — the exact commands, and what correct looks like

```
.claude/scripts/wf-comment.sh $ARGUMENTS <handoff-file>
```

## Then tell me, in the terminal

- The branch name and how to check it out
- The one-command way to see it working
- Anything you are **not** confident about. This is the last gate before main;
  a hedge stated now is cheap and a hedge swallowed now is expensive.

## After I approve

Only on my explicit say-so, and only then:

```
git checkout main
EC_ALLOW_MAIN=1 git merge --no-ff integration/<n>-<slug>
EC_ALLOW_MAIN=1 git push origin main
```

Every override is logged to `.claude/main-override.log`. Then move the parent to
Done and close it.
