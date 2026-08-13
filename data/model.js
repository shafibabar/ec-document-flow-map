/*
 * The derived model — the sole source of truth for the visualisation.
 *
 * Phase 1 output. Empty until knowledge/ has been read and reconciled, and the
 * accuracy report has been reviewed. Nothing in here may be invented: every
 * entry carries a `source` naming the file and heading it came from, and
 * anything the sources leave silent or contradict is recorded as an explicit
 * `unknown` / `conflict` rather than a guess.
 *
 * Schema: docs/MODEL_SCHEMA.md
 *
 * Whether this file holds the real estate or a fictional sample is an open
 * decision — see "Open decisions" in docs/MODEL_SCHEMA.md.
 */

var MODEL = {
  meta: { generated: null, sources: [] },
  nodes: [],      // id, name, kind, grid {x,y}, team, summary, source
  edges: [],      // from, to, transport, name, eventType, source
  retries: [],    // consumer, attempts, backoff, dltTarget, source
  scenarios: [],  // id, name, description, steps[]
  issues: []      // unknown / conflict entries surfaced in the UI
};
