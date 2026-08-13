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

/** A source must name a real file and heading. Empty strings do not count. */
function checkSource(file, where, src) {
  if (src === undefined || src === null) {
    return fail(file, where, 'missing source — every entry must name the file and heading it came from');
  }
  if (typeof src !== 'object') {
    return fail(file, where, `source must be an object, got ${typeof src}`);
  }
  if (src.inferred === true) {
    // Positions inferred rather than read (see issue #5) are legal but must say why.
    if (!src.reason) fail(file, where, 'source.inferred is true but no reason given');
    return;
  }
  if (!src.file || typeof src.file !== 'string') fail(file, where, 'source.file is missing or empty');
  if (!src.heading || typeof src.heading !== 'string') fail(file, where, 'source.heading is missing or empty');
}

/** A conflict records what each source said. One reading is not a conflict. */
function checkConflict(file, where, val) {
  if (!Array.isArray(val.conflict)) {
    return fail(file, where, 'conflict must be an array of readings');
  }
  if (val.conflict.length < 2) {
    return fail(file, where,
      `conflict has ${val.conflict.length} reading(s); a conflict needs at least 2. ` +
      'If the sources agree, record the value directly.');
  }
  val.conflict.forEach((r, i) => {
    if (r.value === undefined) fail(file, where, `conflict[${i}] has no value`);
    checkSource(file, `${where}.conflict[${i}]`, r.source);
  });
}

/**
 * Walks an entry's own fields. null is never acceptable: the sources being
 * silent is a fact worth stating, so it is recorded as the string "unknown".
 * A null cannot be distinguished from an oversight.
 */
function checkFields(file, where, entry) {
  for (const [k, v] of Object.entries(entry)) {
    if (k === 'source') continue;
    const at = `${where}.${k}`;
    if (v === null) {
      fail(file, at, 'is null — use the string "unknown" when the sources are silent, so silence is distinguishable from an oversight');
    } else if (v && typeof v === 'object' && !Array.isArray(v) && 'conflict' in v) {
      checkConflict(file, at, v);
    }
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

  if (!data.service) {
    fail(file, 'service', 'missing — an extract must identify its service');
  } else {
    if (!data.service.id) fail(file, 'service.id', 'missing');
    if (!data.service.name) fail(file, 'service.name', 'missing');
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
      if (!entry || typeof entry !== 'object') {
        return fail(file, where, 'is not an object');
      }
      checkSource(file, where, entry.source);
      checkFields(file, where, entry);

      if (key === 'edges') {
        const t = entry.transport;
        if (t === undefined) {
          fail(file, `${where}.transport`, 'missing');
        } else if (typeof t === 'string' && !TRANSPORTS.includes(t)) {
          fail(file, `${where}.transport`, `"${t}" is not a valid transport. ` +
            `Allowed: ${TRANSPORTS.join(', ')}. ` +
            (t === 'jdbc'
              ? 'Note: "jdbc" appears nowhere in this estate — the stores are MongoDB, S3 and Elasticsearch.'
              : ''));
        }
      }
    });
  }

  // transformation is a single object, not a collection, and drives the
  // document visibly changing at this stop.
  if (data.transformation === undefined) {
    fail(file, 'transformation', 'missing — declare it with "unknown" fields if the stop_info has no Transformation section');
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
