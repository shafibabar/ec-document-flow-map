#!/usr/bin/env node
'use strict';
/*
 * validate-layout.js — the grid-placement gate for data/layout.js (issue #5).
 *
 *     node tools/validate-layout.js data/layout.js
 *
 * Plain Node, no dependencies. Exits 0 if the layout conforms, non-zero
 * otherwise, printing every problem rather than stopping at the first.
 *
 * What it defends, and why each check earns its place:
 *
 *  - **Scope.** Parent #3 fixes exactly which nodes exist. A layout that adds
 *    one puts a node on the map that no extract will ever describe; a layout
 *    that drops one leaves a documented service nowhere to stand.
 *  - **Relative order.** The brief's whole argument for using the diagram is
 *    that the team already carries its spatial model. A layout that silently
 *    re-orders the pipeline is worse than none: it looks authoritative.
 *  - **Ids.** Layout ids and extract ids are joined by Parent 2. Issue #4 spent
 *    three review cycles discovering how easily two files disagree about an id,
 *    so the canonical slugs are checked here rather than trusted.
 *  - **Inference.** Two nodes are placed by reasoning, not by reading. Both must
 *    say so and say why; the other nineteen must not claim to be inferred.
 */

const path = require('node:path');

/** The fifteen canonical service slugs. Must match tools/validate-extract.js. */
const SERVICE_IDS = [
  'gateway', 'queue-qualifier', 'surveillance-filter', 'policy-evaluator',
  'quota-manager', 'indexer', 'config-curator', 'centralised-audit',
  'conduct-audit-service', 'alerting', 'echo-engine', 'manual-run',
  'reporting', 'review-service', 'actioning'
];

/**
 * Every node that must be placed, and nothing else.
 *
 * `actioning` is a service but is deliberately absent: parent #3 parks it —
 * extracted by issue #20, not drawn — because its six inbound topics have no
 * documented producer anywhere in the corpus.
 */
const EXPECTED = [
  'gateway', 'queue-qualifier', 'surveillance-filter', 'policy-evaluator',
  'quota-manager', 'indexer', 'config-curator', 'centralised-audit',
  'conduct-audit-service', 'alerting', 'echo-engine', 'manual-run',
  'reporting', 'review-service',
  'archive', 'cognition-analytics', 'derived-store',
  'store:EA-S3', 'store:EC-S3', 'store:surveil.av5', 'store:review.v1'
];

/** The two in scope that the diagram does not draw. */
const NOT_ON_IMAGE = ['manual-run', 'conduct-audit-service'];

/**
 * Left-to-right chains the image asserts and the layout must preserve.
 *
 * This is the spine of the default bulk-indexing scenario. If it inverts, the
 * map teaches the pipeline backwards.
 */
const ORDERED_CHAINS = [
  ['archive', 'gateway', 'queue-qualifier', 'surveillance-filter', 'policy-evaluator', 'quota-manager']
];

const GROUPS = ['Alerting', 'Actioning', 'Search', 'Review', 'Reporting', 'none', 'unknown'];
const GENERATIONS = ['3.0', 'integrated', 'none', 'unknown'];
const KINDS = ['service', 'store', 'external'];

const problems = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);

function checkFile(file) {
  let data;
  try {
    data = require(path.resolve(file));
  } catch (e) {
    return fail('load', `${path.basename(file)} could not be loaded: ${e.message}`);
  }
  const tag = path.basename(file);
  if (!data || !Array.isArray(data.nodes)) {
    return fail(tag, 'did not export an object with a nodes array');
  }

  const byId = new Map();
  const cells = new Map();

  data.nodes.forEach((n, i) => {
    const where = `${tag}: nodes[${i}]`;
    if (!n || typeof n !== 'object') return fail(where, 'is not an object');
    if (!n.id) return fail(where, 'has no id');
    const at = `${tag}: ${n.id}`;

    if (byId.has(n.id)) fail(at, 'appears twice');
    byId.set(n.id, n);

    if (!EXPECTED.includes(n.id)) {
      fail(at, `is not in scope. Parent #3 fixes the node set; this id is not in it. ` +
        (SERVICE_IDS.includes(n.id)
          ? 'It is a known service but is parked — extracted, not drawn.'
          : 'The 2.0 components, UI Portal, EA Indexing Gateway, Egress and the outbox/token boxes are all excluded.'));
    }

    // A service node must use its canonical slug, or the Parent 2 join breaks.
    if (n.kind === 'service' && !SERVICE_IDS.includes(n.id)) {
      const guess = SERVICE_IDS.find((s) => n.id.includes(s) || s.includes(n.id.replace(/^ec-/, '')));
      fail(`${at}.id`, `"${n.id}" is not one of the fifteen canonical service slugs` +
        (guess ? `. Use "${guess}".` : '.'));
    }

    if (n.kind !== undefined && !KINDS.includes(n.kind)) {
      fail(`${at}.kind`, `"${n.kind}" is not valid. Allowed: ${KINDS.join(', ')}`);
    }
    if (n.group !== undefined && !GROUPS.includes(n.group)) {
      fail(`${at}.group`, `"${n.group}" is not valid. Allowed: ${GROUPS.join(', ')}. ` +
        'Use the frame label alone — "Search", not "Search Sub-domain".');
    }
    if (n.generation !== undefined && !GENERATIONS.includes(n.generation)) {
      fail(`${at}.generation`, `"${n.generation}" is not valid. Allowed: ${GENERATIONS.join(', ')}. ` +
        (String(n.generation) === '2.0'
          ? '2.0 components are out of scope entirely and must not be placed.'
          : 'Note 3.0 must be a quoted string; unquoted 3.0 is the number 3.'));
    }

    if (!n.grid || !Number.isInteger(n.grid.x) || !Number.isInteger(n.grid.y)) {
      fail(`${at}.grid`, 'must be { x, y } with integer coordinates');
    } else {
      const key = `${n.grid.x},${n.grid.y}`;
      if (cells.has(key)) {
        fail(at, `shares grid cell (${n.grid.x}, ${n.grid.y}) with ${cells.get(key)}. ` +
          'Two nodes cannot occupy one tile.');
      } else {
        cells.set(key, n.id);
      }
    }

    // Provenance: read from the image, or inferred with a stated basis.
    const s = n.source;
    if (!s || typeof s !== 'object') {
      fail(`${at}.source`, 'missing — every node must cite the image or state its inference');
    } else if (s.inferred === true) {
      if (!s.reason || String(s.reason).trim().length < 20) {
        fail(`${at}.source`, 'is inferred but gives no usable reason. ' +
          'An inference without a stated basis is a guess wearing a badge.');
      }
      if (!NOT_ON_IMAGE.includes(n.id)) {
        fail(`${at}.source`, 'claims to be inferred, but this node IS drawn on the image. ' +
          'Cite it.');
      }
    } else {
      if (!s.file || !s.heading) {
        fail(`${at}.source`, 'must name the image file and the region it was read from');
      }
      if (NOT_ON_IMAGE.includes(n.id)) {
        fail(`${at}.source`, 'cites the image, but this node is NOT drawn on it. ' +
          'It must be marked inferred with the documented hop that justifies its position.');
      }
    }
  });

  for (const id of EXPECTED) {
    if (!byId.has(id)) fail(`${tag}: ${id}`, 'is missing — every in-scope node must be placed');
  }

  for (const chain of ORDERED_CHAINS) {
    for (let i = 1; i < chain.length; i++) {
      const a = byId.get(chain[i - 1]);
      const b = byId.get(chain[i]);
      if (!a || !b || !a.grid || !b.grid) continue;
      if (!(a.grid.x < b.grid.x)) {
        fail(`${tag}: ${chain[i]}`, `must be to the right of ${chain[i - 1]} — the image ` +
          `puts them in that left-to-right order and it is the spine of the default ` +
          `scenario. Got x=${b.grid.x} vs x=${a.grid.x}.`);
      }
    }
  }
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node tools/validate-layout.js <layout.js> [...]');
  process.exit(2);
}
files.forEach(checkFile);

if (problems.length) {
  console.error(`\n${problems.length} problem(s) found:\n`);
  problems.forEach((p) => console.error(`  ${p}`));
  console.error('');
  process.exit(1);
}
console.log(`ok — ${files.length} layout(s) conform`);
