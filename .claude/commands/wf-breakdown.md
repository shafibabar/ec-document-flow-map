---
description: Produce the granular task breakdown table for the current parent issue
---

Break the planned work into tasks and present them as a table. **Do not create
any issues yet** — this is for me to read and argue with first.

## Granularity

**One unit of work per task.** Never club several things together because they
feel related or because one is small. If a task's description needs the word
"and" to be accurate, it is probably two tasks.

Wrong: *"Write the routing engine and its tests and wire it to the renderer"*
Right: three tasks, and the tests come first.

A task should be completable and reviewable on its own. If a reviewer would have
to hold two unrelated changes in their head at once, split it.

## Dependencies

State a dependency **only where one genuinely exists** — where task B cannot
start until task A is merged, because B builds on something A creates.

Do not invent sequencing to make the list look orderly. Tasks that can proceed in
parallel are a good thing; say so. A false dependency costs real time by
serialising work that did not need to be.

If a dependency is one of convenience rather than necessity ("easier if A lands
first"), mark it as such and say why, so I can choose to ignore it.

## Output

A table, no issues created:

| # | Task | Deliverable | Depends on | Why the dependency |
|---|---|---|---|---|
| 1 | ... | the file or behaviour that exists afterwards | — | — |
| 2 | ... | ... | 1 | needs the schema 1 defines |

Below the table:
- **Parallelisable now:** which tasks could start immediately, in parallel
- **Critical path:** the longest dependency chain, since that sets the duration
- **TDD entry point** for each task: what the first failing test asserts

Then stop and wait. When I approve the breakdown, `/wf-finalize` rewrites the
parent issue and `/wf-children` creates the issues.
