/*
 * Reads MODEL into an indexed directed graph and answers questions about it:
 * outgoing edges from a node, consumers of a topic, the retry policy for a
 * given consumer, which nodes and edges belong to a given layer.
 *
 * Also the home of the model's self-checks — unmatched events, dangling
 * topics, services with no documented failure path — so the same findings that
 * appear in the accuracy report can be surfaced in the UI.
 */

var Graph = {};
