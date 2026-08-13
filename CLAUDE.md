# Working in this repo

Read this before doing anything. The rules here are not preferences — they are
enforced by hooks, and several of them exist because the alternative leaks
internal architecture documents.

If you are joining cold, or resuming, or running unattended: run
`.claude/scripts/wf-context.sh` first. It derives the whole workflow position
from git and GitHub, so it is correct even with no memory of what came before.

---

## What this repo is

A **visualisation** — an isometric map of how a document travels through the
Enterprise Conduct event-driven estate. It is not a deployable service, and it is
not where the `EVENT_FLOW_MAP.md` source documents live. See `README.md`.

---

## The five non-negotiables

### 1. `knowledge/` never reaches git

It holds internal architecture documents and an architecture image. It is
gitignored, and the guard additionally blocks any `git add` that names it —
because `git add -f` would otherwise override `.gitignore`.

Before every commit: `git check-ignore -v knowledge/` and `git status --porcelain`.
**If a `knowledge/` path ever appears in `git status`, stop and tell the repo
owner.** Do not fix it quietly.

### 2. Nothing is invented

Every service, topic, event name, retry count, backoff, index, endpoint and edge
that reaches the screen must trace to a line in `knowledge/`, and carries a
`source` field naming the file and heading it came from.

Where the sources are silent or contradict each other, render an explicit
`unknown` or `conflict` state and list it. **A plausible-looking guess is worse
than a visible gap** — a gap gets investigated, a guess gets believed.

### 3. Work never happens on `main`

```
main                              never edited; receives merges only, after the owner's manual review
└── integration/<parent#>-<slug>  cut from main, linked to the parent issue
    └── issue/<child#>-<slug>     cut from integration, linked to the child issue
```

The guard blocks edits and commits on `main`. The escape hatch `EC_ALLOW_MAIN=1`
exists for exactly one thing — the final reviewed merge — and every use is logged
to `.claude/main-override.log`.

### 4. All work starts in plan mode

Sessions default into plan mode. Work that did not come through a plan and a
parent issue does not get built. Start with `/wf-plan-start`.

### 5. Write everything down

Never assume the next reader has context. They do not. Comments must explain
everything since the last update — what was done, what broke, what was reframed,
what mistakes were made and corrected. The tooling refuses comments under 200
characters on purpose.

---

## The workflow

| Stage | Command | What happens |
|---|---|---|
| Start | `/wf-plan-start <title>` | Plan mode; parent issue created as the decision record; board → In Progress; integration branch cut from main and linked |
| During planning | `/wf-record` | Each exchange recorded in the parent issue, decisions *and* rejections |
| On request | `/wf-breakdown` | Granular task table with real dependencies. Owner reviews. No issues yet. |
| On approval | `/wf-finalize` | Parent description rewritten: decisions on top, rejected alternatives with tradeoffs at the bottom |
| Before exiting plan mode | `/wf-children` | Each task becomes a child sub-issue written for a cold agent; board → Todo |
| Pick up work | `/wf-work <child#>` | Issue branch cut from the integration branch and linked; board → In Progress |
| Implementation done | `/wf-review <child#>` | Board → In Review; cold review cycles, new agent each time |
| Cycle comes back clean | `/wf-done <child#>` | Merged into integration with `--no-ff`; board → Done |
| All children Done | `/wf-parent-review <parent#>` | Parent → In Review; review cycles across the whole integration branch |
| Integration clean | `/wf-handoff <parent#>` | Handoff written; **owner** does manual review and authorises main |
| Any time | `/wf-status` | Where am I, what's next |

Board states: **Todo → In Progress → In Review → Done**
(`Todo` keeps GitHub's default spelling; it is the same state as `ToDo`.)

### Review cycles

- A **new agent** every cycle. Never reuse the previous reviewer; never review
  your own work in the same context.
- The agent learns the history from the issue itself via
  `.claude/scripts/wf-cycles.sh <n>` — cycle count, previous findings, cap status.
- **Record findings as you go**, before continuing. A bug noticed and not written
  down is a bug lost.
- **Finish reviewing, then fix.** Fixing mid-review loses the thread.
- Build a stub or driver where something cannot otherwise be exercised.
- Cycles repeat until one finds nothing, **capped at 5**. At the cap: stop, write
  a full cross-cycle summary, escalate to the owner. Do not merge past it.
- **TDD.** Tests first, always. It is the cheapest way to cut cycles.

---

## Tooling

Scripts in `.claude/scripts/`. They are the only supported way to touch the
board — hand-editing it puts GitHub and the branch state out of step.

| Script | Purpose |
|---|---|
| `wf-context.sh` | Where am I (also the SessionStart hook) |
| `wf-cycles.sh <n>` | Review history for an issue, read back from its comments |
| `wf-parent-new.sh` | Parent issue + integration branch |
| `wf-child-new.sh` | Child sub-issue + dependency cross-references |
| `wf-start.sh <n>` | Issue branch + In Progress |
| `wf-status.sh <n> <state>` | Board transition |
| `wf-comment.sh <n> <file>` | Detailed comment, optionally mirrored to the parent |
| `wf-review-log.sh` | Record a review cycle |
| `wf-finish.sh <n> <file>` | Merge to integration + Done |
| `wf-mirror-commit.sh` | Commit → issue comments (also the PostToolUse hook) |
| `wf-guard.sh` | The deny logic (PreToolUse hook) |

Config: `.claude/workflow.conf` — project and field ids, branch prefixes, the
review cap. It is **shell, not JSON**, because there is no `jq` on this machine.

### Two environment constraints that will bite you

- **No system `jq`.** Use `gh --jq` for API responses (gh ships its own jq) and
  `node -e` for stdin payloads. A script that shells out to `jq` fails here.
- **`gh` 2.46 has no sub-issue subcommand.** Parent/child linking goes through
  the GraphQL `addSubIssue` mutation. `wf-child-new.sh` already does this.

---

## Repo and publishing

**This repo is private,** and must stay that way: issues carry real service,
topic and index names.

**GitHub Pages is off here, permanently.** A Pages site is world-readable *even
from a private repo* — repo visibility hides the source, not the site, and
restricting a site to people with repo access is an Enterprise Cloud feature.

The shareable demo therefore lives in a **separate public repo** carrying the
domain-free engine plus a fictional sample dataset. It does not exist yet; it
gets created during the flow-map work, once there is an engine and a sample to
put in it. See issue #1 for the full reasoning.

**Never publish the real model anywhere world-readable.** The visualisation runs
from `file://` with no build step, so sharing the real map means handing someone
the folder — not a link.

---

## Enforcement, and its limits

Stated plainly so nobody assumes protection that is not there.

- **Hooks are client-side.** They constrain Claude Code sessions on this machine.
  They do not constrain `git` from another terminal, another machine, or the
  GitHub web UI. Server-side branch protection on a private repo needs a paid
  plan, so it is unavailable as a backstop.
- **Nothing can force plan mode.** Sessions default into it and edits on main are
  blocked, but leaving plan mode is the owner's decision — that is the approval
  gate itself.
- **Commit mirroring is best-effort.** A network failure never blocks a commit;
  `wf-context.sh` reports un-mirrored commits, and
  `wf-mirror-commit.sh --retry` catches them up.

If a hook does not seem to be firing, the settings watcher may not have picked up
`.claude/settings.json`. Ask the owner to open `/hooks` once, or restart the
session.
