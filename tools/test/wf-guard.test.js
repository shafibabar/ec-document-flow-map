'use strict';
/*
 * Tests for .claude/scripts/wf-guard.sh — the PreToolUse guard.
 *
 *     node --test "tools/test/*.test.js"
 *
 * The guard had no tests at all until issue #23. It is the only thing standing
 * between `git add -f knowledge/…` and internal architecture documents reaching
 * git, and it is also capable of refusing perfectly ordinary commits — so both
 * halves need holding down.
 *
 * WHY #23 EXISTED. The rule was a shell glob, `*"git add"*knowledge*`, which
 * matches whenever the first string appears anywhere before the second. A commit
 * that staged with `git add -A` and mentioned `knowledge/` in its message — the
 * line recording that the preflight check passed, which CLAUDE.md instructs
 * agents to write — was refused. It was order-sensitive too: the same two
 * operations in the other order were allowed.
 *
 * That matters more than an annoyance. An agent blocked this way most naturally
 * concludes the commit message is at fault and deletes the verification line,
 * quietly removing the audit trail the rule exists to create.
 *
 * The pair that must always agree is `sameVerdictBothOrders` below: two
 * operations with identical safety properties must not get opposite answers
 * because of the order they were written in.
 *
 * These tests run on an issue branch, so the guard's main-branch rules do not
 * fire and only the knowledge/ rules are under test.
 */

const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const GUARD = path.join(__dirname, '..', '..', '.claude', 'scripts', 'wf-guard.sh');

/** Exit 0 = allowed, 2 = blocked. */
function guard(command) {
  const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
  try {
    execFileSync(GUARD, ['bash'], { input: payload, encoding: 'utf8', stdio: 'pipe' });
    return 0;
  } catch (e) {
    return e.status;
  }
}

const K = 'knowledge/';

// --------------------------------------------------------------------------
// Must block. These are the reason the guard exists: .gitignore alone does not
// stop a force-add, and this is the only thing that does.
// --------------------------------------------------------------------------

test('a force-add of a knowledge/ path is blocked', () => {
  assert.strictEqual(guard(`git add -f ${K}EVENT_FLOW_MAP.md`), 2);
});

test('a plain add of a knowledge/ path is blocked', () => {
  assert.strictEqual(guard(`git add ${K}notes.md`), 2);
});

test('git rm --cached on a knowledge/ path is blocked', () => {
  assert.strictEqual(guard(`git rm --cached ${K}notes.md`), 2);
});

test('a knowledge/ path buried later in a compound command is still blocked', () => {
  assert.strictEqual(guard(`npm test && git add -f ${K}secret.md && git commit -m x`), 2);
});

test('a force-add of the directory itself is blocked', () => {
  assert.strictEqual(guard('git add -f knowledge'), 2);
});

// --------------------------------------------------------------------------
// Must allow. Each of these was refused before #23, or would be by any rule
// that matches the command string rather than the staging operand.
// --------------------------------------------------------------------------

test('staging everything is allowed when nothing under knowledge/ is named', () => {
  assert.strictEqual(guard('git add -A'), 0);
});

test('a commit message that mentions knowledge/ does not block the staging', () => {
  // The exact shape that broke: CLAUDE.md tells agents to record the preflight
  // result in the message, and the message is part of the same command.
  const cmd = `git add -A && git commit -m "Add extract\n\nVERIFICATION\n  ${K} absent from git status"`;
  assert.strictEqual(guard(cmd), 0);
});

test('the documented preflight followed by staging is allowed', () => {
  // Verbatim from CLAUDE.md: check, then stage.
  const cmd = `git status --porcelain | grep -i knowledge; git add -A`;
  assert.strictEqual(guard(cmd), 0);
});

test('the same two operations give the same verdict in either order', () => {
  // The order-sensitivity bug, stated as a property. Two commands with
  // identical safety properties must not get opposite answers.
  const before = guard('echo knowledge; git add -A');
  const after = guard('git add -A; echo knowledge');
  assert.strictEqual(before, after,
    `order changed the verdict: "before" gave ${before}, "after" gave ${after}`);
  assert.strictEqual(after, 0, 'and both should be allowed');
});

test('a heredoc body mentioning knowledge/ does not block the staging', () => {
  const cmd = `git add -A\ngit commit -F - <<'EOF'\nSubject\n\n${K} confirmed ignored\nEOF`;
  assert.strictEqual(guard(cmd), 0);
});

test('the read-only check CLAUDE.md recommends is allowed', () => {
  assert.strictEqual(guard(`git check-ignore -v ${K}`), 0);
});

test('a path that merely starts with the same letters is not a knowledge/ path', () => {
  // `knowledgebase/` is not `knowledge/`. Blocking it would be a false positive
  // of the same family as the one #23 fixed.
  assert.strictEqual(guard('git add knowledgebase/readme.md'), 0);
});

test('an unrelated command is allowed', () => {
  assert.strictEqual(guard('ls -la'), 0);
});
