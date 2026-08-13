#!/usr/bin/env bash
# wf-lib.sh — shared helpers for the workflow scripts. Source it, don't run it.
#
# Constraint that shapes this whole file: there is no system `jq` on this
# machine. Every JSON read goes through `gh --jq` (gh ships its own jq engine)
# or through `node -e` for stdin payloads. A script here that shells out to
# `jq` will fail.

set -euo pipefail

wf_die() { printf 'wf: %s\n' "$*" >&2; exit 1; }
wf_warn() { printf 'wf: %s\n' "$*" >&2; }

# Repo root, whether called from a hook (arbitrary cwd) or by hand.
if WF_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  :
else
  WF_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi
export WF_ROOT
WF_DIR="$WF_ROOT/.claude"

[ -f "$WF_DIR/workflow.conf" ] || wf_die "missing $WF_DIR/workflow.conf"
# shellcheck source=/dev/null
. "$WF_DIR/workflow.conf"

WF_REPO_FLAG="$WF_OWNER/$WF_REPO"

# ---------------------------------------------------------------- branch state

wf_branch() { git -C "$WF_ROOT" branch --show-current 2>/dev/null || echo ""; }

# integration | issue | main | other
wf_branch_kind() {
  local b="${1:-$(wf_branch)}"
  case "$b" in
    "$WF_MAIN_BRANCH")             echo "main" ;;
    "$WF_INTEGRATION_PREFIX"*)     echo "integration" ;;
    "$WF_ISSUE_PREFIX"*)           echo "issue" ;;
    *)                             echo "other" ;;
  esac
}

# Issue number encoded in a branch name: integration/12-slug -> 12
wf_issue_from_branch() {
  local b="${1:-$(wf_branch)}" n
  n="${b#"$WF_INTEGRATION_PREFIX"}"
  n="${n#"$WF_ISSUE_PREFIX"}"
  n="${n%%-*}"
  case "$n" in
    ''|*[!0-9]*) echo "" ;;
    *)           echo "$n" ;;
  esac
}

wf_slug() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -e 's/[^a-z0-9]\+/-/g' -e 's/^-//' -e 's/-$//' \
    | cut -c1-50
}

# ------------------------------------------------------------------ issue data

wf_issue_node() {
  gh api graphql -f query='
    query($o:String!,$r:String!,$n:Int!){ repository(owner:$o,name:$r){ issue(number:$n){ id } } }' \
    -f o="$WF_OWNER" -f r="$WF_REPO" -F n="$1" --jq '.data.repository.issue.id'
}

# Parent issue number of a child, or empty.
wf_parent_of() {
  gh api graphql -f query='
    query($o:String!,$r:String!,$n:Int!){ repository(owner:$o,name:$r){ issue(number:$n){ parent { number } } } }' \
    -f o="$WF_OWNER" -f r="$WF_REPO" -F n="$1" --jq '.data.repository.issue.parent.number // empty' 2>/dev/null || echo ""
}

wf_sub_issues() {
  gh api graphql -f query='
    query($o:String!,$r:String!,$n:Int!){ repository(owner:$o,name:$r){ issue(number:$n){
      subIssues(first:100){ nodes { number title state } } } } }' \
    -f o="$WF_OWNER" -f r="$WF_REPO" -F n="$1" \
    --jq '.data.repository.issue.subIssues.nodes[] | "#\(.number)\t\(.state)\t\(.title)"' 2>/dev/null || true
}

wf_issue_title() {
  gh issue view "$1" --repo "$WF_REPO_FLAG" --json title --jq '.title'
}

# The integration branch bound to a parent issue: linked branches first, then
# the marker in the issue body as a fallback.
wf_integration_branch() {
  local parent="$1" b
  b="$(gh api graphql -f query='
    query($o:String!,$r:String!,$n:Int!){ repository(owner:$o,name:$r){ issue(number:$n){
      linkedBranches(first:20){ nodes { ref { name } } } } } }' \
    -f o="$WF_OWNER" -f r="$WF_REPO" -F n="$parent" \
    --jq '.data.repository.issue.linkedBranches.nodes[].ref.name' 2>/dev/null \
    | grep "^$WF_INTEGRATION_PREFIX" | head -1 || true)"
  if [ -z "$b" ]; then
    b="$(gh issue view "$parent" --repo "$WF_REPO_FLAG" --json body --jq '.body' 2>/dev/null \
      | sed -n 's/.*integration-branch=\([^ >]*\).*/\1/p' | head -1 || true)"
  fi
  printf '%s' "$b"
}

# ------------------------------------------------------------------- the board

wf_status_option_id() {
  case "$1" in
    "Todo")        echo "$WF_STATUS_TODO" ;;
    "In Progress") echo "$WF_STATUS_IN_PROGRESS" ;;
    "In Review")   echo "$WF_STATUS_IN_REVIEW" ;;
    "Done")        echo "$WF_STATUS_DONE" ;;
    *) wf_die "unknown board state '$1' (Todo | In Progress | In Review | Done)" ;;
  esac
}

wf_item_id() {
  gh project item-list "$WF_PROJECT_NUMBER" --owner "$WF_OWNER" --limit 200 --format json \
    --jq ".items[] | select(.content.number==$1) | .id" 2>/dev/null | head -1
}

wf_board_status() {
  gh project item-list "$WF_PROJECT_NUMBER" --owner "$WF_OWNER" --limit 200 --format json \
    --jq ".items[] | select(.content.number==$1) | .status" 2>/dev/null | head -1
}

# Add to the board if absent; echo the item id either way.
wf_ensure_on_board() {
  local issue="$1" item
  item="$(wf_item_id "$issue")"
  if [ -z "$item" ]; then
    item="$(gh project item-add "$WF_PROJECT_NUMBER" --owner "$WF_OWNER" \
      --url "https://github.com/$WF_REPO_FLAG/issues/$issue" --format json --jq '.id')"
  fi
  printf '%s' "$item"
}

wf_set_status() {
  local issue="$1" state="$2" item opt
  item="$(wf_ensure_on_board "$issue")"
  [ -n "$item" ] || wf_die "issue #$issue is not on project $WF_PROJECT_NUMBER and could not be added"
  opt="$(wf_status_option_id "$state")"
  gh project item-edit --id "$item" --project-id "$WF_PROJECT_ID" \
    --field-id "$WF_STATUS_FIELD_ID" --single-select-option-id "$opt" >/dev/null
  printf 'wf: #%s -> %s\n' "$issue" "$state"
}

# ------------------------------------------------------------------- guardrails

wf_assert_knowledge_ignored() {
  git -C "$WF_ROOT" check-ignore -q knowledge/ 2>/dev/null \
    || wf_die "knowledge/ is NOT ignored — stop and fix .gitignore before continuing"
}

# Refuse to proceed if anything under knowledge/ is visible to git.
wf_assert_clean_of_knowledge() {
  local hits
  hits="$(git -C "$WF_ROOT" status --porcelain 2>/dev/null | grep -i 'knowledge/' || true)"
  [ -z "$hits" ] || wf_die "knowledge/ paths are visible to git:
$hits
Stop and report this."
}

wf_preflight() {
  wf_assert_knowledge_ignored
  wf_assert_clean_of_knowledge
}
