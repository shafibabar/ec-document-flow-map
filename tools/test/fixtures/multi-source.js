'use strict';
/* Test fixture — an entry whose fields were read from two sections — source as an array */
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
    nodes: [], edges: [],
    retries: [
      { consumer: "C", topic: "t.one", attempts: "3", backoff: "unknown",
        mechanism: "@RetryableTopic",
        source: [
          { file: "Echo Engine/EVENT_FLOW_MAP.md", heading: "Events Consumed", row: 1 },
          { file: "Echo Engine/EVENT_FLOW_MAP.md", heading: "Retry and DLT topics" }
        ] }
    ],
    stores: [], decisions: [], terminalStates: [],
    failurePaths: [], restInbound: [], restOutbound: [], tenancy: [], ambiguities: [],
    transformation: { before: "x", action: "y", after: "z", source: S }
  };
});
