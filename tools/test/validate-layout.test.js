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
  assert.match(r.diag, /gateway/, 'and name the canonical slug to use');
});

test('an inferred position without a reason is rejected', () => {
  // Manual Run and Conduct Audit Service have no box on the image and are
  // placed by inference. An inference without a stated basis is a guess.
  const r = run(path.join(FIXTURES, 'layout-inferred-no-reason.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /manual-run/);
  assert.match(r.diag, /reason/i);
});

test('the two services absent from the image are marked inferred', () => {
  // The inverse: claiming to have read them off a diagram they do not appear on.
  const r = run(path.join(FIXTURES, 'layout-false-provenance.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /conduct-audit-service/);
  assert.match(r.diag, /inferred/i);
});

test('every node carries a source', () => {
  const r = run(path.join(FIXTURES, 'layout-no-source.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /source/i);
});

test('group and generation are checked against the allowed sets', () => {
  const r = run(path.join(FIXTURES, 'layout-bad-enums.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /Search Sub-domain/, 'quote the invalid group back');
  assert.match(r.diag, /2\.0/, 'and reject 2.0, which is out of scope entirely');
});
