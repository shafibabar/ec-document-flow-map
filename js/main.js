'use strict';
/*
 * main.js — the routing engine, the controls, and the frame loop.
 *
 * Written fresh rather than lifted: ChipTycoon walks a fixed polyline, this
 * walks a scenario over a graph, dwelling at each stop for as long as that stop
 * has to explain. Pause holds indefinitely.
 */
(function () {
  var flow = window.EC_FLOW;
  var canvas = document.getElementById('map');
  var ctx = canvas.getContext('2d');

  var scenario = flow.scenarios[0];

  var st = { follow: true, hideLayers: false, dpr: 1 };

  // Virtual-time system so the scene can be paused and jumped.
  var sceneEpoch      = 0;      // real ms when vt==0; vt(now) = now - sceneEpoch
  var isPaused        = false;
  var frozenVT        = 0;      // vt value captured when paused
  var pendingFreezeAt = null;   // abs-vt to freeze at (for "pause on next halt")
  var inspectStop     = null;   // non-null: non-track building being viewed, flatbed hidden

  function stopById(id) {
    for (var i = 0; i < flow.stops.length; i++) if (flow.stops[i].id === id) return flow.stops[i];
    return null;
  }

  function trackBetween(fromId, toId) {
    for (var i = 0; i < flow.tracks.length; i++) {
      var t = flow.tracks[i];
      if (t.from === fromId && t.to === toId) return t;
    }
    return null;
  }

  function resize() {
    st.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * st.dpr;
    canvas.height = canvas.clientHeight * st.dpr;
  }

  /** Ease in and out — the same curve the logistics flatbed uses between stations. */
  function ease(u) {
    var k = Math.max(0, Math.min(1, u));
    return k < 0.5 ? 2 * k * k : -1 + (4 - 2 * k) * k;
  }

  function vt(now) {
    return isPaused ? frozenVT : (now - sceneEpoch);
  }

  function getWaypoints() {
    if (!scene) scene = buildScene();
    return scene.phases.filter(function (ph) {
      return ph.kind === 'load' || ph.kind === 'gateway' || ph.kind === 'halt';
    });
  }

  function followingTransmit(ph) {
    if (!scene) return null;
    for (var i = 0; i < scene.phases.length; i++) {
      var p = scene.phases[i];
      if (p.kind === 'transmit' && Math.abs(p.t0 - ph.t1) < 50) return p;
    }
    return null;
  }

  function jumpToWaypoint(ph) {
    if (!scene) scene = buildScene();
    var now = performance.now();
    var curVT = isPaused ? frozenVT : (now - sceneEpoch);
    var cycleBase = Math.floor(curVT / scene.cycle) * scene.cycle;
    var tx = followingTransmit(ph);
    var target = tx
      ? tx.t0 + (tx.t1 - tx.t0) * 0.7
      : ph.t0 + (ph.t1 - ph.t0) * 0.5;
    frozenVT = cycleBase + target;
    isPaused = true;
    pendingFreezeAt = null;
    inspectStop = null;
    lastPanelStop = 'force';
    updatePauseBtn();
  }

  function goBack() {
    if (!scene) scene = buildScene();
    var now = performance.now();
    var c = (isPaused ? frozenVT : (now - sceneEpoch)) % scene.cycle;
    var pts = getWaypoints();
    var idx = -1;
    for (var i = pts.length - 1; i >= 0; i--) {
      if (pts[i].t0 + 300 < c) { idx = i; break; }
    }
    if (idx < 0) idx = pts.length - 1;
    jumpToWaypoint(pts[idx]);
  }

  function goForward() {
    if (!scene) scene = buildScene();
    var now = performance.now();
    var curVT = isPaused ? frozenVT : (now - sceneEpoch);
    var c = curVT % scene.cycle;
    var pts = getWaypoints();
    for (var i = 0; i < pts.length; i++) {
      if (pts[i].t0 > c + 100) { jumpToWaypoint(pts[i]); return; }
    }
    var cycleBase = Math.floor(curVT / scene.cycle) * scene.cycle;
    var tx = followingTransmit(pts[0]);
    var target = tx ? tx.t0 + (tx.t1 - tx.t0) * 0.7 : pts[0].t0 + 100;
    frozenVT = cycleBase + scene.cycle + target;
    isPaused = true;
    pendingFreezeAt = null;
    inspectStop = null;
    lastPanelStop = 'force';
    updatePauseBtn();
  }

  function togglePause() {
    if (!scene) scene = buildScene();
    var now = performance.now();
    if (inspectStop) {
      inspectStop = null;
      sceneEpoch = now - frozenVT;
      isPaused = false;
      pendingFreezeAt = null;
      lastPanelStop = 'force';
      updatePauseBtn();
      return;
    }
    if (isPaused) {
      sceneEpoch = now - frozenVT;
      isPaused = false;
      pendingFreezeAt = null;
    } else if (pendingFreezeAt !== null) {
      pendingFreezeAt = null;
    } else {
      var curVT = now - sceneEpoch;
      var c = curVT % scene.cycle;
      var pts = getWaypoints();
      var nextPh = null;
      for (var i = 0; i < pts.length; i++) {
        if (pts[i].t0 > c + 100) { nextPh = pts[i]; break; }
      }
      var cycleBase = Math.floor(curVT / scene.cycle) * scene.cycle;
      if (!nextPh) {
        var tx = followingTransmit(pts[0]);
        pendingFreezeAt = cycleBase + scene.cycle + (tx ? tx.t0 + (tx.t1 - tx.t0) * 0.7 : pts[0].t0 + 100);
      } else {
        var tx2 = followingTransmit(nextPh);
        pendingFreezeAt = cycleBase + (tx2 ? tx2.t0 + (tx2.t1 - tx2.t0) * 0.7 : nextPh.t0 + 100);
      }
    }
    updatePauseBtn();
  }

  function updatePauseBtn() {
    var btn = document.getElementById('pauseBtn');
    if (!btn) return;
    var pausing = isPaused || !!inspectStop;
    btn.classList.toggle('on', pausing || pendingFreezeAt !== null);
    btn.innerHTML = pausing ? '&#x25BA;' : '&#x23F8;';
  }

  function screenToGrid(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var cx = clientX - rect.left;
    var cy = clientY - rect.top;
    var wx = (cx - canvas.clientWidth / 2) / Iso.cam.zoom + Iso.cam.x;
    var wy = (cy - canvas.clientHeight / 2) / Iso.cam.zoom + Iso.cam.y;
    return Iso.fromWorld(wx, wy);
  }

  var NO_CLICK_STOPS = { cognition: true, 'ea-s3': true, 'ec-s3': true, 'ui-portal': true, archive: true };

  function findStopAtScreen(clientX, clientY) {
    var g = screenToGrid(clientX, clientY);
    var nearest = null, minDist = 1.5;
    for (var i = 0; i < flow.stops.length; i++) {
      var s = flow.stops[i];
      if (!s.grid || s.kind === 'edge' || NO_CLICK_STOPS[s.id]) continue;
      var dx = s.grid.x - g.x, dy = s.grid.y - g.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < minDist) { nearest = s; minDist = d; }
    }
    return nearest;
  }

  function isTrackStop(id) {
    if (!scene) scene = buildScene();
    for (var i = 0; i < scene.phases.length; i++) {
      var ph = scene.phases[i];
      if (ph.kind === 'halt'    && ph.at === id)    return true;
      if (ph.kind === 'gateway' && id === 'gateway') return true;
      if (ph.kind === 'load'    && id === 'archive') return true;
    }
    return false;
  }

  function handleBuildingClick(stop) {
    if (!scene) scene = buildScene();
    var id = stop.id;
    if (isTrackStop(id)) {
      inspectStop = null;
      for (var i = 0; i < scene.phases.length; i++) {
        var ph = scene.phases[i];
        if ((ph.kind === 'halt'    && ph.at === id) ||
            (ph.kind === 'gateway' && id === 'gateway') ||
            (ph.kind === 'load'    && id === 'archive')) {
          jumpToWaypoint(ph);
          break;
        }
      }
      st.follow = false;
      Iso.lookAt(stop.grid.x, stop.grid.y);
    } else {
      if (!isPaused) {
        frozenVT = performance.now() - sceneEpoch;
        isPaused = true;
      }
      pendingFreezeAt = null;
      inspectStop = stop;
      paintPanelForStop(stop);
      st.follow = false;
      Iso.lookAt(stop.grid.x, stop.grid.y);
      updatePauseBtn();
    }
  }

  /*
   * =======================================================================
   * THE LOGISTICS RUN — the estate working, as scenery.
   * =======================================================================
   *
   * A flatbed loads six packages at the Archive platform, works its way down
   * the line dropping exactly one at every station on the way, and drives into
   * the Alerting yard with the two that are left. Three more flatbeds leave the
   * back of the yard on the three roads and vanish into the terminals.
   *
   * It is deliberately NOT the scenario walk. The scenario is one document's
   * journey and it stops when the user pauses it; this is the railway working,
   * and it runs on wall-clock time so the map is never dead. The two share the
   * rails and nothing else.
   *
   * Nothing here asserts anything about the estate. No document in knowledge/
   * describes freight, and none of these movements is a topic — this is the
   * railway metaphor's own traffic, in the same category as the trees.
   */
  var LOAD_MS = 3000;            // loading at the Archive
  var DWELL_MS = 2500;           // standing at a station while a package comes off
  var SPEED = 0.0026;            // grid units per millisecond
  var GONE_MS = 2600;            // the yard sits empty before the next working
  var START_LOAD = 6;
  var GATEWAY_DWELL_MS = 1200;        // brief deliberate pause at the Gateway arch
  var TRANSMIT_MS = 2400;             // Centralized Audit transmission sequence per stage
  // Gateway → EC-S3 belt cargo lifecycle. Six coloured packages travel the belt
  // while the flatbed holds at the arch; the transmit fires once the 6th enters.
  var BELT_PKG_COUNT = 6;
  var INTER_PKG_MS   = 480;           // spacing between successive package starts
  var CROSS_PKG_MS   = 2200;          // transit time for one package to reach EC-S3
  var BELT_PHASE_MS  = (BELT_PKG_COUNT - 1) * INTER_PKG_MS + CROSS_PKG_MS; // 4600ms
  var BELT_PKG_COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#a855f7', '#f97316'];

  var TUNNEL_GY   = 3.5;   // gy of tunnel mouth centre on the approach track
  var TUNNEL_FADE = 0.5;   // grid units over which the flatbed fades in on exit

  var PORTAL_DELAY_MS = 5000;   // delay after both Review/Reporting flatbeds arrive
  var PORTAL_OUT_MS   = 1500;   // UI Portal bolt travel to all connected LSTs
  var PORTAL_HOLD_MS  = 1000;   // hold at peak (request being processed)
  var PORTAL_RET_MS   = 1500;   // return bolt travel back to UI Portal

  var MAIN_STOPS = ['logistics-origin', 'gateway', 'qualifier', 'filter', 'evaluator', 'quota', 'alerting'];
  var UNLOAD_AT = ['qualifier', 'filter', 'evaluator', 'quota'];

  /*
   * A leg of the run, sampled in grid space off the SAME control point the
   * renderer draws the rail from — so a flatbed stays on its own rail
   * regardless of curve.
   */
  function legPath(fromId, toId, n) {
    var a = stopById(fromId), b = stopById(toId);
    var link = trackBetween(fromId, toId) || trackBetween(toId, fromId);
    var ctrl = link ? Iso.trackControl(link, a.grid, b.grid) : null;
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var u = i / n;
      pts.push(ctrl ? Iso.quadPoint(a.grid, ctrl, b.grid, u)
                    : { x: a.grid.x + (b.grid.x - a.grid.x) * u,
                        y: a.grid.y + (b.grid.y - a.grid.y) * u });
    }
    return pts;
  }

  /** Chain legs into one measured polyline, remembering where each leg ended. */
  function buildRoute(ids) {
    var pts = [], marks = [0];
    for (var i = 0; i + 1 < ids.length; i++) {
      var leg = legPath(ids[i], ids[i + 1], 24);
      if (i) leg.shift();
      pts = pts.concat(leg);
      marks.push(pts.length - 1);
    }
    var cum = [0];
    for (i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    }
    return { pts: pts, cum: cum, len: cum[cum.length - 1],
             at: marks.map(function (m) { return cum[m]; }), ids: ids };
  }

  /** Position and heading a given arc length along a route. */
  function along(route, s) {
    var d = Math.max(0, Math.min(route.len, s));
    var i = 1;
    while (i < route.cum.length - 1 && route.cum[i] < d) i++;
    var span = (route.cum[i] - route.cum[i - 1]) || 1;
    var k = (d - route.cum[i - 1]) / span;
    var p0 = route.pts[i - 1], p1 = route.pts[i];
    var hx = p1.x - p0.x, hy = p1.y - p0.y, L = Math.hypot(hx, hy) || 1;
    return { x: p0.x + hx * k, y: p0.y + hy * k, heading: { x: hx / L, y: hy / L } };
  }

  /*
   * The Archive halt: the point on the route beside the Archive's platform.
   *
   * Found by search rather than written down, because the route's first leg is
   * a straight run from logistics-origin along the archive track, and the arc
   * length of any particular point on it is not a number worth maintaining by
   * hand. Sprites.ARCHIVE_TRACK is the x the line runs on and the Archive's own
   * y is the other coordinate — "wherever the rails pass the loading platform".
   */
  function findHalt(route, target) {
    var best = 0, bestD = Infinity;
    for (var s = 0; s <= route.len; s += 0.05) {
      var p = along(route, s);
      var d = Math.hypot(p.x - target.x, p.y - target.y);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  /*
   * The timeline, built once: alternating runs and halts, each with the wall
   * clock window it owns. Driving the animation off one cycle length keeps
   * every flatbed on the map in step without any of them holding state.
   */
  var scene = null;

  function buildScene() {
    var route = buildRoute(MAIN_STOPS);
    var archive = stopById('archive');
    var haltS = findHalt(route, { x: Sprites.ARCHIVE_TRACK, y: archive.grid.y });
    var gatewayS = route.at[route.ids.indexOf('gateway')];

    var phases = [], t = 0;

    /*
     * Approach: the flatbed runs empty from logistics-origin down the archive
     * track to the loading halt. It spawns off-screen above the Archive so it
     * is already in motion when it enters view — the same trick the parcels use.
     */
    var approachRun = haltS / SPEED;
    phases.push({ kind: 'approach', s0: 0, s1: haltS, t0: 0, t1: approachRun });
    t = approachRun;

    phases.push({ kind: 'load', s: haltS, t0: t, t1: t + LOAD_MS });
    t += LOAD_MS;

    /*
     * Run to the Gateway arch, hold while the driver checks the manifest, then
     * fire the Gateway-to-Audit transmission. The flatbed stays at the arch for
     * the full duration of the electrical sequence before moving on.
     */
    var runToGateway = (gatewayS - haltS) / SPEED;
    phases.push({ kind: 'run', s0: haltS, s1: gatewayS, t0: t, t1: t + runToGateway });
    t += runToGateway;
    // Step A: flatbed halts at arch. No packages unloaded. Belt holds load = 6.
    phases.push({ kind: 'gateway', s: gatewayS, t0: t, t1: t + GATEWAY_DWELL_MS });
    t += GATEWAY_DWELL_MS;
    // Step B/C: belt springs to life; 6 coloured packages travel to EC-S3.
    // Step D begins the instant the 6th package enters EC-S3 (phase end).
    phases.push({ kind: 'belt-to-s3', s: gatewayS, t0: t, t1: t + BELT_PHASE_MS });
    t += BELT_PHASE_MS;
    // Step D: Gateway LST flashes → wire zap → Audit LST electrifies.
    phases.push({ kind: 'transmit', at: 'gateway', s: gatewayS, t0: t, t1: t + TRANSMIT_MS });
    t += TRANSMIT_MS;
    // Step E: flatbed released — continues toward Queue Qualifier (runs below).

    var prev = gatewayS;
    UNLOAD_AT.forEach(function (id) {
      var s1 = route.at[route.ids.indexOf(id)];
      var run = (s1 - prev) / SPEED;
      phases.push({ kind: 'run', s0: prev, s1: s1, t0: t, t1: t + run });
      t += run;
      phases.push({ kind: 'halt', s: s1, at: id, t0: t, t1: t + DWELL_MS });
      t += DWELL_MS;
      /*
       * Each station fires its LST-to-Audit transmission before the flatbed
       * moves on. `s` records the halt position so the flatbed is held there
       * visually for the full sequence duration.
       */
      phases.push({ kind: 'transmit', at: id, s: s1, t0: t, t1: t + TRANSMIT_MS });
      t += TRANSMIT_MS;
      prev = s1;
    });
    var runIn = (route.len - prev) / SPEED;
    phases.push({ kind: 'run', s0: prev, s1: route.len, t0: t, t1: t + runIn });
    t += runIn;
    /*
     * Alerting yard transmission: the flatbed is already inside the building.
     * The three branch flatbeds must not emerge until this entire sequence
     * completes — `enters` is set to after the transmission, not before it.
     */
    phases.push({ kind: 'transmit', at: 'alerting', t0: t, t1: t + TRANSMIT_MS });
    t += TRANSMIT_MS;
    var enters = t;

    // Build exit routes as named variables so we can measure travel times for
    // portal timing — the portal fires only after BOTH Review and Reporting
    // flatbeds have completed their runs.
    var exitEchoRoute   = buildRoute(['alerting', 'echo-engine']);
    var exitEchoDur     = exitEchoRoute.len / SPEED;
    var exitReviewRoute = buildRoute(['alerting', 'yard-l0', 'yard-l1', 'yard-l2', 'yard-l3', 'review-service']);
    var exitReportRoute = buildRoute(['alerting', 'yard-r0', 'yard-r1', 'yard-r2', 'yard-r3', 'reporting']);

    /*
     * The gone phase must outlast the echo-engine transmission: the flatbed
     * travels echoDur ms, then the full TRANSMIT_MS sequence runs. Without this
     * the echoTransmit t1 would exceed the cycle length and never fire correctly.
     */
    var goneMs = Math.max(GONE_MS, exitEchoDur + TRANSMIT_MS + 400);

    /*
     * UI Portal broadcast sequence. Exit flatbed 1 (review-service) departs at
     * enters+400 and exit flatbed 2 (reporting) at enters+800; the portal fires
     * PORTAL_DELAY_MS after both have arrived. Portal phases live inside the gone
     * window, keyed by absolute cycle time just like transmit phases.
     */
    var reviewArrives = enters + 400 + exitReviewRoute.len / SPEED;
    var reportArrives = enters + 800 + exitReportRoute.len / SPEED;
    var portalFireAt  = Math.max(reviewArrives, reportArrives) + PORTAL_DELAY_MS;
    var portalEndAt   = portalFireAt + PORTAL_OUT_MS + PORTAL_HOLD_MS + PORTAL_RET_MS;
    goneMs = Math.max(goneMs, portalEndAt - enters);

    phases.push({ kind: 'gone',        t0: t, t1: t + goneMs });
    phases.push({ kind: 'portal-out',  t0: portalFireAt,
                                       t1: portalFireAt + PORTAL_OUT_MS });
    phases.push({ kind: 'portal-hold', t0: portalFireAt + PORTAL_OUT_MS,
                                       t1: portalFireAt + PORTAL_OUT_MS + PORTAL_HOLD_MS });
    phases.push({ kind: 'portal-ret',  t0: portalFireAt + PORTAL_OUT_MS + PORTAL_HOLD_MS,
                                       t1: portalEndAt });

    return {
      route: route, phases: phases, cycle: t + goneMs, enters: enters,
      /*
       * Echo Engine fires its own transmission once the flatbed reaches the
       * terminal building. t0 is when the exit-0 flatbed (starting at enters)
       * arrives at echo-engine's grid centre.
       */
      echoTransmit: { at: 'echo-engine', t0: enters + exitEchoDur, t1: enters + exitEchoDur + TRANSMIT_MS },
      exits: [
        { route: exitEchoRoute },
        { route: exitReviewRoute },
        { route: exitReportRoute }
      ]
    };
  }

  /*
   * Whether a flatbed has driven inside a yard, and if so what depth key hides
   * it there.
   *
   * A cart at a building's own cell ties with that building on gx + gy and wins
   * the tie, so it drives over the roof rather than into the shed. Handing the
   * renderer an explicit key just behind the building's is what actually makes
   * it disappear: from the moment it crosses the front wall the shed is painted
   * over it, which is the whole "cart goes inside" effect.
   */
  function yardKey(gx, gy) {
    for (var i = 0; i < flow.stops.length; i++) {
      var s = flow.stops[i];
      var f = Sprites.YARD_FOOT[s.kind];
      if (!f) continue;
      if (Math.abs(gx - s.grid.x) <= f[0] && Math.abs(gy - s.grid.y) <= f[1]) {
        return s.grid.x + s.grid.y - 0.05;
      }
    }
    return null;
  }

  function pushFlatbed(out, p, load, alpha) {
    var key = yardKey(p.x, p.y);
    out.push({ gx: p.x, gy: p.y, heading: p.heading, load: load, key: key,
               alpha: alpha === undefined ? 1 : alpha });
  }

  /*
   * Everything the logistics run puts on the map this frame: the flatbeds, the
   * packages walking between a flatbed and a doorway, and the per-stop LST /
   * wire / zap energy levels for the transmission animation layer.
   */
  function sceneState(now) {
    if (!scene) scene = buildScene();
    var beds = [], parcels = [];
    var lstEnergy = {}, wireEnergy = {}, zapT = {};
    var c = now % scene.cycle;

    /*
     * Compute LST electrification for a transmit phase, given its fractional
     * progress k (0..1). Sub-phase schedule (for TRANSMIT_MS = 2400ms):
     *   0.00-0.20  local tower glows up
     *   0.20-0.35  wire energises
     *   0.35-0.50  bolt travels to Audit
     *   0.50-0.65  Audit tower glows up
     *   0.65-0.80  all hold at peak
     *   0.80-1.00  everything fades to idle
     */
    function applyTransmit(at, k) {
      var localE = k < 0.20 ? k / 0.20       : k < 0.80 ? 1 : (1 - k) / 0.20;
      var wireE  = k < 0.20 ? 0 : k < 0.35   ? (k - 0.20) / 0.15 : k < 0.80 ? 1 : (1 - k) / 0.20;
      var zap    = k < 0.35 ? -1 : k < 0.50  ? (k - 0.35) / 0.15 : -1;
      var audE   = k < 0.50 ? 0  : k < 0.65  ? (k - 0.50) / 0.15 : k < 0.80 ? 1 : (1 - k) / 0.20;
      lstEnergy[at]      = Math.max(lstEnergy[at]      || 0, localE);
      wireEnergy[at]     = Math.max(wireEnergy[at]     || 0, wireE);
      zapT[at]           = zap;
      lstEnergy['audit'] = Math.max(lstEnergy['audit'] || 0, audE);
    }

    // Scan for any active transmit phase (at most one at a time).
    var pi;
    for (pi = 0; pi < scene.phases.length; pi++) {
      var tph = scene.phases[pi];
      if (tph.kind === 'transmit' && c >= tph.t0 && c < tph.t1) {
        applyTransmit(tph.at, (c - tph.t0) / (tph.t1 - tph.t0));
        break;
      }
    }
    // Echo Engine transmit fires once exit 0 reaches the terminal building.
    var et = scene.echoTransmit;
    if (et && c >= et.t0 && c < et.t1) {
      applyTransmit(et.at, (c - et.t0) / (et.t1 - et.t0));
    }

    // --- the main working ---------------------------------------------------
    var load = START_LOAD;
    for (var i = 0; i < scene.phases.length; i++) {
      var ph = scene.phases[i];
      if (c < ph.t0 || c >= ph.t1) {
        if (c >= ph.t1 && ph.kind === 'halt') load--;
        continue;
      }
      var k = (c - ph.t0) / (ph.t1 - ph.t0);

      if (ph.kind === 'gone') break;                    // inside the yard, unseen

      // During a transmit phase the flatbed holds at its halt position.
      // (Alerting has no s — the flatbed is already inside the building.)
      if (ph.kind === 'transmit') {
        if (ph.s !== undefined) pushFlatbed(beds, along(scene.route, ph.s), load);
        break;
      }

      // Approach: empty flatbed rolling in from the tunnel mouth above the Archive.
      if (ph.kind === 'approach') {
        var apt = along(scene.route, ph.s0 + (ph.s1 - ph.s0) * k);
        var aAlpha = Math.max(0, Math.min(1, (apt.y - TUNNEL_GY) / TUNNEL_FADE));
        pushFlatbed(beds, apt, 0, aAlpha);
        break;
      }

      if (ph.kind === 'load') {
        /*
         * Loading. Packages appear on the deck one at a time, each preceded by
         * one crossing from the platform stack — the flatbed fills up rather
         * than blinking from empty to full.
         */
        var p0 = along(scene.route, ph.s);
        var whole = Math.floor(k * START_LOAD);
        pushFlatbed(beds, p0, whole);
        var frac = k * START_LOAD - whole;
        if (whole < START_LOAD) {
          var arch = stopById('archive');
          var from = { x: arch.grid.x + Sprites.ARCHIVE_PLATFORM, y: arch.grid.y - 0.30 };
          parcels.push({
            gx: from.x + (p0.x - from.x) * ease(frac),
            gy: from.y + (p0.y - from.y) * ease(frac),
            h: 3 + ease(frac) * 4, alpha: Math.min(1, (1 - frac) * 4)
          });
        }
        break;
      }

      if (ph.kind === 'run') {
        pushFlatbed(beds, along(scene.route, ph.s0 + (ph.s1 - ph.s0) * k), load);
        break;
      }

      // Gateway pause: full load on deck, no delivery (Step A).
      if (ph.kind === 'gateway') {
        pushFlatbed(beds, along(scene.route, ph.s), load);
        break;
      }

      // Belt-to-EC-S3: 6 coloured packages stagger across the belt (Steps B–C).
      if (ph.kind === 'belt-to-s3') {
        pushFlatbed(beds, along(scene.route, ph.s), load);
        var gw = stopById('gateway'), s3 = stopById('ec-s3');
        if (gw && s3) {
          for (var bi2 = 0; bi2 < BELT_PKG_COUNT; bi2++) {
            var elapsed2 = (c - ph.t0) - bi2 * INTER_PKG_MS;
            if (elapsed2 < 0) continue;                        // not launched yet
            var frac2 = Math.min(1, elapsed2 / CROSS_PKG_MS);
            if (frac2 >= 1) continue;                          // already absorbed
            var pgx = gw.grid.x + (s3.grid.x - gw.grid.x) * frac2;
            var pgy = gw.grid.y + (s3.grid.y - gw.grid.y) * frac2;
            var palpha = frac2 > 0.80 ? (1 - frac2) / 0.20 : 1.0;
            parcels.push({
              gx: pgx, gy: pgy,
              h: 7 - 4 * Math.min(1, frac2 * 1.3),
              tint: BELT_PKG_COLORS[bi2], alpha: palpha
            });
          }
        }
        break;
      }

      // --- a halt: one package comes off and crosses to the door ------------
      var p = along(scene.route, ph.s);
      pushFlatbed(beds, p, load);
      var DELIVER = 0.72;                                // fraction of the dwell
      if (k < DELIVER) {
        var stop = stopById(ph.at);
        var door = Sprites.doorPoint(stop, Render.placed(flow, stop));
        var e = ease(k / DELIVER);
        parcels.push({
          gx: p.x + (door.x - p.x) * e,
          gy: p.y + (door.y - p.y) * e,
          // Lifted off the deck and set down on the platform on the way across.
          h: 7 - 4 * Math.min(1, e * 1.4),
          // Faded out as it reaches the wall, which is what turns "stops at the
          // building" into "goes in through the door".
          alpha: e < 0.72 ? 1 : (1 - e) / 0.28
        });
      }
      break;
    }

    // --- the three forwarded workings out of the yard ------------------------
    // They emerge only after the alerting transmission completes (enters is set
    // to after the transmit phase), staggered 400 ms apart.
    scene.exits.forEach(function (ex, n) {
      var e0  = scene.enters + n * 400;
      var dur = ex.route.len / SPEED;
      var u   = c - e0;
      if (u < 0 || u > dur) return;
      pushFlatbed(beds, along(ex.route, u * SPEED), n === 0 ? 2 : 1);
    });

    /*
     * UI Portal broadcast: scan for an active portal phase and compute energy /
     * bolt-position for all five portal wires simultaneously. Sub-phase schedule:
     *
     *   portal-out  0.00–0.20  Portal LST glows up
     *               0.20–0.50  all five wires energise
     *               0.50–0.85  bolt travels from Portal to each target LST
     *               0.85–1.00  target LSTs glow up
     *   portal-hold all values at peak
     *   portal-ret  0.00–0.15  target LSTs begin firing return bolt
     *               0.15–0.50  return bolts travel back to Portal LST
     *               0.50–0.80  Portal LST receives and brightens
     *               0.80–1.00  everything fades to idle
     */
    var PORTAL_TARGETS = ['gateway', 'indexer', 'config-curator', 'review-service', 'reporting'];
    var ps = { uiE: 0, wireE: 0, zapT: -1, targetE: 0, retWireE: 0, retZapT: -1 };
    var ppi;
    for (ppi = 0; ppi < scene.phases.length; ppi++) {
      var pph = scene.phases[ppi];
      if (c < pph.t0 || c >= pph.t1) continue;
      var pk = (c - pph.t0) / (pph.t1 - pph.t0);
      if (pph.kind === 'portal-out') {
        ps.uiE     = pk < 0.20 ? pk / 0.20 : 1;
        ps.wireE   = pk < 0.20 ? 0 : pk < 0.50 ? (pk - 0.20) / 0.30 : 1;
        ps.zapT    = pk < 0.50 ? -1 : pk < 0.85 ? (pk - 0.50) / 0.35 : -1;
        ps.targetE = pk < 0.85 ? 0 : (pk - 0.85) / 0.15;
        break;
      }
      if (pph.kind === 'portal-hold') {
        ps.uiE = 1; ps.wireE = 1; ps.targetE = 1;
        break;
      }
      if (pph.kind === 'portal-ret') {
        ps.targetE  = pk < 0.15 ? 1 : pk < 0.50 ? 1 - (pk - 0.15) / 0.35 : 0;
        ps.retWireE = pk < 0.15 ? 0 : pk < 0.50 ? (pk - 0.15) / 0.35 : pk < 0.80 ? 1 : (1 - pk) / 0.20;
        ps.retZapT  = pk < 0.15 ? -1 : pk < 0.50 ? (pk - 0.15) / 0.35 : -1;
        ps.uiE      = pk < 0.50 ? 0 : pk < 0.80 ? (pk - 0.50) / 0.30 : (1 - pk) / 0.20;
        break;
      }
    }
    if (ps.uiE > 0) lstEnergy['ui-portal'] = Math.max(lstEnergy['ui-portal'] || 0, ps.uiE);
    if (ps.targetE > 0) PORTAL_TARGETS.forEach(function (pid) {
      lstEnergy[pid] = Math.max(lstEnergy[pid] || 0, ps.targetE);
    });

    // Derive which stop the logistics flatbed is currently at for panel + halos.
    var currentStop = null, visitedStops = [], haltRemaining = 0;
    for (var vi = 0; vi < scene.phases.length; vi++) {
      var vph = scene.phases[vi];
      if (vph.kind === 'halt' && c >= vph.t1) visitedStops.push(vph.at);
      if (vph.kind === 'load' && c >= vph.t1 && visitedStops.indexOf('archive') < 0)
        visitedStops.push('archive');
      if (c >= vph.t0 && c < vph.t1) {
        if (vph.kind === 'approach' || vph.kind === 'load') {
          currentStop = 'archive';
        } else if (vph.kind === 'gateway' || vph.kind === 'belt-to-s3') {
          currentStop = 'gateway';
        } else if (vph.kind === 'halt') {
          currentStop = vph.at; haltRemaining = vph.t1 - c;
        } else if (vph.kind === 'transmit') {
          currentStop = vph.at;
        } else if (vph.kind === 'gone' || vph.kind.slice(0, 6) === 'portal') {
          currentStop = 'alerting';
        }
      }
    }

    return { flatbeds: beds, parcels: parcels,
             lstEnergy: lstEnergy, wireEnergy: wireEnergy, zapT: zapT,
             portalState: ps,
             currentStop: currentStop, visitedStops: visitedStops, haltRemaining: haltRemaining };
  }

  var lastLogistics = null;
  var lastPanelStop = 'init';   // sentinel so first tick always paints

  function stopStateFor(id) {
    if (!lastLogistics) return 'ahead';
    if (id === lastLogistics.currentStop) return 'current';
    if ((lastLogistics.visitedStops || []).indexOf(id) >= 0) return 'visited';
    return 'ahead';
  }

  function findStep(stopId) {
    for (var i = 0; i < scenario.steps.length; i++)
      if (scenario.steps[i].at === stopId) return scenario.steps[i];
    return null;
  }

  // ---------------------------------------------------------------- the panel

  var elTitle        = document.getElementById('title');
  var elNote         = document.getElementById('note');
  var elSrc          = document.getElementById('src');
  var elCargo        = document.getElementById('cargo');
  var elStamps       = document.getElementById('stamps');
  var elVia          = document.getElementById('via');
  var elTimer        = document.getElementById('timer');
  var elProgress     = document.getElementById('progress');
  var elCount        = document.getElementById('count');
  var elAttempt      = document.getElementById('attempt');
  var elScenario     = document.getElementById('scenarioName');
  var elBusiness     = document.getElementById('business');
  var elEventsList   = document.getElementById('eventsList');
  var elTerminalEvt  = document.getElementById('terminalEvent');
  var elFailurePath  = document.getElementById('failurePath');
  var elSeeMore      = document.getElementById('seeMore');
  var elPanel        = document.getElementById('panel');

  elSeeMore.addEventListener('click', function () {
    var expanded = elPanel.classList.toggle('is-expanded');
    elSeeMore.innerHTML = expanded ? 'See less &#9650;' : 'See more &#9660;';
  });

  function paintPanel(cs) {
    var s    = cs ? findStep(cs) : null;
    var info = (cs && flow.stopInfo) ? (flow.stopInfo[cs] || {}) : {};

    // collapse technical section whenever the stop changes
    elPanel.classList.remove('is-expanded');
    elSeeMore.innerHTML = 'See more &#9660;';

    elScenario.textContent = 'Document Journey';
    elAttempt.hidden = true;
    document.body.classList.remove('failing');

    // always-visible fields
    var stopObj = stopById(cs);
    elTitle.textContent   = s ? (s.title || '') : (stopObj ? stopObj.name : '');
    elCargo.textContent   = s && s.cargo ? (s.cargo.label || '') : '';
    elCargo.style.color   = s && s.cargo ? (s.cargo.tint  || '') : '';

    elBusiness.textContent = info.business || '';

    elEventsList.innerHTML = '';
    (info.events || []).forEach(function (ev) {
      var li = document.createElement('li');
      li.textContent = ev;
      elEventsList.appendChild(li);
    });

    if (info.terminalEvent) {
      elTerminalEvt.textContent = info.terminalEvent;
      elTerminalEvt.hidden = false;
    } else {
      elTerminalEvt.hidden = true;
    }

    if (info.failurePath) {
      elFailurePath.textContent = info.failurePath;
      elFailurePath.hidden = false;
    } else {
      elFailurePath.hidden = true;
    }

    // technical section (behind See more)
    elNote.textContent = info.note || '';
    elSrc.textContent  = info.src  || '';
    elVia.textContent  = (s && s.via) ? s.via : 'starts here';
    elStamps.innerHTML = '';
    ((s && s.cargo && s.cargo.stamps) || []).forEach(function (stamp) {
      var b = document.createElement('span');
      b.className = 'stamp'; b.textContent = stamp;
      elStamps.appendChild(b);
    });

    var si = MAIN_STOPS.indexOf(cs);
    if (si >= 0) {
      elCount.textContent    = (si + 1) + ' / ' + MAIN_STOPS.length;
      elProgress.style.width = Math.round(si / (MAIN_STOPS.length - 1) * 100) + '%';
    } else {
      elCount.textContent    = '—';
      elProgress.style.width = '0%';
    }
  }

  function paintPanelForStop(stop) {
    var info = (flow.stopInfo && flow.stopInfo[stop.id]) || {};
    elPanel.classList.remove('is-expanded');
    elSeeMore.innerHTML = 'See more &#9660;';
    elAttempt.hidden = true;
    document.body.classList.remove('failing');
    elScenario.textContent = stop.kind || 'component';
    elTitle.textContent    = stop.name || stop.id;
    elCargo.textContent    = '';
    elCargo.style.color    = '';
    elBusiness.textContent = info.business || '';
    elEventsList.innerHTML = '';
    (info.events || []).forEach(function (ev) {
      var li = document.createElement('li');
      li.textContent = ev;
      elEventsList.appendChild(li);
    });
    elTerminalEvt.hidden = !info.terminalEvent;
    if (info.terminalEvent) elTerminalEvt.textContent = info.terminalEvent;
    elFailurePath.hidden = !info.failurePath;
    if (info.failurePath) elFailurePath.textContent = info.failurePath;
    elNote.textContent = info.note || '';
    elSrc.textContent  = info.src  || '';
    elVia.textContent  = '';
    elStamps.innerHTML = '';
    elCount.textContent    = '—';
    elProgress.style.width = '0%';
    lastPanelStop = stop.id;
  }

  // ------------------------------------------------------------------- clock

  function tick(now) {
    // Apply pending freeze when vt crosses the target.
    if (pendingFreezeAt !== null && !isPaused) {
      var curVT = now - sceneEpoch;
      if (curVT >= pendingFreezeAt) {
        frozenVT = pendingFreezeAt;
        isPaused = true;
        pendingFreezeAt = null;
        updatePauseBtn();
      }
    }

    var logistics;
    if (inspectStop) {
      logistics = {
        flatbeds: [], parcels: [],
        lstEnergy: {}, wireEnergy: {}, zapT: {},
        portalState: null, currentStop: null,
        visitedStops: [], haltRemaining: 0
      };
    } else {
      logistics = sceneState(vt(now));
    }
    lastLogistics = logistics;

    if (!inspectStop && st.follow && logistics.flatbeds && logistics.flatbeds.length > 0) {
      var b0 = logistics.flatbeds[0];
      Iso.glideTo(b0.gx, b0.gy, 0.055);
    }

    var rem = logistics.haltRemaining || 0;
    elTimer.textContent = inspectStop ? '' : (rem > 200 ? (rem / 1000).toFixed(1) + 's' : 'in transit');

    if (!inspectStop) {
      var cs = logistics.currentStop;
      if (cs !== lastPanelStop) { lastPanelStop = cs; paintPanel(cs); }
    }

    Render.draw(ctx, canvas, flow, {
      dpr: st.dpr,
      now: now,
      flatbeds: logistics.flatbeds,
      parcels: logistics.parcels,
      lstEnergy: logistics.lstEnergy,
      wireEnergy: logistics.wireEnergy,
      zapT: logistics.zapT,
      portalState: logistics.portalState,
      stopState: stopStateFor,
      hideLayers: st.hideLayers
    });

    requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------- controls

  // Config sync and audit plumbing are drawn faint by default; this hides them
  // outright, leaving only the rails a document can actually travel on.
  document.getElementById('plumbing').onclick = function () {
    st.hideLayers = !st.hideLayers;
    this.classList.toggle('on', !st.hideLayers);
  };

  document.getElementById('followBtn').onclick = function () {
    st.follow = !st.follow;
    this.classList.toggle('on', st.follow);
  };

  // The legend is off by default. The buildings say what they are, so it is
  // there for the track types rather than as a permanent fixture.
  var elLegend = document.getElementById('legend');
  document.getElementById('legendBtn').onclick = function () {
    elLegend.hidden = !elLegend.hidden;
    this.classList.toggle('on', !elLegend.hidden);
  };

  function fit() {
    Iso.frame(flow.stops.map(function (s) { return s.grid; }), canvas);
  }
  document.getElementById('fit').onclick = function () { st.follow = false;
    document.getElementById('followBtn').textContent = '○ Free';
    document.getElementById('followBtn').classList.remove('on');
    fit();
  };

  document.getElementById('backBtn').onclick  = goBack;
  document.getElementById('fwdBtn').onclick   = goForward;
  document.getElementById('pauseBtn').onclick = togglePause;

  // Pan, zoom, click — pointer and wheel and touch.
  var drag = null, didPan = false;

  canvas.addEventListener('pointerdown', function (e) {
    drag = { x: e.clientX, y: e.clientY };
    didPan = false;
    canvas.style.cursor = 'grabbing';
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drag) {
      var hs = findStopAtScreen(e.clientX, e.clientY);
      canvas.style.cursor = hs ? 'pointer' : 'default';
      return;
    }
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) didPan = true;
    if (didPan) {
      Iso.pan(dx, dy);
      st.follow = false;
      var fb = document.getElementById('followBtn');
      fb.textContent = '○ Free'; fb.classList.remove('on');
    }
    drag = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointerup', function (e) {
    if (!didPan && drag) {
      var clicked = findStopAtScreen(e.clientX, e.clientY);
      if (clicked) handleBuildingClick(clicked);
    }
    drag = null;
    var hs = findStopAtScreen(e.clientX, e.clientY);
    canvas.style.cursor = hs ? 'pointer' : 'default';
  });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    Iso.zoomBy(e.deltaY < 0 ? 1.1 : 0.9);
  }, { passive: false });

  window.addEventListener('resize', function () { resize(); });

  resize();
  fit();
  requestAnimationFrame(tick);
})();
