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
  //     | siding (a dead-end topic — a DLT, where a document stops for good)
  //     | terminus (the surveillance line ends, but a record carries on)
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
      role: 'Violation Depot' },

    /*
     * The Queue Qualifier dead letter topic. Its grid position is the one thing
     * on this map that is a drawing decision rather than a document fact: it is
     * a Kafka topic, so it has no place on the architecture image, and
     * data/layout.js has no cell for it. (3,5) is free in that layout and hangs
     * clear below the qualifier at (3,3), which is what a dead-end siding
     * should look like. The topic itself is real; only where it sits is chosen.
     */
    { id: 'qualifier-dlt', name: '{topic}-dlt', kind: 'siding', tech: 'Kafka', grid: { x: 3, y: 5 },
      role: 'Dead Letter Topic' },

    /*
     * The not-qualified branch. A terminus, not a siding: the document stops
     * being surveilled, but an audit record carries on to Centralized Audit and
     * is written to Mongo. Drawing it in the DLT's red would say something went
     * wrong, and nothing did — not matching a flag policy is a normal, correct
     * outcome for most traffic.
     *
     * centralised-audit takes its cell straight from data/layout.js. The other
     * two are Kafka topics and a Mongo collection, which the architecture image
     * does not place, so (4,1) and (5,0) are chosen — both free in that layout,
     * both keeping the branch on one clean line up from the filter.
     */
    { id: 'not-qualified', name: '.not-qualified', kind: 'terminus', tech: 'Kafka', grid: { x: 4, y: 1 },
      role: 'End of the surveillance line' },
    { id: 'audit',       name: 'Centralized Audit', kind: 'station', tech: 'K8s',     grid: { x: 4, y: 0 } },
    { id: 'audit-store', name: 'ec-audit-events',   kind: 'depot',   tech: 'MongoDB', grid: { x: 5, y: 0 } }
  ];

  // transport: kafka (a track) | cdc (outbox -> Debezium -> a track) | s3 (an IO spur)
  //          | retry (a loop siding back into the same station) | dlt (a dead end)
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
      topic: 'index -> review.v1' },

    /*
     * Retry and DLT, on Queue Qualifier's ingestion path. `from` and `to` are
     * the same stop on purpose — a retry is a loop siding: the message goes
     * back to the same consumer on the next -retry-N topic.
     *
     * The topic names really are written `{topic}-retry-0` in the source. The
     * ingestion topic is injected per tenant at consumer bean creation and is
     * not a static template in application.yaml, so the documents can only name
     * the suffix. That is a real gap in the estate's own record, not a gap here.
     */
    { from: 'qualifier', to: 'qualifier',     transport: 'retry',
      topic: '{topic}-retry-0 / {topic}-retry-1' },
    { from: 'qualifier', to: 'qualifier-dlt', transport: 'dlt',
      topic: '{topic}-dlt' },

    { from: 'filter',        to: 'not-qualified', transport: 'kafka',
      topic: 'ec.surveillance-filter.{tenant}.not-qualified' },
    { from: 'not-qualified', to: 'audit',         transport: 'kafka',
      topic: 'ec.centralized.{tenant}.audit' },
    { from: 'audit',         to: 'audit-store',   transport: 'mongo',
      topic: 'write -> ec-audit-events' }
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

  /*
   * The retry walk. Same document, same first two hops, then it fails at Queue
   * Qualifier and is carried through the full Spring Kafka retry ladder until
   * the attempts run out and it rolls into the dead letter topic.
   *
   * Why the qualifier: it is the stop whose retry path the documents describe
   * end to end — consumer method by consumer method, publisher class named, and
   * a "Failure paths" section that states the route in one line. Other services
   * retry too, but most of them only show it in a mermaid diagram.
   *
   * Why exhaustion rather than recovery: a document that recovers on retry-0
   * ends up back on the happy path, which is already drawn. The version that
   * runs out of attempts is the one that shows what the ladder is FOR, and it
   * is the only way to put the DLT on screen. Recovery is worth adding later as
   * a branch of this scenario.
   *
   * Three attempts total — the original delivery plus retry-0 plus retry-1 —
   * because Events Consumed lists exactly those two retry topics and describes
   * retry-1 as "Second/final retry; sends to DLT on failure".
   */
  var RETRY = {
    id: 'retry',
    name: 'Retry ladder — exhausted to DLT',
    steps: [
      { at: 'ea-s3', dwell: 2200,
        title: 'Raw communication lands',
        cargo: { label: 'indexable.json', tint: '#94a3b8', stamps: [] },
        note: 'The same start as the happy path. A BulkIndexEvent pointing at a ' +
              'document in the EA S3 bucket is published to supBulkIndexingTopic_k8s.',
        src: 'Gateway/EVENT_FLOW_MAP.md · Events Consumed' },

      { at: 'gateway', via: 'supBulkIndexingTopic_k8s', dwell: 3800,
        title: 'Ingested and minified',
        cargo: { label: 'miniIndexable.json', tint: '#38bdf8', stamps: ['minified', 'outboxed'] },
        note: 'Gateway minifies the document and writes an IngestedCommunicationOutbox ' +
              'row. Debezium publishes it. Nothing has gone wrong yet.',
        src: 'Gateway/ec-gateway_stop_info.md · Transformation' },

      { at: 'qualifier', via: 'outbox -> Debezium', dwell: 5000,
        attempt: { n: 1, of: 3 }, failed: true,
        title: 'First delivery fails',
        cargo: { label: 'unprocessed message', tint: '#f87171', stamps: ['minified'] },
        note: 'IngestedCommunicationConsumer.listen() takes the batch and hits a ' +
              'recoverable processing error — the qualifier has to fetch the ' +
              'communication document from S3 before it can extract participants, and ' +
              'that is the fragile part. The message is not dropped and it is not ' +
              'acknowledged as done: IngestedCommunicationRetryTopicManager republishes ' +
              'it onto the first retry topic.',
        src: 'Queue Qualifier/ec-queue-qualifier_stop_info.md · Failure paths' },

      { at: 'qualifier', via: '{topic}-retry-0', dwell: 4600,
        attempt: { n: 2, of: 3 },  failed: true,
        title: 'Attempt 2 — first retry',
        cargo: { label: 'unprocessed message', tint: '#f87171', stamps: ['minified', 'retried'] },
        note: 'The message comes back to the same consumer class on a different topic ' +
              'and a different method: firstRetry(). This is what the retry ladder ' +
              'actually is — not a loop inside the service, but a round trip through ' +
              'Kafka, which is why a retry survives the pod restarting. It fails again.',
        src: 'Queue Qualifier/EVENT_FLOW_MAP.md · Events Consumed #2' },

      { at: 'qualifier', via: '{topic}-retry-1', dwell: 4800,
        attempt: { n: 3, of: 3 }, failed: true,
        title: 'Attempt 3 — final retry',
        cargo: { label: 'unprocessed message', tint: '#dc2626', stamps: ['minified', 'retried', 'retried'] },
        note: 'Last chance. secondRetry() is documented as the "second/final retry; ' +
              'sends to DLT on failure" — there is no retry-2. When this one fails the ' +
              'ladder is out of rungs and the message stops being retried at all.',
        src: 'Queue Qualifier/EVENT_FLOW_MAP.md · Events Consumed #3' },

      { at: 'qualifier-dlt', via: '{topic}-dlt', dwell: 5200, terminal: true, failed: true,
        title: 'Dead letter — the siding',
        cargo: { label: 'dead letter', tint: '#7f1d1d', stamps: ['minified', 'retried', 'retried', 'dead'] },
        note: 'The document is parked on the dead letter topic and travels no further. ' +
              'Nothing downstream ever sees it: no qualification, no filtering, no ' +
              'policy evaluation, no index entry. It is not lost — it is sitting on a ' +
              'topic waiting for a human — but as far as the estate is concerned this ' +
              'communication was never surveilled. Deserialization failures are put ' +
              'here directly, without using the ladder at all.',
        src: 'Queue Qualifier/EVENT_FLOW_MAP.md · Events Published #6' }
    ]
  };

  /*
   * The not-qualified walk. The document is ingested and qualified normally,
   * then Surveillance Filter evaluates it and decides it is not flagged for
   * review. That ends its surveillance journey — it never reaches Policy
   * Evaluator, never gets indexed, never appears in either Elasticsearch yard.
   *
   * This is the scenario that stops the map being a story about one lucky
   * document. Most traffic ends here, not in surveil.av5.
   *
   * The part worth watching is that terminal does not mean vanished. The
   * .not-qualified topic is consumed by the filter's own AuditEventAdapter and
   * re-published to the centralized audit topic, where Centralized Audit writes
   * it to Mongo — so the estate keeps a record that this communication was seen
   * and cleared, even though nothing downstream ever processes it.
   */
  var NOT_QUALIFIED = {
    id: 'not-qualified',
    name: 'Terminal state — not qualified',
    steps: [
      { at: 'ea-s3', dwell: 2200,
        title: 'Raw communication lands',
        cargo: { label: 'indexable.json', tint: '#94a3b8', stamps: [] },
        note: 'The same start as every other scenario. A BulkIndexEvent pointing at a ' +
              'document in the EA S3 bucket is published to supBulkIndexingTopic_k8s.',
        src: 'Gateway/EVENT_FLOW_MAP.md · Events Consumed' },

      { at: 'gateway', via: 'supBulkIndexingTopic_k8s', dwell: 3600,
        title: 'Ingested and minified',
        cargo: { label: 'miniIndexable.json', tint: '#38bdf8', stamps: ['minified', 'outboxed'] },
        note: 'Gateway minifies the document, re-uploads it and writes an ' +
              'IngestedCommunicationOutbox row. Debezium publishes it — Gateway never ' +
              'emits the event itself.',
        src: 'Gateway/ec-gateway_stop_info.md · Transformation' },

      { at: 'qualifier', via: 'outbox -> Debezium', dwell: 3800,
        title: 'Qualified against pipelines',
        cargo: { label: 'QualifiedCommunicationDto', tint: '#22d3ee', stamps: ['minified', 'qualified'] },
        note: 'Queue Qualifier matches the communication against the tenant\'s ' +
              'surveillance pipelines and finds at least one, so it travels on. With ' +
              'zero matches it would have been routed straight to audit from here ' +
              'instead — a different terminal state, one stop earlier.',
        src: 'Queue Qualifier/EVENT_FLOW_MAP.md · Events Published #1, #2' },

      { at: 'filter', via: 'ec.surveillance-qualifier.{tenant}.qualifications', dwell: 5400,
        title: 'Evaluated — and not flagged',
        cargo: { label: 'PipelineEvaluationEvent', tint: '#fbbf24',
                 stamps: ['minified', 'qualified', 'evaluated'] },
        note: 'Surveillance Filter runs two phases against locally cached config. The ' +
              'Ignore phase passes — no ignore rule matches, so the document is not ' +
              'discarded. The Filter phase then finds no flag policy that matches ' +
              'either, which is the NOT_QUALIFIED result. Nothing failed here: this is ' +
              'the engine deciding the communication does not need review.',
        src: 'Surveillance Filter/ec-surveillance-filter_stop_info.md · Decisions' },

      { at: 'not-qualified', via: 'ec.surveillance-filter.{tenant}.not-qualified', dwell: 5000,
        title: 'The surveillance line ends',
        cargo: { label: 'NOT_QUALIFIED result', tint: '#a3a3a3',
                 stamps: ['minified', 'qualified', 'evaluated', 'not-qualified'] },
        note: 'PipelineEvaluationEventPublisher puts the result on the not-qualified ' +
              'topic. Compare that with the qualified path, which goes to .evaluations ' +
              'and on to Policy Evaluator: nothing downstream consumes .not-qualified ' +
              'for surveillance purposes. No policy evaluation, no indexing, no entry ' +
              'in surveil.av5 or review.v1. For most traffic in the estate, this is ' +
              'where the journey actually ends.',
        src: 'Surveillance Filter/EVENT_FLOW_MAP.md · Events Published #2' },

      { at: 'audit', via: 'ec.centralized.{tenant}.audit', dwell: 5200,
        title: 'But the record carries on',
        cargo: { label: 'PipelineEvaluationEvent (headers only)', tint: '#818cf8',
                 stamps: ['minified', 'qualified', 'evaluated', 'not-qualified', 'audited'] },
        note: 'Terminal does not mean vanished. AuditEventAdapter — a consumer inside ' +
              'Surveillance Filter itself — reads the not-qualified topic straight back ' +
              'and re-publishes it to the centralized audit topic, headers only. The ' +
              'body is dropped; what survives is the fact that this communication was ' +
              'seen, evaluated and cleared. Centralized Audit consumes it as a primary ' +
              'audit event from the surveillance pipeline.',
        src: 'Surveillance Filter/EVENT_FLOW_MAP.md · Events Published #4' },

      { at: 'audit-store', via: 'write -> ec-audit-events', dwell: 4200, terminal: true,
        title: 'Filed',
        cargo: { label: 'AuditEvent', tint: '#c7d2fe',
                 stamps: ['minified', 'qualified', 'evaluated', 'not-qualified', 'audited', 'filed'] },
        note: 'CommunicationEventService writes the audit event to the ec-audit-events ' +
              'collection in MongoDB. That row is the estate\'s entire memory of this ' +
              'document — proof it passed through and was judged not to need review.',
        src: 'Centralized Audit/EVENT_FLOW_MAP.md · Persistent Store Interactions #1' }
    ]
  };

  return { stops: STOPS, tracks: TRACKS, scenarios: [HAPPY, RETRY, NOT_QUALIFIED] };
});
