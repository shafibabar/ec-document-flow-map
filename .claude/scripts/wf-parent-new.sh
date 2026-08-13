#!/usr/bin/env bash
# wf-parent-new.sh <title> <body-file>
#
# Creates a parent issue — the decision record for a piece of work — puts it on
# the board as In Progress, and cuts an integration branch from main that is
# genuinely linked to the issue on GitHub (not merely named after it).
#
# The body file must already contain the decision log: what was decided, what
# was rejected, and the tradeoffs. See CLAUDE.md for the required shape.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/wf-lib.sh"

title="${1:-}"; body="${2:-}"
[ -n "$title" ] && [ -n "$body" ] || wf_die "usage: wf-parent-new.sh <title> <body-file>"
[ -f "$body" ] || wf_die "body file not found: $body"
wf_preflight

git -C "$WF_ROOT" fetch origin --quiet

url="$(gh issue create --repo "$WF_REPO_FLAG" --title "$title" --label "wf:parent" --body-file "$body")"
issue="${url##*/}"
printf 'wf: created parent issue #%s — %s\n' "$issue" "$url"

wf_set_status "$issue" "In Progress"

slug="$(wf_slug "$title")"
branch="${WF_INTEGRATION_PREFIX}${issue}-${slug}"
base_oid="$(git -C "$WF_ROOT" rev-parse origin/"$WF_MAIN_BRANCH")"

local_main="$(git -C "$WF_ROOT" rev-parse "$WF_MAIN_BRANCH" 2>/dev/null || echo "")"
if [ -n "$local_main" ] && [ "$local_main" != "$base_oid" ]; then
  wf_warn "local $WF_MAIN_BRANCH ($local_main) differs from origin/$WF_MAIN_BRANCH ($base_oid);"
  wf_warn "cutting from origin/$WF_MAIN_BRANCH, which is the shared truth."
fi

node_id="$(wf_issue_node "$issue")"
gh api graphql -f query='
  mutation($i:ID!,$o:GitObjectID!,$n:String!){
    createLinkedBranch(input:{issueId:$i, oid:$o, name:$n}){ linkedBranch { ref { name } } } }' \
  -f i="$node_id" -f o="$base_oid" -f n="$branch" \
  --jq '.data.createLinkedBranch.linkedBranch.ref.name' >/dev/null

git -C "$WF_ROOT" fetch origin --quiet
git -C "$WF_ROOT" checkout -b "$branch" "origin/$branch"
printf 'wf: integration branch %s cut from %s and linked to #%s\n' "$branch" "$WF_MAIN_BRANCH" "$issue"

tmp="$(mktemp)"
cat > "$tmp" <<EOF
<!-- ec-wf kind=parent-bound integration-branch=$branch base=$WF_MAIN_BRANCH base-oid=$base_oid -->

## Integration branch bound

This parent issue now owns the integration branch \`$branch\`, cut from
\`$WF_MAIN_BRANCH\` at \`$base_oid\` and linked to this issue on GitHub, so the
binding survives even if the branch is renamed locally.

Every child issue of this parent cuts its own \`${WF_ISSUE_PREFIX}<n>-<slug>\`
branch from **this** branch, not from \`$WF_MAIN_BRANCH\`, and merges back into
it when its review cycles come back clean. \`$WF_MAIN_BRANCH\` receives nothing
until every child is Done, this parent has passed its own integration review,
and the repo owner has completed a manual review.
EOF
WF_MIN_COMMENT_CHARS=1 "$(dirname "${BASH_SOURCE[0]}")/wf-comment.sh" "$issue" "$tmp"
rm -f "$tmp"

printf 'wf: parent #%s ready. Next: /wf-breakdown, then /wf-children\n' "$issue"
