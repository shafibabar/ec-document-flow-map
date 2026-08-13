#!/usr/bin/env bash
# wf-finish.sh <child#> <closing-narrative-file>
#
# Closes out a child issue whose review cycles came back clean: merges its issue
# branch into the parent's integration branch with --no-ff (so the issue's work
# stays visible as a unit in history), moves it to Done, and records the closing
# narrative on both the child and the parent.
#
# Refuses to run if the last recorded review cycle was not 'clean'. That check is
# the whole point of the gate — a green-looking branch that never passed a clean
# cycle must not reach the integration branch.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/wf-lib.sh"

issue="${1:-}"; narrative="${2:-}"
[ -n "$issue" ] && [ -n "$narrative" ] || wf_die "usage: wf-finish.sh <child#> <closing-narrative-file>"
[ -f "$narrative" ] || wf_die "narrative file not found: $narrative"
wf_preflight

last="$(gh issue view "$issue" --repo "$WF_REPO_FLAG" --json comments --jq '.comments[].body' 2>/dev/null \
  | grep -o '<!-- ec-wf review-cycle=[0-9]* verdict=[a-z-]*' | tail -1 | sed 's/.*verdict=//' || true)"
if [ "$last" != "clean" ]; then
  wf_die "#$issue has no clean review cycle recorded (last verdict: ${last:-none}).
Run the review cycles to completion first. If the cap was reached without a clean
pass, that is an escalation to the repo owner, not something to merge past."
fi

parent="$(wf_parent_of "$issue")"
[ -n "$parent" ] || wf_die "#$issue has no parent issue"
base="$(wf_integration_branch "$parent")"
[ -n "$base" ] || wf_die "parent #$parent has no integration branch"

branch="$(wf_branch)"
case "$branch" in
  "${WF_ISSUE_PREFIX}${issue}-"*) ;;
  *) wf_die "expected to be on ${WF_ISSUE_PREFIX}${issue}-* but on '$branch'" ;;
esac

[ -z "$(git -C "$WF_ROOT" status --porcelain)" ] \
  || wf_die "working tree is dirty — commit or stash before finishing #$issue"

git -C "$WF_ROOT" push -u origin "$branch" --quiet
git -C "$WF_ROOT" fetch origin --quiet
git -C "$WF_ROOT" checkout "$base"
git -C "$WF_ROOT" merge --ff-only "origin/$base" --quiet 2>/dev/null || true
git -C "$WF_ROOT" merge --no-ff "$branch" -m "Merge $branch into $base

Closes the work for issue #$issue after its review cycles came back clean.
Merged with --no-ff so the issue's commits remain identifiable as one unit when
reading history later.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git -C "$WF_ROOT" push origin "$base" --quiet

wf_set_status "$issue" "Done"

tmp="$(mktemp)"
{
  printf '<!-- ec-wf kind=child-done merged-into=%s branch=%s -->\n\n' "$base" "$branch"
  printf '## Done — merged into `%s`\n\n' "$base"
  cat "$narrative"
  printf '\n\n---\n\nBranch `%s` merged into `%s` with `--no-ff`.\n' "$branch" "$base"
  printf 'Board state moved to **Done**.\n'
} > "$tmp"
WF_MIN_COMMENT_CHARS=1 "$(dirname "${BASH_SOURCE[0]}")/wf-comment.sh" "$issue" "$tmp" --also-parent
rm -f "$tmp"

gh issue close "$issue" --repo "$WF_REPO_FLAG" >/dev/null 2>&1 || true

printf 'wf: #%s Done and merged into %s\n' "$issue" "$base"
remaining="$(wf_sub_issues "$parent" | grep -c 'OPEN' || true)"
if [ "${remaining:-0}" -eq 0 ]; then
  printf 'wf: all children of #%s are closed — move the parent to In Review and\n' "$parent"
  printf 'wf: run the integration-branch review cycles (/wf-parent-review %s)\n' "$parent"
else
  printf 'wf: %s child issue(s) of #%s still open\n' "$remaining" "$parent"
fi
