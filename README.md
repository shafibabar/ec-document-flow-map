# ec-document-flow-map

**This repo is a visualisation.** It renders an isometric map of how a single
document travels through the Enterprise Conduct event-driven estate, so the flow
can be read and taught. It is **not a deployable service** — nothing here runs in
any environment, handles a real document, or talks to a real broker. It is also
**not where the `EVENT_FLOW_MAP.md` source documents live**; those are internal,
stay on local disk under `knowledge/`, and are gitignored. The repo name invites
both readings, so: a static page that draws a map, nothing more.

## Running it

Open `index.html` in a browser. There is no build step, no package manager, no
dependencies, and no network calls — plain `<script>` tags, canvas and vanilla JS.

## How it is built

Services and datastores are stops on the map, Kafka topics are the roads between
them, and one document rides through as visible cargo that changes at every stop.
Synchronous REST calls render differently from Kafka hops, so blocking and
non-blocking are legible at a glance.

Everything on screen is derived from the source documents under `knowledge/` and
carries a `source` field naming the file and heading it came from. Nothing is
invented: where the sources are silent or contradict each other, the map shows an
explicit `unknown` or `conflict` state rather than a plausible guess.

## Layout

| Path | What it holds |
|---|---|
| `index.html` | Entry point; loads the data file, then the engine |
| `data/` | The derived model — the sole source of truth for the map |
| `js/` | Isometric projection, routing engine, renderer, controls |
| `css/` | Presentation |
| `docs/` | Model schema and notes |
| `.claude/` | Workflow tooling — hooks, scripts, commands |
| `knowledge/` | **Gitignored.** Internal source documents, local only |

Adding a service is meant to be a data edit, not a code edit. The model schema is
documented in `docs/MODEL_SCHEMA.md`.

## How work is tracked

Every change here runs as a tracked project rather than as ad-hoc edits. The full
rules are in [`CLAUDE.md`](CLAUDE.md); the short version:

- Work is planned before it is built. Planning produces a **parent issue** that
  records the decisions taken *and* the alternatives rejected, with the tradeoffs.
- Each task becomes a **child issue** written so that someone with no other
  context can implement it.
- **`main` is never edited directly.** Work happens on
  `issue/<n>-<slug>` branches cut from `integration/<n>-<slug>` branches, and
  reaches `main` only through a reviewed merge.
- Implementation is followed by **cold review cycles** — a fresh reviewer each
  round, repeating until a round finds nothing, capped at five.
- Progress lives on a private GitHub project board:
  **Todo → In Progress → In Review → Done**.

This is enforced by hooks in `.claude/`, not by good intentions, so it holds
across sessions and unattended runs.

**This repo is private and GitHub Pages is off**, because a Pages site is
world-readable even when published from a private repo, and this map renders real
service and topic names. A shareable demo built on fictional sample data will
live in a separate public repo. Opening `index.html` locally needs no server.
