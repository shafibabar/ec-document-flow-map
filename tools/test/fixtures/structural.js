'use strict';
/* Test fixture — structurally broken graph — edge with no endpoints, node with an invented kind */
(function (root, factory) {
  var d = factory();
  if (typeof module === 'object' && module.exports) module.exports = d;
  else (root.EC_EXTRACTS = root.EC_EXTRACTS || {})[d.service.id] = d;
})(typeof self !== 'undefined' ? self : this, function () {
  var S = { file: "Echo Engine/EVENT_FLOW_MAP.md", heading: "Events Consumed" };
  return {
    service: {
      id: "fixture", name: "fixture-service", folder: "Fixture",
      group: "none", generation: "3.0",
      summary: "A minimal conforming extract.",
      source: S
    },
    nodes: [ { id: "n1", name: "N1", kind: "queue", group: "none", generation: "unknown", source: S } ],
    edges: [ { transport: "kafka", name: "t.one", source: S } ],
    retries: [], stores: [], decisions: [], terminalStates: [],
    failurePaths: [], restInbound: [], restOutbound: [], tenancy: [], ambiguities: [],
    transformation: { before: "x", action: "y", after: "z", source: S }
  };
});
