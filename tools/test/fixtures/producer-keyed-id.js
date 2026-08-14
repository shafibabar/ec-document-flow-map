'use strict';
/* Test fixture — topic and DLT ids keyed on the producer rather than on the
 * topic's own name. Legal shapes, so a note rather than a failure — but
 * ec.centralized.{tenant}.audit has three publishers, so a producer-keyed id
 * puts three nodes on the map for one topic. nodes[2] is already correct and
 * must draw no note; nodes[3] proves <tenant> normalises to {tenant}. */
(function (root, factory) {
  var d = factory();
  if (typeof module === 'object' && module.exports) module.exports = d;
  else (root.EC_EXTRACTS = root.EC_EXTRACTS || {})[d.service.id] = d;
})(typeof self !== 'undefined' ? self : this, function () {
  var S = { file: "Echo Engine/EVENT_FLOW_MAP.md", heading: "Events Published" };
  return {
    service: {
      id: "fixture", name: "fixture-service", folder: "Fixture",
      group: "none", generation: "3.0",
      summary: "A minimal conforming extract.",
      source: S
    },
    nodes: [
      { id: "topic:echo-engine.audit", name: "ec.centralized.{tenant}.audit",
        kind: "topic", group: "none", generation: "unknown", source: S },
      { id: "dlt:echoAction", name: "ec.echo-engine.{tenant}.echoAction-ec-echo-engine-dlt",
        kind: "dlt", group: "none", generation: "unknown", source: S },
      { id: "topic:supBulkIndexingTopic_k8s", name: "supBulkIndexingTopic_k8s",
        kind: "topic", group: "none", generation: "unknown", source: S },
      { id: "topic:ec.alerting-service.{tenant}.alertedCommunication",
        name: "ec.alerting-service.<tenant>.alertedCommunication",
        kind: "topic", group: "none", generation: "unknown", source: S }
    ],
    edges: [], retries: [], stores: [], decisions: [], terminalStates: [],
    failurePaths: [], restInbound: [], restOutbound: [], tenancy: [], ambiguities: [],
    transformation: { before: "x", action: "y", after: "z", source: S }
  };
});
