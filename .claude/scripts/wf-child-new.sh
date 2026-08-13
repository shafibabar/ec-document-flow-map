#!/usr/bin/env bash
# wf-child-new.sh <parent#> <title> <body-file> [depends-on-csv]
#
# Creates one child issue under a parent, as a real GitHub sub-issue (the
# addSubIssue mutation — this gh version has no sub-issue subcommand), puts it
# on the board as Todo, and records dependencies on other issues.
#
# The body file must be written to the cold-agent standard: someone who has read
# nothing else must be able to implement it without asking a question. See
# CLAUDE.md.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/wf-lib.sh"

parent="${1:-}"; title="${2:-}"; body="${3:-}"; deps="${4:-}"
[ -n "$parent" ] && [ -n "$title" ] && [ -n "$body" ] \
  || wf_die "usage: wf-child-new.sh <parent#> <title> <body-file> [depends-on-csv]"
[ -f "$body" ] || wf_die "body file not found: $body"
wf_preflight

url="$(gh issue create --repo "$WF_REPO_FLAG" --title "$title" --label "wf:child" --body-file "$body")"
issue="${url##*/}"
printf 'wf: created child issue #%s — %s\n' "$issue" "$url"

parent_node="$(wf_issue_node "$parent")"
child_node="$(wf_issue_node "$issue")"
gh api graphql -f query='
  mutation($p:ID!,$c:ID!){ addSubIssue(input:{issueId:$p, subIssueId:$c}){ subIssue { number } } }' \
  -f p="$parent_node" -f c="$child_node" --jq '.data.addSubIssue.subIssue.number' >/dev/null
printf 'wf: #%s linked as sub-issue of #%s\n' "$issue" "$parent"

wf_set_status "$issue" "Todo"

if [ -n "$deps" ]; then
  tmp="$(mktemp)"
  {
    printf '<!-- ec-wf depends-on=%s -->\n\n' "$deps"
    printf '## Dependencies\n\n'
    printf 'This issue is blocked by: '
    printf '%s' "$deps" | tr ',' '\n' | sed 's/^ *//; s/ *$//; s/^#*/#/' | paste -sd' ' -
    printf '\n\nDo not start this issue until every issue listed above is in **Done**\n'
    printf 'and merged into the integration branch. Starting early means branching\n'
    printf 'from a base that is missing work this issue assumes exists.\n\n'
    printf 'If you believe a dependency is wrong, say so in a comment before starting\n'
    printf 'rather than working around it silently — the sequence was derived during\n'
    printf 'planning and a wrong edge here misorders everything after it.\n'
  } > "$tmp"
  WF_MIN_COMMENT_CHARS=1 "$(dirname "${BASH_SOURCE[0]}")/wf-comment.sh" "$issue" "$tmp"
  rm -f "$tmp"

  # Cross-reference from the blockers, so the link is visible from both ends.
  printf '%s' "$deps" | tr ',' '\n' | tr -d ' #' | while read -r dep; do
    [ -n "$dep" ] || continue
    tmp2="$(mktemp)"
    {
      printf '<!-- ec-wf blocks=%s -->\n\n' "$issue"
      printf '## Blocks #%s\n\n' "$issue"
      printf 'Issue #%s cannot start until this one is Done and merged into the\n' "$issue"
      printf 'integration branch. If this issue is reopened or reverted after #%s\n' "$issue"
      printf 'has started, #%s must be re-reviewed against the changed base.\n' "$issue"
    } > "$tmp2"
    WF_MIN_COMMENT_CHARS=1 "$(dirname "${BASH_SOURCE[0]}")/wf-comment.sh" "$dep" "$tmp2" || true
    rm -f "$tmp2"
  done
fi

printf 'wf: child #%s ready (Todo). Start it with: /wf-work %s\n' "$issue" "$issue"
