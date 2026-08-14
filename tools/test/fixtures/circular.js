'use strict';
/*
 * Test fixture — a node that refers back to itself.
 *
 * An extract must be plain, serialisable data: Parent 2 merges fifteen of them
 * and the model is written back out as a file. A cycle also used to be a way of
 * hanging any validator that recursed, so the walk is checked against it here.
 *
 * Written without the standard wrapper because the cycle has to be built after
 * the object exists.
 */
var S = { file: 'Echo Engine/EVENT_FLOW_MAP.md', heading: 'Events Consumed' };
var node = { id: 'loop', name: 'Loop', kind: 'topic', group: 'none', generation: 'unknown', source: S };
node.itself = node;

module.exports = {
  service: {
    id: 'fixture', name: 'fixture-service', folder: 'Fixture',
    group: 'none', generation: '3.0', summary: 'A circular extract.', source: S
  },
  nodes: [node],
  edges: [], retries: [], stores: [], decisions: [], terminalStates: [],
  failurePaths: [], restInbound: [], restOutbound: [], tenancy: [], ambiguities: [],
  transformation: { before: 'x', action: 'y', after: 'z', source: S }
};
