'use strict';
/* Test fixture — ids built from templates rather than names.
 *
 * Reporting's Events Published rows 7 and 8 give the @RetryableTopic names only
 * as {base-topic}-…; Centralized Audit has …-retry-*. An id built from a template
 * joins to nothing. A note rather than a failure: the shape is legal and the
 * extractor is recording what the document says. */
(function (root, factory) {
  var d = factory();
  if (typeof module === 'object' && module.exports) module.exports = d;
  else (root.EC_EXTRACTS = root.EC_EXTRACTS || {})[d.service.id] = d;
})(typeof self !== 'undefined' ? self : this, function () {
  var S = { file: "Reporting/ec-reporting-EVENT_FLOW_MAP.md", heading: "Events Published", row: 8 };
  return {
    service: {
      id: "fixture", name: "fixture-service", folder: "Fixture",
      group: "none", generation: "3.0",
      summary: "A minimal conforming extract.",
      source: S
    },
    nodes: [
      { id: "dlt:{base-topic}-ec-reporting-dlt", name: "{base-topic}-ec-reporting-dlt",
        kind: "dlt", group: "none", generation: "unknown", source: S },
      { id: "topic:ec.centralized.TENANT.audit", name: "ec.centralized.TENANT.audit",
        kind: "topic", group: "none", generation: "unknown", source: S }
    ],
    edges: [], retries: [], stores: [], decisions: [], terminalStates: [],
    failurePaths: [], restInbound: [], restOutbound: [], tenancy: [], ambiguities: [],
    transformation: { before: "x", action: "y", after: "z", source: S }
  };
});
