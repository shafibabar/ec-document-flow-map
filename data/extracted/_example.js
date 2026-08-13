'use strict';
/*
 * WORKED EXAMPLE — ec-echo-engine
 *
 * This is the reference the other fourteen extraction issues copy. It is a real
 * extract of a real service, not a sketch: every value below was read out of
 *
 *     knowledge/Conduct Services/Echo Engine/EVENT_FLOW_MAP.md   (242 lines)
 *     knowledge/Conduct Services/Echo Engine/ec-echo-engine_stop_info.md
 *
 * Read docs/MODEL_SCHEMA.md alongside this file. The schema states the rules;
 * this shows them applied to a document with real awkwardness in it.
 *
 * Six things worth noticing before you copy the pattern:
 *
 *  1. The two documents disagree on tenant placeholder syntax — the flow map
 *     writes `<tenant>`, the stop_info writes `{tenant}`. Cosmetic, but recorded
 *     rather than silently normalised, because "I assumed it was cosmetic" is
 *     exactly how a real discrepancy gets lost.
 *  2. The config topics arrive as Debezium CdcEvents, so their transport is
 *     `cdc`, not `kafka`. The wire is Kafka; the semantic is change data
 *     capture. The Outbox/CDC layer depends on that distinction being made here.
 *  3. The alert topic is `cdc` too, and it is deliberately **not** a conflict —
 *     read this one before you copy anything. Its Events Consumed row gives the
 *     payload as a plain `AlertEvent`, unlike rows 2 and 3 which say "Debezium
 *     `CdcEvent` containing …". That is a statement about the message class, in
 *     a column headed "Payload"; the table says nothing about transport either
 *     way. Six passages across the two documents do describe the transport, and
 *     all six say CDC — including the stop_info's "AlertEvent (CDC)", which
 *     holds both facts in one line. A table and a paragraph using different
 *     vocabulary for two different aspects of the same edge is not the corpus
 *     disagreeing with itself, and recording it as a conflict would bury the
 *     real disagreements under noise. The payload observation is kept in
 *     `ambiguities` so the evidence survives.
 *  4. `tenancy[1]` is where a **real** conflict lives: the two documents give
 *     incompatible answers for which MongoDB database holds the echo state —
 *     the flow map says the tenant name and that `alcatraz` is *not* used, the
 *     stop_info says `alcatraz` three times. They cannot both be true, so both
 *     readings are recorded with their own provenance and neither is chosen.
 *     That is the test: a conflict is two answers to one question, not two
 *     vocabularies for one thing.
 *  5. `restOutbound` is empty because the document says "None found" explicitly
 *     — a positive finding, not a gap. That is recorded in `ambiguities` so a
 *     later reader does not mistake it for an unfinished extract.
 *  6. Several entries carry an **array** of sources, because their fields were
 *     read from different sections. One `{file, heading}` would have had to name
 *     one of them and silently mis-cite the rest.
 *
 * The wrapper below works both as a browser <script> tag (registering into
 * window.EC_EXTRACTS) and as a Node require() for the validator. No build step.
 */
(function (root, factory) {
  var d = factory();
  if (typeof module === 'object' && module.exports) module.exports = d;
  else (root.EC_EXTRACTS = root.EC_EXTRACTS || {})[d.service.id] = d;
})(typeof self !== 'undefined' ? self : this, function () {
  var FM = 'Echo Engine/EVENT_FLOW_MAP.md';
  var SI = 'Echo Engine/ec-echo-engine_stop_info.md';
  var IMG = 'Enterprise Conduct V3 - TSA.jpg';

  return {
    service: {
      id: 'echo-engine',
      name: 'ec-echo-engine',
      folder: 'Echo Engine',
      displayName: 'Echo Engine',
      // group and generation are read from the architecture image.
      // data/layout.js (issue #5) is authoritative for grid position.
      group: 'Actioning',
      generation: '3.0',
      summary:
        'Reduces alert fatigue by detecting "echoes" — redundant alerts triggered ' +
        'by the same underlying content across policies and channels — and emitting ' +
        'automated close/update actions back to the Alerting service.',
      runtime: 'Java 21, Spring Boot 3.4.3, Spring Kafka, Spring Data MongoDB, KEDA, Mongock',
      // Two sources, because two sections were read: `summary` is the stop_info's
      // Purpose almost word for word, `runtime` is the flow map's prose under
      // High-Level Architecture. Citing only the flow map — as this entry first
      // did — pointed the summary's provenance at a section that does not
      // contain it, which is worse than no provenance because it looks checked.
      source: [
        { file: SI, heading: 'Purpose' },
        { file: FM, heading: 'High-Level Architecture' }
      ]
    },

    nodes: [
      // The only node whose group and generation are real values: they are read
      // off the image, where the Echo Engine box sits inside the "Actioning
      // Sub-domain" frame and is green, which the legend maps to 3.0.
      { id: 'echo-engine', name: 'Echo Engine', kind: 'service', group: 'Actioning',
        generation: '3.0',
        summary: 'Detects echo alerts and emits automated close/update actions.',
        source: { file: IMG, heading: 'Actioning Sub-domain' } },

      { id: 'topic:alerting.alertedCommunication', name: 'ec.alerting-service.<tenant>.alertedCommunication',
        kind: 'topic', group: 'none', generation: 'unknown',
        source: { file: FM, heading: 'Events Consumed', row: 1 } },
      { id: 'topic:config-curator.surveillance-policies', name: 'ec.config-curator.<tenant>.surveillance-policies',
        kind: 'topic', group: 'none', generation: 'unknown',
        source: { file: FM, heading: 'Events Consumed', row: 2 } },
      { id: 'topic:config-curator.configuration', name: 'ec.config-curator.<tenant>.configuration',
        kind: 'topic', group: 'none', generation: 'unknown',
        source: { file: FM, heading: 'Events Consumed', row: 3 } },
      { id: 'topic:echo-engine.echoAction', name: 'ec.echo-engine.<tenant>.echoAction',
        kind: 'topic', group: 'none', generation: 'unknown',
        source: { file: FM, heading: 'Events Published', row: 1 } },
      { id: 'topic:centralized.audit', name: 'ec.centralized.<tenant>.audit',
        kind: 'topic', group: 'none', generation: 'unknown',
        source: { file: FM, heading: 'Events Published', row: 2 } },

      { id: 'dlt:alertedCommunication', name: 'ec.alerting-service.<tenant>.alertedCommunication-ec-echo-engine-dlt',
        kind: 'dlt', group: 'none', generation: 'unknown',
        source: { file: FM, heading: 'Retry and DLT topics', row: 1 } },
      { id: 'dlt:surveillance-policies', name: 'ec.config-curator.<tenant>.surveillance-policies-ec-echo-engine-dlt',
        kind: 'dlt', group: 'none', generation: 'unknown',
        source: { file: FM, heading: 'Retry and DLT topics', row: 2 } },
      { id: 'dlt:configuration', name: 'ec.config-curator.<tenant>.configuration-ec-echo-engine-dlt',
        kind: 'dlt', group: 'none', generation: 'unknown',
        source: { file: FM, heading: 'Retry and DLT topics', row: 3 } },
      { id: 'dlt:echoAction', name: 'ec.echo-engine.<tenant>.echoAction-ec-echo-engine-dlt',
        kind: 'dlt', group: 'none', generation: 'unknown',
        source: { file: FM, heading: 'Retry and DLT topics', row: 4 } }
    ],

    edges: [
      // transport is `cdc`, and this is NOT a conflict. See note 3 in the
      // header. `eventType` and `transport` are different facts read from
      // different sections, so the entry cites both: the Events Consumed row
      // names the payload class, the diagrams and the stop_info name the
      // transport.
      { from: 'topic:alerting.alertedCommunication', to: 'echo-engine',
        transport: 'cdc',
        name: 'ec.alerting-service.<tenant>.alertedCommunication',
        eventType: 'AlertEvent', direction: 'in',
        consumer: 'AlertEventConsumer.consume',
        consumerGroup: 'ec.echo-engine.alert-event.consumer-group',
        note: 'Batch @KafkaListener with virtual-thread group processing. The payload class is a plain AlertEvent, not a Debezium CdcEvent envelope as on the two config topics — recorded in ambiguities.',
        purpose: 'Validate and correlate alerted communications, persist echo state, and publish an echo action when the alert is actionable.',
        source: [
          { file: FM, heading: 'Events Consumed', row: 1 },
          { file: FM, heading: 'Complete Event Flow' },
          { file: SI, heading: 'Input' }
        ] },

      // transport is cdc, not kafka: the payload is a Debezium CdcEvent.
      { from: 'topic:config-curator.surveillance-policies', to: 'echo-engine',
        transport: 'cdc', name: 'ec.config-curator.<tenant>.surveillance-policies',
        eventType: 'Debezium CdcEvent containing PolicyConfigPayload', direction: 'in',
        consumer: 'PolicyConfigConsumer.consume',
        consumerGroup: 'ec.echo-engine.policy-config.consumer-group',
        purpose: "Synchronize policy configuration into the tenant's versioned policy collection.",
        source: { file: FM, heading: 'Events Consumed', row: 2 } },

      { from: 'topic:config-curator.configuration', to: 'echo-engine',
        transport: 'cdc', name: 'ec.config-curator.<tenant>.configuration',
        eventType: 'Debezium CdcEvent containing EchoConfigDTO', direction: 'in',
        consumer: 'EchoConfigConsumer.consume',
        consumerGroup: 'ec.echo-engine.echo-config.consumer-group',
        purpose: "Synchronize the supervision app echo behavior configuration into the tenant's versioned configuration collection.",
        source: { file: FM, heading: 'Events Consumed', row: 3 } },

      // Self-consumption: the service consumes its own published topic to emit audit records.
      { from: 'topic:echo-engine.echoAction', to: 'echo-engine',
        transport: 'kafka', name: 'ec.echo-engine.<tenant>.echoAction',
        eventType: 'EchoActionEvent', direction: 'in',
        consumer: 'EchoActionAuditAdapter.listen',
        consumerGroup: 'ec.echo-engine.echo-action-event.consumer-group',
        note: 'Self-consumption — the service consumes the topic it publishes, to emit centralized audit records when audit integration is enabled.',
        source: { file: FM, heading: 'Events Consumed', row: 4 } },

      { from: 'echo-engine', to: 'topic:echo-engine.echoAction',
        transport: 'kafka', name: 'ec.echo-engine.<tenant>.echoAction',
        eventType: 'EchoActionEvent', direction: 'out',
        publisher: 'EchoActionEventPublisher.publish',
        trigger: 'Echo correlation classifies an alert as actionable and builds the configured echo action.',
        source: { file: FM, heading: 'Events Published', row: 1 } },

      { from: 'echo-engine', to: 'topic:centralized.audit',
        transport: 'kafka', name: 'ec.centralized.<tenant>.audit',
        eventType: 'EchoActionEvent for action audits, or header-only ProducerRecord<String, String> for non-action audits',
        direction: 'out',
        publisher: 'AuditPublishService.publish',
        trigger: 'Audit integration is enabled for an echo action, or for a non-action outcome such as not applicable, skipped, not enabled, or not detected.',
        source: { file: FM, heading: 'Events Published', row: 2 } }
    ],

    // Retry topic names are written out in full. The source table prints the
    // -retry-0 name in full on every row and abbreviates the second as
    // `...-retry-1`; that ellipsis is typography, not a topic name, so it is
    // expanded here from the suffix and index range the same section states.
    // The `consumer` on each row is the one Events Consumed gives for that same
    // topic — the retry table itself lists topics only, which is why these
    // entries cite both sections.
    retries: [
      { consumer: 'AlertEventConsumer', topic: 'ec.alerting-service.<tenant>.alertedCommunication',
        attempts: '3',
        retryTopics: [
          'ec.alerting-service.<tenant>.alertedCommunication-ec-echo-engine-retry-0',
          'ec.alerting-service.<tenant>.alertedCommunication-ec-echo-engine-retry-1'
        ],
        dltTarget: 'ec.alerting-service.<tenant>.alertedCommunication-ec-echo-engine-dlt',
        backoff: 'unknown',
        mechanism: 'AlertConsumerContainerFactory, RetryTopicManager and DefaultErrorHandler — not @RetryableTopic',
        source: [
          { file: FM, heading: 'Retry and DLT topics', row: 1 },
          { file: FM, heading: 'Events Consumed', row: 1 }
        ] },

      { consumer: 'PolicyConfigConsumer', topic: 'ec.config-curator.<tenant>.surveillance-policies',
        attempts: '3',
        retryTopics: [
          'ec.config-curator.<tenant>.surveillance-policies-ec-echo-engine-retry-0',
          'ec.config-curator.<tenant>.surveillance-policies-ec-echo-engine-retry-1'
        ],
        dltTarget: 'ec.config-curator.<tenant>.surveillance-policies-ec-echo-engine-dlt',
        backoff: 'unknown', mechanism: '@RetryableTopic',
        source: [
          { file: FM, heading: 'Retry and DLT topics', row: 2 },
          { file: FM, heading: 'Events Consumed', row: 2 }
        ] },

      { consumer: 'EchoConfigConsumer', topic: 'ec.config-curator.<tenant>.configuration',
        attempts: '3',
        retryTopics: [
          'ec.config-curator.<tenant>.configuration-ec-echo-engine-retry-0',
          'ec.config-curator.<tenant>.configuration-ec-echo-engine-retry-1'
        ],
        dltTarget: 'ec.config-curator.<tenant>.configuration-ec-echo-engine-dlt',
        backoff: 'unknown', mechanism: '@RetryableTopic',
        source: [
          { file: FM, heading: 'Retry and DLT topics', row: 3 },
          { file: FM, heading: 'Events Consumed', row: 3 }
        ] },

      { consumer: 'EchoActionAuditAdapter', topic: 'ec.echo-engine.<tenant>.echoAction',
        attempts: '3',
        retryTopics: [
          'ec.echo-engine.<tenant>.echoAction-ec-echo-engine-retry-0',
          'ec.echo-engine.<tenant>.echoAction-ec-echo-engine-retry-1'
        ],
        dltTarget: 'ec.echo-engine.<tenant>.echoAction-ec-echo-engine-dlt',
        backoff: 'unknown', mechanism: '@RetryableTopic',
        note: 'autoCreateTopics=false for this listener, so its retry and DLT topics are provisioned outside this repository.',
        source: [
          { file: FM, heading: 'Retry and DLT topics', row: 4 },
          { file: FM, heading: 'Events Consumed', row: 4 }
        ] }
    ],

    stores: [
      { store: 'mongo', entity: 'Echo correlation history and source metadata',
        collection: 'ec-echo-engine-state',
        repository: 'EchoEngineStateRepository, EchoEngineStateRepositoryImpl, EchoStateStoreService',
        operations: 'Query candidates and upsert state',
        calledBy: 'AlertProcessingService, EchoCorrelationService',
        source: { file: FM, heading: 'Persistent Store Interactions', row: 1 } },

      { store: 'mongo', entity: 'Policy configuration',
        collection: 'ec-echo-engine-policies or ec-echo-engine-policies_<windowToken>',
        repository: 'PolicyConfigRepository, PolicyConfigCustomRepositoryImpl, PolicyConfigSyncService',
        operations: 'Find by ID, replace/upsert, and clone during bootstrap',
        calledBy: 'PolicyConfigConsumer, PolicyConfigFacade, BootstrapConfigService',
        windowed: 'true — _<windowToken> suffix',
        source: { file: FM, heading: 'Persistent Store Interactions', row: 2 } },

      { store: 'mongo', entity: 'Echo behavior configuration',
        collection: 'ec-echo-engine-configuration or ec-echo-engine-configuration_<windowToken>',
        repository: 'EchoConfigRepository, EchoConfigSyncService, EchoConfigService',
        operations: 'Find by ID and save; clone during bootstrap',
        calledBy: 'EchoConfigConsumer, alert correlation, BootstrapConfigService',
        windowed: 'true — _<windowToken> suffix',
        source: { file: FM, heading: 'Persistent Store Interactions', row: 3 } },

      { store: 'mongo', entity: 'System echo and supervision tag groups',
        collection: 'ec-echo-engine-taggroups-tags',
        repository: 'TagGroupRepository, EchoTagGroupService, Mongock migration',
        operations: 'Create system tags, query, and read',
        calledBy: 'Echo action construction and migration',
        source: { file: FM, heading: 'Persistent Store Interactions', row: 4 } }
    ],

    // Drives the document visibly changing at this stop.
    transformation: {
      before: 'AlertEvent (CDC) on ec.alerting-service.{tenant}.alertedCommunication',
      action: 'hash policy hits → correlate against state store → classify',
      after: 'EchoActionEvent on ec.echo-engine.{tenant}.echoAction (with classification)',
      source: { file: SI, heading: 'Transformation' }
    },

    decisions: [
      { decision: 'Ingest', evaluates: 'alert isCreate & has originPolicies',
        yes: 'process', no: 'skip',
        source: { file: SI, heading: 'Decisions', row: 1 } },
      { decision: 'Classification', evaluates: 'hash matches stored original',
        yes: 'ECHO_DETECTED / ECHO_DUPLICATE', no: 'ECHO_ORIGINAL',
        source: { file: SI, heading: 'Decisions', row: 2 } }
    ],

    terminalStates: [
      { name: 'ECHO_ORIGINAL', meaning: 'First occurrence, stored as origin.',
        source: { file: SI, heading: 'Terminal states' } },
      { name: 'ECHO_DETECTED / ECHO_DUPLICATE', meaning: 'Correlated echo, action emitted.',
        source: { file: SI, heading: 'Terminal states' } },
      { name: 'Skipped', meaning: 'Non-CREATE or non-policy alert — a business exclusion, not a failure.',
        source: { file: SI, heading: 'Terminal states' } }
    ],

    failurePaths: [
      { trigger: 'Consumer processing failure',
        route: 'Standard consumer retry then DLT, per application.yaml',
        source: { file: SI, heading: 'Failure paths' } },
      // Failure paths says only "Validation short-circuits (skip) rather than
      // failing". What is being validated — non-CREATE and non-policy alerts —
      // comes from Processing, so both sections are cited rather than putting
      // Processing's detail under a Failure paths citation that does not say it.
      { trigger: 'Validation failure (non-CREATE or non-policy alert)',
        route: 'Short-circuits to skip rather than failing — no retry, no DLT',
        source: [
          { file: SI, heading: 'Failure paths' },
          { file: SI, heading: 'Processing' }
        ] }
    ],

    restInbound: [
      { method: 'POST', path: '/v1/tenants/{tenantName}/bootstrap-config',
        controller: 'BootstrapConfigController.bootstrapConfig',
        request: 'Path tenantName; BootstrapConfigRequest body containing current and next window tokens',
        response: '201 empty response; validation and clone errors use documented error responses',
        purpose: 'Clone policy and echo-configuration collections from the current window token to the next window token for a tenant.',
        source: { file: FM, heading: 'REST APIs Exposed (Inbound)', row: 1 } }
    ],

    // Empty because the document states "None found" explicitly — see ambiguities.
    restOutbound: [],

    // Feeds the Tenancy layer.
    tenancy: [
      { subject: 'Kafka topics and MongoDB database contexts',
        placeholder: '<tenant>',
        resolvedFrom: 'tenant.enabled-tenants / ENABLED_TENANTS',
        examples: 'tenant1 (checked-in default); msuat, msanity, msprod (Morgan Stanley production overlay); conducttest, conductprod (Conduct production overlay)',
        note: 'The active tenant set controls the concrete topic list, MongoDB contexts, migrations and KEDA triggers.',
        source: { file: FM, heading: 'Events Consumed' } },
      // A real conflict, recorded unresolved. The two documents give
      // incompatible answers to one question — which database holds the echo
      // state. The flow map says the database name is the tenant name and says
      // in terms that `alcatraz` is *not* used; the stop_info says three times
      // that the state store database *is* `alcatraz`. Neither is a restatement
      // of the other in different words: they cannot both be true. Choosing
      // between them needs the service's application.yaml, which is not in this
      // corpus, so both readings are recorded with their own provenance.
      { subject: 'MongoDB database name',
        placeholder: {
          conflict: [
            { value: 'the tenant name is used as the database name',
              source: { file: FM, heading: 'Persistent Store Interactions' } },
            { value: 'alcatraz',
              source: [
                { file: SI, heading: 'Processing' },
                { file: SI, heading: 'Dependencies' },
                { file: SI, heading: 'Configuration' }
              ] }
          ]
        },
        resolvedFrom: {
          conflict: [
            { value: 'TenantRepositoryFactory',
              source: { file: FM, heading: 'Persistent Store Interactions' } },
            { value: 'TenantMongoConfig',
              source: { file: SI, heading: 'Dependencies' } }
          ]
        },
        note: 'Collection names are NOT tenant-derived, except the explicit _<windowToken> suffix on policy and echo-configuration collections.',
        examples: 'unknown',
        source: [
          { file: FM, heading: 'Persistent Store Interactions' },
          { file: SI, heading: 'Dependencies' }
        ] }
    ],

    ambiguities: [
      { item: 'ENABLED_TENANTS defaults to tenant1 locally and is supplied by each Kubernetes overlay in deployed environments.',
        source: { file: FM, heading: 'Ambiguities' } },
      { item: 'KAFKA_BOOTSTRAP_SERVERS and SHARED_HOST_MONGODB_URI are deployment values obtained from secrets; no production endpoints are reproduced.',
        source: { file: FM, heading: 'Ambiguities' } },
      { item: 'The audit flag defaults to false; at least one staging overlay explicitly enables it. The audit consumer remains present even when audit publishing is disabled.',
        source: { file: FM, heading: 'Ambiguities' } },
      { item: 'Audit retry/DLT topics are generated by @RetryableTopic naming but have autoCreateTopics=false; their provisioning is external to this repository.',
        source: { file: FM, heading: 'Ambiguities' } },
      { item: 'KAFKA_TOPICS_RETRY_DLT_PARTITIONS, KAFKA_TOPICS_PROCESSING_PARTITIONS and KAFKA_TOPICS_RETENTION_MS have local defaults and may be overridden at deployment time.',
        source: { file: FM, heading: 'Ambiguities' } },
      { item: 'Topic templates are tenant-derived; concrete names beyond the checked-in example tenants must be resolved from the selected deployment overlay.',
        source: { file: FM, heading: 'Ambiguities' } },
      { item: 'The echo-state TTL duration is represented by the expiresAt field and TTL index; no separate configuration property defines the duration.',
        source: { file: FM, heading: 'Ambiguities' } },

      // Findings from extraction itself, not copied from the document.
      { item: 'restOutbound is empty because the document states "None found" explicitly, having searched for RestTemplate, WebClient, RestClient, Feign, Apache/Java HTTP client and configured service URLs. This is a positive finding, not an unfinished extract.',
        foundDuringExtraction: 'true',
        source: { file: FM, heading: 'REST APIs Consumed (Outbound)' } },
      { item: 'The two documents use different tenant placeholder syntax: EVENT_FLOW_MAP.md writes <tenant>, ec-echo-engine_stop_info.md writes {tenant}. Recorded rather than normalised — reconciliation across services is Parent 2\'s job, and normalising here would hide whether other services differ too.',
        foundDuringExtraction: 'true',
        source: { file: SI, heading: 'Transformation' } },
      { item: 'The alert consumer uses a different retry mechanism from the other three: AlertConsumerContainerFactory plus RetryTopicManager plus DefaultErrorHandler, rather than @RetryableTopic. Backoff parameters are not stated for any of the four, so backoff is "unknown" throughout.',
        foundDuringExtraction: 'true',
        source: { file: FM, heading: 'Retry and DLT topics' } },
      { item: 'The alert topic carries a plain AlertEvent payload, not a Debezium CdcEvent envelope as the two config topics do, yet its transport is recorded as cdc. This is not a contradiction and is deliberately NOT recorded as a conflict. The Events Consumed column is headed "Payload" and states the message class; the table has no transport column at all. Every passage that describes how these events arrive says CDC: the High-Level Architecture mermaid names the source "Alert CDC topics", the Complete Event Flow mermaid feeds AlertEventConsumer from "Debezium alert/config events", the stop_info Short narrative says "Consumes alert CDC events", its Input says "alert CDC events from Alerting service", and its Dependencies says "Kafka - alert CDC + config CDC". The stop_info Transformation writes "AlertEvent (CDC)", holding both facts in one line. Whether the Alerting service unwraps the Debezium envelope before publishing is answerable only from the Alerting extract, which is Parent 2\'s job; it does not change what this document says.',
        foundDuringExtraction: 'true',
        source: [
          { file: FM, heading: 'Events Consumed', row: 1 },
          { file: FM, heading: 'Complete Event Flow' },
          { file: SI, heading: 'Transformation' }
        ] },

      { item: 'The two documents give incompatible answers for the MongoDB database that holds the echo state, so tenancy[1] records a conflict rather than a value. EVENT_FLOW_MAP.md says TenantRepositoryFactory "constructs the Mongo database factory with the tenant name as the database name" and that "the checked-in spring.data.mongodb.database: alcatraz value is not used by the tenant repository factory for these domain repositories". ec-echo-engine_stop_info.md says the opposite in three places: Processing step 3 ("the MongoDB (alcatraz) state store"), Dependencies ("MongoDB (alcatraz, per-tenant isolation via TenantMongoConfig)") and Configuration ("alcatraz state store DB"). The two also name different classes for the same mechanism, TenantRepositoryFactory versus TenantMongoConfig. Resolution needs the service\'s configuration, which is not in this corpus.',
        foundDuringExtraction: 'true',
        source: [
          { file: FM, heading: 'Persistent Store Interactions' },
          { file: SI, heading: 'Dependencies' }
        ] },
      { item: 'Retry topic names in the Retry and DLT topics table are abbreviated: each row prints the -retry-0 name in full and writes the second as "...-retry-1". The extract expands them, using the retry suffix "-ec-echo-engine-retry" and the stated retry indexes 0 and 1 from the same section. The expansion is mechanical rather than inferred, but it is recorded here because the literal string in the document is not a topic name.',
        foundDuringExtraction: 'true',
        source: { file: FM, heading: 'Retry and DLT topics' } }
    ]
  };
});
