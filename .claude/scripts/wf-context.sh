#!/usr/bin/env bash
# wf-context.sh
#
# SessionStart hook, and the implementation behind /wf-status. Prints where the
# session is in the workflow. Everything it reports is derived from git and
# GitHub, never from local state, so it is correct for a cold session, a resumed
# session, or an unattended run that has no memory of what came before.
#
# Never fails: a session must start even if GitHub is unreachable.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$here/wf-lib.sh" 2>/dev/null || { echo "wf: workflow scripts unavailable"; exit 0; }

branch="$(wf_branch)"
kind="$(wf_branch_kind "$branch")"
issue="$(wf_issue_from_branch "$branch")"

echo "=== ec-document-flow-map workflow ==="
echo "Board: $WF_PROJECT_URL"
echo "Branch: ${branch:-<detached>}  (kind: $kind)"

if ! git -C "$WF_ROOT" check-ignore -q knowledge/ 2>/dev/null; then
  echo "!! knowledge/ IS NOT IGNORED. Stop and fix .gitignore before doing anything."
fi
leaks="$(git -C "$WF_ROOT" status --porcelain 2>/dev/null | grep -i 'knowledge/' || true)"
[ -n "$leaks" ] && echo "!! knowledge/ paths visible to git:" && echo "$leaks"

case "$kind" in
  main)
    cat <<'EOF'

You are on main. Nothing is edited here — the guard will block edits and commits.
Work happens on an issue branch:

    main -> integration/<parent#>-<slug> -> issue/<child#>-<slug>

To start work: enter plan mode, create a parent issue, then a child issue, then
    .claude/scripts/wf-start.sh <child#>

See CLAUDE.md for the full sequence.
EOF
    ;;
  integration|issue)
    if [ -n "$issue" ]; then
      status="$(wf_board_status "$issue" 2>/dev/null || echo "")"
      title="$(wf_issue_title "$issue" 2>/dev/null || echo "")"
      echo "Bound issue: #$issue  [${status:-unknown}]  $title"
      if [ "$kind" = "issue" ]; then
        parent="$(wf_parent_of "$issue" 2>/dev/null || echo "")"
        [ -n "$parent" ] && echo "Parent: #$parent  (integration: $(wf_integration_branch "$parent" 2>/dev/null))"
        echo
        "$here/wf-cycles.sh" "$issue" 2>/dev/null || true
      else
        echo
        echo "Child issues:"
        kids="$(wf_sub_issues "$issue" 2>/dev/null || true)"
        if [ -n "$kids" ]; then
          printf '%s\n' "$kids" | sed 's/^/  /'
        else
          echo "  (none yet — run /wf-breakdown then /wf-children)"
        fi
      fi
    else
      echo "Branch name does not encode an issue number — state cannot be recovered."
      echo "Expected integration/<n>-<slug> or issue/<n>-<slug>."
    fi
    ;;
  *)
    echo
    echo "This branch is outside the workflow naming scheme, so no issue is bound to it."
    echo "Expected integration/<n>-<slug> or issue/<n>-<slug>."
    ;;
esac

# Commits made on this branch that never reached the issue (e.g. committed offline).
if [ -n "$issue" ] && [ -f "$WF_ROOT/.claude/.mirrored" ]; then
  unmirrored=0
  while read -r sha; do
    [ -n "$sha" ] || continue
    grep -q "^$sha" "$WF_ROOT/.claude/.mirrored" 2>/dev/null || unmirrored=$((unmirrored + 1))
  done < <(git -C "$WF_ROOT" log --format='%H' origin/main..HEAD 2>/dev/null)
  if [ "$unmirrored" -gt 0 ]; then
    echo
    echo "!! $unmirrored commit(s) on this branch are not mirrored to the issue."
    echo "   Fix with: .claude/scripts/wf-mirror-commit.sh --retry"
  fi
fi

dirty="$(git -C "$WF_ROOT" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
[ "$dirty" != "0" ] && echo && echo "Working tree: $dirty uncommitted change(s)."

exit 0
