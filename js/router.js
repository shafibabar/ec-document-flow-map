/*
 * The routing engine. Written fresh, not lifted: ChipTycoon walks a fixed
 * polyline sequence, this walks a directed graph with branching, cycles and
 * terminal nodes.
 *
 * Advances a scenario one step at a time and exposes where the document is,
 * what it is doing (travelling, dwelling, blocked on a REST call, retrying)
 * and how long the current step has left. Owns dwell timing — scaled to how
 * much a stop has to explain — and holds indefinitely on pause.
 *
 * Handles: happy path to completion, terminal state at any single service,
 * retry with backoff then recovery, retries exhausted into a DLT, and fan-out
 * from one topic to several consumers.
 */

var Router = {};
