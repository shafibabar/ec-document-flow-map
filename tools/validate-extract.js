#!/usr/bin/env node
'use strict';
/*
 * validate-extract.js — the provenance gate for per-service extracts.
 *
 *     node tools/validate-extract.js data/extracted/*.js
 *
 * Exits 0 if every file conforms, non-zero otherwise, printing every problem
 * rather than stopping at the first. Plain Node, no dependencies.
 *
 * Why this exists: fifteen agents write fifteen extracts independently against
 * one written contract. Prose alone will not keep them consistent — by the time
 * Parent 2 tries to merge them, a silently non-conforming file has already cost
 * a review cycle. This is the mechanical check that a human reading the schema
 * cannot be relied upon to perform fifteen times.
 *
 * It deliberately does NOT check whether the extracted facts are *true*. That is
 * what reading the source document is for. This checks shape and provenance only.
 */

const path = require('node:path');

/** The only transports present in the estate. `jdbc` appears nowhere. */
const TRANSPORTS = ['kafka', 'rest', 's3', 'mongo', 'elastic', 'cdc'];

/** Node kinds. Mongo collections are NOT nodes — see docs/MODEL_SCHEMA.md. */
const KINDS = ['service', 'store', 'topic', 'dlt', 'external'];

/**
 * Store technologies named in Persistent Store Interactions sections.
 *
 * Not three. Cycle 1 wrote `['mongo', 's3', 'elastic']` from issue #3's note
 * about why `jdbc` is invalid — but that note is about the estate having no
 * relational store and about which stores get *map stops*, not about which
 * technologies the documents name. Three of the fifteen services record more:
 *
 *   Actioning      Ceph/object store, Hazelcast   (Persistent Store Interactions rows 13-14)
 *   Quota Manager  Redis                          (### Redis)
 *   Manual Run     AWS Athena, Archive Elasticsearch (### AWS Athena, ### Archive Elasticsearch)
 *
 * A gate that rejects what the document plainly says forces the extractor to
 * either drop the row or mislabel it, and both are worse than the row. `jdbc`
 * is still absent from all 33 documents and still not here.
 */
/**
 * Store technologies seen in the corpus so far. **Advisory, not enforced.**
 *
 * This started as a closed enum of three (`mongo`, `s3`, `elastic`). Cycle 2
 * found it rejected legitimate extracts for three services and widened it to
 * eight. A sweep of the Store column across all fifteen documents in cycle 3
 * found two more it would still have rejected — Alcatraz property/service
 * caches (Actioning) and ShedLock (Manual Run) — plus a literal "Various" in
 * Policy Evaluator.
 *
 * Twice widened and still wrong is the signal. The enum is now advisory: an
 * unrecognised value prints a note and exits 0.
 *
 * The reasoning is a cost asymmetry, not laziness. A missed odd value costs a
 * tidy-up in Parent 2, where every extract is being read anyway. A wrongly
 * rejected extract blocks an agent that recorded the document faithfully, and
 * its only route past the gate is to write something the document does not say
 * — a gate that punishes accuracy teaches agents to falsify. `transport` stays
 * closed because its six values drive rendering; `store` is a label.
 */
const KNOWN_STORES = [
  'mongo', 's3', 'elastic', 'redis', 'athena', 'ceph', 'hazelcast',
  'alcatraz', 'shedlock', 'unknown'
];

/**
 * Edge directions. Documented as a closed set since the schema was written; it
 * was the one small closed set left unenforced, so `direction: 'inbound'` used
 * to pass and fifteen authors would have drifted on it exactly as they would
 * have drifted on `kind` and `transport`.
 */
const DIRECTIONS = ['in', 'out', 'read', 'write', 'both'];

/** Sub-domains from the architecture image, plus the two sentinels. */
const GROUPS = ['Alerting', 'Actioning', 'Search', 'Review', 'Reporting', 'none', 'unknown'];

/** 2.0 is out of scope, so it is not listed. `3.0` must be quoted — see below. */
const GENERATIONS = ['3.0', 'integrated', 'none', 'unknown'];

/**
 * The `id` prefix each node kind must carry.
 *
 * `id` is the key Parent 2 joins fifteen extracts on. A `service` node carries
 * the bare slug, so it must have no prefix at all — `external:gateway` and
 * `gateway` are different keys.
 */
const ID_PREFIX = {
  topic: 'topic:',
  dlt: 'dlt:',
  store: 'store:',
  external: 'external:'
};

/**
 * The four store nodes and the three external nodes, from Parent #3.
 *
 * Fixed sets rather than free-form slugs, because both were producing several
 * ids for one thing. Indexer and Manual Run call the identical endpoint
 * `POST /v1/index/sup-archive/{tenant}/{source}` on a system one calls "Indexing
 * Gateway" and the other "ea-indexing-gateway"; `external:` + slug-of-the-label
 * gave two nodes. Neither `EA-S3` nor `EC-S3` appears in any of the 33
 * documents at all — Parent #3 renamed them from the image.
 *
 * Advisory, not enforced: an extract that genuinely finds a fifth store or a
 * fourth integrated system must be able to say so. See KNOWN_STORES for why a
 * gate that rejects a faithful reading is the wrong tool here.
 */
const STORE_NODE_IDS = ['store:EA-S3', 'store:EC-S3', 'store:surveil.av5', 'store:review.v1'];
const EXTERNAL_NODE_IDS = ['external:archive', 'external:cognition-analytics', 'external:derived-store'];

/**
 * Every name a document uses for one of the fifteen, mapped to its slug.
 *
 * Cycle 3 blocked `external:config-curator`, which is right and insufficient:
 * **no document writes `config-curator`**. Sweeping the outbound REST tables
 * across the corpus, the fifteen are referred to as `ec-gateway`,
 * `alerting-service`, `central-audit`, `Pipeline Qualifier`,
 * `ec-surveillance-quota-manager` and so on. The old check compared
 * `id.replace(/^external:/, '')` against the slug list, so it rejected the one
 * spelling an extractor is least likely to write and admitted every spelling the
 * documents hand them.
 *
 * `Pipeline Qualifier` is the expensive one: Policy Evaluator, Quota Manager and
 * Reporting all call Queue Qualifier that, and Parent #3 decided explicitly that
 * they are one component.
 *
 * `central-audit` is `centralised-audit`, not `conduct-audit-service`: there are
 * two audit services, and Manual Run's `POST /v1/tenants/{t}/source` is
 * `ec-centralised-audit`'s `SourceController`.
 */
const SERVICE_ALIASES = {
  'ec-gateway': 'gateway',
  'ec-queue-qualifier': 'queue-qualifier',
  'pipeline-qualifier': 'queue-qualifier',
  'queue-pipeline-qualifier': 'queue-qualifier',
  'ec-surveillance-pipeline-qualifier': 'queue-qualifier',
  'ec-surveillance-filter': 'surveillance-filter',
  'ec-surveillance-policy-evaluator': 'policy-evaluator',
  'ec-policy-evaluator': 'policy-evaluator',
  'ec-surveillance-quota-manager': 'quota-manager',
  'ec-quota-manager': 'quota-manager',
  'ec-indexer': 'indexer',
  'ec-config-curator': 'config-curator',
  'central-audit': 'centralised-audit',
  'ec-centralised-audit': 'centralised-audit',
  'centralized-audit': 'centralised-audit',
  'ec-centralized-audit': 'centralised-audit',
  'ec-conduct-audit-service': 'conduct-audit-service',
  'conduct-audit': 'conduct-audit-service',
  'alerting-service': 'alerting',
  'ec-alerting-service': 'alerting',
  'ec-echo-engine': 'echo-engine',
  'manual-run-service': 'manual-run',
  'manual-runs-service': 'manual-run',
  'ec-manual-runs-service': 'manual-run',
  'ec-manual-run-service': 'manual-run',
  'ec-reporting': 'reporting',
  'ec-review-service': 'review-service',
  'ec-actioning': 'actioning'
};

/**
 * Tenant placeholders the corpus uses, all normalised to `{tenant}` in an id.
 *
 * Inside a *topic name* the corpus writes only `{tenant}` (209), `{t}` (67),
 * `<tenant>` (20), `%s` (4), plus two mermaid-only oddities handled separately
 * below. `tenantname`/`tenantid` are REST *path* placeholders — they never
 * appear in a topic name — and are kept here defensively rather than because a
 * topic needs them.
 */
const TENANT_TOKENS = ['tenant', 't', 'tenantname', 'tenantid', 'tenant_name'];

/**
 * A dead-letter topic is one whose name ends `-dlt`. That is the whole rule.
 *
 * `kind` decides the id prefix, so leaving `kind` to the extractor's judgement
 * forks the merge key — and the fork is invisible here, because the id is then
 * checked against the prefix that same judgement chose. Reporting reads ten of
 * other services' DLTs as ordinary rows in a table headed `Topic Pattern`, and
 * Centralized Audit reads thirteen, while the services that publish them record
 * them as DLTs. One topic, two ids, both self-consistent.
 *
 * Verified across all 33 documents before being relied on: all 47 `-dlt`
 * suffixed names are dead-letter topics, no dead-letter topic lacks the suffix,
 * and "DLQ" appears nowhere in the corpus.
 */
const DLT_SUFFIX = /-dlt$/;

/**
 * Retry topics are not nodes — they live in `retries[].retryTopics`.
 *
 * Stated in the schema since cycle 1 and never enforced, which only became
 * visible with Reporting: its retry topics are Events Consumed rows carrying
 * their own consumer groups and Events Published rows carrying their own
 * triggers, not lines in a retry section, so an extractor meets them in exactly
 * the place that otherwise produces a node.
 */
const RETRY_SEGMENT = /-retry-(\d+|\*|\{[^}]*\})$/;

/**
 * A placeholder in a topic name that is not the tenant one, or a wildcard.
 *
 * `{base-topic}-ec-reporting-dlt` (Reporting, Events Published rows 7-8) and
 * `…cognition-reconciliation-events-retry-*` (Centralized Audit) are templates,
 * not names. An id built from one joins to nothing; expanding it invents names
 * the document does not contain. Neither is acceptable, so such a topic gets no
 * node at all.
 */
const UNRESOLVED_TOKEN = /\{(?!tenant\})[^}]*\}|(^|[.\-_])\*($|[.\-_])|(^|\.)TENANT(\.|$)/;

/**
 * The id form a topic or DLT node's own `name` implies.
 *
 * `topic:` + the name, with the tenant placeholder normalised. Derived from the
 * name and nothing else, because the alternative — keying on the producer — puts
 * four nodes on the map for `ec.centralized.{tenant}.audit`, which Echo Engine,
 * Policy Evaluator and Queue Qualifier all publish and Reporting consumes.
 */
function normaliseTenant(name) {
  return String(name)
    .replace(/\{([^{}]*)\}|<([^<>]*)>/g, (m, a, b) => {
      const inner = (a === undefined ? b : a).trim().toLowerCase();
      return TENANT_TOKENS.includes(inner) ? '{tenant}' : m;
    })
    .replace(/%s/g, '{tenant}');
}

/**
 * Structural fields the merge in Parent 2 cannot work without.
 *
 * Deliberately short. An edge with no `to` silently vanishes from the graph
 * instead of failing loudly, and a node with no `id` cannot be referenced —
 * those are the failures worth blocking. Descriptive fields (`eventType`,
 * `purpose`, `note`) are left unenforced because a document genuinely may not
 * state them, and the schema's answer for that is the string "unknown", not a
 * validator error.
 */
const REQUIRED = {
  nodes: ['id', 'name', 'kind'],
  edges: ['from', 'to', 'transport', 'direction']
};

/**
 * Which fields of which collection are drawn from a closed set.
 *
 * Table-driven rather than a run of `if (key === ...)` blocks, so that a field
 * cannot be enum-checked in one place and required in another and end up
 * diagnosed twice — which is what used to happen: a node with no `kind` came
 * back as two identical `nodes[0].kind: missing` lines, and the run reported
 * four "problems" for two faults.
 */
const ENUMS = {
  nodes: { kind: KINDS, group: GROUPS, generation: GENERATIONS },
  edges: { transport: TRANSPORTS, direction: DIRECTIONS }
  // `stores.store` is deliberately absent — see KNOWN_STORES.
};

/**
 * Extra sentence appended when a particular wrong value has a known cause.
 *
 * The hint is consulted for non-string values too. It did not used to be: the
 * `typeof val !== 'string'` branch returned first, so `generation: 3.0` — the
 * one mistake the schema warns about in bold — produced a message that never
 * mentioned quoting, and the hint that did was unreachable dead code.
 */
const HINTS = {
  transport: (v) => v === 'jdbc'
    ? ' "jdbc" appears in none of the 33 documents — this estate has no relational store.'
    : '',
  generation: (v) => (v === 3 || v === '3' || v === 3.0)
    ? ' Quote it: `generation: 3.0` is the JavaScript number 3. Write `generation: "3.0"`.'
    : ''
};

/**
 * Words that are never a real file name or heading.
 *
 * Issue #4 requires failing on a "missing, empty or placeholder" source. A
 * source reading `{ file: 'TODO', heading: 'TODO' }` passes every emptiness
 * check while carrying no provenance at all, and it is worse than no source:
 * it looks checked.
 */
const PLACEHOLDERS = [
  'todo', 'tbd', 'fixme', 'xxx', 'n/a', 'na', '?', '-', '...', '…',
  'unknown', 'none', 'placeholder', 'tbc', 'source', 'file', 'heading'
];

/**
 * Array-valued sections every extract must declare, even if empty.
 *
 * Declaring an empty array is deliberate: it says "I read the document and it
 * documents none", which is a different statement from forgetting the section
 * existed. The validator cannot tell those apart if the key is simply absent,
 * so absence is an error.
 */
const COLLECTIONS = [
  'nodes', 'edges', 'retries', 'stores', 'decisions',
  'terminalStates', 'failurePaths', 'restInbound', 'restOutbound',
  'tenancy', 'ambiguities'
];

/**
 * The fifteen in-scope services, by their canonical node id.
 *
 * This is the merge key. Parent 2 joins fifteen independently-written extracts
 * on `id`, and a service referenced by two extracts under two ids becomes two
 * nodes on the map for one service.
 *
 * The failure is specific and was found by writing trial extracts from the
 * schema alone: Gateway calls Config Curator, so Gateway's extract naturally
 * reaches for `external:config-curator` — Config Curator being external *to
 * Gateway*. But Config Curator is one of the fifteen and its own extract will
 * call it `config-curator`. Both agents are being reasonable; the map ends up
 * with two nodes.
 *
 * So `external:` means external to the estate, never merely to the service
 * doing the extracting.
 */
const SERVICE_IDS = [
  'gateway', 'queue-qualifier', 'surveillance-filter', 'policy-evaluator',
  'quota-manager', 'indexer', 'config-curator', 'centralised-audit',
  'conduct-audit-service', 'alerting', 'echo-engine', 'manual-run',
  'reporting', 'review-service', 'actioning'
];

const problems = [];
const notes = [];
function fail(file, where, msg) {
  problems.push(`${path.basename(file)}: ${where}: ${msg}`);
}

/** The slug a cross-service reference means, or null if it names none of them. */
function resolveSlug(bare) {
  const k = bare.trim().toLowerCase().replace(/\s+/g, '-');
  if (SERVICE_IDS.includes(k)) return k;
  return SERVICE_ALIASES[k] || null;
}

/**
 * Node ids must carry their kind's prefix, must not shadow a known service under
 * any of the names the documents use, and — for topics and DLTs — should be the
 * form their own `name` implies.
 */
function checkNodeId(file, where, entry) {
  const { id, kind, name } = entry;
  if (typeof id !== 'string' || typeof kind !== 'string') return; // already diagnosed
  const prefix = ID_PREFIX[kind];

  if (kind === 'service') {
    if (id.includes(':')) {
      return fail(file, `${where}.id`, `a service node carries the bare slug, not "${id}" — ` +
        '"gateway" and "external:gateway" are different merge keys');
    }
    if (!SERVICE_IDS.includes(id)) {
      const slug = resolveSlug(id);
      fail(file, `${where}.id`,
        `"${id}" is not one of the fifteen canonical service slugs` +
        (slug ? `. Use "${slug}" — the documents write it several ways and the id is the merge key.`
              : '. If this is not one of the fifteen, it is not a service node: record the call ' +
                'in restOutbound[] with an ambiguity and create no node.'));
    }
    return;
  }
  if (prefix && !id.startsWith(prefix)) {
    fail(file, `${where}.id`, `a ${kind} node's id must start with "${prefix}", got "${id}"`);
    return;
  }
  const bare = id.slice(prefix ? prefix.length : 0);

  if (kind === 'external') {
    const slug = resolveSlug(bare);
    if (slug) {
      fail(file, `${where}.id`,
        `"${id}" names one of the fifteen in-scope services. Use the bare slug ` +
        `"${slug}" and kind "service". ` +
        '"external" means outside the estate, not merely outside this service.');
    } else if (!EXTERNAL_NODE_IDS.includes(id)) {
      // A note, not a failure: an extract that genuinely finds a fourth
      // integrated system must be able to record it. But Parent #3 kept exactly
      // three, and the Archive is reached under at least five different names.
      notes.push(`${path.basename(file)}: ${where}.id: "${id}" is not one of the three ` +
        `integrated systems (${EXTERNAL_NODE_IDS.join(', ')}). The Archive appears as ` +
        '"EA Storage", "Indexing Gateway", "ea-indexing-gateway" and "Archive Elasticsearch" ' +
        'and is one node. 2.0 components such as supervision.api are not drawn at all — ' +
        'record them in restOutbound[] with an ambiguity.');
    }
  }

  if (kind === 'store' && !STORE_NODE_IDS.includes(id)) {
    notes.push(`${path.basename(file)}: ${where}.id: "${id}" is not one of the four store ` +
      `nodes (${STORE_NODE_IDS.join(', ')}). Everything else belongs in stores[] with no ` +
      'node and no edge. If your document does not say which S3 bucket this is, say so in ' +
      'ambiguities rather than inventing an id.');
  }

  if ((kind === 'topic' || kind === 'dlt') && typeof name === 'string'
      && name.trim() !== '' && name.trim().toLowerCase() !== 'unknown') {
    const bareName = name.trim();

    // `kind` picks the prefix, so it cannot be a judgement call: two agents
    // reading one topic must reach one kind. The name decides it.
    if (kind === 'topic' && DLT_SUFFIX.test(bareName)) {
      fail(file, `${where}.id`,
        `"${bareName}" ends in "-dlt", so this node is kind "dlt" and its id is ` +
        `"dlt:${normaliseTenant(bareName)}", not "${id}". A dead-letter topic you ` +
        'merely consume is still a dead-letter topic — Reporting reads ten of them as ' +
        'ordinary rows and the services that publish them record them as DLTs, so ' +
        'classifying by your own vantage point puts two nodes on the map for one topic.');
      return;
    }
    if (kind === 'dlt' && !DLT_SUFFIX.test(bareName)) {
      fail(file, `${where}.id`,
        `"${bareName}" does not end in "-dlt", so this node is kind "topic" and its id ` +
        `is "topic:${normaliseTenant(bareName)}", not "${id}".`);
      return;
    }

    // Retry topics are not nodes at all. Reporting meets them as Events
    // Consumed rows with their own consumer groups, which is exactly where a
    // node would otherwise be created.
    if (RETRY_SEGMENT.test(bareName)) {
      fail(file, `${where}.id`,
        `"${bareName}" is a retry topic, which is not a node. Record it in ` +
        'retries[].retryTopics — with its consumer group and trigger — and create no ' +
        'node and no edge. Only the DLT gets a node, because the DLT is where a ' +
        "document's journey visibly ends.");
      return;
    }

    // A template is not a name.
    if (UNRESOLVED_TOKEN.test(bareName)) {
      notes.push(`${path.basename(file)}: ${where}.id: "${bareName}" still carries an ` +
        'unresolved placeholder or wildcard, so this id joins to nothing. If the document ' +
        'gives only a template ({base-topic}-…, …-retry-*), create no node: record the row ' +
        'in retries[] verbatim plus an ambiguity. If a mermaid label gave TENANT or *, ' +
        'prefer the tabular form of the name — the table is authoritative.');
    }

    const expected = prefix + normaliseTenant(bareName);
    if (id !== expected) {
      notes.push(`${path.basename(file)}: ${where}.id: is "${id}"; the id derived from this ` +
        `node's own name is "${expected}". The id is the merge key and is derived from the ` +
        'topic name, never from who publishes it — a producer-keyed id gives ' +
        'ec.centralized.{tenant}.audit four ids, one per publisher.');
    }
  }
}

/**
 * True for a string that names nothing — '', '   ', 'TODO', 'TODO.', '...'.
 *
 * Both forms are tested because trailing-punctuation stripping turns 'TODO.'
 * into 'todo' but also turns '...' into '', which would otherwise escape.
 */
function isPlaceholder(s) {
  const t = String(s).trim().toLowerCase();
  return t === '' || PLACEHOLDERS.includes(t) || PLACEHOLDERS.includes(t.replace(/[.\s]+$/, ''));
}

/**
 * A source must name a real file and heading. Empty strings do not count, and
 * neither do placeholders: `{ file: 'TODO' }` is worse than no source, because
 * it looks like provenance that was checked.
 *
 * `source` may also be an **array** of source objects, for an entry whose
 * fields were read from more than one section. The schema requires retry data
 * to be gathered from tables *and* prose *and* mermaid, so a single
 * `{file, heading}` cannot describe where such an entry came from.
 */
function checkSource(file, where, src) {
  if (Array.isArray(src)) {
    if (src.length === 0) {
      return fail(file, where, 'source is an empty array — list at least one {file, heading}');
    }
    return src.forEach((s, i) => checkOneSource(file, `${where}.source[${i}]`, s));
  }
  checkOneSource(file, where, src);
}

function checkOneSource(file, where, src) {
  if (src === undefined || src === null) {
    return fail(file, where, 'missing source — every entry must name the file and heading it came from');
  }
  if (typeof src !== 'object') {
    return fail(file, where, `source must be an object, got ${typeof src}`);
  }
  if (src.inferred === true) {
    // Positions inferred rather than read (see issue #5) are legal but must say why.
    if (!src.reason || typeof src.reason !== 'string' || isPlaceholder(src.reason)) {
      fail(file, where, 'source.inferred is true but no reason given — an inference without a stated basis is a guess wearing a badge');
    }
    return;
  }
  for (const k of ['file', 'heading']) {
    if (!src[k] || typeof src[k] !== 'string') {
      fail(file, where, `source.${k} is missing or empty`);
    } else if (isPlaceholder(src[k])) {
      fail(file, where, `source.${k} is a placeholder ("${src[k]}") — name the real ${k === 'file' ? 'file, relative to knowledge/Conduct Services/' : 'section heading'}`);
    }
  }
  if (src.row !== undefined && (!Number.isInteger(src.row) || src.row < 1)) {
    fail(file, where, `source.row must be a 1-based integer, got ${JSON.stringify(src.row)}`);
  }
}

/** A conflict records what each source said. One reading is not a conflict. */
function checkConflict(file, where, val, seen) {
  if (!Array.isArray(val.conflict)) {
    return fail(file, where, 'conflict must be an array of readings');
  }
  if (val.conflict.length < 2) {
    return fail(file, where,
      `conflict has ${val.conflict.length} reading(s); a conflict needs at least 2. ` +
      'If the sources agree, record the value directly.');
  }
  val.conflict.forEach((r, i) => {
    if (!r || typeof r !== 'object') {
      return fail(file, `${where}.conflict[${i}]`, 'is not a {value, source} reading');
    }
    if (r.value === undefined) fail(file, where, `conflict[${i}] has no value`);
    else walk(file, `${where}.conflict[${i}].value`, r.value, seen);
    checkSource(file, `${where}.conflict[${i}]`, r.source);
  });
}

/**
 * Walks a value and everything inside it — nested objects and array elements
 * included.
 *
 * The recursion is the point. The schema says null is invalid *anywhere* and a
 * conflict always needs two readings; a walk that only looked at an entry's own
 * top-level fields would let `retryTopics: [null]` and a one-sided conflict
 * buried one level down straight through, while the schema promised otherwise.
 *
 * `seen` is the set of ancestors on the current path, so a genuinely circular
 * extract is reported rather than hanging, while the same object appearing
 * twice in different places is not mistaken for a cycle.
 */
function walk(file, where, value, seen) {
  if (value === null) {
    return fail(file, where, 'is null — use the string "unknown" when the sources are silent, so silence is distinguishable from an oversight');
  }
  if (typeof value === 'string') {
    if (value.trim() === '') {
      fail(file, where, 'is an empty string — write "unknown" for silence, "none" for a documented absence');
    }
    return;
  }
  if (typeof value !== 'object') return;

  if (seen.has(value)) {
    return fail(file, where, 'is a circular reference — an extract must be plain, serialisable data');
  }
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(file, `${where}[${i}]`, v, seen));
  } else if ('conflict' in value) {
    checkConflict(file, where, value, seen);
  } else {
    for (const [k, v] of Object.entries(value)) {
      // A nested object may carry its own provenance; validate it as one.
      if (k === 'source') checkSource(file, where, v);
      else walk(file, `${where}.${k}`, v, seen);
    }
  }

  seen.delete(value);
}

/** Walks an entry's fields. Its own `source` is checked separately. */
function checkFields(file, where, entry) {
  const seen = new Set([entry]);
  for (const [k, v] of Object.entries(entry)) {
    if (k === 'source') continue;
    walk(file, `${where}.${k}`, v, seen);
  }
}

/**
 * Enum check that sees through a conflict.
 *
 * Without this, `transport: { conflict: [{ value: 'jdbc' }, ...] }` smuggles the
 * one value the issue names explicitly straight past the gate.
 */
function checkEnum(file, where, val, allowed, hint) {
  if (val === undefined) return fail(file, where, 'missing');
  if (val && typeof val === 'object' && Array.isArray(val.conflict)) {
    return val.conflict.forEach((r, i) => {
      if (r && typeof r === 'object') checkEnum(file, `${where}.conflict[${i}]`, r.value, allowed, hint);
    });
  }
  const extra = hint ? hint(val) : '';
  if (typeof val !== 'string') {
    return fail(file, where,
      `must be one of ${allowed.join(', ')}, got ${typeof val} ${JSON.stringify(val)}.${extra}`);
  }
  if (!allowed.includes(val)) {
    fail(file, where, `"${val}" is not valid. Allowed: ${allowed.join(', ')}.${extra}`);
  }
}

function checkFile(file) {
  let data;
  try {
    data = require(path.resolve(file));
  } catch (e) {
    return fail(file, 'load', `could not be loaded: ${e.message}`);
  }
  if (!data || typeof data !== 'object') {
    return fail(file, 'root', 'did not export an object');
  }
  if (Array.isArray(data)) {
    return fail(file, 'root', 'exported an array — an extract exports one object with a service and eleven collections');
  }

  if (!data.service || typeof data.service !== 'object' || Array.isArray(data.service)) {
    fail(file, 'service', 'missing — an extract must identify its service');
  } else {
    if (!data.service.id) fail(file, 'service.id', 'missing');
    if (!data.service.name) fail(file, 'service.name', 'missing');
    checkEnum(file, 'service.group', data.service.group, GROUPS);
    checkEnum(file, 'service.generation', data.service.generation, GENERATIONS, HINTS.generation);
    checkSource(file, 'service', data.service.source);
    checkFields(file, 'service', data.service);
  }

  for (const key of COLLECTIONS) {
    const arr = data[key];
    if (arr === undefined) {
      fail(file, key, 'missing — declare it as [] if the sources document none, so absence is deliberate rather than forgotten');
      continue;
    }
    if (!Array.isArray(arr)) {
      fail(file, key, `must be an array, got ${typeof arr}`);
      continue;
    }
    arr.forEach((entry, i) => {
      const where = `${key}[${i}]`;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return fail(file, where, 'is not an object');
      }
      checkSource(file, where, entry.source);
      checkFields(file, where, entry);

      const enums = ENUMS[key] || {};
      for (const req of REQUIRED[key] || []) {
        // Skip anything the enum pass below also diagnoses, or a single
        // omission is reported as two problems.
        if (req in enums) continue;
        if (entry[req] === undefined) fail(file, `${where}.${req}`, 'missing');
      }
      for (const [field, allowed] of Object.entries(enums)) {
        checkEnum(file, `${where}.${field}`, entry[field], allowed, HINTS[field]);
      }

      if (key === 'stores' && typeof entry.store === 'string'
          && !KNOWN_STORES.includes(entry.store)) {
        notes.push(`${path.basename(file)}: ${where}.store: "${entry.store}" is not a ` +
          'store technology seen before. Not an error — check it matches the document ' +
          'and mention it when closing the issue, so Parent 2 knows to expect it.');
      }

      if (key === 'nodes') checkNodeId(file, where, entry);
    });
  }

  // transformation is a single object, not a collection, and drives the
  // document visibly changing at this stop. It is checked last and defensively:
  // a null here used to throw, which killed the run and threw away every
  // problem already found, so the file came back with one stack trace instead
  // of the list of things to fix.
  if (data.transformation === undefined) {
    fail(file, 'transformation', 'missing — declare it with "unknown" fields if the stop_info has no Transformation section');
  } else if (!data.transformation || typeof data.transformation !== 'object' || Array.isArray(data.transformation)) {
    fail(file, 'transformation', `must be an object with before, action, after and source, got ${JSON.stringify(data.transformation)}`);
  } else {
    checkSource(file, 'transformation', data.transformation.source);
    checkFields(file, 'transformation', data.transformation);
  }
}

/**
 * The three fixed id sets, exported so `tools/validate-layout.js` can use the
 * same arrays rather than a second copy of them.
 *
 * Review cycle 1 of #5 composed layout's `EXPECTED` from its own local copies
 * and recorded that "the two files cannot drift apart again". That closed the
 * drift *inside* validate-layout.js and left the drift *between* the two files
 * wide open: renaming `store:EA-S3` to `store:ea-s3` here alone left
 * `node tools/validate-layout.js data/layout.js` printing "ok" and all fifty
 * tests green — the merge-key failure #22 exists to catch, sitting in the pair
 * of files whose job is to prevent it. One list, imported, is the only version
 * of this that is actually true.
 *
 * The CLI below is behind `require.main === module` so that importing these
 * runs nothing.
 */
module.exports = { SERVICE_IDS, STORE_NODE_IDS, EXTERNAL_NODE_IDS };

if (require.main === module) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('usage: node tools/validate-extract.js <extract.js> [...]');
    process.exit(2);
  }
  files.forEach(checkFile);

  // Advisories print whether or not the run passed — they are things to look at,
  // never reasons to stop.
  if (notes.length) {
    console.log(`\n${notes.length} note(s):\n`);
    notes.forEach((n) => console.log(`  ${n}`));
    console.log('');
  }

  if (problems.length) {
    console.error(`\n${problems.length} problem(s) found:\n`);
    problems.forEach((p) => console.error(`  ${p}`));
    console.error('');
    process.exit(1);
  }
  console.log(`ok — ${files.length} extract(s) conform`);
}
