'use strict';
/* Test fixture — a retry topic recorded as a node.
 *
 * The schema has said since cycle 1 that retry topics are not nodes, and nothing
 * enforced it. Echo Engine never tested the rule because its retry topics sit
 * inside a retry section; Reporting's are Events Consumed rows carrying their own
 * consumer groups, which is exactly where a node otherwise gets created. */
(function (root, factory) {
  var d = factory();
  if (typeof module === 'object' && module.exports) module.exports = d;
  else (root.EC_EXTRACTS = root.EC_EXTRACTS || {})[d.service.id] = d;
})(typeof self !== 'undefined' ? self : this, function () {
  var S = { file: "Reporting/ec-reporting-EVENT_FLOW_MAP.md", heading: "Events Consumed", row: 6 };
  return {
    service: {
      id: "fixture", name: "fixture-service", folder: "Fixture",
      group: "none", generation: "3.0",
      summary: "A minimal conforming extract.",
      source: S
    },
    nodes: [
      { id: "topic:ec.centralized.{tenant}.audit.ec-reporting-retry-0",
        name: "ec.centralized.{tenant}.audit.ec-reporting-retry-0",
        kind: "topic", group: "none", generation: "unknown", source: S }
    ],
    edges: [], retries: [], stores: [], decisions: [], terminalStates: [],
    failurePaths: [], restInbound: [], restOutbound: [], tenancy: [], ambiguities: [],
    transformation: { before: "x", action: "y", after: "z", source: S }
  };
});
