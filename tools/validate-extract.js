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
const STORES = ['mongo', 's3', 'elastic', 'redis', 'athena', 'ceph', 'hazelcast', 'unknown'];

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
  edges: { transport: TRANSPORTS, direction: DIRECTIONS },
  stores: { store: STORES }
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

const problems = [];
function fail(file, where, msg) {
  problems.push(`${path.basename(file)}: ${where}: ${msg}`);
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

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node tools/validate-extract.js <extract.js> [...]');
  process.exit(2);
}
files.forEach(checkFile);

if (problems.length) {
  console.error(`\n${problems.length} problem(s) found:\n`);
  problems.forEach((p) => console.error(`  ${p}`));
  console.error('');
  process.exit(1);
}
console.log(`ok — ${files.length} extract(s) conform`);
