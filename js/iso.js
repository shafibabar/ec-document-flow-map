/*
 * Isometric projection: grid coordinates <-> screen coordinates, plus camera
 * pan/zoom and depth sorting. Deliberately free of any domain knowledge — it
 * knows about tiles, not about services or topics.
 *
 * To be lifted from ChipTycoon as-is if it fits unchanged.
 * https://github.com/laurentiugabriel/ChipTycoon
 */

var Iso = {};
