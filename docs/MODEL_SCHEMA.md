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
fixture files under `tools/test/fixtures/` and counts each as a passing "test",
reporting 65 rather than the 35 real ones. Use the glob, and expect 35.

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

**`null` is never valid anywhere.** The validator rejects it, at any depth —
inside a nested object and inside an array element, not only in an entry's own
fields. A `null` cannot be distinguished from an oversight, which defeats the
whole point.

**An empty string is rejected for the same reason.** `attempts: ''` is not a
statement about the document; `attempts: 'unknown'` is.

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
| `row` | no | 1-based row within that section's table, when applicable. Must be an integer ≥ 1 |

**Placeholders are rejected, not just empty strings.** `{ file: 'TODO' }`,
`{ heading: '...' }` and `{ heading: 'unknown' }` all fail. A source that names
nothing is worse than no source at all, because it looks like it was checked.

### Citing the architecture image

`group` and `generation` are read from the image, not from a markdown file, so
they are cited as:

```js
source: { file: 'Enterprise Conduct V3 - TSA.jpg', heading: 'Actioning Sub-domain' }
```

The image sits in `knowledge/Conduct Services/`, so the same relative-path rule
applies. `heading` names the labelled frame the component was found inside —
`Alerting Sub-domain`, `Actioning Sub-domain`, `Search Sub-domain`, `Review
Sub-domain`, `Reporting subdomain` — or `Legend` for anything read off the
colour key. A component drawn outside every frame has `group: 'none'`, cited to
the image all the same.

### More than one section: `source` may be an array

An entry whose fields came from two sections cites both, in the order the fields
appear:

```js
source: [
  { file: 'Echo Engine/ec-echo-engine_stop_info.md', heading: 'Purpose' },
  { file: 'Echo Engine/EVENT_FLOW_MAP.md', heading: 'High-Level Architecture' }
]
```

This is not a convenience. This schema orders retry data gathered from tables
**and** prose **and** mermaid; a single `{file, heading}` on such an entry has to
name one of them and silently mis-cite the rest. Prefer one source where one
section really is the origin — an array of every section you happened to read is
not provenance either.

One further exception, for issue #5 only: a position **inferred** rather than
read may use `{ inferred: true, reason: '...' }`. The reason is mandatory — an
inference without a stated basis is a guess wearing a badge.

---

## Conflicts

A conflict records that two sources disagree, without picking a winner. The
example below is not invented: it is `tenancy[1]` in the worked extract. Echo
Engine's two documents give incompatible answers to one question — which MongoDB
database holds the echo state:

```js
placeholder: {
  conflict: [
    { value: 'the tenant name is used as the database name',
      source: { file: 'Echo Engine/EVENT_FLOW_MAP.md', heading: 'Persistent Store Interactions' } },
    { value: 'alcatraz',
      source: [
        { file: 'Echo Engine/ec-echo-engine_stop_info.md', heading: 'Processing' },
        { file: 'Echo Engine/ec-echo-engine_stop_info.md', heading: 'Dependencies' },
        { file: 'Echo Engine/ec-echo-engine_stop_info.md', heading: 'Configuration' }
      ] }
  ]
}
```

Any field may hold a conflict instead of a value, including `transport` and the
other enumerated fields — but the enum still applies to each reading, so a
conflict is not a way to smuggle an invalid value past the validator. Nested
conflicts, inside an array element or a nested object, are checked too.

At least **two** readings, each with its own `source` (which may itself be an
array, when one reading rests on several sections). One reading is not a
conflict — record the value directly.

Every `file` and `heading` in that example is real, and yours must be too. A
snippet is not exempt from provenance: if you cannot point at the heading, you
have not read it.

### What is *not* a conflict

**A conflict is two answers to one question, not two vocabularies for one
thing.** These documents are auto-generated, and the same fact routinely appears
in a table, a paragraph and a mermaid label in three different wordings. If you
record every such difference as a conflict, the accuracy report fills with noise
and the real disagreements — like the one above — are lost in it.

The test before you write a conflict:

1. **Do the two passages answer the same question?** A column headed `Payload`
   answers "what class is the message", not "how does it arrive". A cell that
   does not mention CDC is not a passage claiming the topic is not CDC.
2. **Could both be true at once?** If yes, it is not a conflict. Echo Engine's
   `stop_info` writes `AlertEvent (CDC)` — one line holding both the payload
   class and the transport, which is the document telling you they are
   compatible.
3. **If it is not a conflict but you noticed it, write it in `ambiguities`**
   with `foundDuringExtraction: 'true'`. Nothing is lost that way; the evidence
   survives without a false disagreement being asserted.

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
| `group` | Sub-domain from the image: `Alerting` · `Actioning` · `Search` · `Review` · `Reporting` · `none` · `unknown`. Required — write `unknown` rather than omitting it |
| `generation` | `3.0` · `integrated` · `none` · `unknown`. No 2.0 components are in scope. **Quote it**: unquoted `3.0` is the JavaScript number `3` |
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
| `id` | Required. `echo-engine`, `topic:ec.echo-engine.{tenant}.echoAction`, `dlt:ec.echo-engine.{tenant}.echoAction-ec-echo-engine-dlt` |
| `name` | Required. The literal name as written in the source, placeholders intact |
| `kind` | Required. `service` · `store` · `topic` · `dlt` · `external` |
| `group` | Required. Values as for `service`. **`none` on every topic and DLT node** — the image draws no topic inside a sub-domain frame, so "belongs to no sub-domain" is a positive reading, not a silence |
| `generation` | Required. **`unknown` on every topic and DLT node** — the image assigns a generation to components, not to topics, and inferring one from the producing service would be a guess |
| `summary` | The service node carries one — the same sentence as `service.summary`, or a shorter form of it. Topic and DLT nodes normally have none: writing one means inventing it |
| `note` | Optional, for something the document states about the node that no other field holds — Manual Run's `ec-surveillance-manual-run-{t}-qualified` is marked `@Deprecated`, and that belongs here rather than in an invented field |

Record topics and DLTs as nodes. **These are not nodes:**

- **Mongo collections, outbox collections and per-tenant windowed collections.**
  They belong in `stores[]`, and surface on the State layer and in stop detail.
  Parent #3 settled this: dozens of collections as map stops crowds the grid past
  readability.
- **Retry topics.** They live in `retries[].retryTopics`. Only the DLT gets a
  node, because the DLT is where a document's journey visibly ends.

  This holds **wherever you meet them**, which is the part that catches people
  out. Retry topics are not always tucked inside a retry section: Reporting's are
  `Events Consumed` rows with their own consumer groups
  (`ec.reporting.event-log.retry-0.consumer-group`) and `Events Published` rows
  with their own triggers, and Centralized Audit publishes five more the same
  way. Those rows still produce **no node and therefore no edge**. Record the
  topic name, the consumer group and the trigger in the matching `retries[]`
  entry — nothing is lost, and the retry fan-out is drawn from `retries[]`.
- **Topic names that are templates.** Reporting's `Events Published` rows 7 and 8
  give the `@RetryableTopic` names only as `{base-topic}-ec-reporting-retry-{0..N}`
  and `{base-topic}-ec-reporting-dlt`; Centralized Audit has
  `…cognition-reconciliation-events-retry-*`. A template is not a name: an id
  built from one joins to nothing, and expanding it invents names your document
  does not contain. Create **no node**; write the row into `retries[]` verbatim
  plus an `ambiguities` entry.

#### `topic` or `dlt`? The name decides, not your vantage point

`kind` chooses the id prefix, so it cannot be a judgement call — if two agents
classify one topic differently they produce two merge keys for it.

**A topic whose `name` ends in `-dlt` is `kind: 'dlt'`. Every other topic node is
`kind: 'topic'`.** That is the whole rule, and the validator enforces it both
ways. All 47 `-dlt`-suffixed names in the corpus are dead-letter topics, no
dead-letter topic lacks the suffix, and "DLQ" appears nowhere.

**A dead-letter topic you merely consume is still a dead-letter topic.** This is
the half that is easy to get wrong. Reporting's
`EventLogConsumer — Full Topic Pattern List` is a table headed `Topic Pattern`
whose rows 2–11 are ten *other* services' DLTs, read as an ordinary data source
and sitting beside `ec.centralized.{tenant}.audit` in row 1; Centralized Audit
reads thirteen the same way. Meanwhile Surveillance Filter publishes
`ec.surveillance-gateway.outbox.{tenant}.qualifiedCommunication-dlt` under
`Events Published` and will record it as a DLT. Classify by the suffix and all
three agree; classify by what the topic means to *you* and the map grows a second
node for each of the estate's 31 DLTs.

#### `id` conventions — this is the merge key

Parent 2 merges fifteen extracts by joining on `id`. Two agents inventing two ids
for one thing produces two nodes on the map, so the forms are fixed:

| Kind | Form | Example |
|---|---|---|
| `service` | the service slug, no prefix | `echo-engine` |
| `topic` | `topic:` + **the topic's own name**, tenant placeholder normalised | `topic:ec.echo-engine.{tenant}.echoAction` |
| `dlt` | `dlt:` + **the DLT topic's own name**, same normalisation | `dlt:ec.echo-engine.{tenant}.echoAction-ec-echo-engine-dlt` |
| `store` | one of four fixed ids — see below | `store:surveil.av5` |
| `external` | one of three fixed ids — see below | `external:archive` |

**The id is derived from the name, never from who publishes it.** An earlier
draft said `topic:` + producer + `.` + last segment. That cannot work, and the
reasons are worth keeping so it is not re-proposed:

- **Shared topics have several producers.** `ec.centralized.{tenant}.audit` is
  published by Echo Engine, Policy Evaluator and Queue Qualifier and consumed by
  Reporting. A producer-keyed id gives that one topic four ids and the map four
  nodes.
- **"Producer" is ambiguous.** For `ec.alerting-service.{tenant}.alertedCommunication`
  it means either the slug `alerting` or the name's own segment
  `alerting-service`, and the two differ for every `ec.alerting-service.*`,
  `ec.surveillance-gateway.*`, `ec.surveillance-manual-run.*`,
  `ec.surveillance-policy-evaluator.*`, `ec.surveillance-qualifier.*` and
  `ec.manual-runs.*` topic in the estate.
- **"Last segment" degenerates.** `ec.centralized.{tenant}.audit.indexer.event`
  reduces to `event`; `supBulkIndexingTopic_k8s`, `supActionIndexTopic_k8s` and
  `conduct_audit_topic` have no segments at all.
- **DLT names embed the *consuming* service**, so one source topic has as many
  DLTs as it has consumers. Centralized Audit's Events Consumed table writes both
  `ec.surveillance-policy-evaluator.{tenant}.surveilled-dlt` **and**
  `…surveilled-audit-adapter-dlt`, and Indexer adds `{original-topic}-ec-indexer-dlt`
  over the same source topic. Same for
  `ec.surveillance-filter.{tenant}.evaluations-audit-adapter-dlt` beside
  `…evaluations-ec-surveillance-policy-evaluator-dlt`. A source-topic-keyed id
  merges those distinct topics into one node.

Deriving from the name makes the join mechanical: two agents looking at the same
topic write the same id without knowing anything about each other's document, and
`retries[].dltTarget` joins to its `dlt` node by construction.

**Tenant placeholder normalisation — in the `id` only.** Inside an `id`, rewrite
`<tenant>`, `{t}` and `%s` to **`{tenant}`**. Everything else in the name is kept
character for character. `name` always keeps the document's literal text,
placeholder and all — the normalisation exists so the merge key is stable, not to
correct the document, and `tenancy[]` is where the difference is recorded.

These are the forms that actually occur **inside a topic name**, swept across all
33 documents:

| Form | Occurrences | Where |
|---|---|---|
| `{tenant}` | 209 | most documents |
| `{t}` | 67 | stop_info files mostly |
| `<tenant>` | 20 | Echo Engine |
| `%s` | 4 | Policy Evaluator prose |
| `TENANT` | 2 | Policy Evaluator mermaid participant only |
| `*` | 1 | Reporting / Indexer mermaid only |

`{tenantName}` and `{tenantId}` are **REST path** placeholders — Reporting's
inbound paths use the first and its outbound path the second — and never appear
in a topic name. Do not normalise a path; only ids are normalised, and no id is
built from a path.

`TENANT` and `*` are deliberately **not** normalised, because treating an
unbraced word as a placeholder means guessing. Both occur only in mermaid labels
for topics that a table names properly elsewhere, so: **when a topic is named in
both a table and a mermaid label, the table is authoritative.** The validator
notes an id still carrying either.

Ids are long. That is the correct trade: an id is a key, not a label, and
`name` and `displayName` are what the map draws.

**`external:` means outside the estate, never merely outside the service you are
extracting.** This is the trap: Gateway calls Config Curator, so Gateway's
extract reaches for `external:config-curator` — reasonable, since Config Curator
is external *to Gateway*. But Config Curator is one of the fifteen and its own
extract calls it `config-curator`. Two reasonable agents, one service, two nodes
on the map. If the thing you are referencing is one of the fifteen in-scope
services, use its bare slug and `kind: "service"`, however external it feels from
where you are standing.

The fifteen canonical service slugs: `gateway` · `queue-qualifier` ·
`surveillance-filter` · `policy-evaluator` · `quota-manager` · `indexer` ·
`config-curator` · `centralised-audit` · `conduct-audit-service` · `alerting` ·
`echo-engine` · `manual-run` · `reporting` · `review-service` · `actioning`.
Note `centralised-audit` is spelled with an `s`, matching the service name, while
its folder is `Centralized Audit` with a `z`.

##### Cross-service names — the documents do not use the slugs

Almost none of them do. Every name below appears in a real
`REST APIs Consumed (Outbound)` table and means one of the fifteen. Use the slug
in the `id`; keep the document's wording in `name` and in `restOutbound[].target`:

| Written in a document as | Slug |
|---|---|
| `ec-gateway`, `Gateway` | `gateway` |
| `queue-qualifier`, `ec-queue-qualifier`, `Queue Qualifier`, **`Pipeline Qualifier`**, `pipeline-qualifier` | `queue-qualifier` |
| `surveillance-filter`, `ec-surveillance-filter`, `Surveillance Filter` | `surveillance-filter` |
| `policy-evaluator`, `ec-surveillance-policy-evaluator` | `policy-evaluator` |
| `quota-manager`, `ec-surveillance-quota-manager` | `quota-manager` |
| `config-curator`, `Config Curator`, `ec-config-curator` | `config-curator` |
| `central-audit`, `ec-centralised-audit`, `Centralised Audit` | `centralised-audit` |
| `alerting-service`, `ec-alerting-service` | `alerting` |
| `Manual Run Service`, `ec-manual-runs-service` | `manual-run` |
| `ec-reporting` | `reporting` |

**`Pipeline Qualifier` is Queue Qualifier.** Policy Evaluator, Quota Manager and
Reporting all call it that. Parent #3 settled it: the folder `Queue Qualifier`,
the service `ec-surveillance-pipeline-qualifier` and the image's "Queue
(Pipeline) Qualifier" are one component. Three extracts would otherwise put a
`pipeline-qualifier` node on a map that already has `queue-qualifier`.

**`central-audit` is `centralised-audit`, not `conduct-audit-service`** — there
are two audit services and Manual Run's `POST /v1/tenants/{t}/source` is
`ec-centralised-audit`'s `SourceController`. If your document's target name is
not on this list and you cannot tell which of the fifteen it is, write the row in
`restOutbound[]`, record an `ambiguities` entry, and create **no node** — an
invented id costs more than a missing edge.

#### Which stores become nodes

Parent #3 decided this and it is not open. There are exactly **four** store
nodes in the whole model, and these are their ids:

`store:EA-S3` · `store:EC-S3` · `store:surveil.av5` · `store:review.v1`

**`EA-S3` and `EC-S3` appear in no document.** Parent #3 renamed them from the
image's labels; the documents write `AWS S3`, `Source Bucket`, `Conduct Bucket`,
`Tenant-specific buckets`, `ec-surveillance-results`. So:

- Create an S3 store node **only if your own document tells you which bucket
  role it is** — the archive-side source that content is read from (`EA-S3`) or
  the Conduct-side destination it is written to (`EC-S3`) — and record the basis
  in `ambiguities`. Gateway's Persistent Store Interactions and its mermaid
  (`SRC[(Source Bucket)]`, `DST[(Conduct Bucket)]`) do tell you; Indexer's
  "Tenant-specific buckets" does not.
- If it does not, put the interaction in `stores[]` with `store: 's3'`, write an
  `ambiguities` entry saying the bucket could not be identified, and create **no
  node and no edge**. Parent 2 places it. Do not invent `store:AWS-S3`.

`surveil.av5` and `review.v1` are the easy case: Indexer names both verbatim, so
its extract carries both nodes and an `elastic` edge to each.

Everything else stays in `stores[]` with no node and no edge — every Mongo
collection, every outbox, every Redis, Hazelcast, Ceph, Athena, ShedLock and
Archive-Elasticsearch interaction. `mongo` is in the transport enum because
Parent #3 fixed the six transports, not because Mongo interactions are drawn; if
you do write a `mongo` edge, its `to` must be a `store` node you declared.

#### External systems

Parent #3 kept exactly **three** integrated systems, and these are their ids:

`external:archive` · `external:cognition-analytics` · `external:derived-store`

Their `generation` is `integrated` and their `group` is `none` unless the image
draws them inside a sub-domain frame. The Archive is reached under several names
— `EA Storage`, `Indexing Gateway`, `ea-indexing-gateway`, `Archive
Elasticsearch`, `Archive index (hlrest)` — and they are one node. Indexer and
Manual Run call the *identical* endpoint `POST /v1/index/sup-archive/{tenant}/{source}`
under two of those names, so this is not hypothetical.

**Everything else outbound gets no node and no edge.** Record the call in
`restOutbound[]` and write an `ambiguities` entry. This covers:

- **2.0 components.** Parent #3: "All 2.0 (grey) components excluded …
  `supervision.api` is still called by **Indexer** — recorded in the accuracy
  report as an outbound dependency on an out-of-scope component, **not drawn**."
  So Indexer's `Supervision API` row is recorded and no node is created. There is
  deliberately no `2.0` value in `generation`; writing `integrated` for a 2.0
  component would be false, and `unknown` would throw away a fact you have.
- **Third parties and infrastructure** — `ISS v2` / `ISS V2`, `UAA`,
  `Debezium Connect`, `Conduct Search`, `Cognition Platform`.

`Cognition Platform` (Policy Evaluator) is *not* silently equated with
Parent #3's `Cognition Analytics`, which #3 records as appearing in zero
documents. They may be the same thing. Record the row, record the ambiguity, and
let Parent 2 decide — resolving it here would destroy the evidence that it was
ever a question.

A row in `restOutbound[]` whose target is one of the three externals, or one of
the fifteen services, also gets an edge: `transport: 'rest'`, `direction: 'out'`,
`name` set to the method and path. A `restInbound[]` row does **not** produce an
edge — the caller is outside this extract's knowledge, and inventing a `from` for
it is a guess. This is why the worked example has a `restInbound` row and no
`rest` edge.

`retries[].dltTarget` holds the DLT topic pattern, character-for-character equal
to the `name` of the corresponding `dlt` node — that string equality is how the
two join during the merge, so do not abbreviate one of them. Because a `dlt` id
is `dlt:` + that same name with the tenant placeholder normalised, the node id
follows from `dltTarget` mechanically; if it does not, one of the two is wrong.

`data/layout.js` (issue #5) is authoritative for grid position — do not put
coordinates here.

### `edges[]`

| Field | Notes |
|---|---|
| `from`, `to` | Required. Node ids. An edge missing one silently vanishes from the graph instead of failing, so both are enforced |
| `transport` | Required. **`kafka` · `rest` · `s3` · `mongo` · `elastic` · `cdc`** |
| `direction` | Required, and enum-checked. `in` · `out` · `read` · `write` · `both`. Always determinable — no document leaves it open. `in`/`out` for Kafka and REST, `read`/`write` for stores |
| `name` | Topic name or endpoint path, placeholders intact. `unknown` if the document truly never names it |
| `eventType` | Payload DTO or message type |
| `consumer` / `publisher` | Class and method |
| `consumerGroup`, `purpose`, `trigger`, `note` | Where documented |

**`jdbc` is not a valid transport.** It appears in none of the 33 documents, and
there is no relational store in this estate. The validator rejects it by name.

**`cdc` versus `kafka` is a real distinction, not a nicety.** The wire is Kafka
either way; the semantic is change data capture. The Outbox/CDC layer — the one
that corrects the belief that services publish their own events — depends
entirely on this being got right during extraction. Twelve of sixteen services
use the pattern.

`transport` is a claim about **how the message arrives**, not about what class it
deserialises to. Write `cdc` when the document says any of:

- the payload is a Debezium `CdcEvent`;
- the service writes an outbox collection that Debezium publishes from;
- the topic is described as a CDC topic, or the events as CDC events, in prose
  or in a mermaid label.

Any one of those is sufficient. **Do not treat a `Payload` column that names a
domain class as evidence against CDC** — that column answers a different
question, and most of these tables have no transport column at all.

The worked example is exactly this case, and it is worth reading before you copy
it. Echo Engine's Events Consumed row 1 gives the alert payload as a plain
`AlertEvent`, unlike rows 2 and 3 which say "Debezium `CdcEvent` containing …".
Six other passages — both mermaid diagrams, the `stop_info`'s Short narrative,
Input, Dependencies and its `AlertEvent (CDC)` transformation line — describe the
transport, and all six say CDC. So the edge is `cdc`, the payload observation
goes in `ambiguities`, and **no conflict is recorded**: see "What is *not* a
conflict" above. Whether the producing service unwraps the Debezium envelope is
answerable only from *its* extract, which you must not go and read — and it does
not change what your document says.

### `retries[]`

`consumer` · `topic` · `attempts` · `retryTopics[]` · `dltTarget` · `backoff` ·
`mechanism` · `note` · `source`

**Four of the sixteen documents have a retry section, under four different
names. Check yours before you go hunting through prose:**

| File | Heading |
|---|---|
| `Policy Evaluator/EVENT_FLOW_MAP.md` | `### Retry / DLT Configuration` |
| `Echo Engine/EVENT_FLOW_MAP.md` | `### Retry and DLT topics` |
| `Conduct Audit Service/EVENT_FLOW_MAP.md` | `### Retry and DLT behavior` |
| `Centralized Audit/EVENT_FLOW_MAP.md` | `### 1. Retry / DLT Publishing (via RetryTopicManager)` |

**For the other eleven there is no such section** — the data is scattered across
Events Consumed rows, prose paragraphs and mermaid diagrams, and must be gathered
from all three. Any field may be `"unknown"`; partial retry data is normal.

Cite the section you actually read. Do not cite one of the four headings above
unless it is in *your* file.

**DLT = Dead Letter Topic**, not DLQ. Kafka has no queues. The term appears in 29
of 33 documents; "DLQ" appears in none.

### `stores[]`

`store` (required, see below) · `entity` · `collection` · `repository` ·
`operations` · `calledBy` · `windowed` · `source`

`store` names the technology. Values seen so far, across all fifteen documents:

`mongo` · `s3` · `elastic` · `redis` · `athena` · `ceph` · `hazelcast` ·
`alcatraz` · `shedlock` · `unknown`

**This list is advisory, not enforced.** A value outside it prints a note and
still passes. That is deliberate, and it is the second reversal on this field:
the list began as three values, was widened to eight in review cycle 2 after it
rejected legitimate extracts for three services, and a cycle 3 sweep of the Store
column across every document found two more it would *still* have rejected —
Alcatraz property and service caches in Actioning, ShedLock in Manual Run — plus
a literal `Various` in Policy Evaluator.

Twice widened and still wrong is the signal. The deciding argument is a cost
asymmetry rather than tidiness: a missed odd value costs a tidy-up in Parent 2,
where every extract is being read anyway, while a wrongly rejected extract blocks
an agent who recorded the document faithfully, and its only route past the gate
is to write something the document does not say. **A gate that punishes accuracy
teaches agents to falsify.**

So: use the closest value above if one genuinely fits, invent one if none does,
and say so when you close your issue. `transport` stays a closed set because its
six values drive what gets drawn; `store` is a label.

### `transformation` — one object

```js
transformation: {
  before: 'AlertEvent (CDC) on ec.alerting-service.{tenant}.alertedCommunication',
  action: 'hash policy hits → correlate against state store → classify',
  after: 'EchoActionEvent on ec.echo-engine.{tenant}.echoAction (with classification)',
  source: { file: 'Echo Engine/ec-echo-engine_stop_info.md', heading: 'Transformation' }
}
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

## What the validator enforces

Everything in this list is mechanical. Everything *not* in it — whether the
extracted facts are true — is what reading the document is for, and no tool
substitutes for it.

| Rule | Failure looks like |
|---|---|
| Every entry has a `source`, or an array of them | `edges[1]: missing source` |
| `source.file` and `source.heading` are non-empty and not placeholders | `source.file is a placeholder ("TODO")` |
| `source.row`, when present, is an integer ≥ 1 | `source.row must be a 1-based integer` |
| All eleven collections declared, `transformation` present and an object | `tenancy: missing` |
| `transport` ∈ the six, inside a conflict as well as outside | `edges[0].transport: "jdbc" is not valid` |
| `kind`, `group`, `generation`, `store`, `direction` ∈ their sets | `nodes[0].kind: "queue" is not valid` |
| `generation` written unquoted is caught by name | `got number 3. Quote it: … Write `generation: "3.0"`` |
| Edges have `from`, `to`, `transport`, `direction`; nodes have `id`, `name`, `kind` | `edges[0].to: missing` |
| A `service` node's id is one of the fifteen slugs, naming the slug when the id is a known alias | `"ec-gateway" is not one of the fifteen … use "gateway"` |
| An `external:` id names neither an in-scope service nor a known alias of one | `"external:pipeline-qualifier" names one of the fifteen …` |
| A topic or DLT node's id matches the form derived from its own `name` (a **note**, not a failure) | `expected id "topic:ec.centralized.{tenant}.audit"` |
| A `store:` or `external:` id outside the fixed sets is surfaced (a **note**) | `"store:AWS-S3" is not one of the four store nodes` |
| No `null` and no empty string, at any depth | `retries[0].retryTopics[1]: is null` |
| A conflict has ≥ 2 readings, each with a value and a source | `conflict has 1 reading(s)` |
| The extract is plain, serialisable data | `nodes[0].itself: is a circular reference` |

| A `topic` node whose name ends `-dlt`, or a `dlt` node whose name does not | `"…-dlt" ends in "-dlt", so this node is kind "dlt"` |
| A retry topic recorded as a node | `"…-retry-0" is a retry topic, which is not a node` |
| An id still carrying a template placeholder or wildcard (a **note**) | `"{base-topic}-ec-reporting-dlt" still carries an unresolved placeholder` |

Every problem in a run is reported, with file, entity type and index. It never
stops at the first, and a broken entry never costs you the report on the rest.

### What this validator structurally cannot check — for Parent 2

It compares each id against **its own extract's** `name`. It has no access to the
other fourteen extracts, so a fork in which two agents write two internally
consistent ids for one topic is invisible to it *by construction*. Review cycle 5
demonstrated this: a Reporting extract and a Surveillance Filter extract
disagreeing about ten DLT ids both validate clean with zero notes.

The rules above close every fork found so far by making the id computable from
the topic's own name — both the prefix and the body. But the general check is
cheap and belongs to the merge, where the evidence finally exists:

> **Collect every node id from the fifteen extracts, group by the normalised
> `name`, and fail on any name carrying more than one id.**

One rule, and it catches every fork of this shape including ones nobody has
thought of yet. Parent 2 should run it before merging anything.

---

## Checklist before marking an extraction issue done

- [ ] `node --check data/extracted/<id>.js` passes
- [ ] `node tools/validate-extract.js data/extracted/<id>.js` exits 0
- [ ] All eleven collections declared, empty ones deliberately so
- [ ] Every entry has a `source` naming file and heading
- [ ] Every ambiguity the document flags is copied across
- [ ] Retry data gathered from tables **and** prose **and** mermaid
- [ ] No `null` and no empty string anywhere; silences are `"unknown"`; known absences are `"none"`
- [ ] No conflict resolved — both readings recorded with both sources
- [ ] No conflict *invented* either — each one is two answers to one question,
      not a table and a paragraph wording the same fact differently
- [ ] Every topic and DLT id is `topic:`/`dlt:` + that node's own `name` with the
      tenant placeholder normalised to `{tenant}` — not the producer, not a
      shortened segment
- [ ] `kind` is `dlt` for every node whose name ends `-dlt` and `topic` for every
      other topic node — including DLTs you only consume
- [ ] No retry topic is a node, wherever you met it — including as an Events
      Consumed or Events Published row with its own consumer group
- [ ] No node has a templated name (`{base-topic}-…`, `…-retry-*`); those are
      `retries[]` rows plus an ambiguity
- [ ] Every cross-service id is one of the fifteen slugs, not the name your
      document happens to use for it (`ec-gateway` → `gateway`,
      `Pipeline Qualifier` → `queue-qualifier`)
- [ ] Store and external nodes only from the four and the three fixed ids;
      anything else is a `stores[]` / `restOutbound[]` row plus an ambiguity
- [ ] Every `source` names the section its fields actually came from; an entry
      drawing on two sections cites both
- [ ] Nothing abbreviated: a name the document shortens with `...` is written out
- [ ] Any acceptance fact from issue #3 belonging to this service is reproduced
