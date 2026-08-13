#!/usr/bin/env bash
# wf-cycles.sh <issue#>
#
# Reads review history back out of the issue's comments. This is the recovery
# path: a brand-new review agent runs this to learn how many cycles have already
# happened, what each concluded, and whether the cap has been hit — without any
# local state and without being told by whoever spawned it.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/wf-lib.sh"

issue="${1:-}"
[ -n "$issue" ] || wf_die "usage: wf-cycles.sh <issue#>"

markers="$(gh issue view "$issue" --repo "$WF_REPO_FLAG" --json comments \
  --jq '.comments[].body' 2>/dev/null \
  | grep -o '<!-- ec-wf review-cycle=[0-9]* verdict=[a-z-]*' || true)"

if [ -z "$markers" ]; then
  printf 'review cycles on #%s: 0 (none recorded)\n' "$issue"
  printf 'next cycle: 1\n'
  exit 0
fi

count="$(printf '%s\n' "$markers" | wc -l | tr -d ' ')"
last_verdict="$(printf '%s\n' "$markers" | tail -1 | sed 's/.*verdict=//')"
highest="$(printf '%s\n' "$markers" | sed 's/.*review-cycle=\([0-9]*\).*/\1/' | sort -n | tail -1)"

printf 'review cycles on #%s: %s recorded, highest=%s, last verdict=%s, cap=%s\n' \
  "$issue" "$count" "$highest" "$last_verdict" "$WF_REVIEW_CYCLE_CAP"
printf '%s\n' "$markers" | sed 's/<!-- ec-wf /  cycle log: /'

if [ "$last_verdict" = "clean" ]; then
  printf 'next: no further cycles needed — move #%s to Done and merge\n' "$issue"
elif [ "$highest" -ge "$WF_REVIEW_CYCLE_CAP" ]; then
  printf 'next: CAP REACHED — do not start another cycle, escalate to the repo owner\n'
else
  printf 'next cycle: %s (spawn a NEW agent; do not reuse the previous reviewer)\n' "$((highest + 1))"
fi
