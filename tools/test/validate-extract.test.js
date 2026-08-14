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

/**
 * Runs the validator; returns {code, out, diag}. Never throws on non-zero exit.
 *
 * `diag` is `out` with the fixture file names stripped out, and it is the one to
 * assert diagnoses against. Every problem line is printed as
 * `basename: where: message`, and the fixtures are named after the fault they
 * carry — so `/circular/i` matched `circular.js` whatever the validator actually
 * said, and `/root/` and `/array/` both matched any line at all from
 * `root-array.js`. Review cycle 2 found seven assertions passing on the file
 * name rather than the diagnosis; two tests had no other assertion than the exit
 * code. Asserting against `diag` makes them mean what their names claim.
 */
function run(...files) {
  let code = 0;
  let out;
  try {
    out = execFileSync('node', [VALIDATOR, ...files], { encoding: 'utf8' });
  } catch (e) {
    code = e.status;
    out = (e.stdout || '') + (e.stderr || '');
  }
  const diag = files.reduce((s, f) => s.split(path.basename(f)).join('<file>'), out);
  return { code, out, diag };
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
  // `edges[1]` literally. Asserting /\b1\b/ — as this test used to — matched the
  // "1 problem(s) found" summary line, so it passed just as happily when the
  // fault was on edges[0]. Verified by moving it there.
  assert.match(r.diag, /edges\[1\]/, 'must name the entity type and the index');
  assert.match(r.out, /missing-source\.js/, 'must name the file');
});

test('transport "jdbc" is rejected — it appears nowhere in the estate', () => {
  const r = run(path.join(FIXTURES, 'bad-transport.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /jdbc/i);
  assert.match(r.diag, /\.transport:/, 'must name the field, not just the file');
});

test('null is rejected where "unknown" is required', () => {
  const r = run(path.join(FIXTURES, 'null-not-unknown.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /is null/, 'must diagnose the null, not merely name the file');
  assert.match(r.diag, /unknown/, 'and say what to write instead');
});

test('a conflict entry with both readings and both sources is valid', () => {
  const r = run(path.join(FIXTURES, 'good-conflict.js'));
  assert.strictEqual(r.code, 0, `conflicts are legal, not errors:\n${r.out}`);
});

test('a conflict with only one reading is rejected', () => {
  const r = run(path.join(FIXTURES, 'bad-conflict.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /conflict has 1 reading\(s\)/);
});

test('all problems are reported, not just the first', () => {
  const r = run(path.join(FIXTURES, 'multi-problem.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /jdbc/i, 'should report the bad transport');
  assert.match(r.diag, /missing source/, 'and also the missing source');
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
  assert.match(r.diag, /is a placeholder/);
  assert.match(r.diag, /source\.file/);
  assert.match(r.diag, /source\.heading/);
});

test('jdbc cannot be smuggled through a conflict wrapper', () => {
  // transport was only enum-checked when it was a string, so wrapping it in a
  // conflict bypassed the one rule the issue names explicitly.
  const r = run(path.join(FIXTURES, 'conflict-transport.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /jdbc/i);
  assert.match(r.diag, /conflict\[0\]/, 'must name which reading is invalid');
});

test('an empty string is rejected where "unknown" is required', () => {
  const r = run(path.join(FIXTURES, 'empty-string.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /attempts/);
  assert.match(r.diag, /backoff/);
  assert.match(r.diag, /unknown/, 'the message must say what to write instead');
});

test('structural gaps fail: an edge with no endpoints, a node with an invented kind', () => {
  const r = run(path.join(FIXTURES, 'structural.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /edges\[0\]\.from/);
  assert.match(r.diag, /edges\[0\]\.to/);
  assert.match(r.diag, /nodes\[0\]\.kind/);
  assert.match(r.diag, /"queue" is not valid/, 'must quote the invalid value back');
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
  assert.match(r.diag, /^\s*<file>: transformation:/m, 'must diagnose the transformation itself');
  assert.doesNotMatch(r.out, /TypeError/, 'must not crash');
  assert.match(r.diag, /jdbc/i, 'the problem found before the crash must still be reported');
});

test('a file exporting an array is diagnosed as such', () => {
  const r = run(path.join(FIXTURES, 'root-array.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /root: exported an array/);
});

test('a circular extract is reported rather than hanging', () => {
  const r = run(path.join(FIXTURES, 'circular.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /is a circular reference/);
});

// ---------------------------------------------------------------------------
// Added in review cycle 2. The first four are the gate being *loosened* where it
// had been tightened past what the documents say; the last two are diagnoses the
// tool promised and did not deliver.
// ---------------------------------------------------------------------------

test('a stores[] section of real corpus rows draws no note and no problem', () => {
  // Cycle 2 wrote this as "every store technology the corpus names is accepted",
  // asserting only exit 0, when the enum was mongo/s3/elastic and rejected Ceph
  // and Hazelcast (Actioning), Redis (Quota Manager) and Athena (Manual Run).
  // Cycle 3 then made `store` advisory, so exit 0 became true of every value —
  // and cycle 4 confirmed the test had gone vacuous by replacing all eight
  // technologies with a made-up one and watching it still pass.
  //
  // The assertion that survives the reversal is the one about notes: these eight
  // are the corpus's own technologies, so none of them should be surfaced as
  // unfamiliar. That fails if a real value is dropped from KNOWN_STORES, which is
  // the regression worth defending now the enum is gone.
  const r = run(path.join(FIXTURES, 'stores-technologies.js'));
  assert.strictEqual(r.code, 0, `these are all real store rows:\n${r.out}`);
  assert.doesNotMatch(r.out, /note\(s\)/,
    `no corpus store technology should be reported as unfamiliar:\n${r.out}`);
});

test('an unheard-of store technology is surfaced as a note, not rejected', () => {
  // This test asserted the opposite until cycle 3. Cycle 2 widened the store
  // enum from three values to eight and added this to stop the widening
  // becoming a free-for-all — a reasonable instinct. But a cycle 3 sweep of the
  // Store column across all fifteen documents found two more the enum would
  // still have rejected (Alcatraz caches, ShedLock) and a literal "Various".
  //
  // Twice widened and still wrong is the signal. `store` is now advisory. The
  // deciding argument is a cost asymmetry: a missed odd value costs a tidy-up
  // in Parent 2, where every extract is read anyway, while a wrongly rejected
  // extract blocks an agent that recorded the document faithfully and whose
  // only way past the gate is to write something the document does not say.
  //
  // `transport` stays closed — its six values drive rendering. `store` is a label.
  const r = run(path.join(FIXTURES, 'bad-store.js'));
  assert.strictEqual(r.code, 0, `a faithful extract must not be blocked:\n${r.out}`);
  assert.match(r.out, /postgres/, 'but the odd value must still be surfaced');
});

test('an invented direction is rejected', () => {
  // Documented as a closed set from the start and never enforced, so
  // direction: "inbound" passed while kind and transport were checked.
  const r = run(path.join(FIXTURES, 'bad-direction.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /edges\[0\]\.direction/);
  assert.match(r.diag, /"inbound" is not valid/);
});

test('an unquoted generation is diagnosed as the quoting mistake it is', () => {
  // `generation: 3.0` is the number 3. The hint that said so was unreachable:
  // the non-string branch returned before it was consulted, and it compared
  // against the string '3' anyway.
  const r = run(path.join(FIXTURES, 'unquoted-generation.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /got number 3/);
  assert.match(r.diag, /Quote it/, 'the message must name the cause, not just the type');
});

test('one omission is reported once, not twice', () => {
  // `direction` is both a REQUIRED field and an enum field, and each pass used
  // to diagnose the omission separately — so a node with no `kind` and an edge
  // with no `transport` came back as four identical-looking lines for two
  // faults, against the issue's requirement to name the offending entry rather
  // than inflate a count.
  const r = run(path.join(FIXTURES, 'structural.js'));
  const lines = r.diag.split('\n').filter((l) => /edges\[0\]\.direction: missing/.test(l));
  assert.strictEqual(lines.length, 1, `expected one line, got ${lines.length}:\n${r.out}`);
});

// ---------------------------------------------------------------------------
// Added in review cycle 3.
// ---------------------------------------------------------------------------

test('an unrecognised store technology is a note, not a failure', () => {
  // The enum was widened twice and was still wrong: a sweep of all fifteen
  // documents found Alcatraz caches and ShedLock, which it would have rejected.
  // A gate that fails a faithful extract teaches agents to write something the
  // document does not say, so this one advises instead.
  const r = run(path.join(FIXTURES, 'unknown-store.js'));
  assert.strictEqual(r.code, 0, `an odd store must not block a faithful extract:\n${r.out}`);
  assert.match(r.diag, /quantumdb/, 'but it must still be surfaced');
  assert.match(r.diag, /note\(s\)/, 'as a note rather than a problem');
});

test('an external: id may not shadow an in-scope service', () => {
  // The merge-key collision: Gateway calls Config Curator and would reasonably
  // write external:config-curator, while Config Curator's own extract writes
  // config-curator — one service, two nodes on the map.
  const r = run(path.join(FIXTURES, 'external-shadow.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /config-curator/, 'must name the offending id');
  assert.match(r.diag, /outside the estate/i,
    'and must explain what external actually means, not just reject it');
});

test('a topic node id must carry its kind prefix', () => {
  const r = run(path.join(FIXTURES, 'unprefixed-id.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /topic:/, 'must state the required prefix');
  assert.match(r.diag, /nodes\[0\]\.id/, 'and name the offending entry');
});

// ---------------------------------------------------------------------------
// Added in review cycle 4. Cycle 3 closed one merge-key collision; writing trial
// extracts of Gateway, Indexer and Manual Run from the schema alone found four
// more, and all four validated clean.
// ---------------------------------------------------------------------------

test('a service node id written as the documents write it is rejected, and the slug named', () => {
  // Cycle 3's check compared id.replace(/^external:/, '') against the fifteen
  // slugs — so it caught `external:config-curator`, the one spelling no document
  // uses, and admitted `ec-gateway`, `alerting-service` and `central-audit`,
  // which are literally the target names in Manual Run's outbound REST table.
  const r = run(path.join(FIXTURES, 'alias-service-id.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /nodes\[0\]\.id.*Use "gateway"/s, 'ec-gateway -> gateway');
  assert.match(r.diag, /nodes\[1\]\.id.*Use "alerting"/s, 'alerting-service -> alerting');
  // central-audit is centralised-audit, NOT conduct-audit-service: there are two
  // audit services and POST /v1/tenants/{t}/source is the centralised one's.
  assert.match(r.diag, /nodes\[2\]\.id.*Use "centralised-audit"/s, 'central-audit -> centralised-audit');
});

test('an external: id shadowing a service under an alias is rejected too', () => {
  // Policy Evaluator, Quota Manager and Reporting all call Queue Qualifier
  // "Pipeline Qualifier". Parent #3 decided they are one component; three
  // extracts would otherwise add a pipeline-qualifier node beside it.
  const r = run(path.join(FIXTURES, 'external-alias.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /Use the bare slug "queue-qualifier"/);
});

test('a producer-keyed topic or DLT id is surfaced with the id its name implies', () => {
  // A note, not a failure — the shape is legal and blocking it would stop a
  // faithful extract. But ec.centralized.{tenant}.audit is published by Echo
  // Engine, Policy Evaluator and Queue Qualifier, so a producer-keyed id gives
  // one topic three ids and the map three nodes.
  const r = run(path.join(FIXTURES, 'producer-keyed-id.js'));
  assert.strictEqual(r.code, 0, `the shape is legal:\n${r.out}`);
  assert.match(r.diag, /nodes\[0\]\.id.*"topic:ec\.centralized\.\{tenant\}\.audit"/s,
    'must name the derived id, not merely complain');
  assert.match(r.diag, /nodes\[1\]\.id.*"dlt:ec\.echo-engine\.\{tenant\}\.echoAction-ec-echo-engine-dlt"/s,
    'a DLT id derives from the DLT topic name, not from the source topic');
  assert.doesNotMatch(r.diag, /nodes\[2\]/,
    'a topic with no dotted segments and a matching id is already correct');
  assert.doesNotMatch(r.diag, /nodes\[3\]/,
    '<tenant> in the name normalises to {tenant} in the id, so this one matches');
});

test('the fifteen slugs, the four store nodes and the three externals are accepted', () => {
  // The other half of every check above: the correct forms must pass silently,
  // or the gate teaches agents to write something else. The worked example is
  // the real evidence for this (below); this asserts the sets themselves.
  const r = run(path.join(FIXTURES, 'good-extract.js'));
  assert.strictEqual(r.code, 0);
  assert.doesNotMatch(r.out, /note\(s\)/, `a conforming extract draws no notes:\n${r.out}`);
});

// ---------------------------------------------------------------------------
// Added in review cycle 5. A Reporting trial extract written from the schema
// alone passed clean — and its ids still did not join, because `kind` picks the
// id prefix and nothing said how to pick `kind`.
// ---------------------------------------------------------------------------

test('a DLT consumed as an ordinary topic is still kind dlt, and the reverse', () => {
  // The fork the validator could not see: it checked each id against the prefix
  // implied by the kind the extractor chose, so either choice was self-consistent.
  // Reporting reads ten of other services' DLTs as rows in a table headed
  // `Topic Pattern`; Surveillance Filter publishes one of them as a DLT. Before
  // this rule both extracts validated clean carrying different ids for one topic.
  const r = run(path.join(FIXTURES, 'consumed-dlt-kind.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /nodes\[0\]\.id.*ends in "-dlt".*kind "dlt"/s,
    'a -dlt name must be classified dlt however it is used');
  assert.match(r.diag, /nodes\[0\]\.id.*merely consume is still a dead-letter topic/s,
    'and the message must say why, since consuming one feels like an ordinary read');
  assert.match(r.diag, /nodes\[1\]\.id.*does not end in "-dlt".*kind "topic"/s,
    'the rule must bind in both directions or it only moves the fork');
});

test('a retry topic is not a node, even as an Events Consumed row', () => {
  // Stated since cycle 1, enforced by nothing. Echo Engine never tested it: its
  // retry topics live in a retry section. Reporting's are Events Consumed rows
  // with their own consumer groups, which is where nodes get made.
  const r = run(path.join(FIXTURES, 'retry-topic-node.js'));
  assert.notStrictEqual(r.code, 0);
  assert.match(r.diag, /nodes\[0\]\.id.*is a retry topic, which is not a node/s);
  assert.match(r.diag, /retries\[\]\.retryTopics/, 'and must name where it does belong');
});

test('an id built from a template or a mermaid placeholder is surfaced', () => {
  // A note, not a failure: the extractor is recording what the document says,
  // and Reporting's Events Published rows 7-8 genuinely give only a template.
  const r = run(path.join(FIXTURES, 'templated-topic-id.js'));
  assert.strictEqual(r.code, 0, `the shape is legal:\n${r.out}`);
  assert.match(r.diag, /nodes\[0\]\.id.*\{base-topic\}.*joins to nothing/s);
  assert.match(r.diag, /nodes\[1\]\.id.*TENANT.*joins to nothing/s,
    'the mermaid-only TENANT form forks the estate\'s most shared topic');
  assert.match(r.diag, /table is authoritative/,
    'and the message must say which form to prefer');
});

test('the real worked example conforms', () => {
  const r = run(path.join(__dirname, '..', '..', 'data', 'extracted', '_example.js'));
  assert.strictEqual(r.code, 0, `the example other agents copy must be valid:\n${r.out}`);
});
