'use strict';
/*
 * Four provenance entries that all validated clean until review cycle 3 of
 * #5, because this validator tested truthiness where tools/validate-extract.js
 * tests type and placeholder on the identical source object:
 *
 *   gateway           file: 1, heading: 2      — numbers cite nothing
 *   policy-evaluator  file/heading whitespace  — empty by any reading
 *   quota-manager     file/heading "TODO"      — provenance that looks checked
 *   manual-run        inferred: 'yes'          — not the boolean true, so it
 *                     fell through to the drawn branch and the node was read
 *                     as measured off an image it does not appear on
 */
module.exports = {
  image: 'Enterprise Conduct V3 - TSA.jpg',
  grid: { columns: 13, rows: 8 },
  nodes: [
    {
      id: 'centralised-audit',
      name: 'Centralized Audit',
      kind: 'service',
      grid: { x: 4, y: 0 },
      group: 'none',
      generation: '3.0',
      px: { x: 2626, y: 302 },
      source: {
        file: 'Enterprise Conduct V3 - TSA.jpg',
        heading: 'top banner spanning the upper edge'
      }
    },
    {
      id: 'external:cognition-analytics',
      name: 'Cognition Analytics',
      kind: 'external',
      grid: { x: 5, y: 1 },
      group: 'none',
      generation: 'integrated',
      px: { x: 2934, y: 686 },
      source: {
        file: 'Enterprise Conduct V3 - TSA.jpg',
        heading: 'upper middle, above Policy Evaluator'
      }
    },
    {
      id: 'external:derived-store',
      name: 'Derived Store',
      kind: 'external',
      grid: { x: 6, y: 1 },
      group: 'none',
      generation: 'integrated',
      px: { x: 3640, y: 686 },
      source: {
        file: 'Enterprise Conduct V3 - TSA.jpg',
        heading: 'upper middle, right of Cognition Analytics'
      }
    },
    {
      id: 'config-curator',
      name: 'Config Curator',
      kind: 'service',
      grid: { x: 3, y: 2 },
      group: 'none',
      generation: '3.0',
      px: { x: 1668, y: 1070 },
      source: {
        file: 'Enterprise Conduct V3 - TSA.jpg',
        heading: 'upper left, above the pipeline row'
      }
    },
    {
      id: 'alerting',
      name: 'Alerting',
      kind: 'service',
      grid: { x: 10, y: 2 },
      group: 'Alerting',
      generation: '3.0',
      px: { x: 7814, y: 1256 },
      source: {
        file: 'Enterprise Conduct V3 - TSA.jpg',
        heading: 'Alerting Sub-domain frame, upper right'
      }
    },
    {
      id: 'echo-engine',
      name: 'Echo Engine',
      kind: 'service',
      grid: { x: 12, y: 2 },
      group: 'Actioning',
      generation: '3.0',
      px: { x: 9552, y: 1248 },
      source: {
        file: 'Enterprise Conduct V3 - TSA.jpg',
        heading: 'Actioning Sub-domain frame, far upper right'
      }
    },
    {
      id: 'external:archive',
      name: 'Archive',
      kind: 'external',
      grid: { x: 1, y: 3 },
      group: 'none',
      generation: 'integrated',
      px: { x: 562, y: 1538 },
      source: {
        file: 'Enterprise Conduct V3 - TSA.jpg',
        heading: 'far left of the main pipeline row'
      }
    },
    {
      id: 'gateway',
      name: 'Gateway',
      kind: 'service',
      grid: { x: 2, y: 3 },
      group: 'none',
      generation: '3.0',
      px: { x: 1250, y: 1538 },
      source: { file: 1, heading: 2 }
    },
    {
      id: 'queue-qualifier',
      name: 'Queue Qualifier',
      kind: 'service',
      grid: { x: 3, y: 3 },
      group: 'none',
      generation: '3.0',
      px: { x: 1918, y: 1536 },
      source: {
        file: 'Enterprise Conduct V3 - TSA.jpg',
        heading: 'main pipeline row, second stop'
      }
    },
    {
      id: 'surveillance-filter',
      name: 'Surveillance Filter',
      kind: 'service',
      grid: { x: 4, y: 3 },
      group: 'none',
      generation: '3.0',
      px: { x: 2426, y: 1536 },
      source: {
        file: 'Enterprise Conduct V3 - TSA.jpg',
        heading: 'main pipeline row, third stop'
      }
    },
    {
      id: 'policy-evaluator',
      name: 'Policy Evaluator',
      kind: 'service',
      grid: { x: 5, y: 3 },
      group: 'none',
      generation: '3.0',
      px: { x: 2934, y: 1536 },
      source: { file: '   ', heading: '  ' }
    },
    {
      id: 'quota-manager',
      name: 'Quota Manager',
      kind: 'service',
      grid: { x: 8, y: 3 },
      group: 'none',
      generation: '3.0',
      px: { x: 4318, y: 1534 },
      source: { file: 'TODO', heading: 'TODO' }
    },
    {
      id: 'store:EA-S3',
      name: 'EA-S3',
      kind: 'store',
      grid: { x: 0, y: 4 },
      group: 'none',
      generation: 'none',
      px: { x: 282, y: 2154 },
      source: {
        file: 'Enterprise Conduct V3 - TSA.jpg',
        heading: 'far left, below Archive'
      }
    },
    {
      id: 'manual-run',
      name: 'Manual Run',
      kind: 'service',
      grid: { x: 1, y: 4 },
      group: 'none',
      generation: '3.0',
      source: {
        inferred: 'yes',
        reason: 'No box on the image. Placed upstream-left of Gateway on the documented hop.'
      }
    },
    {
      id: 'store:EC-S3',
      name: 'EC-S3',
      kind: 'store',
      grid: { x: 2, y: 4 },
      group: 'none',
      generation: 'none',
      px: { x: 1250, y: 2136 },
      source: {
        file: 'Enterprise Conduct V3 - TSA.jpg',
        heading: 'below Gateway'
      }
    },
    {
      id: 'indexer',
      name: 'Indexer',
      kind: 'service',
      grid: { x: 7, y: 5 },
      group: 'Search',
      generation: '3.0',
      px: { x: 4004, y: 2506 },
      source: {
        file: 'Enterprise Conduct V3 - TSA.jpg',
        heading: 'Search Sub-domain frame, middle'
      }
    },
    {
      id: 'store:surveil.av5',
      name: 'surveil.av5',
      kind: 'store',
      grid: { x: 6, y: 6 },
      group: 'none',
      generation: 'none',
      px: { x: 3660, y: 3158 },
      source: {
        file: 'Enterprise Conduct V3 - TSA.jpg',
        heading: 'cylinder below the Search frame'
      }
    },
    {
      id: 'store:review.v1',
      name: 'review.v1',
      kind: 'store',
      grid: { x: 8, y: 6 },
      group: 'none',
      generation: 'none',
      px: { x: 4472, y: 3092 },
      source: {
        file: 'Enterprise Conduct V3 - TSA.jpg',
        heading: 'cylinder right of surveil.av5'
      }
    },
    {
      id: 'review-service',
      name: 'Review Service',
      kind: 'service',
      grid: { x: 9, y: 7 },
      group: 'Review',
      generation: '3.0',
      px: { x: 7050, y: 3678 },
      source: {
        file: 'Enterprise Conduct V3 - TSA.jpg',
        heading: 'Review Sub-domain frame, lower right'
      }
    },
    {
      id: 'reporting',
      name: 'Reporting',
      kind: 'service',
      grid: { x: 11, y: 7 },
      group: 'Reporting',
      generation: '3.0',
      px: { x: 8848, y: 3678 },
      source: {
        file: 'Enterprise Conduct V3 - TSA.jpg',
        heading: 'Reporting subdomain frame, lower right'
      }
    },
    {
      id: 'conduct-audit-service',
      name: 'Conduct Audit Service',
      kind: 'service',
      grid: { x: 12, y: 7 },
      group: 'none',
      generation: '3.0',
      source: {
        inferred: true,
        reason: "No box on the architecture image; the diagram's only audit box is Centralized Audit, which is the separate service ec-centralised-audit. Placed right of Reporting because Reporting's ConductAuditPublisher publishes conduct_audit_topic, which this service's AuditEventConsumer consumes."
      }
    }
  ]
};
