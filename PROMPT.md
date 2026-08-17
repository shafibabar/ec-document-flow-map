# START HERE — read this before anything else

You are continuing a project that went badly wrong. Read this whole file, then
work. Do not plan, do not ask, do not propose. **Build.**

---

## What the owner wants

A working, browser-based isometric visualisation of how one document travels
through the Enterprise Conduct estate — the same feel as
<https://laurentiugabriel.github.io/ChipTycoon/>, built from the documents in
`knowledge/`.

**They have a blown deadline and have already been reprimanded for it. They have
no patience left for process. Every message you send that is not working
software is a cost.**

---

## What went wrong, so you do not repeat it

The previous session spent an entire day building **workflow machinery** —
GitHub issue automation, git hooks, schema validators, a provenance linter, and
multi-cycle cold code reviews — and shipped **zero pixels**. It ran five review
cycles on a *schema validator*. It ran four on a *layout file*. It ran two on a
*git hook*. Each cycle found bugs in the previous cycle's fixes, so nothing ever
closed cleanly, and the actual visualisation was never started.

The signal it missed: on the layout issue, 21 defects were found across four
cycles and **not one touched a coordinate**. The data was right from the first
commit. All the churn was in the tooling that was never the deliverable.

**Do not repeat any of this.**

---

## Hard rules

1. **No process work.** Do not touch `.claude/scripts/`, `.claude/settings.json`
   hooks, `tools/validate-*.js`, or `docs/MODEL_SCHEMA.md`. They exist, they are
   frozen, they are not the job.
2. **No review cycles. No spawned review agents. No GitHub issues, comments,
   boards or branch ceremony.** Commit straight to the branch you are on.
3. **No plan mode.** If the session opens in plan mode, leave it immediately.
4. **Do not ask the owner questions unless you are genuinely blocked on
   something only they know.** Make the call, write it down in a comment, move
   on. A wrong choice you can fix in ten minutes is cheaper than a question.
5. **`knowledge/` never reaches git.** It is gitignored. Check with
   `git check-ignore -v knowledge/` before committing. This one rule stays.
6. **Never invent estate facts.** Every service, topic, index and hop must come
   from a file in `knowledge/`. If the documents are silent, leave it out or
   label it `unknown` on screen. A plausible guess is worse than a visible gap.
7. **Ship something runnable every time you commit.** `index.html` must always
   open and work.

---

## First action, before anything else

The previous session's hooks will actively obstruct you: they force plan mode,
block commits, and one of them blocks any command whose text contains `git add`
near the word `knowledge`. **Delete the hooks and the plan-mode default.**

Replace `.claude/settings.json` entirely with:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": { "defaultMode": "acceptEdits" }
}
```

Then commit that. It takes one minute and it removes every obstacle behind you.

---

## What already exists and works

On branch **`build/railway-map`** (commit `a9a16e8`) there is a **working
railway visualisation**. Open `index.html` and you will see it run.

| File | What it is |
|---|---|
| `data/flow.js` | 10 stops, 9 tracks, the happy-path scenario with cargo state at each stop |
| `data/layout.js` | 21 nodes with grid positions derived from the architecture image — **trust this, it was verified twice** |
| `js/iso.js` | isometric projection and camera; domain-free |
| `js/render.js` | draws the railway: rails, sleepers, stations, yards, the cart |
| `js/main.js` | the walk, dwell timing, controls |
| `index.html`, `css/map.css` | panel, controls, legend |

It runs: the cart travels the pipeline, the cargo changes at every stop, stamps
accrete, a tag names what it is carrying, and the panel explains each stop with
the source file it came from.

**Your job is to extend this, not to redesign it.**

---

## The estate, already established — do not re-derive

**14 services in scope.** Egress is excluded entirely (it has no Kafka surface —
its own document says "None found" for both consumed and published). Actioning is
excluded from the map (nothing in the corpus publishes its inbound topics).

**The happy path, verified from both ends of every hop:**

```
EA-S3 → Gateway → (Mongo outbox → Debezium) → Queue Qualifier
      → Surveillance Filter → Policy Evaluator → Indexer → surveil.av5
```

Key facts already confirmed against the documents:

- Gateway consumes `supBulkIndexingTopic_k8s`, downloads `indexable.json` from
  S3, minifies it, uploads `miniIndexable.json`, writes an
  `IngestedCommunicationOutbox` row.
- **Gateway does not publish its own event.** Debezium reads the Mongo outbox and
  publishes `ec.surveillance-gateway.outbox.{tenant}.ingestedCommunication`. This
  pattern is in 12 of 16 services and is the single most valuable thing the map
  teaches. It is drawn as a dashed rail.
- Queue Qualifier → `ec.surveillance-qualifier.{tenant}.qualifications` →
  Surveillance Filter → `ec.surveillance-filter.{tenant}.evaluations` →
  Policy Evaluator → `ec.surveillance-policy-evaluator.{tenant}.surveilled` →
  Indexer **and** Quota Manager.
- Indexer writes **both** Elasticsearch indexes via `ElasticsearchIndexingService`:
  `surveil.av5` (clean — the "Clearance Terminal") and `review.v1` (alerted — the
  "Violation Depot").
- **DLT means Dead Letter Topic**, not DLQ. It appears in 29 of 33 documents;
  "DLQ" appears in none. Retry is Spring Kafka `@RetryableTopic`, typically
  `-retry-0` → `-retry-1` → `-dlt`.
- Surveillance Filter publishes `.not-qualified` — a genuine terminal state where
  a document stops travelling.

**Reading the documents: read them, do not script them.** Two scripted attempts
produced two different wrong answers. Column headers differ between files, topics
are backticked in some and bare in others (Indexer's are bare — a script found
zero topics for it and reported success), one cell can hold two topics split by
`<br>`, and retry routing is often only drawn in mermaid, never tabulated.

---

## What to build next, in this order

Each of these is shippable on its own. Commit after each. Do not start the next
until the previous one runs.

1. **Retry and DLT scenario.** A document fails at a stop, retries with visible
   `attempt 2 of 3`, and either recovers or goes dark and rolls into the DLT.
   The retry data is the richest part of the documents.
2. **Terminal-state scenario.** A document that hits `.not-qualified` at
   Surveillance Filter and stops there.
3. **A scenario picker** in the UI so the owner can switch between them.
4. **The remaining services on the map** — Config Curator, Centralized Audit,
   Alerting, Echo Engine, Review Service, Reporting, Manual Run, Quota Manager —
   with their real edges, so the estate looks like the estate.
5. **The professional infrastructure view** and a toggle between it and the
   railway view, per the owner's second prompt (below). Both views read the same
   scenario state; switching must never restart the animation.
6. **Layer toggles** — Flow, Resilience, Outbox/CDC, Tenancy — only once the
   above works.

---

## The owner's two original prompts, verbatim

These describe the end state. They are recorded in full on GitHub issue #3 in
this repo. In short:

**Railway view (the fun one).** Tracks are Kafka topics. Stations are K8s
services. Local freight depots are MongoDB stores. Central classification yards
are the Elasticsearch indexes — `review.v1` is the "Violation Depot",
`surveil.av5` is the "Clearance Terminal". Cargo uncouples at a terminal state
and visibly changes when enriched.

**Infrastructure view (the professional one).** Same data, same state machine,
literal technology symbols instead of railway metaphor — Kafka, Kubernetes, S3,
MongoDB, Elasticsearch marks. A global toggle switches between the two,
preserving layout, filters and the timeline position.

One conflict to know about: that prompt asks for React Context / Redux / Zustand.
**Ignore that part.** The owner's hard constraint is no build step, no
dependencies, no framework — plain `<script>` tags, canvas, vanilla JS, opens by
double-clicking `index.html`. The architecture it describes (one view-agnostic
store both renderers read) is already how `data/flow.js` + `js/main.js` work.

---

## Technical constraints

- Pure static site. No build step, no npm, no framework, no network calls.
- Must run by opening `index.html` from the filesystem.
- Works on a phone and on a large screen.
- Controls: pause, step, restart, speed, follow/free camera, pan, zoom.
- Paced to be read, not raced — dwell scaled to how much a stop has to explain,
  with a visible timer, and a pause that holds indefinitely.
- Keep the model in `data/` separate from engine code in `js/`, so adding a
  service is a data edit.

---

## Repository facts

- **Private repo.** GitHub Pages is off and stays off: a Pages site is
  world-readable even from a private repo, and this map renders real service and
  topic names. A public demo would need a separate repo with fictional data.
- Branch `build/railway-map` has the working visualisation. `main` does not yet —
  merging it is a one-line job once the hooks are gone.
- `knowledge/Conduct Services/` holds 33 documents across 16 services plus
  `Enterprise Conduct V3 - TSA.jpg`. All gitignored. Never commit any of it.

---

## How to report back

Short. What you built, whether it runs, what is next. No status essays, no
option menus, no asking permission to continue. If something is genuinely
ambiguous, pick the sensible answer, note it in a code comment, and keep going.
