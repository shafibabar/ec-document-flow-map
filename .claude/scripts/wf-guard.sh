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
# .gitignore already covers this; the guard catches the one thing .gitignore
# cannot: an explicit force-add.
case "$subject" in
  *"git add"*knowledge*|*"git stage"*knowledge*|*"git rm --cached"*knowledge*)
    deny "That command names knowledge/ in a git staging operation.

knowledge/ holds internal architecture documents and must never reach git. It is
gitignored, but 'git add -f' would override that, so this is blocked outright.

If you genuinely need to inspect what git thinks about knowledge/, use the
read-only 'git check-ignore -v knowledge/' instead."
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
