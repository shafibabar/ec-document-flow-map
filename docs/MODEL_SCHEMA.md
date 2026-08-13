# Extraction schema

This defines the **per-service extract** — the file each extraction issue in
Parent #3 produces, one per service, at `data/extracted/<service-id>.js`.

It does **not** define the merged model. Merging fifteen extracts into one
`data/model.js` is Parent 2's job, and the shapes here are chosen so that merge
is mechanical rather than interpretive.

**Read this alongside [`../data/extracted/_example.js`](../data/extracted/_example.js)** —
a real, complete extract of `ec-echo-engine` from its two real documents. The
rules are here; the example shows them applied to a document with genuine
awkwardness in it.

Validate with:

```
node tools/validate-extract.js data/extracted/<file>.js
node --test "tools/test/*.test.js"     # the validator's own tests
```

Note the quoted glob. `node --test tools/test/` does **not** work on Node 22 — it
tries to `require()` the directory as a module and fails with `MODULE_NOT_FOUND`.
Bare `node --test` from the repo root also works but additionally discovers the
fixture files under `tools/test/fixtures/`, reporting 19 "tests" instead of 11.

---

## The three rules that matter more than the shape

### 1. Record what the document says, never what seems reasonable

A plausible-looking guess is worse than a visible gap. A gap gets investigated; a
guess gets believed. If you find yourself reasoning "it must be X because that
would make sense", stop and write `"unknown"`.

### 2. Silence, absence and disagreement are three different facts

| Situation | Record |
|---|---|
| The sources say nothing about this | `"unknown"` |
| The sources positively state there is none | `"none"`, or `[]` for a collection, plus an `ambiguities` note |
| Two sources disagree | a `conflict` — **both** readings, **both** sources |

**`null` is never valid anywhere.** The validator rejects it. A `null` cannot be
distinguished from an oversight, which defeats the whole point.

The `"none"` versus `"unknown"` distinction is load-bearing. "Echo Engine belongs
to no sub-domain" and "we could not tell which sub-domain Echo Engine belongs to"
lead to different actions by whoever reads the accuracy report.

### 3. Never resolve a conflict during extraction

If Gateway's document and Config Curator's document describe the same REST call
differently, record what **your** document says and note the discrepancy in
`ambiguities`. Do not check the other service's file and reconcile.

Reconciliation is Parent 2's job. Fixing a disagreement here destroys the
evidence that it existed — and the accuracy report the repo owner reads is
precisely a list of such disagreements.

---

## Provenance

**Every entry carries a `source`.** The validator fails the file otherwise.

```js
source: { file: 'Echo Engine/EVENT_FLOW_MAP.md', heading: 'Events Consumed', row: 1 }
```

| Field | Required | Notes |
|---|---|---|
| `file` | yes | Relative to `knowledge/Conduct Services/` |
| `heading` | yes | The `##` or `###` section it was read from |
| `row` | no | 1-based row within that section's table, when applicable |

One exception, for issue #5 only: a position **inferred** rather than read may use
`{ inferred: true, reason: '...' }`. The reason is mandatory — an inference
without a stated basis is a guess wearing a badge.

---

## Conflicts

```js
attempts: {
  conflict: [
    { value: '3', source: { file: '...', heading: 'Kafka consumer configuration' } },
    { value: '1', source: { file: '...', heading: 'Deployment overlays' } },
    { value: '4', source: { file: '...', heading: 'Base shared configuration' } }
  ]
}
```

Any field may hold a conflict instead of a value. At least **two** readings, each
with its own `source`. One reading is not a conflict — record the value directly.

---

## File format

Each extract is a `.js` file that works both as a browser `<script>` tag and as a
Node `require()`, with no build step:

```js
'use strict';
(function (root, factory) {
  var d = factory();
  if (typeof module === 'object' && module.exports) module.exports = d;
  else (root.EC_EXTRACTS = root.EC_EXTRACTS || {})[d.service.id] = d;
})(typeof self !== 'undefined' ? self : this, function () {
  return { /* the extract */ };
});
```

Copy this wrapper verbatim. It is what lets the validator run in Node while the
page still loads by opening `index.html`.

---

## Shape

### `service` — one object

| Field | Notes |
|---|---|
| `id` | Stable slug, e.g. `echo-engine`. Used by every edge and by `data/layout.js` |
| `name` | The service's real name, e.g. `ec-echo-engine` |
| `folder` | The `knowledge/Conduct Services/` folder it came from |
| `displayName` | What appears on the map |
| `group` | Sub-domain from the image: `Alerting` · `Actioning` · `Search` · `Review` · `Reporting` · `none` |
| `generation` | `3.0` or `integrated`. No 2.0 components are in scope |
| `summary` | One or two sentences: what this stop does to the document |
| `source` | Required |

### Collections — **all eleven must be declared, even if empty**

`nodes` · `edges` · `retries` · `stores` · `decisions` · `terminalStates` ·
`failurePaths` · `restInbound` · `restOutbound` · `tenancy` · `ambiguities`

An omitted key is an error, not an implied empty. `[]` states "I read the section
and it documents none"; absence cannot be distinguished from having forgotten it.

### `nodes[]`

| Field | Notes |
|---|---|
| `id` | `echo-engine`, `topic:echo-engine.echoAction`, `dlt:echoAction` |
| `name` | The literal name as written in the source, placeholders intact |
| `kind` | `service` · `store` · `topic` · `dlt` · `external` |
| `group`, `generation` | As above; `unknown` for topics |

Record topics and DLTs as nodes. `data/layout.js` (issue #5) is authoritative for
grid position — do not put coordinates here.

### `edges[]`

| Field | Notes |
|---|---|
| `from`, `to` | Node ids |
| `transport` | **`kafka` · `rest` · `s3` · `mongo` · `elastic` · `cdc`** |
| `name` | Topic name or endpoint path, placeholders intact |
| `eventType` | Payload DTO or message type |
| `direction` | `in` · `out` · `read` · `write` · `both` |
| `consumer` / `publisher` | Class and method |
| `consumerGroup`, `purpose`, `trigger`, `note` | Where documented |

**`jdbc` is not a valid transport.** It appears nowhere in this estate; the
stores are MongoDB, S3 and Elasticsearch. The validator rejects it by name.

**`cdc` versus `kafka` is a real distinction, not a nicety.** If the payload is a
Debezium `CdcEvent`, or the service writes an outbox collection that Debezium
publishes from, the transport is `cdc`. The wire is Kafka; the semantic is change
data capture. The Outbox/CDC layer — the one that corrects the belief that
services publish their own events — depends entirely on this being got right
during extraction. Twelve of sixteen services use the pattern.

### `retries[]`

`consumer` · `topic` · `attempts` · `retryTopics[]` · `dltTarget` · `backoff` ·
`mechanism` · `note` · `source`

**No document has a `Retry/DLT Configuration` section.** This data is scattered
across Events Consumed rows, prose paragraphs and mermaid diagrams — gather from
all three. Any field may be `"unknown"`; partial retry data is normal.

**DLT = Dead Letter Topic**, not DLQ. Kafka has no queues. The term appears in 29
of 33 documents; "DLQ" appears in none.

### `stores[]`

`store` (`mongo` · `s3` · `elastic`) · `entity` · `collection` · `repository` ·
`operations` · `calledBy` · `windowed` · `source`

From Persistent Store Interactions. Feeds the State layer.

### `transformation` — one object

```js
transformation: { before: '...', action: '...', after: '...', source: {...} }
```

From `stop_info` → Transformation. **This is the highest-value field in the whole
extract**: it is what makes the document visibly change at this stop, which is
the single idea that makes the visualisation teach rather than decorate. If the
`stop_info` has no Transformation section, declare the object with `"unknown"`
fields rather than omitting it.

### `decisions[]`

`decision` · `evaluates` · `yes` · `no` · `source` — from `stop_info` → Decisions.
Drives scenario branching.

### `terminalStates[]`

`name` · `meaning` · `source`. Where the document stops travelling. Drives the
"terminal state at a service" scenarios and, in the railway view, where cargo
uncouples.

### `failurePaths[]`

`trigger` · `route` · `source`. Drives the retry and DLT scenarios.

### `restInbound[]` / `restOutbound[]`

`method` · `path` · `controller` / `target` · `client` · `request` · `response` ·
`purpose` · `source`. Feeds the Sync calls layer — the blocking out-and-back.

### `tenancy[]`

`subject` · `placeholder` · `resolvedFrom` · `examples` · `note` · `source`.

Feeds the Tenancy layer. Record how tenant-derived names resolve: which
placeholder syntax the document uses, what supplies the tenant list, whether
collection names are tenant-derived or only database names are. Placeholder
syntax **differs between documents** — `{tenant}`, `<tenant>`, `{t}`,
`{tenantName}` all occur. Record what your document uses; do not normalise.

### `ambiguities[]`

`item` · `foundDuringExtraction` · `source`.

Two kinds, both required:

1. **Everything the document itself flags** — many have an `Ambiguities` or
   `Notes` section. Copy every item across with provenance. Roughly 65 exist
   across the corpus and they seed the accuracy report.
2. **Anything you noticed while extracting** — a section that contradicts
   another, a topic named two ways, a "None found" that could be misread as an
   unfinished extract. Mark these `foundDuringExtraction: 'true'`.

---

## Extraction warnings

Two scripted attempts to parse these documents produced two different wrong
answers during planning. Read the tables; do not pattern-match.

- **Column headers differ between documents**: `Event/Topic Name`, `Topic / Pattern`, `Event / topic`
- **Topics are backticked in some documents and bare in others.** Indexer's are bare — a backtick-based script extracted zero topics from it and reported success
- **One cell may hold two topics separated by `<br>`** — that is two edges
- **Some topics appear only in prose** ("Configurable via `spring.kafka...`")
- **Retry and DLT routing is often only drawn in mermaid, never tabulated.** Read the mermaid blocks
- **Filenames are inconsistent**: `EVENT_FLOW_MAP.md`, `ec-reporting-EVENT_FLOW_MAP.md`, and `ec-config-curator stop info.md` with spaces

---

## Checklist before marking an extraction issue done

- [ ] `node --check data/extracted/<id>.js` passes
- [ ] `node tools/validate-extract.js data/extracted/<id>.js` exits 0
- [ ] All eleven collections declared, empty ones deliberately so
- [ ] Every entry has a `source` naming file and heading
- [ ] Every ambiguity the document flags is copied across
- [ ] Retry data gathered from tables **and** prose **and** mermaid
- [ ] No `null` anywhere; silences are `"unknown"`; known absences are `"none"`
- [ ] No conflict resolved — both readings recorded with both sources
- [ ] Any acceptance fact from issue #3 belonging to this service is reproduced
