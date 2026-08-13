/*
 * Canvas drawing. Stops, roads, the cart and its cargo tag, labels, and the
 * `unknown` / `conflict` markers where the sources were silent or disagreed.
 *
 * Kafka and REST must not look alike: topics are roads the cart drives along,
 * a synchronous REST call is a short out-and-back line from the service to its
 * dependency with the document waiting at the stop. Blocking versus
 * non-blocking is legible at a glance.
 */

var Render = {};
