---
description: Record the current conversation into the parent issue, in enough detail to reconstruct why
argument-hint: [what to emphasise]
---

Write everything that has happened in this conversation since the last recorded
update into the parent issue. Emphasis, if given: `$ARGUMENTS`

Find the parent issue from the current branch (`.claude/scripts/wf-context.sh`).

**Write it for someone who was not here.** A reader months from now must be able
to follow how we got from the previous state to this one without guessing. That
means recording:

- **What was decided**, and the reasoning that produced it — not just the outcome
- **What was considered and dropped**, with the tradeoff and why it lost
- **What I pushed back on**, and what changed as a result. Reversals are the most
  valuable thing in the record and the most commonly omitted.
- **Mistakes made and corrected** — a wrong turn that got fixed is worth writing
  down, because the next person will otherwise take it again
- **Anything reframed**: if we discovered a question was the wrong question, say
  so explicitly, and say what the right one turned out to be
- **What is still open**, phrased as a question rather than a vague gesture

Rules:
- Write to a file, then post it. One-liners are refused by the tooling on purpose.
- Never write "discussed X and decided Y" with no reasoning. That is the exact
  failure this whole system exists to prevent.
- If nothing of substance changed since the last update, say that plainly instead
  of padding — but check the transcript before concluding it.

```
.claude/scripts/wf-comment.sh <parent#> <body-file>
```
