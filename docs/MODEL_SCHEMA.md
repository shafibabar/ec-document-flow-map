# Model schema

`data/model.js` is the sole source of truth for the visualisation. The engine
reads it and never hardcodes a service, topic, event or endpoint name — adding a
service is a data edit, not a code edit.

This document describes the shape. It is provisional until Phase 1 has read the
source documents; field names may firm up once the real sections are in hand.

## Rules that apply to every entry

- **`source` is mandatory.** Every node, edge and retry policy names the file and
  heading it came from, so each one can be checked against the source.
- **Nothing is invented.** Where the sources are silent, the field is `unknown`.
  Where two services describe the same hop differently, the entry is one
  reconciled edge carrying a `conflict` recording both readings — never a
  silently chosen winner. Both states render visibly on the map.

## `nodes[]`

| Field | Notes |
|---|---|
| `id` | Stable slug, referenced by edges and scenarios |
| `name` | Display name |
| `kind` | `service` \| `store` \| `topic` \| `dlt` \| `external` |
| `grid` | `{x, y}` on the isometric grid, taken from the architecture image |
| `team` | Owning team, or `unknown` |
| `summary` | One or two lines; what this stop does to the document |
| `source` | `{file, heading}` |

Grid positions preserve the relative layout of the architecture image. The team
already carries that spatial mental model and fighting it wastes the benefit.

## `edges[]`

| Field | Notes |
|---|---|
| `from`, `to` | Node ids |
| `transport` | `kafka` \| `rest` \| `jdbc` \| `elastic` |
| `name` | Topic name or endpoint path |
| `eventType` | Event type carried, where the sources name one |
| `direction` | For stores: `read` \| `write` \| `both` |
| `source` | `{file, heading}` — several, when reconciled from both ends |

Transport drives the visual: `kafka` edges are roads the cart drives along,
`rest` edges are a blocking out-and-back with the document waiting at the stop.

## `retries[]`

Per consumer: `consumer` (node id), `topic`, `attempts`, `backoff`, `dltTarget`,
`source`. A consumer with no documented retry configuration is listed in the
accuracy report as having no documented failure path, and renders as `unknown` on
the Resilience layer rather than being assumed to have none.

## `scenarios[]`

A scenario is a named ordered walk through the same graph — not a separate map.

| Field | Notes |
|---|---|
| `id`, `name`, `description` | Shown in the picker |
| `steps[]` | Ordered; each names an edge or a stop, what the document becomes there, and the dwell weight |

At minimum: happy path, retry-then-recover, retries-exhausted-to-DLT, and one
terminal state at a service. Dwell weight scales the pause at each stop to how
much there is to explain there.

## `issues[]`

The findings from the Phase 1 accuracy pass that the map should show rather than
hide: unmatched events, dangling topics, undocumented failure paths, conflicts.

## Open decisions

Settled with the repo owner before Phase 1 output lands here:

1. **Does the derived model get committed?** It carries the same sensitive content
   as `knowledge/` — real service, topic and index names — just restructured.
   Either commit it and keep the repo private, or gitignore it and commit the
   engine plus a small fictional sample dataset.
2. **Is GitHub Pages deployment appropriate at all**, given (1). No workflow has
   been added yet; the `node --check` gate is wanted either way.
3. **Layer control shape** — radio group or toggles.

The Phase 1 accuracy report is written to `knowledge/derived/`, which is
gitignored, because it quotes the same names as the sources.
