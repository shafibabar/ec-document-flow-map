'use strict';
/*
 * Test fixture — a node id that is a number, not a string.
 *
 * checkNodeId opened with `if (typeof id !== "string" || typeof kind !== "string")
 * return; // already diagnosed`. True of kind, which is an enum. False of id,
 * whose only other check was REQUIRED testing `=== undefined` — so 12345 was
 * present, was not an enum, and the whole node-id contract was skipped in
 * silence. This fixture ran "ok — 1 extract(s) conform" and exited 0.
 *
 * Review cycle 2 of #5 cited that guard as the one validate-layout.js should
 * have copied. It guarded the crash, not the defect.
 */
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
    nodes: [ { id: 12345, name: "ec.alerting-service.<t>.alertedCommunication",
        kind: "topic", group: "none", generation: "unknown",
        source: { file: "Echo Engine/EVENT_FLOW_MAP.md", heading: "Events Consumed" } } ],
    edges: [
      { from: "a", to: "fixture", transport: "kafka", name: "t.one",
        eventType: "Ev", direction: "in", source: { file: "Echo Engine/EVENT_FLOW_MAP.md", heading: "Events Consumed" } }
    ],
    retries: [], stores: [], decisions: [], terminalStates: [],
    failurePaths: [], restInbound: [], restOutbound: [], tenancy: [], ambiguities: [],
    transformation: { before: "x", action: "y", after: "z", source: { file: "Echo Engine/EVENT_FLOW_MAP.md", heading: "Events Consumed" } }
  };
});
