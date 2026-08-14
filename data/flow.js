'use strict';
/*
 * data/flow.js — the happy path, as a walk through the estate.
 *
 * Grid positions come from data/layout.js, which was derived from
 * "Enterprise Conduct V3 - TSA.jpg" by colour-detecting every box and ranking
 * the centres. Relative order matches the diagram.
 *
 * Every hop below was read from both ends in knowledge/Conduct Services/ —
 * the publisher's Events Published table and the consumer's Events Consumed
 * table — and each carries the file it came from. Nothing here is invented.
 */
(function (root, factory) {
  var d = factory();
  if (typeof module === 'object' && module.exports) module.exports = d;
  else root.EC_FLOW = d;
})(typeof self !== 'undefined' ? self : this, function () {

  // kind: station (a K8s service) | yard (Elasticsearch) | depot (S3 / Mongo)
  var STOPS = [
    { id: 'ea-s3',      name: 'EA-S3',               kind: 'depot',   tech: 'S3',            grid: { x: 0, y: 4 } },
    { id: 'gateway',    name: 'Gateway',             kind: 'station', tech: 'K8s',           grid: { x: 2, y: 3 } },
    { id: 'ec-s3',      name: 'EC-S3',               kind: 'depot',   tech: 'S3',            grid: { x: 2, y: 4 } },
    { id: 'qualifier',  name: 'Queue Qualifier',     kind: 'station', tech: 'K8s',           grid: { x: 3, y: 3 } },
    { id: 'filter',     name: 'Surveillance Filter', kind: 'station', tech: 'K8s',           grid: { x: 4, y: 3 } },
    { id: 'evaluator',  name: 'Policy Evaluator',    kind: 'station', tech: 'K8s',           grid: { x: 5, y: 3 } },
    { id: 'quota',      name: 'Quota Manager',       kind: 'station', tech: 'K8s',           grid: { x: 8, y: 3 } },
    { id: 'indexer',    name: 'Indexer',             kind: 'station', tech: 'K8s',           grid: { x: 7, y: 5 } },
    { id: 'surveil',    name: 'surveil.av5',         kind: 'yard',    tech: 'Elasticsearch', grid: { x: 6, y: 6 },
      role: 'Clearance Terminal' },
    { id: 'review',     name: 'review.v1',           kind: 'yard',    tech: 'Elasticsearch', grid: { x: 8, y: 6 },
      role: 'Violation Depot' }
  ];

  // transport: kafka (a track) | cdc (outbox -> Debezium -> a track) | s3 (an IO spur)
  var TRACKS = [
    { from: 'ea-s3',     to: 'gateway',   transport: 'kafka',
      topic: 'supBulkIndexingTopic_k8s' },
    { from: 'gateway',   to: 'ec-s3',     transport: 's3',
      topic: 'miniIndexable.json upload' },
    { from: 'gateway',   to: 'qualifier', transport: 'cdc',
      topic: 'ec.surveillance-gateway.outbox.{tenant}.ingestedCommunication' },
    { from: 'qualifier', to: 'filter',    transport: 'kafka',
      topic: 'ec.surveillance-qualifier.{tenant}.qualifications' },
    { from: 'filter',    to: 'evaluator', transport: 'kafka',
      topic: 'ec.surveillance-filter.{tenant}.evaluations' },
    { from: 'evaluator', to: 'indexer',   transport: 'kafka',
      topic: 'ec.surveillance-policy-evaluator.{tenant}.surveilled' },
    { from: 'evaluator', to: 'quota',     transport: 'kafka',
      topic: 'ec.surveillance-policy-evaluator.{tenant}.surveilled' },
    { from: 'indexer',   to: 'surveil',   transport: 'elastic',
      topic: 'index -> surveil.av5' },
    { from: 'indexer',   to: 'review',    transport: 'elastic',
      topic: 'index -> review.v1' }
  ];

  /*
   * The walk. `cargo` is what the document IS on arrival at that stop — this is
   * what makes the map teach rather than decorate. `dwell` scales with how much
   * the stop has to explain.
   */
  var HAPPY = {
    id: 'happy',
    name: 'Happy path — bulk indexing',
    steps: [
      { at: 'ea-s3', dwell: 2200,
        title: 'Raw communication lands',
        cargo: { label: 'indexable.json', tint: '#94a3b8', stamps: [] },
        note: 'A large indexable.json sits in the EA S3 bucket. A BulkIndexEvent ' +
              'pointing at it is published to supBulkIndexingTopic_k8s.',
        src: 'Gateway/EVENT_FLOW_MAP.md · Events Consumed' },

      { at: 'gateway', via: 'supBulkIndexingTopic_k8s', dwell: 4200,
        title: 'Ingested and minified',
        cargo: { label: 'miniIndexable.json', tint: '#38bdf8', stamps: ['minified', 'outboxed'] },
        note: 'BulkIndexingEventConsumer downloads the JSON from S3, strips it to a ' +
              '"mini" version, re-uploads it, and writes an IngestedCommunicationOutbox ' +
              'row scoped to a reconciliation window.',
        src: 'Gateway/ec-gateway_stop_info.md · Transformation' },

      { at: 'qualifier', via: 'outbox -> Debezium', dwell: 4200,
        title: 'Qualified against pipelines',
        cargo: { label: 'QualifiedCommunicationDto', tint: '#22d3ee', stamps: ['minified', 'qualified'] },
        note: 'Gateway does not publish this itself. Debezium reads the Mongo outbox ' +
              'and publishes ingestedCommunication, which Queue Qualifier consumes and ' +
              'matches against the tenant\'s surveillance pipelines.',
        src: 'Queue Qualifier/EVENT_FLOW_MAP.md · Events Consumed' },

      { at: 'filter', via: 'ec.surveillance-qualifier.{tenant}.qualifications', dwell: 4400,
        title: 'Filtered',
        cargo: { label: 'PipelineEvaluationEvent', tint: '#34d399', stamps: ['minified', 'qualified', 'filtered'] },
        note: 'Evaluates the communication against pipeline rules. A document that does ' +
              'not qualify leaves here on .not-qualified and travels no further — a ' +
              'terminal state at a service.',
        src: 'Surveillance Filter/EVENT_FLOW_MAP.md · Events Published' },

      { at: 'evaluator', via: 'ec.surveillance-filter.{tenant}.evaluations', dwell: 4600,
        title: 'Policies evaluated',
        cargo: { label: 'CognitionResponseEvent', tint: '#a78bfa',
                 stamps: ['minified', 'qualified', 'filtered', 'surveilled'] },
        note: 'Policies are applied and the result comes back as a surveilled ' +
              'communication. This is where compliance violation is determined, and it ' +
              'decides which yard the cargo ends up in.',
        src: 'Policy Evaluator/EVENT_FLOW_MAP.md · Events Published' },

      { at: 'indexer', via: 'ec.surveillance-policy-evaluator.{tenant}.surveilled', dwell: 4400,
        title: 'Indexed',
        cargo: { label: 'indexed document', tint: '#fbbf24',
                 stamps: ['minified', 'qualified', 'filtered', 'surveilled', 'indexed'] },
        note: 'Indexer resolves the target index, fetches the document from S3 and writes ' +
              'it to Elasticsearch — surveil.av5 for clean traffic, review.v1 for anything ' +
              'alerted.',
        src: 'Indexer/EVENT_FLOW_MAP.md · Persistent Store Interactions' },

      { at: 'surveil', via: 'index -> surveil.av5', dwell: 3600, terminal: true,
        title: 'Cleared',
        cargo: { label: 'surveil.av5 document', tint: '#4ade80',
                 stamps: ['minified', 'qualified', 'filtered', 'surveilled', 'indexed', 'cleared'] },
        note: 'The Clearance Terminal. Compliant traffic is archived here and the ' +
              'journey ends. Alerted traffic would have been offloaded at the Violation ' +
              'Depot, review.v1, instead.',
        src: 'Indexer/ec-indexer_stop_info.md' }
    ]
  };

  return { stops: STOPS, tracks: TRACKS, scenarios: [HAPPY] };
});
