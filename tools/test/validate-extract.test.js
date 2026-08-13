'use strict';
/*
 * Tests for tools/validate-extract.js — the provenance gate.
 *
 * Written before the validator exists. Run with:
 *     node --test tools/test/
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

test('the real worked example conforms', () => {
  const r = run(path.join(__dirname, '..', '..', 'data', 'extracted', '_example.js'));
  assert.strictEqual(r.code, 0, `the example other agents copy must be valid:\n${r.out}`);
});
