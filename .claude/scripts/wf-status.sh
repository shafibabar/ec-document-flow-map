#!/usr/bin/env bash
# wf-status.sh <issue#> <Todo|In Progress|In Review|Done>
#
# Moves an issue's Status on the project board, adding it to the board first if
# it is not there yet.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/wf-lib.sh"

[ $# -eq 2 ] || wf_die "usage: wf-status.sh <issue#> <Todo|In Progress|In Review|Done>"
wf_set_status "$1" "$2"
