'use strict';
/* Test fixture — every store technology the corpus actually names — all of these are legal */
(function (root, factory) {
  var d = factory();
  if (typeof module === 'object' && module.exports) module.exports = d;
  else (root.EC_EXTRACTS = root.EC_EXTRACTS || {})[d.service.id] = d;
})(typeof self !== 'undefined' ? self : this, function () {
  var S = { file: "Echo Engine/EVENT_FLOW_MAP.md", heading: "Persistent Store Interactions" };
  return {
    service: {
      id: "fixture", name: "fixture-service", folder: "Fixture",
      group: "none", generation: "3.0",
      summary: "A minimal conforming extract.",
      source: S
    },
    nodes: [], edges: [],
    stores: [
      { store: "mongo",     entity: "Echo state",                       operations: "R/W", calledBy: "EchoStateStoreService", source: S },
      { store: "s3",        entity: "Tenant-specific buckets",          operations: "Read", calledBy: "S3FileDownloader", source: S },
      { store: "elastic",   entity: "surveil.av5",                      operations: "Write", calledBy: "ElasticsearchIndexingService", source: S },
      { store: "redis",     entity: "Sampling bucket counters",         operations: "R/W", calledBy: "SamplingBucketRedisStorageRepository", source: S },
      { store: "ceph",      entity: "Held/released communication objects", operations: "Hold/release", calledBy: "ObjectStoreServiceImpl", source: S },
      { store: "hazelcast", entity: "Alcatraz/property caches",         operations: "Read", calledBy: "SystemPropertiesCacheProvider", source: S },
      { store: "athena",    entity: "ec_indexable_payload_table",       operations: "query start / poll", calledBy: "AthenaQueryExecutor", source: S },
      // alcatraz and shedlock were added to KNOWN_STORES by cycle 3's sweep of all
      // fifteen documents — Actioning's "Alcatraz/property and service caches" and
      // Manual Run's ShedLock — and are the two values that motivated making `store`
      // advisory. Cycle 4's rewrite of this test did not include them, so dropping
      // either from KNOWN_STORES left the test passing; they are covered now.
      { store: "alcatraz",  entity: "Alcatraz/property and service caches", operations: "Read", calledBy: "SystemPropertiesCacheProvider", source: S },
      { store: "shedlock",  entity: "Scheduled-job distributed lock",   operations: "R/W", calledBy: "ShedLock (framework-managed)", source: S },
      { store: "unknown",   entity: "A store the document names but does not identify", operations: "unknown", calledBy: "unknown", source: S }
    ],
    retries: [], decisions: [], terminalStates: [],
    failurePaths: [], restInbound: [], restOutbound: [], tenancy: [], ambiguities: [],
    transformation: { before: "x", action: "y", after: "z", source: S }
  };
});
