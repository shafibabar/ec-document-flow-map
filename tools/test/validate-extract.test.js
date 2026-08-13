'use strict';
/*
 * Tests for tools/validate-extract.js — the provenance gate.
 *
 * Written before the validator exists. Run with:
 *     node --test "tools/test/*.test.js"
 *
 * Note the quoted glob. `node --test tools/test/` — which this header used to
 * recommend — does not work on Node 22: it tries to require() the directory as
 * a module and dies with MODULE_NOT_FOUND. Bare `node --test` works but also
 * discovers the files under fixtures/ and reports them as passing "tests",
 * which inflates the count and hides a genuine failure among the noise.
 *
 * Uses node:test, built into Node 22. No dependencies, consistent with the
 * repo's no-build-step constraint.
 *
 * What these tests defend: fifteen agents will each write an extract against
 * one contract, independently. The validator is the only thing that catches a
 * silently non-conforming file before Parent 2 tries to merge them.
 */

const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const VALIDATOR = path.join(__dirname, '..', 'validate-extract.js');
const FIXTURES = path.join(__dirname, 'fixtures');

/** Runs the validator; returns {code, out}. Never throws on non-zero exit. */
function run(...files) {
  try {
    const out = execFileSync('node', [VALIDATOR, ...files], { encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

test('a conforming extract passes with exit 0', () => {
  const r = run(path.join(FIXTURES, 'good-extract.js'));
  assert.strictEqual(r.code, 0, `expected exit 0, got ${r.code}:\n${r.out}`);
});

test('an entry with a missing source fails', () => {
  const r = run(path.join(FIXTURES, 'missing-source.js'));
  assert.notStrictEqual(r.code, 0, 'validator must exit non-zero');
  assert.match(r.out, /source/i);
});

test('a missing source names the entity type and index, not just a count', () => {
  const r = run(path.join(FIXTURES, 'missing-source.js'));
  // The offending entry is edges[1] in the fixture.
  assert.match(r.out, /edges/, 'must name the entity type');
  assert.match(r.out, /\b1\b/, 'must name the index of the offending entry');
  assert.match(r.out, /missing-source\.js/, 'must name the file');
});

test('transport "jdbc" is rejected — it appears nowhere in the estate', () => {
  const r = run(path.join(FIXTURES, 'bad-transport.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.out, /jdbc/i);
  assert.match(r.out, /transport/i);
});

test('null is rejected where "unknown" is required', () => {
  const r = run(path.join(FIXTURES, 'null-not-unknown.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.out, /null/i);
});

test('a conflict entry with both readings and both sources is valid', () => {
  const r = run(path.join(FIXTURES, 'good-conflict.js'));
  assert.strictEqual(r.code, 0, `conflicts are legal, not errors:\n${r.out}`);
});

test('a conflict with only one reading is rejected', () => {
  const r = run(path.join(FIXTURES, 'bad-conflict.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.out, /conflict/i);
});

test('all problems are reported, not just the first', () => {
  const r = run(path.join(FIXTURES, 'multi-problem.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.out, /jdbc/i, 'should report the bad transport');
  assert.match(r.out, /source/i, 'and also the missing source');
});

test('several files can be validated in one invocation', () => {
  const r = run(
    path.join(FIXTURES, 'good-extract.js'),
    path.join(FIXTURES, 'missing-source.js')
  );
  assert.notStrictEqual(r.code, 0, 'one bad file fails the whole run');
  assert.match(r.out, /missing-source\.js/);
});

test('an omitted collection is an error, not an implied empty', () => {
  const r = run(path.join(FIXTURES, 'omitted-collection.js'));
  assert.notStrictEqual(r.code, 0, 'a missing section must fail');
  assert.match(r.out, /tenancy/,
    'must name the omitted section — "I read it and found none" is a different ' +
    'claim from forgetting the section existed');
});

// ---------------------------------------------------------------------------
// Added in review cycle 1. Each of these was a hole found by driving the
// validator with a fixture, not by reading it: every one of them passed.
// ---------------------------------------------------------------------------

test('a null buried inside an array or a nested object is rejected too', () => {
  // The schema promises null is invalid *anywhere*. A walk over an entry's own
  // top-level fields let retryTopics: [null] straight through.
  const r = run(path.join(FIXTURES, 'nested-null.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.out, /retryTopics\[1\]/, 'must name the array index of the null');
  assert.match(r.out, /note\.detail/, 'and the nested object field');
});

test('a placeholder source is rejected, not just an empty one', () => {
  // { file: 'TODO' } passes every emptiness check while carrying no provenance.
  const r = run(path.join(FIXTURES, 'placeholder-source.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.out, /placeholder/i);
  assert.match(r.out, /source\.file/);
  assert.match(r.out, /source\.heading/);
});

test('jdbc cannot be smuggled through a conflict wrapper', () => {
  // transport was only enum-checked when it was a string, so wrapping it in a
  // conflict bypassed the one rule the issue names explicitly.
  const r = run(path.join(FIXTURES, 'conflict-transport.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.out, /jdbc/i);
  assert.match(r.out, /conflict\[0\]/, 'must name which reading is invalid');
});

test('an empty string is rejected where "unknown" is required', () => {
  const r = run(path.join(FIXTURES, 'empty-string.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.out, /attempts/);
  assert.match(r.out, /backoff/);
  assert.match(r.out, /unknown/, 'the message must say what to write instead');
});

test('structural gaps fail: an edge with no endpoints, a node with an invented kind', () => {
  const r = run(path.join(FIXTURES, 'structural.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.out, /edges\[0\]\.from/);
  assert.match(r.out, /edges\[0\]\.to/);
  assert.match(r.out, /kind/);
  assert.match(r.out, /queue/, 'must quote the invalid value back');
});

test('source may be an array when an entry was read from two sections', () => {
  // The schema orders retry data gathered from tables AND prose AND mermaid,
  // so one {file, heading} cannot describe where the entry came from.
  const r = run(path.join(FIXTURES, 'multi-source.js'));
  assert.strictEqual(r.code, 0, `multi-section provenance is legal:\n${r.out}`);
});

test('a null transformation is reported, and earlier problems survive it', () => {
  // This used to throw an uncaught TypeError, which killed the process before
  // the collected problems were printed — the file came back with a stack
  // trace instead of the list of things to fix.
  const r = run(path.join(FIXTURES, 'broken-transformation.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.out, /transformation/);
  assert.doesNotMatch(r.out, /TypeError/, 'must not crash');
  assert.match(r.out, /jdbc/i, 'the problem found before the crash must still be reported');
});

test('a file exporting an array is diagnosed as such', () => {
  const r = run(path.join(FIXTURES, 'root-array.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.out, /root/);
  assert.match(r.out, /array/);
});

test('a circular extract is reported rather than hanging', () => {
  const r = run(path.join(FIXTURES, 'circular.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.out, /circular/i);
});

test('the real worked example conforms', () => {
  const r = run(path.join(__dirname, '..', '..', 'data', 'extracted', '_example.js'));
  assert.strictEqual(r.code, 0, `the example other agents copy must be valid:\n${r.out}`);
});
