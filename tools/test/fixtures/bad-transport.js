'use strict';
/* Test fixture — transport jdbc is invalid */
(function (root, factory) {
  var d = factory();
  if (typeof module === 'object' && module.exports) module.exports = d;
  else (root.EC_EXTRACTS = root.EC_EXTRACTS || {})[d.service.id] = d;
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    service: {
      id: "fixture", name: "fixture-service", folder: "Fixture",
      group: "none", generation: "3.0",
      summary: "A minimal conforming extract.",
      source: { file: "Echo Engine/EVENT_FLOW_MAP.md", heading: "Events Consumed" }
    },
    nodes: [],
    edges: [
      { from: "a", to: "fixture", transport: "jdbc", name: "t.one",
        eventType: "Ev", direction: "in", source: { file: "Echo Engine/EVENT_FLOW_MAP.md", heading: "Events Consumed" } }
    ],
    retries: [], stores: [], decisions: [], terminalStates: [],
    failurePaths: [], restInbound: [], restOutbound: [], tenancy: [], ambiguities: [],
    transformation: { before: "x", action: "y", after: "z", source: { file: "Echo Engine/EVENT_FLOW_MAP.md", heading: "Events Consumed" } }
  };
});
