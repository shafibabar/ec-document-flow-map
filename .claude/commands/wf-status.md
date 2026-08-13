---
description: Where am I — branch, bound issue, board state, review cycles, what's next
---

Report the current workflow position.

```
.claude/scripts/wf-context.sh
```

Everything it prints is derived live from git and GitHub, so it is correct in a
cold session, a resumed session, or an unattended run with no memory of what came
before.

Then read it back to me in plain terms:

- Which issue this branch is bound to and what state it is in
- If it is a child: how many review cycles have run, what they found, whether the
  cap is close
- If it is a parent: which children are open and which are Done
- **The single next action**, named as a command — not a list of options

Flag loudly, not in passing:

- `knowledge/` visible to git in any form
- Commits on this branch not mirrored to their issue
- A board state that contradicts the branch (e.g. work happening on a branch
  whose issue still says Todo)
- Being on `main` at all
