'use strict';
/*
 * Tests for tools/validate-layout.js — the grid-placement gate for issue #5.
 *
 *     node --test "tools/test/*.test.js"
 *
 * Written before the validator and before data/layout.js exist.
 *
 * What these defend. `data/layout.js` decides where every node sits on the
 * isometric grid, and the original brief is explicit that relative positions
 * from the architecture image must be preserved, because the team already
 * carries that spatial mental model. A layout that quietly re-orders the
 * pipeline is worse than no layout: it looks authoritative and teaches the
 * wrong shape.
 *
 * The `id` assertions matter for a second reason. Layout ids and extract ids
 * must be the same strings — Parent 2 joins on them. Issue #4 spent three
 * review cycles discovering how easily two files disagree about an id, so the
 * canonical slug list is asserted here rather than trusted.
 */

const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const VALIDATOR = path.join(__dirname, '..', 'validate-layout.js');
const LAYOUT = path.join(__dirname, '..', '..', 'data', 'layout.js');
const FIXTURES = path.join(__dirname, 'fixtures');

function run(...files) {
  let code = 0;
  let out;
  try {
    out = execFileSync('node', [VALIDATOR, ...files], { encoding: 'utf8' });
  } catch (e) {
    code = e.status;
    out = (e.stdout || '') + (e.stderr || '');
  }
  // Strip fixture file names so assertions cannot pass on the filename alone —
  // the flaw review cycle 2 of #4 found in seven of cycle 1's tests.
  const diag = files.reduce((s, f) => s.split(path.basename(f)).join('<file>'), out);
  return { code, out, diag };
}

test('the real layout passes', () => {
  const r = run(LAYOUT);
  assert.strictEqual(r.code, 0, `data/layout.js must be valid:\n${r.out}`);
});

test('a missing in-scope node is reported by name', () => {
  const r = run(path.join(FIXTURES, 'layout-missing-node.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /policy-evaluator/, 'must name the id that is absent');
  assert.match(r.diag, /missing/i);
});

test('an out-of-scope node is rejected', () => {
  // The 2.0 components, UI Portal, EA Indexing Gateway, supervised_items and
  // Egress are all excluded by parent #3. A layout that quietly includes one
  // puts a node on the map that no extract will ever describe.
  const r = run(path.join(FIXTURES, 'layout-out-of-scope.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /ingestor-service/, 'must name the offending id');
  assert.match(r.diag, /not in scope/i);
});

test('two nodes in the same grid cell are rejected', () => {
  const r = run(path.join(FIXTURES, 'layout-collision.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /gateway/);
  assert.match(r.diag, /queue-qualifier/, 'must name both occupants, not just one');
  assert.match(r.diag, /\b3\s*,\s*4\b|\(3, ?4\)/, 'and the cell they share');
});

test('the documented pipeline order must survive', () => {
  // Gateway -> Queue Qualifier -> Surveillance Filter -> Policy Evaluator is
  // left-to-right on the image and is the spine of the default scenario.
  const r = run(path.join(FIXTURES, 'layout-reordered.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /surveillance-filter/);
  assert.match(r.diag, /left of|order/i, 'must say what ordering was violated');
});

test('a service id outside the canonical fifteen is rejected', () => {
  // Layout ids and extract ids are joined by Parent 2. A layout inventing
  // `ec-gateway` where extracts write `gateway` produces two nodes for one
  // service — the exact failure #4 spent three cycles on.
  const r = run(path.join(FIXTURES, 'layout-bad-slug.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /ec-gateway/, 'must quote the invalid id back');
  // Not /gateway/, which "ec-gateway" already satisfies: assert the suggestion.
  assert.match(r.diag, /Use "gateway"/, 'and name the canonical slug to use');
});

test('the store and external ids carry the prefixes the merge key needs', () => {
  // Not a fixture test: an assertion about the real layout, because this is the
  // one defect class that cannot be seen from inside either validator. Parent 2
  // joins these ids to the fifteen extracts, and tools/validate-extract.js
  // refuses any external node id that is not `external:`-prefixed. Review cycle
  // 1 of #5 found the layout writing bare `archive`, `cognition-analytics` and
  // `derived-store`, which would have merged into two nodes for the Archive
  // with neither validator saying a word.
  const layout = require(LAYOUT);
  const ids = layout.nodes.map((n) => n.id);
  for (const id of ['store:EA-S3', 'store:EC-S3', 'store:surveil.av5', 'store:review.v1',
    'external:archive', 'external:cognition-analytics', 'external:derived-store']) {
    assert.ok(ids.includes(id), `data/layout.js must place "${id}" under exactly that id`);
  }
  for (const n of layout.nodes) {
    if (n.kind === 'store') assert.match(n.id, /^store:/, `${n.id} must carry the store: prefix`);
    if (n.kind === 'external') assert.match(n.id, /^external:/, `${n.id} must carry the external: prefix`);
    if (n.kind === 'service') assert.doesNotMatch(n.id, /:/, `${n.id} must be a bare slug`);
  }
});

test('an inferred position without a reason is rejected', () => {
  // Manual Run and Conduct Audit Service have no box on the image and are
  // placed by inference. An inference without a stated basis is a guess.
  const r = run(path.join(FIXTURES, 'layout-inferred-no-reason.js'));
  assert.notStrictEqual(r.code, 0);
  // Not a bare /reason/i alongside /manual-run/: the ordered-chain diagnostic
  // added in review cycle 1 also names manual-run and quotes its source.reason,
  // so that pair stopped discriminating the moment the chain existed. Assert the
  // whole diagnostic.
  assert.match(r.diag, /manual-run\.source: is inferred but gives no usable reason/);
});

test('the two services absent from the image are marked inferred', () => {
  // The inverse: claiming to have read them off a diagram they do not appear on.
  const r = run(path.join(FIXTURES, 'layout-false-provenance.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /conduct-audit-service/);
  assert.match(r.diag, /inferred/i);
});

test('every node carries a source', () => {
  // A bare /source/i here would pass on layout-inferred-no-reason.js and
  // layout-false-provenance.js too, because every source diagnostic contains
  // the token "<id>.source" — proved by cross-matrixing all ten fixtures
  // against all nine assertion sets in review cycle 1. Name the node and the
  // wording, or the test proves only that the validator mentioned sources.
  const r = run(path.join(FIXTURES, 'layout-no-source.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /gateway\.source: missing/, 'must name the node with no source');
  assert.doesNotMatch(r.diag, /inferred/i, 'and must not be the inference diagnostic instead');
});

test('group and generation are checked against the allowed sets', () => {
  const r = run(path.join(FIXTURES, 'layout-bad-enums.js'));
  assert.notStrictEqual(r.code, 0);
  // Not a bare /Search Sub-domain/: the validator's group hint always ends
  // '"Search", not "Search Sub-domain"', so that fires for any invalid group
  // and never checks the offending value was echoed. Assert the quoting.
  assert.match(r.diag, /"Search Sub-domain" is not valid/, 'quote the invalid group back');
  assert.match(r.diag, /2\.0/, 'and reject 2.0, which is out of scope entirely');
});

test('a kind that contradicts its id prefix is rejected', () => {
  // The prefix and the kind say the same thing twice. A node that joins to an
  // extract by id and then disagrees with it about what the thing is corrupts
  // the merge quietly, so the two are cross-checked rather than each validated
  // alone. Both directions, because `external:` and `store:` fail differently.
  const r = run(path.join(FIXTURES, 'layout-kind-prefix-clash.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /external:archive\.kind: "store" contradicts the id/);
  assert.match(r.diag, /store:review\.v1\.kind: "external" contradicts the id/);
});

test('name, kind, group and generation are required, not merely checked when present', () => {
  // docs/MODEL_SCHEMA.md marks all four Required. Until review cycle 1 of #5
  // each was guarded by `if (x !== undefined)`, so a node stripped of all four
  // validated clean — and a missing `kind` additionally disabled the canonical-
  // slug check, which is gated on kind === 'service'.
  const r = run(path.join(FIXTURES, 'layout-missing-fields.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /indexer\.name: is required/);
  assert.match(r.diag, /indexer\.kind: is required/);
  assert.match(r.diag, /indexer\.group: is required/);
  assert.match(r.diag, /indexer\.generation: is required/);
});

test('a node placed off the declared board is rejected', () => {
  // Parent 3 sizes its canvas from grid.columns/rows and iterates the board, so
  // a negative rank or a declared size that has drifted from the data puts a
  // node nowhere. Neither was checked before review cycle 1 of #5: `reporting`
  // could sit at (99, 42), or the file declare 2x2 while placing (12, 7).
  const r = run(path.join(FIXTURES, 'layout-off-board.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /store:EC-S3\.grid: \(-1, 4\) is off the board/, 'negative ranks');
  assert.match(r.diag, /declares 13x8 but the nodes occupy 100x43/, 'and a size that lies');
});

test('an inferred node must sit where its own stated reason says it does', () => {
  // Manual Run and Conduct Audit Service are the only two positions resting on
  // an argument rather than a detected pixel. The validator used to check that
  // the argument existed but never that the position satisfied it, so manual-run
  // could be moved right of Gateway while still reading "upstream-left of
  // Gateway" — an entry that looks fully sourced and is self-contradictory.
  const r = run(path.join(FIXTURES, 'layout-inferred-wrong-side.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /manual-run/, 'must name the node whose position contradicts its reason');
  assert.match(r.diag, /gateway/, 'and the node it is now on the wrong side of');
  assert.match(r.diag, /Got x=2 vs x=12/);
});
