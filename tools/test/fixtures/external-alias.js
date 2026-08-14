'use strict';
/* Test fixture — external: id shadowing an in-scope service under a name the
 * documents actually use. Policy Evaluator, Quota Manager and Reporting all call
 * Queue Qualifier "Pipeline Qualifier"; Parent #3 decided they are one component. */
(function (root, factory) {
  var d = factory();
  if (typeof module === 'object' && module.exports) module.exports = d;
  else (root.EC_EXTRACTS = root.EC_EXTRACTS || {})[d.service.id] = d;
})(typeof self !== 'undefined' ? self : this, function () {
  var S = { file: "Quota Manager/EVENT_FLOW_MAP.md", heading: "REST APIs Consumed (Outbound)" };
  return {
    service: {
      id: "fixture", name: "fixture-service", folder: "Fixture",
      group: "none", generation: "3.0",
      summary: "A minimal conforming extract.",
      source: S
    },
    nodes: [
      { id: "external:pipeline-qualifier", name: "Pipeline Qualifier", kind: "external",
        group: "none", generation: "integrated", source: S }
    ],
    edges: [], retries: [], stores: [], decisions: [], terminalStates: [],
    failurePaths: [], restInbound: [], restOutbound: [], tenancy: [], ambiguities: [],
    transformation: { before: "x", action: "y", after: "z", source: S }
  };
});
