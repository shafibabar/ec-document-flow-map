---
description: Begin a planned piece of work — enter plan mode and open the parent issue that will record every decision
argument-hint: <short title for the work>
---

Begin a new piece of work: `$ARGUMENTS`

**This is the only legitimate way work starts in this repo.** Nothing gets built
that did not come through here.

Do this in order:

1. **Enter plan mode** with EnterPlanMode if you are not already in it.

2. **Explore before proposing.** Read what is actually in the repo and, where
   relevant, in `knowledge/`. Never propose a design built on an assumption you
   could have checked in about a minute.

3. **Draft the parent issue body** to a scratch file. It is a decision record,
   not a task summary. It must contain:
   - **Why this exists** — the problem, and what changes when it is solved
   - **Final decisions** — each with the reasoning that produced it
   - **Considered and rejected** — each with its tradeoff and why it lost *now*,
     so nobody re-argues it from scratch in three months
   - **Verified constraints** — facts you confirmed by probing, not assumed
   - **Known limits** — what this deliberately does not protect against
   - A `<!-- ec-wf kind=parent -->` marker on the first line

4. **Create it**, which also puts it on the board as In Progress and cuts and
   links the integration branch:

   ```
   .claude/scripts/wf-parent-new.sh "<title>" <body-file>
   ```

5. **Keep recording as we talk.** Every exchange that changes the shape of the
   work goes into the issue via `/wf-record` — including the ideas we abandoned
   and *why*. A decision whose reasoning was never written down will be
   re-litigated, badly.

Do not break the work down yet. Wait for me to ask for the breakdown — I will
say so when I am satisfied with the plan.
