/*
 * The document itself, and how it accretes state as it travels.
 *
 * This is what makes the map teach rather than decorate: the envelope must
 * visibly change at every stop — raw inbound payload, validation stamp,
 * enrichment fields added after a REST lookup, a copy peeling off into an
 * Elastic index, status transitions, an `attempt 2 of 3` counter during retry,
 * going dark on the way to a DLT.
 *
 * Owns the tag above the cart naming what it is carrying right now.
 */

var Envelope = {};
