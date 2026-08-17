'use strict';
/*
 * data/flow.js — the happy path, as a walk through the estate.
 *
 * Grid positions come from data/layout.js, which was derived from
 * "Enterprise Conduct V3 - TSA.jpg" by colour-detecting every box and ranking
 * the centres. Relative order matches the diagram.
 *
 * Every hop below was read from both ends in knowledge/Conduct Services/ —
 * the publisher's Events Published table and the consumer's Events Consumed
 * table — and each carries the file it came from. Nothing here is invented.
 */
(function (root, factory) {
  var d = factory();
  if (typeof module === 'object' && module.exports) module.exports = d;
  else root.EC_FLOW = d;
})(typeof self !== 'undefined' ? self : this, function () {

  /*
   * ---------------------------------------------------------------------------
   * Positions are a RAILWAY layout, not the architecture image's layout.
   * ---------------------------------------------------------------------------
   *
   * data/layout.js remains the provenance record: it holds where each service
   * sits on "Enterprise Conduct V3 - TSA.jpg", derived by colour-detecting every
   * box, and it is not changed by any of this. But an architecture diagram is
   * drawn to show grouping, and a railway map is drawn to show a journey. Laying
   * the stops out on the image's coordinates produced 32 edge crossings and 25
   * rails running through the middle of a station they had nothing to do with —
   * one of them straight through Queue Qualifier — which made the transitions
   * impossible to follow.
   *
   * The projection in js/iso.js has exactly four directions that read as clean
   * straight lines, and everything here is built out of them:
   *
   *   same y, +x     down-right on screen   the main line
   *   same x, +y     down-left on screen    branches off it
   *   dx === dy      straight down          spurs to stores and sidings
   *   dx === -dy     straight right         short connectors
   *
   * So: one main line along y = 4 carrying the document from EA-S3 to
   * surveil.av5, every stop two cells apart to give the labels room. Everything
   * a document can branch to hangs off that line on one of the other three axes,
   * with the control plane (config, audit) above it and storage, sidings and
   * dead ends below. Nothing sits at a position that puts it under a rail it is
   * not connected to.
   *
   * kind: station (a K8s service) | yard (Elasticsearch) | depot (S3 / Mongo)
   *     | siding (a dead-end topic — a DLT, where a document stops for good)
   *     | terminus (the surveillance line ends, but a record carries on)
   *     | external (outside the estate)
   */
  var STOPS = [
    /*
     * The Archive, at (0,7): EA-S3 sits two cells to the left (dx = −2, dy = 0),
     * on the same-y axis (up-left on screen). The conveyor between them runs
     * squarely out of the Archive's left wall and into EA-S3's +x annex.
     *
     * That single-axis constraint is the whole point, and it is easy to get
     * wrong. A building's walls lie along the grid axes, so a wall's normal is
     * a pure +x or +y. A belt offset diagonally — two cells on BOTH axes —
     * leaves through the corner of the building at 45 degrees to either wall,
     * which is exactly what looked awkward before. Only a pure-axis run comes
     * squarely out of a wall.
     *
     * PROVENANCE, stated plainly because this is the one edge on the map that
     * does not come from knowledge/:
     *
     *   The corpus does document an Archive, but only as Archive Elasticsearch
     *   — Manual Run's remediation flow searches it through ArchiveSearchClient
     *   and indexes into it via ea-indexing-gateway's /v1/index/sup-archive.
     *   It does NOT document any Archive -> EA-S3 relationship, and the string
     *   "EA-S3" does not appear anywhere in the documents at all; that name
     *   reached this map from the architecture image.
     *
     *   The architecture image does place an Archive box far left of the main
     *   pipeline row, which is where data/layout.js has it and is consistent
     *   with this. The hop itself is asserted by the repo owner, and is sourced
     *   to them below rather than to a file that does not say it. If a document
     *   turns up that describes this hand-off, replace the src with it.
     */
    { id: 'archive',    name: 'Archive',             kind: 'archive', tech: 'external',      grid: { x: 0, y: 7 },
      role: 'External system of record' },

    /*
     * The line out of the Archive, and Gateway on it.
     *
     * Gateway is no longer a station on the y = 4 row. It IS this archway: one
     * service, one representation, with the old building deleted rather than
     * left standing beside its replacement.
     *
     * That has a visible cost until the rest of the pipeline follows. EA-S3 and
     * Queue Qualifier still sit on the y = 4 line, so their rails now meet
     * Gateway off-axis and the main line has a kink in it. That is a deliberate
     * intermediate state, agreed with the repo owner: the alternative was to
     * keep two Gateways on the map, and a duplicate is worse than a bend.
     *
     * The track runs along x = 1.55, which is Sprites.ARCHIVE_TRACK — parallel
     * to the Archive's own platform and just beyond it. A platform belongs
     * BESIDE a track, never across the end of one, so the arrangement across
     * the x axis is building at 0, platform at 1.02, rail at 1.55, all of it
     * running the same way as the trains.
     *
     * The Archive has no halt of its own any more. Its loading yard is the
     * platform, the building is the structure, and neither needs a name of its
     * own on the map.
     *
     * These are scenery, not estate facts: no scenario walks them, and nothing
     * in knowledge/ describes a railway out of the Archive. Marked `scene` so
     * the tooling can tell them apart from the modelled estate.
     */
    { id: 'gateway',      name: 'Gateway', kind: 'archway', tech: 'k8s',
      grid: { x: 1.55, y: 10.4 } },

    /*
     * Logistics spawn: the point on the archive track where the scenery flatbed
     * appears each cycle. At x = ARCHIVE_TRACK = 1.55, above the Archive, so
     * the approach runs as one clean vertical — same x, increasing y. Not an
     * estate fact; not in knowledge/. It is the railway's own traffic.
     */
    { id: 'logistics-origin', kind: 'edge', grid: { x: 1.55, y: 1.5 } },

    /*
     * ---------------------------------------------------------------------
     * THE NEW LINE: y = NEW_LINE, running +x, which is down-right on screen.
     * ---------------------------------------------------------------------
     *
     * This is the line the pipeline is being rebuilt onto, one service at a
     * time, as each gets a building worth standing beside. Queue Qualifier,
     * Surveillance Filter and Policy Evaluator are on it. Indexer and
     * surveil.av5 are still back on the old y = 4 row and have not moved yet.
     *
     * Three rules hold for every stop on this line, and breaking any one of
     * them is what made the old row unreadable:
     *
     *   1. Same y. The projection turns constant-y, increasing-x into a clean
     *      straight run down-right, and the arch's exit curve already arrives
     *      on that bearing, so the whole line is one unbroken track.
     *   2. `aside` pinned to -y, never computed. Every one of these stations
     *      still has long rails to services on the old rows, and the automatic
     *      rule in render.js keys on a stop's DOMINANT rail axis — those long
     *      northbound rails outvote the short line the station actually stands
     *      beside, and it swings the building off to the -x side, out of step
     *      with its own row. -y is also toward smaller gx + gy, so the building
     *      sorts BEHIND the track: rails and trains stay in the foreground,
     *      unobstructed, which is the whole point of stepping aside.
     *   3. STEP apart, not one cell. These are large industrial works with
     *      nameboards over them, not the small huts the old row carried. At
     *      3.5 the buildings clear each other with room to read, and the line
     *      still reads as one compact stretch rather than a thin scatter.
     */
    { id: 'qualifier',  name: 'Queue Qualifier',     kind: 'sorting',   tech: 'k8s',
      grid: { x: 6.5,  y: 13.8 }, aside: { x: 0, y: -0.72 } },
    { id: 'filter',     name: 'Surveillance Filter', kind: 'filtering', tech: 'k8s',
      grid: { x: 10,   y: 13.8 }, aside: { x: 0, y: -0.72 } },
    { id: 'evaluator',  name: 'Policy Evaluator',    kind: 'scanning',  tech: 'k8s',
      grid: { x: 13.5, y: 13.8 }, aside: { x: 0, y: -0.72 } },

    /*
     * ---------------------------------------------------------------------
     * THE BEND, AND THE SECOND LEG: x = 17.5, running -y, up-right on screen.
     * ---------------------------------------------------------------------
     *
     * The line does not run off the bottom-right corner for ever. After the
     * evaluator it turns through 90 degrees and climbs back up the screen, so
     * the estate reads as a circuit rather than a diagonal stripe — which is
     * also what puts the far end of the pipeline back beside its beginning.
     *
     * The turn is one quadratic whose control point sits where the two tangent
     * lines meet, at (17.5, 13.8): the corner of the L. That makes the rail
     * leave the evaluator dead along y = 13.8 and arrive travelling dead along
     * x = 17.5, with no kink at either end. The curvature is all in the middle
     * — by three quarters of the way round it is within 0.25 of the x = 17.5
     * line — so the bend visibly COMPLETES and there is a straight run before
     * the first station on the new leg, which is what the brief asks for.
     *
     * `aside` flips to -x on this leg, and for exactly the same reason it was
     * -y on the first: -x is toward smaller gx + gy when the track runs along
     * y, so the building sorts behind its own rails. Everything about the
     * arrangement rotates with the track, including the platform and the
     * building footprint — see the `axis` field, which sprites.js reads.
     */
    { id: 'quota',      name: 'Quota Manager',       kind: 'metering',  tech: 'k8s',
      grid: { x: 17.5, y: 9.2 }, aside: { x: -0.72, y: 0 }, axis: 'y' },

    /*
     * Alerting is not a station on this line — it is the railway yard the line
     * runs INTO. No platform, no stepping aside, no halt: the track goes
     * straight through the front bay doors and the cart is swallowed by the
     * building, which is why its apron is zero and its aside is left alone.
     */
    { id: 'alerting',   name: 'Alerting',            kind: 'railyard',  tech: 'k8s',
      grid: { x: 17.5, y: 5.2 }, axis: 'y' },

    /*
     * The yard throat. Three roads leave the back of the shed on the same
     * bearing the line came in on, run straight for a length, and then the two
     * outer ones swing away and straighten again to reach their own terminal.
     *
     * These are `edge` stops: no building, no board, nothing drawn. They exist
     * because a rail's ends are stops, and an S-bend that leaves and arrives on
     * the SAME bearing cannot be one quadratic — it takes two, meeting where
     * the curve is momentarily square to the line. Hence the middle node on
     * each side, and hence the tangents matching across it exactly.
     */
    { id: 'yard-l0', kind: 'edge', grid: { x: 16.60, y: 4.10 } },
    { id: 'yard-l1', kind: 'edge', grid: { x: 16.60, y: 2.80 } },
    { id: 'yard-l2', kind: 'edge', grid: { x: 15.775, y: 2.00 } },
    { id: 'yard-l3', kind: 'edge', grid: { x: 14.95, y: 1.20 } },
    { id: 'yard-r0', kind: 'edge', grid: { x: 18.40, y: 4.10 } },
    { id: 'yard-r1', kind: 'edge', grid: { x: 18.40, y: 2.80 } },
    { id: 'yard-r2', kind: 'edge', grid: { x: 19.225, y: 2.00 } },
    { id: 'yard-r3', kind: 'edge', grid: { x: 20.05, y: 1.20 } },

    /*
     * The three terminal yards at the head of the three roads. Each one takes
     * its road in through its own front bay, so a cart that reaches the end of
     * the map goes inside a building rather than stopping dead on open track.
     * `kit` picks the roof machinery; sprites.js does not know what an Echo
     * Engine is, only that this one wears the acoustic kit.
     */
    { id: 'review-service', name: 'Review Service', kind: 'terminal', tech: 'k8s',
      grid: { x: 14.95, y: -0.4 }, axis: 'y', kit: 'inspect' },
    { id: 'echo-engine',    name: 'Echo Engine',    kind: 'terminal', tech: 'k8s',
      grid: { x: 17.50, y: -0.4 }, axis: 'y', kit: 'acoustic' },
    { id: 'reporting',      name: 'Reporting',      kind: 'terminal', tech: 'k8s',
      grid: { x: 20.05, y: -0.4 }, axis: 'y', kit: 'ticker' },

    /*
     * Cognition, off the running lines entirely.
     *
     * It sits up-right of the evaluator, in the open ground the bend encloses,
     * and that position is chosen for one property above all others: every
     * point of it is at a LOWER gx + gy than any rail near it, so it is painted
     * before them and physically cannot obscure a track, a platform or a cart.
     * Anywhere on the far side of the running lines would have put a building
     * in front of the railway, which is the one thing the brief rules out.
     *
     * It is also the only bearing on which the carousel to the evaluator
     * crosses no track at all: due -y from the evaluator, parallel to the
     * second leg and well inside it.
     */
    { id: 'cognition',  name: 'Cognition',           kind: 'cognition', tech: 'k8s',
      grid: { x: 13.5, y: 10.2 } },

    { id: 'ea-s3',      name: 'EA-S3',               kind: 'depot',   tech: 'S3',
      orientation: '+x', grid: { x: -2, y: 7 } },

    /*
     * EC-S3 (S3 bucket). Relocated four tiles top-left of the Gateway along the
     * same-y axis (dx = −4, dy = 0), which is up-left on screen. The belt from
     * Gateway arrives from the +x direction, so the building is oriented to open
     * its annex toward Gateway (orientation: '+x'). The belt runs along gy = 10.4
     * — the same y as the Gateway arch — giving a clean horizontal isometric run
     * with no kink at either end.
     */
    { id: 'ec-s3',      name: 'EC-S3',               kind: 'depot',   tech: 'S3',
      orientation: '+x', grid: { x: -2.45, y: 10.4 } },


    /*
     * The y = 2 row is what is left of the old jumbled configuration once
     * Quota Manager, Alerting and Echo Engine moved onto the second leg. They
     * were MOVED, not copied — there is deliberately no building of any of them
     * left standing here, because a stale duplicate of a service is worse than
     * a gap on a map whose whole job is to be believed.
     */

    /*
     * ---------------------------------------------------------------------------
     * New infrastructure: Config Curator, Centralized Audit, Indexer, the two
     * ES silos, and UI Portal.
     *
     * None of these stand on the railway. They connect via conveyor belts,
     * carousel and road links. Grid positions are chosen so every connection
     * runs along one of the four clean isometric axes, and no footprint lands
     * under a track it has nothing to do with.
     * ---------------------------------------------------------------------------
     */

    /*
     * Config Curator (k8s). Moved to {x:11, y:0} — one tile bottom-right (dx = +1,
     * constant y) of its previous position at {x:10, y:0}. Keeps it off the same
     * column as the Indexer and gives the control-plane area more breathing room.
     * Sourced to knowledge/.
     */
    { id: 'config-curator', name: 'Config Curator',    kind: 'config-engine', tech: 'k8s',
      grid: { x: 11, y: 0 } },

    /*
     * Centralized Audit (MongoDB). One row below Config Curator, three cells
     * east, in open ground above the Indexer and below the control plane. That
     * position gives it clear sight-lines to every pipeline station and to the
     * Indexer. Sourced to knowledge/.
     */
    /*
     * Repositioned two tiles bottom-right of UI Portal ({x:6,y:7} → {x:8,y:9})
     * to shorten all seven transmission wire paths and reduce rendering overhead.
     */
    { id: 'audit',          name: 'Centralized Audit', kind: 'audit-vault',   tech: 'MongoDB',
      grid: { x: 8, y: 9 } },

    /*
     * Indexer (k8s). Moved 4 tiles top-right (constant x, dy = −4) from {x:7,
     * y:4} to {x:7, y:0}. The two ES silos maintain the same relative offsets —
     * the belt vectors are unchanged:
     *
     *   Surveilled Index: delta (0, −3) — same-x axis, straight up-right.
     *   Review Index:     delta (−3, 0) — same-y axis, straight up-left.
     *
     * Sourced to knowledge/.
     */
    { id: 'indexer',        name: 'Indexer',           kind: 'data-indexer',  tech: 'k8s',
      orientation: '90', grid: { x: 7, y: 0 } },

    /*
     * Surveilled Index (ES). Belt exit: dx = 0, dy = −3 from Indexer — same-x
     * axis, straight up-right on screen. Length = 3. Moved with Indexer: was
     * {x:7, y:1}, now {x:7, y:−3}. Fast and densely packed.
     */
    { id: 'surveil',        name: 'Surveilled Index',  kind: 'es-silo',       tech: 'ES',
      grid: { x: 7, y: -3 } },

    /*
     * Review Index (ES). Belt exit: dx = −3, dy = 0 from Indexer — same-y axis,
     * straight up-left on screen. Length = 3. Moved with Indexer: was {x:4, y:4},
     * now {x:4, y:0}. Slow and sparsely packed.
     */
    { id: 'review',         name: 'Review Index',      kind: 'es-silo',       tech: 'ES',
      grid: { x: 4, y: 0 } },

    /*
     * UI Portal (k8s). Swapped with Indexer: now at {x:10, y:4} on the same y = 4
     * structural axis. Three tiles to the right of the Indexer, increasing x at
     * constant y appears down-right on screen. gx + gy = 14. Sourced to knowledge/.
     */
    { id: 'ui-portal',      name: 'UI Portal',         kind: 'ui-portal',     tech: 'k8s',
      grid: { x: 10, y: 4 } },
  ];

  // transport: kafka (a track) | cdc (outbox -> Debezium -> a track) | s3 (an IO spur)
  //          | retry (a loop siding back into the same station) | dlt (a dead end)
  var TRACKS = [
    /*
     * Archive -> EA-S3. A conveyor, not a rail and not a road: no Kafka topic
     * carries it, and it never stops. Boxes are stamped with metadata in the
     * Archive's processing bay and ride the belt straight into the bucket in a
     * continuous stream — which is a truer picture of a bulk feed than a cart
     * shuttling one crate at a time ever was.
     *
     * Sourced to the repo owner. See the note on the archive stop above.
     */
    { from: 'archive',   to: 'ea-s3',     transport: 'belt',
      topic: 'archived documents -> EA S3 bucket',
      src: 'repo owner (not in knowledge/)' },

    /*
     * Gateway → EC-S3. A mechanical conveyor belt, not a road. The belt runs
     * along the gy = 10.4 axis (same y as both structures, decreasing x = up-left
     * on screen). It is normally slow-moving infra; during the Gateway cargo
     * lifecycle the engine emits six distinct coloured parcels on top of it.
     * Sourced to knowledge/ (Gateway uploads miniIndexable.json to EC-S3).
     */
    { from: 'gateway',   to: 'ec-s3',     transport: 'belt',
      topic: 'miniIndexable.json upload',
      beltSpeed: 0.4, beltDensity: 0.6 },
    { from: 'gateway',   to: 'qualifier', transport: 'cdc',
      ctrl: { x: 1.55, y: 13.8 },
      topic: 'ec.surveillance-gateway.outbox.{tenant}.ingestedCommunication' },
    /*
     * The new line itself, and it is now two plain straight rails.
     *
     * The curve these replaced was scaffolding: while Surveillance Filter was
     * still up on the old y = 4 row, the rail out of Queue Qualifier had to
     * leave along the platform and then swing hard north, and the control point
     * existed purely to stop it reversing out of the station. With all three
     * stops on the same y there is nothing left to steer around — same y,
     * increasing x, which the projection draws as one clean run down-right.
     */
    { from: 'qualifier', to: 'filter',    transport: 'kafka',
      topic: 'ec.surveillance-qualifier.{tenant}.qualifications' },
    { from: 'filter',    to: 'evaluator', transport: 'kafka',
      topic: 'ec.surveillance-filter.{tenant}.evaluations' },
    /*
     * The 90-degree bend. Control point at the corner of the L, so the rail
     * leaves the evaluator along the first leg and arrives at Quota Manager
     * along the second with no kink at either end. See the note on the quota
     * stop for why the curvature sits where it does.
     */
    { from: 'evaluator', to: 'quota',     transport: 'kafka',
      ctrl: { x: 17.5, y: 13.8 },
      topic: 'ec.surveillance-policy-evaluator.{tenant}.surveilled' },
    /*
     * Retry and DLT, on Queue Qualifier's ingestion path. `from` and `to` are
     * the same stop on purpose — a retry is a loop siding: the message goes
     * back to the same consumer on the next -retry-N topic.
     *
     * The topic names really are written `{topic}-retry-0` in the source. The
     * ingestion topic is injected per tenant at consumer bean creation and is
     * not a static template in application.yaml, so the documents can only name
     * the suffix. That is a real gap in the estate's own record, not a gap here.
     */

    /*
     * The rest of the estate's edges. Every one of these was read from both
     * ends — the publisher's Events Published table and the consumer's Events
     * Consumed table — except the two marked `unverified`, which is explained
     * where they appear below.
     *
     * Where an edge is `cdc`, the publisher's table correctly does NOT list the
     * topic, because the service writes an outbox row and Debezium publishes
     * it. That absence is the pattern, not a gap.
     */
    { from: 'quota',          to: 'alerting',       transport: 'cdc',
      topic: 'ec.surveillance-quota-manager.{tenant}.surveilled-communication-outbox' },
    { from: 'alerting',       to: 'echo-engine',    transport: 'kafka',
      topic: 'ec.alerting-service.{tenant}.alertedCommunication' },
    { from: 'echo-engine',    to: 'alerting',       transport: 'kafka',
      topic: 'ec.echo-engine.{tenant}.echoAction' },

    /*
     * Policy Evaluator <-> Cognition, as a cargo carousel rather than a rail.
     *
     * DEVIATION, FLAGGED RATHER THAN HIDDEN. This map's one structural rule is
     * "Kafka moves between services, so Kafka is RAIL", and this hop is a real
     * Kafka topic — it should be a railway by that rule. It is drawn as a
     * carousel at the repo owner's explicit request: a dedicated two-way
     * conveyor between exactly these two buildings, which is a fair picture of
     * a per-tenant point-to-point link and is a deliberate exception, not an
     * oversight. The topic below is unchanged and still the documented one.
     */
    { from: 'evaluator',      to: 'cognition',      transport: 'carousel',
      topic: 'cognition.config.{tenant}.kafkaTopic (per-tenant)' },

    { from: 'quota',          to: 'reporting', layer: 'audit',      transport: 'cdc',
      topic: 'ec.surveillance-quota-manager.{tenant}.quota-windows' },

    /*
     * ------------------------------------------------------------------------
     * The yard throat: TRACKWORK, not topics.
     * ------------------------------------------------------------------------
     *
     * Three roads leave the back of the Alerting shed. The centre one is the
     * real thing — it carries ec.alerting-service.{tenant}.alertedCommunication
     * to Echo Engine, read from both ends, and it is listed with the other
     * modelled edges above. The two outer ones are marked `scene` because that
     * is all they are: physical yard roads to the Review Service and Reporting
     * terminals.
     *
     * NOTHING IN knowledge/ SAYS ALERTING FEEDS EITHER OF THOSE. Reporting is
     * fed by Centralized Audit and Quota Manager, and Review Service by Config
     * Curator; those edges are drawn where they always were, as faint service
     * lines from the services that really publish to them. Drawing these two
     * roads as ordinary rails would have quietly asserted two hops the corpus
     * does not contain, so they are trackwork and say so — the same treatment
     * the line out of the Archive gets, and for the same reason.
     *
     * The S on each side is two quadratics meeting at yard-l2 / yard-r2, where
     * the road is momentarily square to the line. The control points are the
     * tangent intersections: (x of the straight, y of the meeting point) on the
     * way out, (x of the final straight, y of the meeting point) on the way
     * back in. That is what makes the pair join without a visible corner and
     * leaves both ends exactly parallel to the centre road.
     */
    /*
     * The archive approach track: the scenery run from the flatbed's spawn
     * point, above the Archive, down to the Gateway arch. Without this entry
     * the renderer draws no rail for that leg and the logistics flatbed appears
     * to float on open ground before Gateway. Not an estate fact.
     */
    { from: 'logistics-origin', to: 'gateway', transport: 'rail', scene: true },

    { from: 'alerting', to: 'yard-l0', transport: 'rail', scene: true },
    { from: 'yard-l0',  to: 'yard-l1', transport: 'rail', scene: true },
    { from: 'yard-l1',  to: 'yard-l2', transport: 'rail', scene: true, ctrl: { x: 16.60, y: 2.00 } },
    { from: 'yard-l2',  to: 'yard-l3', transport: 'rail', scene: true, ctrl: { x: 14.95, y: 2.00 } },
    { from: 'yard-l3',  to: 'review-service', transport: 'rail', scene: true },

    { from: 'alerting', to: 'yard-r0', transport: 'rail', scene: true },
    { from: 'yard-r0',  to: 'yard-r1', transport: 'rail', scene: true },
    { from: 'yard-r1',  to: 'yard-r2', transport: 'rail', scene: true, ctrl: { x: 18.40, y: 2.00 } },
    { from: 'yard-r2',  to: 'yard-r3', transport: 'rail', scene: true, ctrl: { x: 20.05, y: 2.00 } },
    { from: 'yard-r3',  to: 'reporting', transport: 'rail', scene: true },

    /*
     * Indexer → Surveilled Index and Indexer → Review Index.
     *
     * Two distinct, non-overlapping belts of equal length (√10 ≈ 3.16 grid
     * units) that fan gently left and right from the same forward-facing side of
     * the Indexer building. Both run up-right on screen in the same general
     * direction as the Alerting → Echo Engine leg. Different speeds and densities
     * make the two streams visually distinguishable: surveil is fast and dense,
     * review is slow and sparse. Sourced to the estate documents; the Indexer
     * feeds both ES stores.
     */
    { from: 'indexer', to: 'surveil', transport: 'belt',
      topic: 'index -> Surveilled Index (ES)',
      beltSpeed: 1.9, beltDensity: 2.4 },   // fast, densely packed
    { from: 'indexer', to: 'review',  transport: 'belt',
      topic: 'index -> Review Index (ES)',
      beltSpeed: 0.55, beltDensity: 0.55 }  // slow, sparsely packed
  ];

  /*
   * Stop-level panel content, keyed by stop id.
   *
   * Two layers: a business layer (always visible) and a technical layer (revealed
   * on request). Each entry is independently readable — failure paths are stated
   * wherever they apply, even where the wording overlaps across stops.
   *
   * Function names, class names, and source-file references are confined to the
   * technical layer (note / src). Nothing in the business layer is invented;
   * all content traces to knowledge/Conduct Services/<name>/*_stop_info.md.
   */
  var STOP_INFO = {

    'ea-s3': {
      business: 'A communication has arrived and is staged for compliance ' +
                'surveillance. The document sits in secure storage — nothing has ' +
                'been evaluated yet.',
      events: [
        'Communication received and stored in EA S3',
        'A bulk-index event is published to signal the pipeline to begin processing'
      ],
      note: 'A large indexable.json sits in the EA S3 bucket. A BulkIndexEvent ' +
            'pointing at it is published to supBulkIndexingTopic_k8s.',
      src: 'Gateway/ec-gateway_stop_info.md · Input'
    },

    'gateway': {
      business: 'The communication enters the compliance pipeline. It is compressed ' +
                'to reduce processing cost, then registered under a reconciliation ' +
                'window that guarantees it will be processed even if a downstream ' +
                'service is temporarily unavailable.',
      events: [
        'Document downloaded from S3 and compressed to a smaller format',
        'Assigned to a reconciliation window for end-to-end tracking',
        'Queued via a durable outbox — delivery guaranteed even across service restarts'
      ],
      failurePath: 'If processing fails, the message retries twice before landing on ' +
                   'a dead-letter topic. The communication is retained but requires ' +
                   'operational intervention to re-process.',
      note: 'BulkIndexingEventConsumer fetches indexable.json from S3, minifies and ' +
            're-uploads it as miniIndexable.json, then inserts an ' +
            'IngestedCommunicationOutboxEntity scoped to a reconciliation window. ' +
            'Debezium publishes the outbox row — Gateway never emits the event directly.',
      src: 'Gateway/ec-gateway_stop_info.md · Transformation'
    },

    'qualifier': {
      business: 'The communication is matched against active surveillance pipelines ' +
                'to determine whether any monitored population is involved. Documents ' +
                'with no pipeline match exit here permanently to an audit record — ' +
                'they will never reach a compliance reviewer.',
      events: [
        'Participants extracted from the communication document',
        'Matched against all active pipeline surveilled populations',
        'One or more matches: routed to compliance processing',
        'Zero matches: published to centralized audit and processing ends'
      ],
      terminalEvent: 'Communications with no pipeline match are published to the ' +
                     'centralized audit topic — a permanent record that the communication ' +
                     'was seen and cleared, without compliance review.',
      failurePath: 'If the document cannot be fetched or participants cannot be extracted, ' +
                   'the message retries twice before landing on a dead-letter topic. ' +
                   'Manual re-processing is required.',
      note: 'IngestedCommunicationConsumer fetches the communication document from S3, ' +
            'extracts participants, and matches them against the tenant\'s ' +
            'surveilled-population collections. One or more pipeline matches routes to ' +
            'qualifications; zero matches routes straight to centralized audit.',
      src: 'Queue Qualifier/ec-queue-qualifier_stop_info.md · Processing'
    },

    'filter': {
      business: 'The communication is tested against two layers of surveillance ' +
                'policy: rules that explicitly exclude it from review, then rules that ' +
                'flag it for compliance attention. Most qualified communications ' +
                'clear both layers.',
      events: [
        'Ignore rules evaluated — matched communications are sent to audit and exit here',
        'Flag policies evaluated against remaining communications',
        'QUALIFIED communications proceed to policy evaluation',
        'NOT_QUALIFIED communications are published to the not-qualified topic'
      ],
      terminalEvent: 'NOT_QUALIFIED communications are published to the not-qualified ' +
                     'topic. A corresponding audit event is also published to the ' +
                     'centralized audit record — the document was seen and assessed, ' +
                     'without reaching a compliance reviewer.',
      failurePath: 'Recoverable errors trigger up to two retries. After exhaustion the ' +
                   'message is routed to a dead-letter topic and will not be re-evaluated ' +
                   'automatically.',
      note: 'Two-phase evaluation against locally cached Config Curator data. The Ignore ' +
            'phase discards matched communications to audit; the Filter phase then tests ' +
            'the rest against flag policies. QUALIFIED proceeds; NOT_QUALIFIED exits ' +
            'here to the not-qualified topic.',
      src: 'Surveillance Filter/ec-surveillance-filter_stop_info.md · Decisions'
    },

    'evaluator': {
      business: 'The communication is assessed for compliance violation. Simple rule ' +
                'matches are resolved immediately; those requiring content analysis are ' +
                'forwarded to the Cognition AI platform. The outcome determines whether ' +
                'a compliance alert will be generated.',
      events: [
        'Policy type classified: metadata-only or content-analysis',
        'Metadata-only matches published immediately to the surveilled topic',
        'Content-analysis matches forwarded to Cognition AI for evaluation',
        'Cognition result received and routed: PASS proceeds, FAIL/TIMEOUT/FILTER go to audit'
      ],
      terminalEvent: 'FAIL, TIMEOUT, and FILTER outcomes are published to the centralized ' +
                     'audit topic. These communications are recorded but do not proceed ' +
                     'to alerting and will not appear in any review queue.',
      failurePath: 'Each consumer retries up to three times. After exhaustion the message ' +
                   'lands on a dead-letter topic. Certain non-retryable errors bypass ' +
                   'the retry ladder entirely.',
      note: 'Metadata-only policies pass through directly to the surveilled topic. ' +
            'Content-analysis policies are forwarded to the Cognition AI platform; COMS ' +
            'results route PASS to surveilled or FAIL/TIMEOUT/FILTER to centralized audit.',
      src: 'Policy Evaluator/ec-surveillance-policy-evaluator_stop_info.md · Processing'
    },

    'quota': {
      business: 'The communication is counted against the tenant\'s surveillance quota ' +
                'and evaluated for sampling. This determines the volume of communications ' +
                'that proceed to active alerting versus those retained for reporting only.',
      events: [
        'Quota recorded against the current reconciliation window',
        'Sampling evaluated per pipeline using probabilistic counters',
        'Metadata event published to downstream reporting systems',
        'Outbox written for reliable delivery to Alerting'
      ],
      failurePath: 'After two retries the message is routed to a dead-letter topic. ' +
                   'The quota for the affected communications may be underreported ' +
                   'until the message is re-processed.',
      note: 'SurveilledCommunicationConsumer stores quota data, fetches participants ' +
            'from S3, and evaluates probabilistic sampling per pipeline using Redis ' +
            'bucket counters. A surveilled-communication-outbox row is written; ' +
            'Debezium routes it to Alerting.',
      src: 'Quota Manager/ec-surveillance-quota-manager_stop_info.md · Processing'
    },

    'alerting': {
      business: 'The communication becomes a live alert in the compliance review ' +
                'queue. This is the end of the automated surveillance journey — ' +
                'from here, a compliance officer takes action.',
      events: [
        'Communication enriched with organisation metadata from S3 and microservices',
        'Retention policy applied and mapped in shadow collections',
        'Alert generated and written to the review system',
        'AlertedCommunicationEvent published to the Indexer and Echo Engine'
      ],
      terminalEvent: 'AlertedCommunicationEvent is published — the compliance alert is ' +
                     'live in the review queue and downstream indexing and echo ' +
                     'processing begin.',
      failurePath: 'Recoverable errors retry with exponential backoff. After exhaustion ' +
                   'the message lands on a dead-letter topic — the alert will not appear ' +
                   'in the review queue until re-processed.',
      note: 'SurveilledCommunicationConsumer enriches the communication with org metadata ' +
            'via S3 and microservice calls, applies retention policies through windowed ' +
            'shadow collections, and generates an alert. AlertedCommunicationEvent is ' +
            'published to the Indexer and Echo Engine.',
      src: 'Alerting/ec-alerting-service_stop_info.md · Processing'
    },

    'echo-engine': {
      business: 'Reduces alert fatigue by detecting "echo" alerts — redundant alerts ' +
                'triggered by the same underlying content across multiple policies or ' +
                'channels — and emitting automated close or update actions back to the ' +
                'Alerting service.',
      events: [
        'Consumes alert CDC events from the Alerting service',
        'Computes a deterministic policy-hits hash per alert',
        'Correlates against a per-tenant MongoDB state store to classify the alert',
        'Publishes an EchoActionEvent with the classification result'
      ],
      terminalEvent: 'EchoActionEvent published to ec.echo-engine.{tenant}.echoAction — ' +
                     'classified as ECHO_ORIGINAL (first occurrence), ECHO_DETECTED, or ' +
                     'ECHO_DUPLICATE. Non-CREATE and non-policy alerts are silently skipped.',
      failurePath: 'Standard consumer retry then dead-letter topic per application config. ' +
                   'Validation failures (non-CREATE / non-policy alerts) short-circuit as ' +
                   'a business exclusion — they do not retry.',
      note: 'AlertProcessingService validates → PolicyHitsHashGeneratorService hashes → ' +
            'EchoStateStoreService reads/writes the alcatraz MongoDB state store → ' +
            'EchoCorrelationService classifies → EchoActionAuditAdapter records. ' +
            'Local policy and echo config kept in sync via PolicyConfigConsumer / ' +
            'EchoConfigConsumer CDC.',
      src: 'Echo Engine/ec-echo-engine_stop_info.md · Processing'
    },

    'audit': {
      business: 'Central sink and reconciliation engine for the entire surveillance pipeline. ' +
                'Persists a complete, immutable audit trail of every document\'s journey ' +
                'across all processing stages, and periodically reconciles ingested vs. ' +
                'processed message counts to detect gaps.',
      events: [
        'Nine Kafka consumers ingest audit, communication, config, quota, pipeline, DLT, and legacy events',
        'Audit events written to ec-audit-events; pipeline summaries bulk-upserted',
        'Reconciliation schedulers compare audit counts against the Gateway watermark every 15 minutes',
        'On reconciliation, source-reconciled and policy-evaluation-reconciled events published downstream via Debezium outbox'
      ],
      failurePath: 'Communication events retry via a custom 2-level retry ladder then ' +
                   'ec.centralized.{tenant}.audit-events-dlt. CDC consumers use Spring ' +
                   '@RetryableTopic (backoff 1 s, ×2) then -centralised-audit-dlt. ' +
                   'Gateway HTTP client retries twice at 1 s backoff; non-retriable failures rethrow.',
      note: 'Ten per-tenant MongoDB collections in alcatraz. Two ShedLock cron schedulers ' +
            '(reconShedLock, sourceWindowReconShedLock, default every 15 min). ' +
            'Cognition reconciliation is triggered by Debezium CDC delete events on the ' +
            'cognition-reconciliation collection. Bootstrap endpoint is idempotent.',
      src: 'Centralized Audit/ec-centralised-audit_stop_info.md · Detailed narrative'
    },

    'config-curator': {
      business: 'Control-plane orchestrator that curates and distributes surveillance ' +
                'configuration — pipelines, policies, sampling — across all tenant data-plane ' +
                'services. Gates config delivery behind per-tenant freeze windows and rotates ' +
                'quota windows on a schedule.',
      events: [
        'Receives legacy config JSON and Debezium CDC events; evaluates the tenant freeze status',
        'Routes config to Kafka curator topics (unfrozen) or stages to MongoDB (frozen)',
        'On freeze-end, replays all staged messages in paginated, transactional batches',
        'On schedule, rotates the quota window and POSTs bootstrap config to 8–9 downstream services'
      ],
      failurePath: 'Legacy consumer failure → exponential backoff retry → DLT. ' +
                   'Unmappable topics raise NonRetryableConfigException → straight to DLT. ' +
                   'Bootstrap step failure → full transaction rollback and failure outbox event; ' +
                   'the job is not rescheduled. Missing quota window → RuntimeException (retried).',
      note: 'Four runtime paths: legacy config sync, freeze-window replay, scheduled ' +
            'bootstrap/window rotation, tenant CDC sync/onboarding. Payload body is never ' +
            'modified — only topic routing and headers (tenantName, nextWindowToken) change. ' +
            'ShedLock guards the freeze (default every 15 min). New tenant onboarding ' +
            'initialises a Day-0 quota window and two cron jobs.',
      src: 'Config Curator/ec-config-curator stop info.md · Detailed narrative'
    },

    'indexer': {
      business: 'Indexes communication documents into Elasticsearch to power Review and ' +
                'Surveillance workflows. Downloads content from S3, resolves the target index, ' +
                'and writes the parent document — with audio enrichment where applicable.',
      events: [
        'Consumes ingested, surveilled, and parent-reindex communication events',
        'Resolves the target index name via the Supervision API if absent from the event header',
        'Downloads indexable content from S3 (parallel, chunked)',
        'Writes the document to surveil.av5 or review.v1 in Elasticsearch',
        'Publishes an audit event on successful ingestion-flow indexing'
      ],
      terminalEvent: 'AuditEvent published to ec.centralized.{tenant}.audit.indexer.event — ' +
                     'confirms the document is now searchable in the surveillance index.',
      failurePath: 'Any consumer failure → retry-0 → retry-1 → -ec-indexer-dlt. ' +
                   'Empty S3 on parent re-index → NonRetryableEventException → straight to DLT. ' +
                   'When S3 is empty on ingested flow, a ConductAction is forwarded to the ' +
                   'Indexing Gateway instead of indexing to ES.',
      note: 'Three flows: ingested (S3 → ES → audit), surveilled/audio (EA Storage + child ' +
            'indexing, re-index parent from S3 if missing), parent re-index (Config Curator ' +
            'for tenant UUID resolution → S3). Tenant-specific per-consumer beans via ' +
            'MultiTenancyConfig. S3 download uses a virtual-thread executor.',
      src: 'Indexer/ec-indexer_stop_info.md · Detailed narrative'
    },

    'review-service': {
      business: 'Authoritative source for reviewer configuration in the supervision workflow: ' +
                'reviewer groups, pipeline reviewer assignments, and per-pipeline review ' +
                'entitlements. Keeps reviewer state in sync with surveillance pipeline ' +
                'changes published by Config Curator.',
      events: [
        'Consumes ec.config-curator.{tenant}.surveillance-pipelines CDC events to mirror reviewer state',
        'Upserts or deletes supervision-queue reviewer documents in MongoDB',
        'REST endpoints for reviewer-group CRUD, pipeline-reviewer-group assignment, and entitlement import/export',
        'All mutations produce AuditEvent records persisted to app_audit_new'
      ],
      failurePath: 'CDC consumer → Spring @RetryableTopic retry then -review-service-dlt. ' +
                   'Stale CDC events (older updatedTime) routed to DLT without overwriting. ' +
                   'HTTP calls to Config Curator and Queue Qualifier retry on 5xx or connection ' +
                   'error (1 s backoff, ×2); 404 raises NotFoundError.',
      note: 'Three domains: pipeline sync (CDC), reviewer groups & assignments (REST), ' +
            'review entitlements (REST + CSV import up to 500 rows / 5 MB). Entitlement ' +
            'imports validated against Config Curator (window token) and Queue Qualifier ' +
            '(surveilled population). Entitlement replace is delete-then-saveAll in a ' +
            'MongoDB transaction. Partial success returns HTTP 207.',
      src: 'Review Service/ec-review-service_stop_info.md · Detailed narrative'
    },

    'surveil': {
      business: 'Tenant-specific Elasticsearch index that stores surveilled communication ' +
                'documents for the surveillance workflow. The Indexer writes here after a ' +
                'document has passed through the full pipeline — including audio enrichment ' +
                'where applicable.',
      events: [
        'Receives parent documents and audio enrichment child documents from the Indexer',
        'External versioning (ptime) prevents newer documents being overwritten by late arrivals',
        'Managed by an ILM rollover policy (surveil_data_ilm_{tenant}) for ongoing index lifecycle',
        'Routing determined by index name suffix (-surveil.av5) via ElasticsearchClientFactory'
      ],
      note: 'Index name pattern: {tenant}-surveil.av5*. Created only for tenants that are both ' +
            'v3-enabled AND audio-enabled. Join relation: idoc → enrich (parent doc + audio ' +
            'enrichment children). Carries a surveilled boolean field. Lives on a separate ' +
            'Elasticsearch cluster from the review index (surveilClientCache, keyed by config group). ' +
            'Provisioned by create_surveil_es_template.sh; mapping updates via ' +
            'update_surveil_index_mapping.sh. Metric label: es_surveil_indexing_latency.',
      src: 'User-provided: ec-indexer Elasticsearch index knowledge · Surveil Index'
    },

    'review': {
      business: 'Tenant-specific Elasticsearch index that stores communication documents for ' +
                'the compliance review workflow. Carries an embedded review state block — ' +
                'assigned reviewers, tags, comments, and policy actions — and is the primary ' +
                'data source for the supervision review UI.',
      events: [
        'Receives parent documents from the Indexer for all v3-enabled tenants',
        'Join relation supports parent doc (idoc) with review and enrich children',
        'Embedded review object tracks queue info, current/last/past reviewer state, and policy actions',
        'External versioning (ptime) prevents newer documents being overwritten by late arrivals'
      ],
      note: 'Index name pattern: {tenant}-review.av5 (suffix configurable per tenant group). ' +
            'Created for all v3-enabled tenants (audio and non-audio alike). ILM rollover alias ' +
            '{tenant}-review.av5-{date}-000001 via review_data_ilm policy. Separate Elasticsearch ' +
            'cluster from the surveil index (reviewClientCache). Routing decided by index name: ' +
            'contains -review.av5 → review client, otherwise surveil client. Metric label: ' +
            'es_review_indexing_latency. Note: ec-review-service manages MongoDB reviewer ' +
            'assignments — it is entirely separate from this index.',
      src: 'User-provided: ec-indexer Elasticsearch index knowledge · Review Index'
    },

    'reporting': {
      business: 'Aggregates reporting data for the surveillance pipeline — counting alerts ' +
                'and echo cancellations per pipeline, tracking communication-event logs per ' +
                'quota window, and generating DHC pipeline execution reports on reconciliation. ' +
                'Terminating events are forwarded to Conduct Audit.',
      events: [
        'Six consumers across pipeline completion, reconciliation, config/quota CDC, event-log batch, and audit-event-log',
        'PipelineCompletionService counts alerts and echo cancellations from supervised_items',
        'ReconciledEventHandler calls the pipeline-qualifier and generates DHC execution reports',
        'EventLogService persists pipeline events to window-scoped MongoDB collections',
        'Terminating events forwarded to conduct_audit_topic; ingested-comm events published to event-logging publisher'
      ],
      terminalEvent: 'ConductAuditMessage published to conduct_audit_topic — forwarded when ' +
                     'a terminating pipeline event is detected. EventLogMessage published to ' +
                     'eventloggingpublisher_k8s for ingested-communication events.',
      failurePath: 'EventLogConsumer: manual retry-0 → retry-1 → ec.centralized.{tenant}.audit.ec-reporting-dlt. ' +
                   'CDC/reconciliation consumers: Spring @RetryableTopic (auto retry → DLT). ' +
                   'NonRetryableEventException routes straight to DLT.',
      note: 'ShedLock pipelineSummary cron runs every 15 min. Window-scoped MongoDB collections ' +
            '(ec-reporting-pipeline-events_{windowToken}) via CollectionMappingConfig. ' +
            'supervised_items is read-only, owned by another service. Bootstrap endpoint is ' +
            'idempotent — skips if the window collection already exists.',
      src: 'Reporting/ec-reporting_stop_info.md · Detailed narrative'
    }

  };

  /*
   * The walk. `cargo` is what the document IS on arrival at that stop — this is
   * what makes the map teach rather than decorate. `dwell` scales with how much
   * the stop has to explain. `note` and `src` live in STOP_INFO; steps carry
   * only journey-specific fields (timing, transport, document state).
   */
  var HAPPY = {
    id: 'happy',
    name: 'Happy path — bulk indexing',
    steps: [
      { at: 'ea-s3', dwell: 2200,
        title: 'Raw communication lands',
        cargo: { label: 'indexable.json', tint: '#94a3b8', stamps: [] } },

      { at: 'gateway', via: 'supBulkIndexingTopic_k8s', dwell: 4200,
        title: 'Ingested and minified',
        cargo: { label: 'miniIndexable.json', tint: '#38bdf8', stamps: ['minified', 'outboxed'] } },

      { at: 'qualifier', via: 'outbox -> Debezium', dwell: 4200,
        title: 'Qualified against pipelines',
        cargo: { label: 'QualifiedCommunicationDto', tint: '#22d3ee', stamps: ['minified', 'qualified'] } },

      { at: 'filter', via: 'ec.surveillance-qualifier.{tenant}.qualifications', dwell: 4400,
        title: 'Two-phase policy filter',
        cargo: { label: 'PipelineEvaluationEvent', tint: '#34d399', stamps: ['minified', 'qualified', 'filtered'] } },

      { at: 'evaluator', via: 'ec.surveillance-filter.{tenant}.evaluations', dwell: 4600,
        title: 'Metadata pass-through or Cognition',
        cargo: { label: 'CognitionResponseEvent', tint: '#a78bfa',
                 stamps: ['minified', 'qualified', 'filtered', 'surveilled'] } },

      { at: 'quota', via: 'ec.surveillance-policy-evaluator.{tenant}.surveilled', dwell: 3800,
        title: 'Sampled and queued',
        cargo: { label: 'SurveilledEvent', tint: '#818cf8',
                 stamps: ['minified', 'qualified', 'filtered', 'surveilled'] } },

      { at: 'alerting', via: 'ec.surveillance-quota-manager.{tenant}.surveilled-communication-outbox',
        dwell: 4200, title: 'Alert generated', terminal: true,
        cargo: { label: 'AlertedCommunicationEvent', tint: '#fb923c',
                 stamps: ['minified', 'qualified', 'filtered', 'surveilled', 'alerted'] } }
    ]
  };

  /*
   * The retry walk. Same document, same first two hops, then it fails at Queue
   * Qualifier and is carried through the full Spring Kafka retry ladder until
   * the attempts run out and it rolls into the dead letter topic.
   *
   * Why the qualifier: it is the stop whose retry path the documents describe
   * end to end — consumer method by consumer method, publisher class named, and
   * a "Failure paths" section that states the route in one line. Other services
   * retry too, but most of them only show it in a mermaid diagram.
   *
   * Why exhaustion rather than recovery: a document that recovers on retry-0
   * ends up back on the happy path, which is already drawn. The version that
   * runs out of attempts is the one that shows what the ladder is FOR, and it
   * is the only way to put the DLT on screen. Recovery is worth adding later as
   * a branch of this scenario.
   *
   * Three attempts total — the original delivery plus retry-0 plus retry-1 —
   * because Events Consumed lists exactly those two retry topics and describes
   * retry-1 as "Second/final retry; sends to DLT on failure".
   */
  var RETRY = {
    id: 'retry',
    name: 'Retry ladder — exhausted to DLT',
    steps: [
      { at: 'ea-s3', dwell: 2200,
        title: 'Raw communication lands',
        cargo: { label: 'indexable.json', tint: '#94a3b8', stamps: [] },
        note: 'The same start as the happy path. A BulkIndexEvent pointing at a ' +
              'document in the EA S3 bucket is published to supBulkIndexingTopic_k8s.',
        src: 'Gateway/EVENT_FLOW_MAP.md · Events Consumed' },

      { at: 'gateway', via: 'supBulkIndexingTopic_k8s', dwell: 3800,
        title: 'Ingested and minified',
        cargo: { label: 'miniIndexable.json', tint: '#38bdf8', stamps: ['minified', 'outboxed'] },
        note: 'Gateway minifies the document and writes an IngestedCommunicationOutbox ' +
              'row. Debezium publishes it. Nothing has gone wrong yet.',
        src: 'Gateway/ec-gateway_stop_info.md · Transformation' },

      { at: 'qualifier', via: 'outbox -> Debezium', dwell: 5000,
        attempt: { n: 1, of: 3 }, failed: true,
        title: 'First delivery fails',
        cargo: { label: 'unprocessed message', tint: '#f87171', stamps: ['minified'] },
        note: 'IngestedCommunicationConsumer.listen() takes the batch and hits a ' +
              'recoverable processing error — the qualifier has to fetch the ' +
              'communication document from S3 before it can extract participants, and ' +
              'that is the fragile part. The message is not dropped and it is not ' +
              'acknowledged as done: IngestedCommunicationRetryTopicManager republishes ' +
              'it onto the first retry topic.',
        src: 'Queue Qualifier/ec-queue-qualifier_stop_info.md · Failure paths' },

      { at: 'qualifier', via: '{topic}-retry-0', dwell: 4600,
        attempt: { n: 2, of: 3 },  failed: true,
        title: 'Attempt 2 — first retry',
        cargo: { label: 'unprocessed message', tint: '#f87171', stamps: ['minified', 'retried'] },
        note: 'The message comes back to the same consumer class on a different topic ' +
              'and a different method: firstRetry(). This is what the retry ladder ' +
              'actually is — not a loop inside the service, but a round trip through ' +
              'Kafka, which is why a retry survives the pod restarting. It fails again.',
        src: 'Queue Qualifier/EVENT_FLOW_MAP.md · Events Consumed #2' },

      { at: 'qualifier', via: '{topic}-retry-1', dwell: 4800,
        attempt: { n: 3, of: 3 }, failed: true, terminal: true,
        title: 'Ladder exhausted',
        cargo: { label: 'unprocessed message', tint: '#7f1d1d', stamps: ['minified', 'retried', 'retried', 'dead'] },
        note: 'Last chance. secondRetry() is documented as the "second/final retry; ' +
              'sends to DLT on failure" — there is no retry-2. The ladder is out of ' +
              'rungs and the message stops being retried at all.',
        src: 'Queue Qualifier/EVENT_FLOW_MAP.md · Events Consumed #3' }
    ]
  };

  /*
   * The not-qualified walk. The document is ingested and qualified normally,
   * then Surveillance Filter evaluates it and decides it is not flagged for
   * review. That ends its surveillance journey — it never reaches Policy
   * Evaluator, never gets indexed, never appears in either Elasticsearch yard.
   *
   * This is the scenario that stops the map being a story about one lucky
   * document. Most traffic ends here, not in surveil.av5.
   *
   * The part worth watching is that terminal does not mean vanished. The
   * .not-qualified topic has two consumers, and neither of them continues the
   * surveillance: the filter's own AuditEventAdapter re-publishes it to the
   * centralized audit topic, where Centralized Audit writes it to Mongo, and
   * Quota Manager's SurveilledNotQualifiedCommunicationConsumer counts it
   * against the tenant's quota. So the estate keeps a record that this
   * communication was seen and cleared, while nothing evaluates or indexes it.
   */
  var NOT_QUALIFIED = {
    id: 'not-qualified',
    name: 'Terminal state — not qualified',
    steps: [
      { at: 'ea-s3', dwell: 2200,
        title: 'Raw communication lands',
        cargo: { label: 'indexable.json', tint: '#94a3b8', stamps: [] },
        note: 'The same start as every other scenario. A BulkIndexEvent pointing at a ' +
              'document in the EA S3 bucket is published to supBulkIndexingTopic_k8s.',
        src: 'Gateway/EVENT_FLOW_MAP.md · Events Consumed' },

      { at: 'gateway', via: 'supBulkIndexingTopic_k8s', dwell: 3600,
        title: 'Ingested and minified',
        cargo: { label: 'miniIndexable.json', tint: '#38bdf8', stamps: ['minified', 'outboxed'] },
        note: 'Gateway minifies the document, re-uploads it and writes an ' +
              'IngestedCommunicationOutbox row. Debezium publishes it — Gateway never ' +
              'emits the event itself.',
        src: 'Gateway/ec-gateway_stop_info.md · Transformation' },

      { at: 'qualifier', via: 'outbox -> Debezium', dwell: 3800,
        title: 'Qualified against pipelines',
        cargo: { label: 'QualifiedCommunicationDto', tint: '#22d3ee', stamps: ['minified', 'qualified'] },
        note: 'Queue Qualifier matches the communication against the tenant\'s ' +
              'surveillance pipelines and finds at least one, so it travels on. With ' +
              'zero matches it would have been routed straight to audit from here ' +
              'instead — a different terminal state, one stop earlier.',
        src: 'Queue Qualifier/EVENT_FLOW_MAP.md · Events Published #1, #2' },

      { at: 'filter', via: 'ec.surveillance-qualifier.{tenant}.qualifications', dwell: 5400,
        title: 'Evaluated — and not flagged', terminal: true,
        cargo: { label: 'PipelineEvaluationEvent', tint: '#fbbf24',
                 stamps: ['minified', 'qualified', 'evaluated'] },
        note: 'Surveillance Filter runs two phases against locally cached config. The ' +
              'Ignore phase passes — no ignore rule matches, so the document is not ' +
              'discarded. The Filter phase then finds no flag policy that matches ' +
              'either, which is the NOT_QUALIFIED result. The surveillance line ends here.',
        src: 'Surveillance Filter/ec-surveillance-filter_stop_info.md · Decisions' }
    ]
  };

  return { stops: STOPS, tracks: TRACKS, scenarios: [HAPPY, RETRY, NOT_QUALIFIED],
           stopInfo: STOP_INFO };
});
