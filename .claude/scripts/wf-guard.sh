#!/usr/bin/env bash
# wf-guard.sh <edit|bash>
#
# PreToolUse hook. Reads the hook payload on stdin and exits 2 to block, with the
# reason on stderr (which is what Claude sees). Exit 0 allows.
#
# Payload JSON is parsed with node, not jq: there is no jq on this machine, and
# node is already a hard dependency of this repo (the `node --check` gate).
#
# What it refuses:
#   - editing files while on the main branch
#   - git commit / merge / rebase / push while on the main branch
#   - any push targeting main, from any branch
#   - any `git add` that names knowledge/ (this catches `git add -f`, which
#     would otherwise defeat .gitignore)
#
# Escape hatch: EC_ALLOW_MAIN=1 allows main-branch operations and logs every use
# to .claude/main-override.log. It exists for exactly one thing — the final
# reviewed merge to main — and the log is there so its use is never invisible.
set -uo pipefail

mode="${1:-}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(git -C "$here" rev-parse --show-toplevel 2>/dev/null || echo "$here/../..")"

payload="$(cat || true)"

# Fast path: this hook fires on every Bash and every edit. Parsing JSON with
# node costs ~50ms each time. Nothing here can trigger unless the raw payload
# mentions git or knowledge, so bail before spawning node when it does not.
if [ "$mode" = "bash" ]; then
  case "$payload" in
    *git*|*knowledge*) ;;
    *) exit 0 ;;
  esac
fi

extract() {
  printf '%s' "$payload" | node -e '
    let s = "";
    process.stdin.on("data", d => s += d).on("end", () => {
      try {
        const j = JSON.parse(s);
        const t = j.tool_input || {};
        process.stdout.write(String(t.command || t.file_path || t.notebook_path || ""));
      } catch (e) { process.stdout.write(""); }
    });
  ' 2>/dev/null || true
}

branch="$(git -C "$root" branch --show-current 2>/dev/null || echo "")"

# Edits only care about the branch, so the file path is extracted lazily —
# an edit on a non-main branch, which is the overwhelmingly common case, never
# spawns node at all.
if [ "$mode" = "edit" ] && [ "$branch" != "main" ] && [ "${EC_ALLOW_MAIN:-0}" != "1" ]; then
  exit 0
fi

subject="$(extract)"

deny() {
  printf 'BLOCKED by the ec-document-flow-map workflow guard.\n\n%s\n' "$1" >&2
  exit 2
}

if [ "${EC_ALLOW_MAIN:-0}" = "1" ]; then
  printf '%s  branch=%s  mode=%s  subject=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$branch" "$mode" "${subject:0:200}" \
    >> "$root/.claude/main-override.log" 2>/dev/null || true
  exit 0
fi

# --- knowledge/ protection, on every branch -----------------------------------
#
# .gitignore already covers this; the guard catches the one thing .gitignore
# cannot: an explicit force-add.
#
# This check matches the OPERAND of a staging verb, not the command string.
# It used to be a shell glob, `*"git add"*knowledge*`, which matches whenever
# the first string appears anywhere before the second — so a commit that staged
# with `git add -A` and mentioned knowledge/ in its message was refused, while
# the same two operations written in the other order were allowed (issue #23).
#
# That is not merely inconvenient. CLAUDE.md instructs agents to record the
# preflight result in the commit message, so the documented workflow produced
# exactly the string that tripped the guard — and an agent blocked that way most
# naturally concludes the message is at fault and deletes the verification line,
# quietly removing the audit trail the rule exists to create. A gate that
# punishes correct behaviour teaches agents to route around it.
#
# The analysis runs in node because it needs to strip heredoc bodies and split
# on statement separators, which is fiddly and error-prone in shell.
verdict="$(printf '%s' "$subject" | node -e '
  let s = "";
  process.stdin.on("data", (d) => (s += d)).on("end", () => {
    // Drop heredoc bodies: their content is data, never an operand.
    s = s.replace(/<<-?\s*[\x27"]?(\w+)[\x27"]?[\s\S]*?^\s*\1\s*$/gm, " ");
    // A trailing unterminated heredoc still must not be read as arguments.
    s = s.replace(/<<-?\s*[\x27"]?\w+[\x27"]?[\s\S]*$/m, " ");

    const STAGING = /^(add|stage|rm)$/;
    for (const stmt of s.split(/[;|&\n]+/)) {
      const tok = stmt.trim().split(/\s+/).filter(Boolean);
      const g = tok.indexOf("git");
      if (g === -1 || !STAGING.test(tok[g + 1] || "")) continue;
      for (const raw of tok.slice(g + 2)) {
        if (raw.startsWith("-")) continue;                 // a flag, not a path
        const a = raw.replace(/^[\x27"]|[\x27"]$/g, "").replace(/^\.\//, "");
        // knowledge or knowledge/... — but not knowledgebase/...
        if (/^knowledge(\/|$)/.test(a)) return process.stdout.write("BLOCK:" + a);
      }
    }
    process.stdout.write("OK");
  });
' 2>/dev/null || echo "OK")"

case "$verdict" in
  BLOCK:*)
    deny "That command stages \"${verdict#BLOCK:}\", which is inside knowledge/.

knowledge/ holds internal architecture documents and must never reach git. It is
gitignored, but 'git add -f' would override that, so this is blocked outright.

If you genuinely need to inspect what git thinks about knowledge/, use the
read-only 'git check-ignore -v knowledge/' instead.

Note: only a path given TO a staging verb triggers this. Mentioning knowledge/
in a commit message or a grep is fine — record your preflight result as usual."
    ;;
esac

# --- main branch protection ---------------------------------------------------
if [ "$mode" = "edit" ] && [ "$branch" = "main" ]; then
  deny "You are on 'main' and this repo never takes edits on main.

Work happens on an issue branch cut from an integration branch:
  main -> integration/<parent#>-<slug> -> issue/<child#>-<slug>

Start the child issue you are working on:
  .claude/scripts/wf-start.sh <child#>

If no issue exists yet, this work has not been planned. Enter plan mode and
create a parent issue first — see CLAUDE.md."
fi

if [ "$mode" = "bash" ]; then
  case "$subject" in
    *"git push"*)
      case "$subject" in
        *" main"*|*"main:"*|*":main"*|*"HEAD:main"*|*"origin main"*)
          deny "That pushes to main. main only ever receives a reviewed merge, performed
deliberately at the end of a parent issue after your manual review.

If this IS that final merge, re-run it with the override, which is logged:
  EC_ALLOW_MAIN=1 <your command>"
          ;;
      esac
      ;;
  esac

  if [ "$branch" = "main" ]; then
    case "$subject" in
      *"git commit"*|*"git merge"*|*"git rebase"*|*"git cherry-pick"*|*"git revert"*)
        deny "You are on 'main' and this repo never commits directly to main.

Cut or check out an issue branch first:
  .claude/scripts/wf-start.sh <child#>

If this is the final reviewed merge of an integration branch into main, use the
logged override:
  EC_ALLOW_MAIN=1 <your command>"
        ;;
    esac
  fi
fi

exit 0
