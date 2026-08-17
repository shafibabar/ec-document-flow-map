'use strict';
/* Test fixture — the kind fork that decides the id prefix.
 *
 * nodes[0] is Reporting's real case: `EventLogConsumer — Full Topic Pattern List`
 * row 4 is another service's DLT, read as an ordinary input under a column headed
 * `Topic Pattern`, so an extractor naturally writes kind "topic" — while
 * Surveillance Filter, which publishes it, writes kind "dlt". One topic, two
 * merge keys, and both used to validate clean with no note.
 *
 * nodes[1] is the same mistake the other way round. */
(function (root, factory) {
  var d = factory();
  if (typeof module === 'object' && module.exports) module.exports = d;
  else (root.EC_EXTRACTS = root.EC_EXTRACTS || {})[d.service.id] = d;
})(typeof self !== 'undefined' ? self : this, function () {
  var S = { file: "Reporting/ec-reporting-EVENT_FLOW_MAP.md", heading: "EventLogConsumer — Full Topic Pattern List" };
  return {
    service: {
      id: "fixture", name: "fixture-service", folder: "Fixture",
      group: "none", generation: "3.0",
      summary: "A minimal conforming extract.",
      source: S
    },
    nodes: [
      { id: "topic:ec.surveillance-gateway.outbox.{tenant}.qualifiedCommunication-dlt",
        name: "ec.surveillance-gateway.outbox.{tenant}.qualifiedCommunication-dlt",
        kind: "topic", group: "none", generation: "unknown", source: S },
      { id: "dlt:ec.centralized.{tenant}.audit", name: "ec.centralized.{tenant}.audit",
        kind: "dlt", group: "none", generation: "unknown", source: S }
    ],
    edges: [], retries: [], stores: [], decisions: [], terminalStates: [],
    failurePaths: [], restInbound: [], restOutbound: [], tenancy: [], ambiguities: [],
    transformation: { before: "x", action: "y", after: "z", source: S }
  };
});
