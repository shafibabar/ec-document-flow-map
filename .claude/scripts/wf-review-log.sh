#!/usr/bin/env bash
# wf-review-log.sh <issue#> <cycle-n> <clean|bugs-found> <narrative-file>
#
# Records one completed review cycle on an issue. The marker line is what the
# NEXT review agent reads to learn how many cycles have run and what they found,
# so it must be written even when a cycle finds nothing.
#
# The narrative below the marker is for humans and for the next agent's context:
# every bug found, what caused it, the fix applied, and anything left open.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/wf-lib.sh"

issue="${1:-}"; cycle="${2:-}"; verdict="${3:-}"; narrative="${4:-}"
[ -n "$issue" ] && [ -n "$cycle" ] && [ -n "$verdict" ] && [ -n "$narrative" ] \
  || wf_die "usage: wf-review-log.sh <issue#> <cycle-n> <clean|bugs-found> <narrative-file>"
[ -f "$narrative" ] || wf_die "narrative file not found: $narrative"
case "$verdict" in clean|bugs-found) ;; *) wf_die "verdict must be 'clean' or 'bugs-found'" ;; esac

tmp="$(mktemp)"
{
  printf '<!-- ec-wf review-cycle=%s verdict=%s cap=%s -->\n\n' "$cycle" "$verdict" "$WF_REVIEW_CYCLE_CAP"
  printf '## Review cycle %s of at most %s — `%s`\n\n' "$cycle" "$WF_REVIEW_CYCLE_CAP" "$verdict"
  cat "$narrative"
} > "$tmp"

WF_MIN_COMMENT_CHARS=1 "$(dirname "${BASH_SOURCE[0]}")/wf-comment.sh" "$issue" "$tmp" --also-parent
rm -f "$tmp"

if [ "$verdict" = "clean" ]; then
  printf 'wf: cycle %s clean — issue #%s may move to Done\n' "$cycle" "$issue"
elif [ "$cycle" -ge "$WF_REVIEW_CYCLE_CAP" ]; then
  printf 'wf: CAP REACHED at cycle %s on #%s — stop and escalate to the repo owner.\n' "$cycle" "$issue"
  printf 'wf: do not start another cycle. Summarise every cycle so far and hand back.\n'
else
  printf 'wf: bugs found — start cycle %s with a NEW agent\n' "$((cycle + 1))"
fi

# How many cycles have run so far, read back from the issue itself.
"$(dirname "${BASH_SOURCE[0]}")/wf-cycles.sh" "$issue"
