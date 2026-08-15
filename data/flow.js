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

  /*
   * ---------------------------------------------------------------------------
   * Positions are a RAILWAY layout, not the architecture image's layout.
   * ---------------------------------------------------------------------------
   *
   * data/layout.js remains the provenance record: it holds where each service
   * sits on "Enterprise Conduct V3 - TSA.jpg", derived by colour-detecting every
   * box, and it is not changed by any of this. But an architecture diagram is
   * drawn to show grouping, and a railway map is drawn to show a journey. Laying
   * the stops out on the image's coordinates produced 32 edge crossings and 25
   * rails running through the middle of a station they had nothing to do with —
   * one of them straight through Queue Qualifier — which made the transitions
   * impossible to follow.
   *
   * The projection in js/iso.js has exactly four directions that read as clean
   * straight lines, and everything here is built out of them:
   *
   *   same y, +x     down-right on screen   the main line
   *   same x, +y     down-left on screen    branches off it
   *   dx === dy      straight down          spurs to stores and sidings
   *   dx === -dy     straight right         short connectors
   *
   * So: one main line along y = 4 carrying the document from EA-S3 to
   * surveil.av5, every stop two cells apart to give the labels room. Everything
   * a document can branch to hangs off that line on one of the other three axes,
   * with the control plane (config, audit) above it and storage, sidings and
   * dead ends below. Nothing sits at a position that puts it under a rail it is
   * not connected to.
   *
   * kind: station (a K8s service) | yard (Elasticsearch) | depot (S3 / Mongo)
   *     | siding (a dead-end topic — a DLT, where a document stops for good)
   *     | terminus (the surveillance line ends, but a record carries on)
   *     | external (outside the estate)
   */
  var STOPS = [
    /*
     * The Archive, at (0,7): three cells from EA-S3 along a single grid axis, so
     * EA-S3 sits up and to the right of it and the conveyor between them runs
     * at 90 degrees to both buildings' walls.
     *
     * That single-axis constraint is the whole point, and it is easy to get
     * wrong. A building's walls lie along the grid axes, so a wall's normal is
     * a pure +x or +y. A belt offset diagonally — two cells on BOTH axes —
     * leaves through the corner of the building at 45 degrees to either wall,
     * which is exactly what looked awkward before. Only a pure-axis run comes
     * squarely out of a wall.
     *
     * (-x would have worked geometrically too, but it puts the Archive on the
     * y = 4 row, which is the pipeline's own line, and the Archive must not
     * read as a stop on it.)
     *
     * PROVENANCE, stated plainly because this is the one edge on the map that
     * does not come from knowledge/:
     *
     *   The corpus does document an Archive, but only as Archive Elasticsearch
     *   — Manual Run's remediation flow searches it through ArchiveSearchClient
     *   and indexes into it via ea-indexing-gateway's /v1/index/sup-archive.
     *   It does NOT document any Archive -> EA-S3 relationship, and the string
     *   "EA-S3" does not appear anywhere in the documents at all; that name
     *   reached this map from the architecture image.
     *
     *   The architecture image does place an Archive box far left of the main
     *   pipeline row, which is where data/layout.js has it and is consistent
     *   with this. The hop itself is asserted by the repo owner, and is sourced
     *   to them below rather than to a file that does not say it. If a document
     *   turns up that describes this hand-off, replace the src with it.
     */
    { id: 'archive',    name: 'Archive',             kind: 'archive', tech: 'external',      grid: { x: 0, y: 7 },
      role: 'External system of record' },

    // --- the main line, y = 4, west to east ---------------------------------
    { id: 'ea-s3',      name: 'EA-S3',               kind: 'depot',   tech: 'S3',            grid: { x: 0, y: 4 } },
    { id: 'gateway',    name: 'Gateway',             kind: 'station', tech: 'K8s',           grid: { x: 2, y: 4 } },
    { id: 'qualifier',  name: 'Queue Qualifier',     kind: 'station', tech: 'K8s',           grid: { x: 4, y: 4 } },
    { id: 'filter',     name: 'Surveillance Filter', kind: 'station', tech: 'K8s',           grid: { x: 6, y: 4 } },
    { id: 'evaluator',  name: 'Policy Evaluator',    kind: 'station', tech: 'K8s',           grid: { x: 8, y: 4 } },
    { id: 'indexer',    name: 'Indexer',             kind: 'station', tech: 'K8s',           grid: { x: 10, y: 4 } },
    { id: 'surveil',    name: 'surveil.av5',         kind: 'yard',    tech: 'Elasticsearch', grid: { x: 12, y: 4 },
      role: 'Clearance Terminal' },

    // --- below the line: storage, sidings, dead ends -------------------------
    // Each one hangs straight down on screen (dx === dy) from its own station,
    // so a spur can never be mistaken for a continuation of the journey.
    { id: 'ec-s3',      name: 'EC-S3',               kind: 'depot',   tech: 'S3',            grid: { x: 3, y: 5 } },
    { id: 'qualifier-dlt', name: '{topic}-dlt',      kind: 'siding',  tech: 'Kafka',         grid: { x: 5, y: 5 },
      role: 'Dead Letter Topic' },
    { id: 'review',     name: 'review.v1',           kind: 'yard',    tech: 'Elasticsearch', grid: { x: 11, y: 5 },
      role: 'Violation Depot' },

    // --- above the line: the audit plane ------------------------------------
    // The not-qualified walk climbs straight up on screen from the filter —
    // filter -> .not-qualified -> Centralized Audit are each dx === dy === -1 —
    // and the Mongo collection peels off due right (dx === -dy).
    { id: 'not-qualified', name: '.not-qualified',   kind: 'terminus', tech: 'Kafka',        grid: { x: 5, y: 3 },
      role: 'End of the surveillance line' },
    { id: 'audit',       name: 'Centralized Audit',  kind: 'station',  tech: 'K8s',          grid: { x: 4, y: 2 } },
    { id: 'audit-store', name: 'ec-audit-events',    kind: 'depot',    tech: 'MongoDB',      grid: { x: 5, y: 1 } },

    // --- the y = 3 row: everything fed from the main line's later stops -------
    // Runs parallel to the main line one cell above it, so its rails never cross
    // it — they only ever meet it at a station.
    { id: 'quota',       name: 'Quota Manager',      kind: 'station',  tech: 'K8s',          grid: { x: 9, y: 3 } },
    { id: 'alerting',    name: 'Alerting',           kind: 'station',  tech: 'K8s',          grid: { x: 11, y: 3 } },
    { id: 'echo-engine', name: 'Echo Engine',        kind: 'station',  tech: 'K8s',          grid: { x: 13, y: 3 } },

    // --- upstream and control ------------------------------------------------
    { id: 'manual-run',     name: 'Manual Run',      kind: 'station',  tech: 'K8s',          grid: { x: 0, y: 2 } },
    { id: 'config-curator', name: 'Config Curator',  kind: 'station',  tech: 'K8s',          grid: { x: 2, y: 2 } },
    // Cognition sits below the line rather than above it with the other
    // non-pipeline services. Above the evaluator, on any clean axis, its spur
    // crossed the .not-qualified -> Quota Manager rail; here it runs due left on
    // screen from the evaluator and crosses nothing.
    { id: 'cognition',      name: 'Cognition Analytics', kind: 'external', tech: 'external', grid: { x: 7, y: 5 } },

    // --- the y = 7 row: the reporting and review subdomain -------------------
    { id: 'review-service', name: 'Review Service',        kind: 'station', tech: 'K8s',     grid: { x: 7, y: 7 } },
    { id: 'reporting',      name: 'Reporting',             kind: 'station', tech: 'K8s',     grid: { x: 9, y: 7 } },
    { id: 'conduct-audit',  name: 'Conduct Audit Service', kind: 'station', tech: 'K8s',     grid: { x: 11, y: 7 } }
  ];

  // transport: kafka (a track) | cdc (outbox -> Debezium -> a track) | s3 (an IO spur)
  //          | retry (a loop siding back into the same station) | dlt (a dead end)
  var TRACKS = [
    /*
     * Archive -> EA-S3. A conveyor, not a rail and not a road: no Kafka topic
     * carries it, and it never stops. Boxes are stamped with metadata in the
     * Archive's processing bay and ride the belt straight into the bucket in a
     * continuous stream — which is a truer picture of a bulk feed than a cart
     * shuttling one crate at a time ever was.
     *
     * Sourced to the repo owner. See the note on the archive stop above.
     */
    { from: 'archive',   to: 'ea-s3',     transport: 'belt',
      topic: 'archived documents -> EA S3 bucket',
      src: 'repo owner (not in knowledge/)' },

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
      topic: 'write -> ec-audit-events' },

    /*
     * The rest of the estate's edges. Every one of these was read from both
     * ends — the publisher's Events Published table and the consumer's Events
     * Consumed table — except the two marked `unverified`, which is explained
     * where they appear below.
     *
     * Where an edge is `cdc`, the publisher's table correctly does NOT list the
     * topic, because the service writes an outbox row and Debezium publishes
     * it. That absence is the pattern, not a gap.
     */
    { from: 'manual-run',     to: 'gateway',        transport: 'kafka',
      topic: 'ec.surveillance-manual-run.{tenant}.ingestion' },
    /*
     * The manual-run bypass. Drawn with a bow because it genuinely is one: a
     * manual-run communication is qualified before it ever reaches Gateway, so
     * it skips Queue Qualifier entirely and goes from Gateway's outbox straight
     * to Surveillance Filter. Straight, this rail ran exactly through the
     * middle of the qualifier, which said the opposite of what it means. Bowed,
     * it visibly goes around the station it bypasses.
     */
    { from: 'gateway',        to: 'filter',         transport: 'cdc', bow: 1.15,
      topic: 'ec.surveillance-gateway.outbox.{tenant}.qualifiedCommunication' },

    { from: 'config-curator', layer: 'config', to: 'qualifier',      transport: 'kafka',
      topic: 'ec.config-curator.{tenant}.surveillance-pipelines' },
    { from: 'config-curator', layer: 'config', to: 'filter',         transport: 'kafka',
      topic: 'ec.config-curator.{tenant}.surveillance-policies' },
    { from: 'config-curator', layer: 'config', to: 'quota',          transport: 'kafka',
      topic: 'ec.config-curator.{tenant}.surveillance-sampling' },
    { from: 'config-curator', layer: 'config', to: 'review-service', transport: 'kafka',
      topic: 'ec.config-curator.{tenant}.surveillance-pipelines' },
    { from: 'config-curator', layer: 'config', to: 'reporting',      transport: 'kafka',
      topic: 'ec.config-curator.{tenant}.surveillance-pipelines' },

    /*
     * These two edges are named only by their consumer. Config Curator's own
     * documents never mention alert-generation-config, retention-policies (both
     * consumed by Alerting, so one edge here) or .configuration — not in its
     * Events Published table, and not as outbox topics either, though it does
     * document publishing other topics that way. So the mechanism is probably
     * the same Debezium outbox, and "probably" is exactly what this map is not
     * allowed to draw as fact. They are marked unverified and rendered faintly
     * rather than quietly promoted or quietly dropped: a gap someone can see is
     * a gap someone can go and close.
     */
    { from: 'config-curator', layer: 'config', to: 'alerting',       transport: 'kafka', unverified: true,
      topic: 'ec.config-curator.{tenant}.alert-generation-config' },
    { from: 'config-curator', layer: 'config', to: 'echo-engine',    transport: 'kafka', unverified: true,
      topic: 'ec.config-curator.{tenant}.configuration' },

    { from: 'not-qualified',  to: 'quota',          transport: 'kafka',
      topic: 'ec.surveillance-filter.{tenant}.not-qualified' },
    { from: 'quota',          to: 'alerting',       transport: 'cdc',
      topic: 'ec.surveillance-quota-manager.{tenant}.surveilled-communication-outbox' },
    { from: 'alerting',       to: 'echo-engine',    transport: 'kafka',
      topic: 'ec.alerting-service.{tenant}.alertedCommunication' },
    { from: 'echo-engine',    to: 'alerting',       transport: 'kafka',
      topic: 'ec.echo-engine.{tenant}.echoAction' },

    { from: 'evaluator',      to: 'cognition',      transport: 'kafka',
      topic: 'cognition.config.{tenant}.kafkaTopic (per-tenant)' },
    { from: 'evaluator',      to: 'audit', layer: 'audit',          transport: 'kafka',
      topic: 'ec.centralized.{tenant}.audit' },
    { from: 'echo-engine',    to: 'audit', layer: 'audit',          transport: 'kafka',
      topic: 'ec.centralized.{tenant}.audit' },

    { from: 'audit',          to: 'quota', layer: 'audit',          transport: 'cdc',
      topic: 'ec.centralised-audit.outbox.{tenant}.windowReconciliation' },
    { from: 'audit',          to: 'reporting', layer: 'audit',      transport: 'cdc',
      topic: 'ec.centralised-audit.outbox.{tenant}.windowReconciliation' },
    { from: 'quota',          to: 'reporting', layer: 'audit',      transport: 'cdc',
      topic: 'ec.surveillance-quota-manager.{tenant}.quota-windows' },
    { from: 'quota',          to: 'manual-run', layer: 'audit',     transport: 'cdc',
      topic: 'ec.surveillance-quota-manager.{tenant}.quota-windows' },
    { from: 'reporting',      to: 'conduct-audit', layer: 'audit',  transport: 'kafka',
      topic: 'conduct_audit_topic' }
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
   * .not-qualified topic has two consumers, and neither of them continues the
   * surveillance: the filter's own AuditEventAdapter re-publishes it to the
   * centralized audit topic, where Centralized Audit writes it to Mongo, and
   * Quota Manager's SurveilledNotQualifiedCommunicationConsumer counts it
   * against the tenant's quota. So the estate keeps a record that this
   * communication was seen and cleared, while nothing evaluates or indexes it.
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
              'and on to Policy Evaluator: no policy evaluation happens here, no ' +
              'indexing, no entry in surveil.av5 or review.v1. Two consumers do read ' +
              'this topic, and neither continues the surveillance — Surveillance ' +
              'Filter\'s own AuditEventAdapter, next stop, and Quota Manager, which ' +
              'counts it against the tenant\'s quota.',
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
