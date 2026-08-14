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

const fs = require('node:fs');

const VALIDATOR = path.join(__dirname, '..', 'validate-layout.js');
const EXTRACT_VALIDATOR = path.join(__dirname, '..', 'validate-extract.js');
const LAYOUT = path.join(__dirname, '..', '..', 'data', 'layout.js');
const FIXTURES = path.join(__dirname, 'fixtures');

// The single source of the fixed node-id sets. Requiring validate-extract.js
// runs nothing: its CLI is behind `require.main === module`.
const { STORE_NODE_IDS, EXTERNAL_NODE_IDS } = require(EXTRACT_VALIDATOR);

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
  //
  // Not a bare /surveillance-filter/ alongside /left of|order/i. The rank check
  // added in review cycle 2 of #5 also names surveillance-filter on
  // layout-collision.js — that fixture's mutation breaks the px-tie invariant
  // as well as the cell — so the loose pair stopped discriminating the moment
  // the rank check existed, and node --test said nothing because this test
  // still passed on its own fixture. Caught by re-running cycle 1's
  // fixture-vs-assertion cross-matrix. Assert the whole diagnostic.
  const r = run(path.join(FIXTURES, 'layout-reordered.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag,
    /surveillance-filter: must be to the right of queue-qualifier — the image puts them/);
  assert.match(r.diag, /Got x=2 vs x=3/, 'and quote both ranks back');
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
  //
  // The expected ids come from validate-extract.js rather than being restated
  // here. That is the point of the test as of review cycle 2 of #5: with the
  // list written out a third time, renaming `store:EA-S3` in validate-extract.js
  // alone left this file green, validate-layout.js printing "ok", and the two
  // gates quietly disagreeing about the merge key — the failure #22 exists to
  // catch, in the pair of files whose job is to prevent it.
  const layout = require(LAYOUT);
  const ids = layout.nodes.map((n) => n.id);
  for (const id of [...STORE_NODE_IDS, ...EXTERNAL_NODE_IDS]) {
    assert.ok(ids.includes(id), `data/layout.js must place "${id}" under exactly that id`);
  }
  assert.strictEqual(STORE_NODE_IDS.length, 4, 'parent #3 fixed four store nodes');
  assert.strictEqual(EXTERNAL_NODE_IDS.length, 3, 'and three integrated systems');
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

test('the two validators share one copy of the fixed id sets', () => {
  // Cycle 1 composed EXPECTED from local copies and recorded that "the two
  // files cannot drift apart". They could: the composition only stopped
  // EXPECTED drifting from those copies, and cross-file nothing compared them.
  // The fix is one list, imported — so this asserts the import rather than
  // asserting that two copies happen to match, which is the thing that failed.
  const src = fs.readFileSync(VALIDATOR, 'utf8');
  assert.match(src, /require\(['"]\.\/validate-extract\.js['"]\)/,
    'validate-layout.js must import the id sets, not restate them');
  assert.doesNotMatch(src, /^const (STORE_NODE_IDS|EXTERNAL_NODE_IDS|SERVICE_IDS)\s*=\s*\[/m,
    'a second literal copy of any fixed id set is exactly the drift this closes');
});

test('a grid rank that crosses the px order is rejected', () => {
  // data/layout.js says the grid is a RANKING of the detected centres. Nothing
  // held it to that: alerting and echo-engine could swap cells — two boxes
  // 1738px apart, inverted — for a clean run and fifty green tests. Cycle 1's
  // proof that monotone clustering cannot invert is true of the data as it
  // stood and is not a check on the next edit.
  const r = run(path.join(FIXTURES, 'layout-rank-inversion.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /echo-engine: is left of reporting on the grid but not on the image/);
  assert.match(r.diag, /px\.x 9552 > 8848, yet grid\.x 10 < 11/, 'quote both centres and both ranks');
});

test('px must be present, integral and inside the image', () => {
  // px is the only machine-checkable evidence in the file and the validator did
  // not mention it: deleting it from all 21 nodes ran clean, which would also
  // have disabled the rank check above.
  const r = run(path.join(FIXTURES, 'layout-px-unsound.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /centralised-audit\.px: must be \{ x, y \} integers/);
  assert.match(r.diag, /store:EA-S3\.px: \(20000, 2154\) is outside the image, which is 10322x4746/);
});

test('an inferred node must not carry a px', () => {
  // The mirror of a rule cycle 1 added one field over. A node drawn nowhere on
  // the image cannot have a centre detected on it.
  const r = run(path.join(FIXTURES, 'layout-px-on-inferred.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /manual-run\.px: is set on an inferred node/);
});

test('a non-string id is diagnosed, not dereferenced', () => {
  // `if (!n.id)` admits 12345 and cycle 1's prefix check then called
  // n.id.startsWith on it. The crash printed no diagnostic for any of the 21
  // nodes — against this validator's own promise to print every problem — and
  // exited 1, indistinguishable from a clean rejection. So assert the
  // diagnostic, never merely the exit code.
  const r = run(path.join(FIXTURES, 'layout-id-not-string.js'));
  assert.notStrictEqual(r.code, 0);
  assert.doesNotMatch(r.diag, /TypeError|is not a function/, 'must not be a crash');
  assert.match(r.diag, /nodes\[\d+\]: id must be a non-empty string, got 12345/);
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
