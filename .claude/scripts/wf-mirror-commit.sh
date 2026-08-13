#!/usr/bin/env bash
# wf-mirror-commit.sh
#
# PostToolUse hook. After any Bash call that contained `git commit`, mirrors the
# full commit message onto the issue bound to the current branch, and onto its
# parent. Automating this is deliberate: "remember to comment on the issue" is
# exactly the discipline that lapses at 2am and in unattended runs.
#
# Best-effort by design. It never fails the commit — a network problem must not
# turn a good commit into an error. Un-mirrored commits are reported by
# wf-status.sh's session briefing instead.
#
# Already-mirrored SHAs are recorded in .claude/.mirrored (untracked) so a hook
# that fires twice does not double-post.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(git -C "$here" rev-parse --show-toplevel 2>/dev/null || echo "$here/../..")"

# --retry is run by hand after an offline commit. It must not read stdin, which
# would block on a terminal.
if [ "${1:-}" = "--retry" ]; then
  retry=1
else
  retry=0
  payload="$(cat || true)"
  # Fast path: fires after every Bash call, so skip the node parse entirely
  # unless the raw payload could possibly contain a commit.
  case "$payload" in *"git commit"*) ;; *) exit 0 ;; esac
  cmd="$(printf '%s' "$payload" | node -e '
    let s = "";
    process.stdin.on("data", d => s += d).on("end", () => {
      try { const j = JSON.parse(s); process.stdout.write(String((j.tool_input||{}).command||"")); }
      catch (e) { process.stdout.write(""); }
    });
  ' 2>/dev/null || true)"
  case "$cmd" in *"git commit"*) ;; *) exit 0 ;; esac
fi

# shellcheck source=/dev/null
. "$here/wf-lib.sh" 2>/dev/null || exit 0

ledger="$root/.claude/.mirrored"
touch "$ledger" 2>/dev/null || true

issue="$(wf_issue_from_branch)"
if [ -z "$issue" ]; then
  printf 'wf: commit not mirrored — branch "%s" is not bound to an issue\n' "$(wf_branch)" >&2
  exit 0
fi

mirror_one() {
  local sha="$1" tmp
  grep -q "^$sha" "$ledger" 2>/dev/null && return 0
  tmp="$(mktemp)"
  {
    printf '<!-- ec-wf kind=commit sha=%s branch=%s -->\n\n' "$sha" "$(wf_branch)"
    printf '## Commit `%s`\n\n' "${sha:0:8}"
    printf '```\n'
    git -C "$root" log -1 --format='%s%n%n%b' "$sha"
    printf '```\n\n'
    printf '**Files changed**\n\n```\n'
    git -C "$root" show --stat --format='' "$sha"
    printf '```\n'
  } > "$tmp"

  if WF_MIN_COMMENT_CHARS=1 "$here/wf-comment.sh" "$issue" "$tmp" --also-parent >/dev/null 2>&1; then
    printf '%s %s\n' "$sha" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$ledger"
    printf 'wf: commit %s mirrored to #%s and its parent\n' "${sha:0:8}" "$issue" >&2
  else
    printf 'wf: could not mirror commit %s to #%s (offline?). The commit itself is fine.\n' "${sha:0:8}" "$issue" >&2
    printf 'wf: re-run later with: .claude/scripts/wf-mirror-commit.sh --retry\n' >&2
    return 1
  fi
  rm -f "$tmp"
}

if [ "$retry" = "1" ]; then
  # Everything on this branch that is not yet on main and not yet mirrored,
  # oldest first so the issue reads in chronological order.
  git -C "$root" log --reverse --format='%H' "origin/main..HEAD" 2>/dev/null \
    | while read -r sha; do
        [ -n "$sha" ] || continue
        mirror_one "$sha" || true
      done
else
  sha="$(git -C "$root" rev-parse HEAD 2>/dev/null || echo "")"
  [ -n "$sha" ] && mirror_one "$sha" || true
fi
exit 0
