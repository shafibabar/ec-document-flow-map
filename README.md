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
| `knowledge/` | **Gitignored.** Internal source documents, local only |

Adding a service is meant to be a data edit, not a code edit. The model schema is
documented in `docs/MODEL_SCHEMA.md`.
