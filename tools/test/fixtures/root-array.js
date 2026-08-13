'use strict';
/*
 * Test fixture — the extract exports an array instead of one object.
 *
 * Deliberately does not use the standard wrapper: the wrapper reads
 * `d.service.id`, so it could not express this mistake. This is what an agent
 * produces after collecting entries in an array and returning the array.
 */
module.exports = [
  { id: 'echo-engine', kind: 'service', source: { file: 'Echo Engine/EVENT_FLOW_MAP.md', heading: 'Events Consumed' } }
];
