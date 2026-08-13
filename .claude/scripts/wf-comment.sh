#!/usr/bin/env bash
# wf-comment.sh <issue#> <body-file> [--also-parent]
#
# Posts a comment read from a FILE, never from an argument. That is deliberate:
# it makes a throwaway one-line comment awkward to write and a properly
# structured one natural. A comment must explain everything that happened since
# the last update — including mistakes made and reframings — so that someone
# reading only the issue can reconstruct the work.
#
# --also-parent mirrors the same text onto the parent issue, so the parent
# stays a complete narrative of its children.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/wf-lib.sh"

WF_MIN_COMMENT_CHARS="${WF_MIN_COMMENT_CHARS:-200}"

issue="${1:-}"; body="${2:-}"; also_parent="${3:-}"
[ -n "$issue" ] && [ -n "$body" ] || wf_die "usage: wf-comment.sh <issue#> <body-file> [--also-parent]"
[ -f "$body" ] || wf_die "body file not found: $body"

chars="$(wc -c < "$body" | tr -d ' ')"
if [ "$chars" -lt "$WF_MIN_COMMENT_CHARS" ]; then
  wf_die "comment is $chars chars, minimum is $WF_MIN_COMMENT_CHARS.
A comment must carry the full context of what happened since the last update:
what was done, what broke, what was reframed and why. Expand it, don't shrink
the limit. Override for a genuinely mechanical note with:
  WF_MIN_COMMENT_CHARS=1 wf-comment.sh ..."
fi

gh issue comment "$issue" --repo "$WF_REPO_FLAG" --body-file "$body" >/dev/null
printf 'wf: commented on #%s (%s chars)\n' "$issue" "$chars"

if [ "$also_parent" = "--also-parent" ]; then
  parent="$(wf_parent_of "$issue")"
  if [ -n "$parent" ]; then
    {
      printf '<!-- ec-wf mirrored-from=%s -->\n\n' "$issue"
      printf '_Mirrored from #%s._\n\n' "$issue"
      cat "$body"
    } > "$body.parent"
    gh issue comment "$parent" --repo "$WF_REPO_FLAG" --body-file "$body.parent" >/dev/null
    rm -f "$body.parent"
    printf 'wf: mirrored to parent #%s\n' "$parent"
  else
    wf_warn "#$issue has no parent issue; nothing mirrored"
  fi
fi
