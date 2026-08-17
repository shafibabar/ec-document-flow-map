'use strict';
/*
 * TEST FIXTURE — invalid group label and a 2.0 generation
 *
 * Derived from knowledge/Conduct Services/Enterprise Conduct V3 - TSA.jpg,
 * the only image in the corpus. Issue #5.
 *
 * HOW THESE COORDINATES WERE OBTAINED, so they can be re-derived or challenged.
 *
 * Not by eye. The image was reduced 4x and every box located by flood-filling
 * the four fill colours the legend defines:
 *
 *     (173, 240, 199)  solid green   3.0 component
 *     (230, 250, 238)  pale green    sub-domain frame
 *     (231, 231, 231)  grey          2.0 component  -- all out of scope
 *     (222, 218, 255)  purple        integrated system
 *
 * That produced 23 green, 16 frame, 20 grey and 6 purple components with pixel
 * bounding boxes. Each was matched to a label read from six overlapping crops of
 * the image, because text in the smaller boxes is illegible at full-image scale.
 * `px` below is the detected centre in ORIGINAL image coordinates (10322x4746).
 *
 * The grid is a RANKING of those centres, not a scaling of them: x and y centres
 * were clustered with a 260px tolerance and numbered. Relative order is therefore
 * preserved exactly while spacing is regularised, which is what the brief asks
 * for -- the team already carries the diagram's spatial model and fighting it
 * wastes the benefit. Absolute pixel distances are deliberately NOT preserved;
 * the diagram's whitespace is an artefact of its drawing tool, not information.
 *
 * The main pipeline row survives intact and legible at row 3:
 *     Archive -> Gateway -> Queue Qualifier -> Surveillance Filter
 *             -> Policy Evaluator -> Quota Manager
 *
 * TWO NODES ARE NOT ON THE IMAGE AT ALL. Manual Run and Conduct Audit Service
 * are in scope and fully documented but appear nowhere in the diagram. They
 * carry `source.inferred: true` with the documented hop that justifies the
 * position. Every other node cites the image.
 *
 * Scope is fixed by parent issue #3 and is not re-derived here: 14 services,
 * 3 integrated systems, 4 store stops. All 2.0 components, UI Portal, EA
 * Indexing Gateway, Egress, Actioning and every outbox/token box are excluded.
 * Actioning is extracted by issue #20 but deliberately not placed.
 */
(function (root, factory) {
  var d = factory();
  if (typeof module === 'object' && module.exports) module.exports = d;
  else root.EC_LAYOUT = d;
})(typeof self !== 'undefined' ? self : this, function () {
  var IMG = 'Enterprise Conduct V3 - TSA.jpg';
  return {
    image: IMG,
    grid: { columns: 13, rows: 8 },
    nodes: [
    { id: 'centralised-audit', name: 'Centralized Audit', kind: 'service',
      grid: { x: 4, y: 0 },
      group: 'none', generation: '3.0',
      px: { x: 2626, y: 302 },
      source: { file: IMG, heading: 'top banner spanning the upper edge' } },
    { id: 'external:cognition-analytics', name: 'Cognition Analytics', kind: 'external',
      grid: { x: 5, y: 1 },
      group: 'none', generation: 'integrated',
      px: { x: 2934, y: 686 },
      source: { file: IMG, heading: 'upper middle, above Policy Evaluator' } },
    { id: 'external:derived-store', name: 'Derived Store', kind: 'external',
      grid: { x: 6, y: 1 },
      group: 'none', generation: 'integrated',
      px: { x: 3640, y: 686 },
      source: { file: IMG, heading: 'upper middle, right of Cognition Analytics' } },
    { id: 'config-curator', name: 'Config Curator', kind: 'service',
      grid: { x: 3, y: 2 },
      group: 'none', generation: '3.0',
      px: { x: 1668, y: 1070 },
      source: { file: IMG, heading: 'upper left, above the pipeline row' } },
    { id: 'alerting', name: 'Alerting', kind: 'service',
      grid: { x: 10, y: 2 },
      group: 'Alerting', generation: '3.0',
      px: { x: 7814, y: 1256 },
      source: { file: IMG, heading: 'Alerting Sub-domain frame, upper right' } },
    { id: 'echo-engine', name: 'Echo Engine', kind: 'service',
      grid: { x: 12, y: 2 },
      group: 'Actioning', generation: '3.0',
      px: { x: 9552, y: 1248 },
      source: { file: IMG, heading: 'Actioning Sub-domain frame, far upper right' } },
    { id: 'external:archive', name: 'Archive', kind: 'external',
      grid: { x: 1, y: 3 },
      group: 'none', generation: 'integrated',
      px: { x: 562, y: 1538 },
      source: { file: IMG, heading: 'far left of the main pipeline row' } },
    { id: 'gateway', name: 'Gateway', kind: 'service',
      grid: { x: 2, y: 3 },
      group: 'none', generation: '3.0',
      px: { x: 1250, y: 1538 },
      source: { file: IMG, heading: 'main pipeline row, first stop' } },
    { id: 'queue-qualifier', name: 'Queue Qualifier', kind: 'service',
      grid: { x: 3, y: 3 },
      group: 'none', generation: '3.0',
      px: { x: 1918, y: 1536 },
      source: { file: IMG, heading: 'main pipeline row, second stop' } },
    { id: 'surveillance-filter', name: 'Surveillance Filter', kind: 'service',
      grid: { x: 4, y: 3 },
      group: 'none', generation: '3.0',
      px: { x: 2426, y: 1536 },
      source: { file: IMG, heading: 'main pipeline row, third stop' } },
    { id: 'policy-evaluator', name: 'Policy Evaluator', kind: 'service',
      grid: { x: 5, y: 3 },
      group: 'none', generation: '3.0',
      px: { x: 2934, y: 1536 },
      source: { file: IMG, heading: 'main pipeline row, fourth stop' } },
    { id: 'quota-manager', name: 'Quota Manager', kind: 'service',
      grid: { x: 8, y: 3 },
      group: 'none', generation: '3.0',
      px: { x: 4318, y: 1534 },
      source: { file: IMG, heading: 'main pipeline row, right of Policy Evaluator' } },
    { id: 'store:EA-S3', name: 'EA-S3', kind: 'store',
      grid: { x: 0, y: 4 },
      group: 'none', generation: 'none',
      px: { x: 282, y: 2154 },
      source: { file: IMG, heading: 'far left, below Archive' } },
    { id: 'manual-run', name: 'Manual Run', kind: 'service',
      grid: { x: 1, y: 4 },
      group: 'none', generation: '3.0',
      source: { inferred: true, reason:
          'No box on the architecture image. Placed upstream-left of Gateway because it publishes ec.surveillance-manual-run.{t}.ingestion, which Gateway\'s ManualRunEventConsumer consumes.' } },
    { id: 'store:EC-S3', name: 'EC-S3', kind: 'store',
      grid: { x: 2, y: 4 },
      group: 'none', generation: 'none',
      px: { x: 1250, y: 2136 },
      source: { file: IMG, heading: 'below Gateway' } },
    { id: 'indexer', name: 'Indexer', kind: 'service',
      grid: { x: 7, y: 5 },
      group: 'Search Sub-domain', generation: '2.0',
      px: { x: 4004, y: 2506 },
      source: { file: IMG, heading: 'Search Sub-domain frame, middle' } },
    { id: 'store:surveil.av5', name: 'surveil.av5', kind: 'store',
      grid: { x: 6, y: 6 },
      group: 'none', generation: 'none',
      px: { x: 3660, y: 3158 },
      source: { file: IMG, heading: 'cylinder below the Search frame' } },
    { id: 'store:review.v1', name: 'review.v1', kind: 'store',
      grid: { x: 8, y: 6 },
      group: 'none', generation: 'none',
      px: { x: 4472, y: 3092 },
      source: { file: IMG, heading: 'cylinder right of surveil.av5' } },
    { id: 'review-service', name: 'Review Service', kind: 'service',
      grid: { x: 9, y: 7 },
      group: 'Review', generation: '3.0',
      px: { x: 7050, y: 3678 },
      source: { file: IMG, heading: 'Review Sub-domain frame, lower right' } },
    { id: 'reporting', name: 'Reporting', kind: 'service',
      grid: { x: 11, y: 7 },
      group: 'Reporting', generation: '3.0',
      px: { x: 8848, y: 3678 },
      source: { file: IMG, heading: 'Reporting subdomain frame, lower right' } },
    { id: 'conduct-audit-service', name: 'Conduct Audit Service', kind: 'service',
      grid: { x: 12, y: 7 },
      group: 'none', generation: '3.0',
      source: { inferred: true, reason:
          'No box on the architecture image; the diagram\'s only audit box is Centralized Audit, which is the separate service ec-centralised-audit. Placed right of Reporting because Reporting\'s ConductAuditPublisher publishes conduct_audit_topic, which this service\'s AuditEventConsumer consumes.' } }
    ]
  };
});
