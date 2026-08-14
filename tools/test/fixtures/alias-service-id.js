'use strict';
/* Test fixture — cross-service ids written the way the documents write them.
 * Manual Run's outbound REST table names ec-gateway, alerting-service and
 * central-audit; none is a canonical slug, and all three used to pass. */
(function (root, factory) {
  var d = factory();
  if (typeof module === 'object' && module.exports) module.exports = d;
  else (root.EC_EXTRACTS = root.EC_EXTRACTS || {})[d.service.id] = d;
})(typeof self !== 'undefined' ? self : this, function () {
  var S = { file: "Manual Run/EVENT_FLOW_MAP.md", heading: "REST APIs Consumed (Outbound)" };
  return {
    service: {
      id: "fixture", name: "fixture-service", folder: "Fixture",
      group: "none", generation: "3.0",
      summary: "A minimal conforming extract.",
      source: S
    },
    nodes: [
      { id: "ec-gateway",       name: "ec-gateway",       kind: "service", group: "none", generation: "3.0", source: S },
      { id: "alerting-service", name: "alerting-service", kind: "service", group: "none", generation: "3.0", source: S },
      { id: "central-audit",    name: "central-audit",    kind: "service", group: "none", generation: "3.0", source: S }
    ],
    edges: [], retries: [], stores: [], decisions: [], terminalStates: [],
    failurePaths: [], restInbound: [], restOutbound: [], tenancy: [], ambiguities: [],
    transformation: { before: "x", action: "y", after: "z", source: S }
  };
});
