#!/usr/bin/env bash
# wf-start.sh <child#>
#
# Picks up a child issue: cuts an issue branch from the PARENT's integration
# branch (never from main), links it to the child issue, checks it out, and
# moves the issue to In Progress.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/wf-lib.sh"

issue="${1:-}"
[ -n "$issue" ] || wf_die "usage: wf-start.sh <child#>"
wf_preflight

parent="$(wf_parent_of "$issue")"
[ -n "$parent" ] || wf_die "#$issue has no parent issue. A child issue must hang off a parent so it
inherits an integration branch. Create it with wf-child-new.sh."

base="$(wf_integration_branch "$parent")"
[ -n "$base" ] || wf_die "parent #$parent has no integration branch. Cut one with wf-parent-new.sh
or link one to #$parent before starting this issue."

git -C "$WF_ROOT" fetch origin --quiet
git -C "$WF_ROOT" rev-parse --verify "origin/$base" >/dev/null 2>&1 \
  || wf_die "integration branch origin/$base does not exist on the remote"

# Warn loudly about unfinished dependencies rather than blocking: the sequence
# is advice derived at planning time, and the operator may have a reason.
deps="$(gh issue view "$issue" --repo "$WF_REPO_FLAG" --json comments --jq '.comments[].body' 2>/dev/null \
  | sed -n 's/.*<!-- ec-wf depends-on=\([0-9, ]*\).*/\1/p' | head -1 || true)"
if [ -n "$deps" ]; then
  printf '%s' "$deps" | tr ',' '\n' | tr -d ' ' | while read -r dep; do
    [ -n "$dep" ] || continue
    st="$(wf_board_status "$dep")"
    if [ "$st" != "Done" ]; then
      wf_warn "dependency #$dep is '${st:-not on board}', not Done — starting #$issue now means"
      wf_warn "branching from a base that may be missing work this issue assumes."
    fi
  done
fi

title="$(wf_issue_title "$issue")"
branch="${WF_ISSUE_PREFIX}${issue}-$(wf_slug "$title")"
base_oid="$(git -C "$WF_ROOT" rev-parse "origin/$base")"

if git -C "$WF_ROOT" rev-parse --verify "origin/$branch" >/dev/null 2>&1; then
  wf_warn "branch $branch already exists on the remote — checking it out instead of recreating"
  git -C "$WF_ROOT" checkout -B "$branch" "origin/$branch"
else
  node_id="$(wf_issue_node "$issue")"
  gh api graphql -f query='
    mutation($i:ID!,$o:GitObjectID!,$n:String!){
      createLinkedBranch(input:{issueId:$i, oid:$o, name:$n}){ linkedBranch { ref { name } } } }' \
    -f i="$node_id" -f o="$base_oid" -f n="$branch" \
    --jq '.data.createLinkedBranch.linkedBranch.ref.name' >/dev/null
  git -C "$WF_ROOT" fetch origin --quiet
  git -C "$WF_ROOT" checkout -b "$branch" "origin/$branch"
fi

wf_set_status "$issue" "In Progress"

printf 'wf: on %s (cut from %s @ %s), issue #%s is In Progress\n' "$branch" "$base" "${base_oid:0:8}" "$issue"
printf 'wf: write the failing test first — TDD is the point, it cuts review cycles.\n'
