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
 *    say so and say why; the other nineteen must not claim to be inferred — and
 *    each must sit where its own stated reason says it does, which is why
 *    `manual-run -> gateway` and `reporting -> conduct-audit-service` are
 *    ordered chains rather than prose.
 *  - **Required fields.** `id`, `name`, `kind`, `group` and `generation` are all
 *    Required by docs/MODEL_SCHEMA.md. Absence is reported separately from a
 *    wrong value; a missing `kind` in particular used to disable the id check.
 *  - **Board bounds.** Coordinates are non-negative ranks and the declared
 *    `grid: { columns, rows }` must equal the extent the nodes actually occupy.
 *  - **Grid against px.** data/layout.js states that the grid is a *ranking* of
 *    the detected box centres. Nothing held it to that until review cycle 2 of
 *    #5, so `alerting` and `echo-engine` could have their cells swapped — two
 *    boxes 1738px apart on the image, inverted — and the file still validated.
 *    Cycle 1's argument that monotone clustering cannot invert is true of the
 *    data as it stood; it is not a check on the next edit.
 */

const path = require('node:path');

/**
 * The three fixed id sets, imported rather than restated.
 *
 * Review cycle 1 of #5 found the layout writing bare `archive`,
 * `cognition-analytics` and `derived-store` while every extract writes
 * `external:archive` and friends, because tools/validate-extract.js refuses
 * anything else; the join Parent 2 runs would have produced two nodes for the
 * Archive. It fixed the ids and composed EXPECTED from local copies of the
 * lists, so that "the two files cannot drift apart without this composition
 * changing".
 *
 * They could. The composition stopped EXPECTED drifting from those local
 * copies; cross-file, the two validators held independent literal arrays and
 * nothing compared them. Renaming `store:EA-S3` in validate-extract.js alone
 * left this validator printing "ok" and all fifty tests green. Importing is the
 * fix: one list, rather than two that are asserted to agree.
 */
const { SERVICE_IDS, STORE_NODE_IDS, EXTERNAL_NODE_IDS } = require('./validate-extract.js');

/**
 * The image's own dimensions, from data/layout.js's header. `px` is stated
 * there to be "the detected centre in ORIGINAL image coordinates", so a px
 * outside these bounds is not the centre of anything.
 */
const IMAGE_W = 10322;
const IMAGE_H = 4746;

/** The fourteen services parent #3 draws — the fifteen minus parked `actioning`. */
const PLACED_SERVICE_IDS = SERVICE_IDS.filter((s) => s !== 'actioning');

/**
 * Every node that must be placed, and nothing else.
 *
 * `actioning` is a service but is deliberately absent: parent #3 parks it —
 * extracted by issue #20, not drawn — because its six inbound topics have no
 * documented producer anywhere in the corpus.
 */
const EXPECTED = [...PLACED_SERVICE_IDS, ...EXTERNAL_NODE_IDS, ...STORE_NODE_IDS];

/** The two in scope that the diagram does not draw. */
const NOT_ON_IMAGE = ['manual-run', 'conduct-audit-service'];

/**
 * Left-to-right chains the layout must preserve, each with the authority it
 * rests on — the two authorities are different and the diagnostic says which.
 *
 * The first chain is read off the image and is the spine of the default
 * bulk-indexing scenario. If it inverts, the map teaches the pipeline backwards.
 *
 * The other two hold the file's only two *inferred* positions to the decision
 * that put them there. Before review cycle 1 of #5 the validator checked that
 * an inferred node gave a reason but never that its position satisfied it, so
 * `manual-run` could be moved to the right of Gateway while still reading
 * "placed upstream-left of Gateway" — an entry that looks fully sourced and
 * contradicts itself.
 *
 * Those two `why` texts state the hop directly. They used to open "its own
 * source.reason places it …", which this validator never reads: edit the reason
 * to say the opposite, move the node, and the diagnostic went on attributing
 * the old wording to the file. The constraint is right — the placement is #5's
 * decision and moving it should mean changing this list — but a gate must not
 * read as evidence it did not gather.
 */
const ORDERED_CHAINS = [
  { why: 'the image puts them in that left-to-right order and it is the spine of the default scenario',
    ids: ['external:archive', 'gateway', 'queue-qualifier', 'surveillance-filter',
      'policy-evaluator', 'quota-manager'] },
  { why: 'manual-run is not drawn on the image. Issue #5 placed it upstream-left of Gateway on ' +
      'the documented hop: it publishes ec.surveillance-manual-run.{t}.ingestion, which ' +
      "Gateway's ManualRunEventConsumer consumes. A position that contradicts that decision " +
      'makes the entry self-refuting',
    ids: ['manual-run', 'gateway'] },
  { why: 'conduct-audit-service is not drawn on the image. Issue #5 placed it right of Reporting ' +
      "on the documented hop: Reporting's ConductAuditPublisher publishes conduct_audit_topic, " +
      "which this service's AuditEventConsumer consumes. A position that contradicts that " +
      'decision makes the entry self-refuting',
    ids: ['reporting', 'conduct-audit-service'] }
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
    // `id` must be a string before anything dereferences it. `if (!n.id)` alone
    // admits `12345`, and the prefix/kind cross-check below immediately calls
    // `n.id.startsWith` on it: an uncaught TypeError that printed no diagnostic
    // for this node or any of the twenty others, in a validator whose header
    // promises to print every problem rather than stop at the first — and that
    // exited 1, the same code as a clean rejection, so a test asserting a
    // non-zero exit passed on the crash. tools/validate-extract.js has guarded
    // this since #4; this file did not.
    if (typeof n.id !== 'string' || !n.id.trim()) {
      return fail(where, `id must be a non-empty string, got ${JSON.stringify(n.id)}`);
    }
    const at = `${tag}: ${n.id}`;

    if (byId.has(n.id)) fail(at, 'appears twice');
    byId.set(n.id, n);

    if (!EXPECTED.includes(n.id)) {
      fail(at, `is not in scope. Parent #3 fixes the node set; this id is not in it. ` +
        (SERVICE_IDS.includes(n.id)
          ? 'It is a known service but is parked — extracted, not drawn.'
          : 'The 2.0 components, UI Portal, EA Indexing Gateway, Egress and the outbox/token boxes are all excluded.'));
    }

    // The id prefix and the kind are two statements of the same fact, so they
    // must agree: `external:archive` with kind 'store' would join to the extract
    // node by id and then disagree with it about what the thing is.
    const KIND_FOR_PREFIX = { 'store:': 'store', 'external:': 'external' };
    const prefix = Object.keys(KIND_FOR_PREFIX).find((p) => n.id.startsWith(p));
    const impliedKind = prefix ? KIND_FOR_PREFIX[prefix] : 'service';
    if (n.kind !== undefined && KINDS.includes(n.kind) && n.kind !== impliedKind) {
      fail(`${at}.kind`, `"${n.kind}" contradicts the id. ` + (prefix
        ? `An id beginning "${prefix}" is ${impliedKind === 'external' ? 'an' : 'a'} ${impliedKind} node.`
        : 'A bare slug with no prefix is a service node; a store id begins "store:" ' +
          'and an integrated system\'s begins "external:".'));
    }

    // A service node must use its canonical slug, or the Parent 2 join breaks.
    if (n.kind === 'service' && !SERVICE_IDS.includes(n.id)) {
      const guess = SERVICE_IDS.find((s) => n.id.includes(s) || s.includes(n.id.replace(/^ec-/, '')));
      fail(`${at}.id`, `"${n.id}" is not one of the fifteen canonical service slugs` +
        (guess ? `. Use "${guess}".` : '.'));
    }

    // name, kind, group and generation are Required by docs/MODEL_SCHEMA.md.
    // Absence is checked separately from a wrong value, because an optional-
    // guard idiom made all four silently optional here: a node stripped of all
    // four validated clean, and — worse — dropping `kind` also disabled the
    // canonical-slug check above, since that check is gated on kind==='service'.
    // `name` is the label the map draws, not a transcription of the image. Six
    // of the twenty-one deliberately are not what the image writes — the four
    // stores use their id, `indexer` shortens "Indexer Service" and
    // `queue-qualifier` drops the "(Pipeline)" alias — so the old wording here,
    // "the literal label as the image writes it", described a rule the file
    // does not follow and would have produced a seventh spelling from the next
    // person to add a node. data/layout.js records all six image labels in its
    // header so the reading stays re-checkable.
    if (typeof n.name !== 'string' || !n.name.trim()) {
      fail(`${at}.name`, 'is required — the label the map draws for this node');
    }
    if (n.kind === undefined) {
      fail(`${at}.kind`, `is required. Allowed: ${KINDS.join(', ')}. Without it the ` +
        'canonical-service-slug check cannot run, so a wrong id passes unnamed.');
    } else if (!KINDS.includes(n.kind)) {
      fail(`${at}.kind`, `"${n.kind}" is not valid. Allowed: ${KINDS.join(', ')}`);
    }
    if (n.group === undefined) {
      fail(`${at}.group`, `is required. Allowed: ${GROUPS.join(', ')}. Use "none" for a ` +
        'component drawn outside every sub-domain frame — "drawn outside every frame" ' +
        'and "could not be placed" are different facts and get different values.');
    } else if (!GROUPS.includes(n.group)) {
      fail(`${at}.group`, `"${n.group}" is not valid. Allowed: ${GROUPS.join(', ')}. ` +
        'Use the frame label alone — "Search", not "Search Sub-domain".');
    }
    if (n.generation === undefined) {
      fail(`${at}.generation`, `is required. Allowed: ${GENERATIONS.join(', ')}.`);
    } else if (!GENERATIONS.includes(n.generation)) {
      fail(`${at}.generation`, `"${n.generation}" is not valid. Allowed: ${GENERATIONS.join(', ')}. ` +
        (String(n.generation) === '2.0'
          ? '2.0 components are out of scope entirely and must not be placed.'
          : 'Note 3.0 must be a quoted string; unquoted 3.0 is the number 3.'));
    }

    if (!n.grid || !Number.isInteger(n.grid.x) || !Number.isInteger(n.grid.y)) {
      fail(`${at}.grid`, 'must be { x, y } with integer coordinates');
    } else if (n.grid.x < 0 || n.grid.y < 0) {
      fail(`${at}.grid`, `(${n.grid.x}, ${n.grid.y}) is off the board — coordinates are ` +
        'ranks, counted from 0, and cannot be negative.');
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
      // An inferred node has no position on the image, so it cannot have a
      // detected centre. Review cycle 1 of #5 closed the mirror-image of this
      // one field over — an inferred node must not cite file/heading — and left
      // `px` free, so `manual-run` could carry a measurement of a box that does
      // not exist and validate clean.
      if (n.px !== undefined) {
        fail(`${at}.px`, 'is set on an inferred node. `px` is a centre detected on the image ' +
          'and this node is not drawn on it; the position is carried by source.reason.');
      }
    } else {
      if (!s.file || !s.heading) {
        fail(`${at}.source`, 'must name the image file and the region it was read from');
      }
      if (NOT_ON_IMAGE.includes(n.id)) {
        fail(`${at}.source`, 'cites the image, but this node is NOT drawn on it. ' +
          'It must be marked inferred with the documented hop that justifies its position.');
      }
      // `px` is the only machine-checkable evidence in the file and was not
      // mentioned by this validator at all: it could be deleted from all 21
      // nodes, or set to (0,0) throughout, for a clean run. It is required here
      // because the ranking check below has no teeth without it.
      if (!n.px || !Number.isInteger(n.px.x) || !Number.isInteger(n.px.y)) {
        fail(`${at}.px`, 'must be { x, y } integers — the centre detected on the image. ' +
          'It is what makes the grid rank re-checkable rather than asserted.');
      } else if (n.px.x < 0 || n.px.x >= IMAGE_W || n.px.y < 0 || n.px.y >= IMAGE_H) {
        fail(`${at}.px`, `(${n.px.x}, ${n.px.y}) is outside the image, which is ` +
          `${IMAGE_W}x${IMAGE_H}. px is in ORIGINAL image coordinates.`);
      }
    }
  });

  for (const id of EXPECTED) {
    if (!byId.has(id)) fail(`${tag}: ${id}`, 'is missing — every in-scope node must be placed');
  }

  // The declared grid size must describe the nodes, not merely sit beside them.
  // Parent 3's isometric projection sizes its canvas from `columns`/`rows` and
  // iterates the board, so a declaration that has drifted from the data puts
  // nodes off-canvas. Before review cycle 1 of #5 nothing compared the two, and
  // a layout could declare 2x2 while placing a node at (12, 7).
  const placed = data.nodes.filter((n) => n && n.grid &&
    Number.isInteger(n.grid.x) && Number.isInteger(n.grid.y) && n.grid.x >= 0 && n.grid.y >= 0);
  if (placed.length) {
    const needCols = Math.max(...placed.map((n) => n.grid.x)) + 1;
    const needRows = Math.max(...placed.map((n) => n.grid.y)) + 1;
    const g = data.grid;
    if (!g || !Number.isInteger(g.columns) || !Number.isInteger(g.rows)) {
      fail(tag, 'must declare grid: { columns, rows } as integers');
    } else if (g.columns !== needCols || g.rows !== needRows) {
      fail(`${tag}: grid`, `declares ${g.columns}x${g.rows} but the nodes occupy ` +
        `${needCols}x${needRows}. The declared size is what a renderer sizes its board ` +
        'from, so it must be max+1 on each axis, not an approximation.');
    }
  }

  /*
   * The grid must actually be the ranking data/layout.js says it is.
   *
   * The file's header: "The grid is a RANKING of those centres, not a scaling
   * of them: x and y centres were clustered with a 260px tolerance and
   * numbered. Relative order is therefore preserved exactly." Nothing held it
   * to that. Two drivers, both built by loading the real file and mutating it:
   * `indexer` moved to grid.x=1 while keeping px.x=4004, and `alerting` and
   * `echo-engine` swapping cells outright — a straight inversion of two boxes
   * 1738px apart — both validated clean, and all fifty tests stayed green.
   * ORDERED_CHAINS pins eight nodes; the other thirteen had their order checked
   * by nothing, while acceptance criterion 4 of #5 is that left-to-right and
   * top-to-bottom order matches the image.
   *
   * Cycle 1 reasoned that single-linkage clustering on a sorted axis is
   * monotone, so no pair *can* invert. True of the data as it stood, and not a
   * check: it is a proof about today's file offered where tomorrow's edit needs
   * a gate. Cycle 1 drew that exact distinction itself for the two inferred
   * positions and then left nineteen resting on a comment.
   *
   * What is enforced is monotonicity and nothing more: sorted by px, the ranks
   * must not decrease. That forbids every inversion and permits every tie, so
   * it does not re-run the clustering at a hardcoded 260 — a re-measured px or
   * a different tolerance anywhere in the collision-free 200-270 band still
   * passes, and only a genuine reordering fails.
   */
  for (const axis of ['x', 'y']) {
    const measured = data.nodes.filter((n) => n && n.px && n.grid &&
      Number.isInteger(n.px[axis]) && Number.isInteger(n.grid[axis]));
    const sorted = [...measured].sort((a, b) => a.px[axis] - b.px[axis]);
    for (let i = 1; i < sorted.length; i++) {
      const lo = sorted[i - 1];
      const hi = sorted[i];
      if (hi.grid[axis] < lo.grid[axis]) {
        const side = axis === 'x' ? 'left of' : 'above';
        const tied = hi.px[axis] === lo.px[axis];
        fail(`${tag}: ${hi.id}`, tied
          ? `and ${lo.id} share px.${axis} ${hi.px[axis]} but rank differently: grid.${axis} ` +
            `${hi.grid[axis]} vs ${lo.grid[axis]}. Equal centres must get equal ranks.`
          : `is ${side} ${lo.id} on the grid but not on the image. px.${axis} ` +
            `${hi.px[axis]} > ${lo.px[axis]}, yet grid.${axis} ${hi.grid[axis]} < ` +
            `${lo.grid[axis]}. The grid is a ranking of the detected centres, so ranks may ` +
            'tie but must never cross — that is the whole of what "relative positions are ' +
            'preserved" means, and it is the reason the diagram was used at all.');
      }
    }
  }

  for (const { ids: chain, why } of ORDERED_CHAINS) {
    for (let i = 1; i < chain.length; i++) {
      const a = byId.get(chain[i - 1]);
      const b = byId.get(chain[i]);
      if (!a || !b || !a.grid || !b.grid) continue;
      if (!(a.grid.x < b.grid.x)) {
        fail(`${tag}: ${chain[i]}`, `must be to the right of ${chain[i - 1]} — ${why}. ` +
          `Got x=${b.grid.x} vs x=${a.grid.x}.`);
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
