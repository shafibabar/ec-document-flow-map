/*
 * Map layers — the same estate rendered several ways, like political versus
 * physical versus navigation maps of one geography:
 *
 *   Flow (default)  Events Consumed / Published, Complete Event Flow
 *   Topology        High-Level Architecture: who talks to whom, boundaries
 *   Resilience      Retry/DLT Configuration: attempts, backoff, terminal states
 *   State           Persistent Store Interactions: indices and DBs, reads vs writes
 *   Sync calls      REST APIs Inbound/Outbound: the synchronous overlay
 *
 * The control lives on the map itself. Switching a layer changes what is drawn
 * and never resets or restarts the running animation — layer state and router
 * state are kept strictly separate for exactly this reason.
 *
 * Radio versus toggles is an open decision (docs/MODEL_SCHEMA.md).
 */

var Layers = {};
