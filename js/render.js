'use strict';
/*
 * render.js — draws the railway and the country it runs through.
 *
 * The estate as a railway: services are stations, S3 buckets are goods
 * warehouses, Elasticsearch indexes are classification depots, MongoDB is a
 * record office, a DLT is a dead-end siding with a buffer stop.
 *
 * The one rule worth stating, because everything else follows from it:
 *
 *   Kafka moves between services, so Kafka is RAIL.
 *   Everything else is the last few metres, so it is ROAD.
 *
 * A document reaching S3 or Elasticsearch is not a train journey — it is a
 * cart running from the station to the warehouse next door while the train
 * stands at the platform. Drawing those two things the same way was what made
 * the old map read as one undifferentiated web.
 *
 * Layers, painted in this order:
 *   1. grass, clipped to the viewport
 *   2. ballast and roadbed (flat, on the ground)
 *   3. rails, sleepers, road markings
 *   4. everything that stands up — buildings, trees, the train, the carts —
 *      sorted back to front, one painter per thing
 */
var Render = (function () {

  var C = {
    grass:     '#5c8a4a',
    grassAlt:  '#548243',
    grassDark: '#4a7740',
    ballast:   '#9a9182',
    ballastEd: '#7f7768',
    sleeper:   '#6d5942',
    rail:      '#cdd6de',
    railDark:  '#5c6672',
    railHot:   '#f0a132',
    road:      '#4f545b',
    roadEdge:  '#3b3f45',
    roadLine:  '#e2ddcb',
    dead:      '#8a4f4a',
    deadHot:   '#e05252',
    faint:     '#7d8a74'
  };

  function stopById(flow, id) {
    for (var i = 0; i < flow.stops.length; i++) if (flow.stops[i].id === id) return flow.stops[i];
    return null;
  }

  /** Kafka and its retry/DLT variants ride on rail; everything else on road. */
  function isRail(t) {
    return t.transport === 'kafka' || t.transport === 'cdc' ||
           t.transport === 'retry' || t.transport === 'dlt' ||
           t.transport === 'rail';
  }


  // ------------------------------------------------------------------ ground

  /*
   * Grass. The plate is deliberately much larger than the estate so it fills
   * the screen at any zoom, but only the tiles inside the viewport are drawn —
   * at low zoom the full plate would be tens of thousands of quads a frame.
   */
  function drawGround(ctx, canvas, bounds) {
    var z = Iso.cam.zoom;

    // The base is one rectangle, not thousands of tiles. Only the darker check
    // tiles are traced, and they all go into a single path filled once — the
    // difference between roughly 960 canvas calls a frame here and 3200.
    ctx.fillStyle = C.grass;
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    var hw = (Iso.TILE_W / 2) * z, hh = (Iso.TILE_H / 2) * z;
    var mw = Iso.TILE_W * z, mh = Iso.TILE_H * 4 * z;
    ctx.beginPath();
    for (var gy = bounds.y0; gy <= bounds.y1; gy++) {
      for (var gx = bounds.x0; gx <= bounds.x1; gx++) {
        if (((gx * 7 + gy * 13) % 5) >= 2) continue;      // stable two-tone check
        var s = Iso.toScreen(gx, gy, canvas);
        if (s.x < -mw || s.x > canvas.clientWidth + mw) continue;
        if (s.y < -mh || s.y > canvas.clientHeight + mh) continue;
        ctx.moveTo(s.x, s.y - hh);
        ctx.lineTo(s.x + hw, s.y);
        ctx.lineTo(s.x, s.y + hh);
        ctx.lineTo(s.x - hw, s.y);
        ctx.closePath();
      }
    }
    ctx.fillStyle = C.grassAlt;
    ctx.fill();
  }

  /** How much of the grid to cover, given the camera. Generous on purpose. */
  function groundBounds(canvas) {
    var z = Iso.cam.zoom;
    var spanX = canvas.clientWidth / (Iso.TILE_W * z) + 4;
    var spanY = canvas.clientHeight / (Iso.TILE_H * z) + 6;
    var cx = Iso.cam.x / Iso.TILE_W, cy = Iso.cam.y / Iso.TILE_H;
    // Screen x is (gx-gy), screen y is (gx+gy); invert to get the grid centre.
    var g0 = (cy + cx), g1 = (cy - cx);
    var span = Math.ceil((spanX + spanY) / 2) + 2;
    return {
      x0: Math.floor(g0 / 2 - span), x1: Math.ceil(g0 / 2 + span),
      y0: Math.floor(g1 / 2 - span), y1: Math.ceil(g1 / 2 + span)
    };
  }

  // ------------------------------------------------------------------- track

  /*
   * The path a rail or road follows, as screen points. Bowed edges curve.
   * `ga` and `gb` are grid points, already trimmed back to each stop's apron
   * by the caller — this function no longer knows about stops at all.
   */
  function edgePoints(canvas, ga, gb, track) {
    /*
     * Both curve kinds go through the same control point and the same sampler.
     * A bow used to be struck in screen space here and nowhere else, which is
     * how it became possible for a rail to curve while the train ran the chord
     * — Iso.trackControl is now the single answer to "where does this edge go",
     * and js/main.js asks the same question of the same function.
     */
    var c = Iso.trackControl(track, ga, gb);
    if (!c) return [Iso.toScreen(ga.x, ga.y, canvas), Iso.toScreen(gb.x, gb.y, canvas)];
    var pts = [];
    for (var j = 0; j <= 24; j++) {
      var g = Iso.quadPoint(ga, c, gb, j / 24);
      pts.push(Iso.toScreen(g.x, g.y, canvas));
    }
    return pts;
  }

  function stroke(ctx, pts, colour, width, dash) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /*
   * Railway track, drawn as track: a ballast bed, sleepers across it, then two
   * running rails. Three passes over the same polyline rather than one thick
   * line, which is the whole difference between "a link" and "a railway".
   */
  function drawRail(ctx, canvas, pts, active, dead, faded, z) {
    var w = z;
    stroke(ctx, pts, C.ballast, 15 * w);                       // ballast bed

    /*
     * Sleepers, spaced along the polyline by arc length. All of them go into
     * one path and get a single stroke — one per sleeper was the single most
     * expensive thing on the map, and there are a few hundred of them a frame.
     * Below a certain zoom they are smaller than a pixel, so they are skipped
     * entirely rather than drawn invisibly.
     */
    if (z > 0.5) {
      ctx.strokeStyle = C.sleeper;
      ctx.lineWidth = 2.4 * w;
      ctx.beginPath();
      var step = 13 * w, carry = 0;
      for (var i = 1; i < pts.length; i++) {
        var dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
        var seg = Math.sqrt(dx * dx + dy * dy) || 1;
        var nx = -dy / seg, ny = dx / seg;
        for (var d = carry; d < seg; d += step) {
          var x = pts[i - 1].x + dx * (d / seg), y = pts[i - 1].y + dy * (d / seg);
          ctx.moveTo(x - nx * 6 * w, y - ny * 6 * w);
          ctx.lineTo(x + nx * 6 * w, y + ny * 6 * w);
        }
        carry = step - ((seg - carry) % step);
      }
      ctx.stroke();
    }

    // Two running rails, offset either side of the centre line.
    var railCol = active ? C.railHot : (dead ? C.dead : C.rail);
    [-3.4, 3.4].forEach(function (off) {
      var side = pts.map(function (p, i) {
        var j = i === 0 ? 1 : i;
        var ax = pts[j].x - pts[j - 1].x, ay = pts[j].y - pts[j - 1].y;
        var L = Math.sqrt(ax * ax + ay * ay) || 1;
        return { x: p.x + (-ay / L) * off * w, y: p.y + (ax / L) * off * w };
      });
      stroke(ctx, side, railCol, (active ? 2.6 : 2) * w);
    });

    if (active) {                                   // a warm glow on the live rail
      ctx.save();
      ctx.globalAlpha = 0.25;
      stroke(ctx, pts, C.railHot, 13 * w);
      ctx.restore();
    }
  }

  /*
   * A road. Flat, tan, with a dashed centre line — visibly not a railway, which
   * is the point: what runs on it is a cart, not the train.
   */
  function drawRoad(ctx, canvas, pts, active, z) {
    var w = z;
    stroke(ctx, pts, C.roadEdge, 12 * w);
    stroke(ctx, pts, C.road, 9.5 * w);
    stroke(ctx, pts, active ? C.railHot : C.roadLine, 1.4 * w, [5 * w, 6 * w]);
  }

  /*
   * A conveyor belt, and the stream of boxes riding it.
   *
   * Drawn in the flat pass, before any building — which is precisely what makes
   * the boxes emerge from inside the Archive and vanish inside EA-S3. Both
   * buildings are painted afterwards and simply cover the ends of the run, so
   * no fade or clip is needed and the depth tie along this axis stops mattering.
   */
  /** How far from a stop's centre its goods entrance stands, in grid units. */
  function entryOffset(stop) {
    if (stop.kind === 'depot' && stop.tech === 'S3') return Sprites.S3_DOCK;
    return 0;
  }

  /*
   * Where a rail has to stop.
   *
   * Every rail used to run to a stop's CENTRE, which meant it spent the whole
   * half-depth of that building buried under it — 30px under a station, 21px
   * under EA-S3 — and the train stood on the same spot the building occupies.
   * The rail now ends at the edge of the stop's apron, which is exactly where a
   * platform is, so the track arrives beside the building instead of inside it.
   *
   * These are the half-extents of each painter's ground slab plus a little, so
   * a rail stops just clear of the paving rather than flush against it.
   */
  var APRON = {
    station:  [0.52, 0.52],
    yard:     [0.58, 0.46],
    depot:    [0.58, 0.48],
    siding:   [0.40, 0.26],
    terminus: [0.46, 0.30],
    external: [0.36, 0.32],
    archive:  [0.64, 0.50],
    archway:  [0, 0],          // the line runs THROUGH it, so never trimmed
    // The works on the new line. All three pin an explicit aside, so a rail
    // never actually gets trimmed at one — these are here so the fallback stays
    // right if a works is ever put back on its own track cell.
    sorting:  [0.74, 0.47],
    filtering:[0.74, 0.47],
    scanning: [0.74, 0.47],
    metering: [0.47, 0.74],    // the second leg's works, rotated with the track
    cognition:[0.74, 0.47],
    // A yard is a building the line runs INTO, so its rail is never trimmed:
    // the last stretch of track belongs under the shed, where the cart vanishes.
    railyard: [0, 0],
    terminal: [0, 0],
    edge:     [0, 0]
  };

  /*
   * A through-station steps aside from its own track.
   *
   * Trimming the rail at the apron is the right answer for an END of a line,
   * but not for a station a train passes through: the platform a train would
   * halt at sits at a LOWER gx+gy than the building, so the building would be
   * painted after it and hide the train at every stop. Moving the building off
   * the line instead fixes both halves at once — the rail never runs under
   * anything, and the train stands in front of its own station where you can
   * see it.
   *
   * The offset is perpendicular to whichever grid axis the station's rails
   * mostly follow, and always toward smaller gx + gy so the building sits
   * BEHIND the track. A platform strip is drawn in the gap.
   */
  var ASIDE = 0.72;
  var asideCache = null;

  function asideOf(flow, stop) {
    if (!asideCache) {
      asideCache = {};
      var axis = {};
      flow.stops.forEach(function (s) { axis[s.id] = { x: 0, y: 0 }; });
      flow.tracks.forEach(function (t) {
        if (t.layer || t.from === t.to || !isRail(t)) return;
        var a = stopById(flow, t.from), b = stopById(flow, t.to);
        if (!a || !b) return;
        var dx = Math.abs(b.grid.x - a.grid.x), dy = Math.abs(b.grid.y - a.grid.y);
        axis[t.from].x += dx; axis[t.from].y += dy;
        axis[t.to].x += dx;   axis[t.to].y += dy;
      });
      flow.stops.forEach(function (s) {
        var a = axis[s.id];
        // Only stations a train runs THROUGH move. Depots, yards, sidings and
        // the Archive are ends of a line: their rails get trimmed instead, and
        // moving them would break the docks the belts and roads aim at.
        // Externals are the end of a spur, not somewhere a train runs through,
        // so they keep their cell and get their rail trimmed instead.
        var through = (s.kind === 'station' || s.kind === 'terminus');
        // An explicit aside in the data always wins: the automatic rule keys on
        // a stop's dominant rail axis, which is the wrong answer whenever a
        // stop's long-haul rails point somewhere other than the track it
        // actually stands beside.
        if (s.aside) { asideCache[s.id] = s.aside; return; }
        asideCache[s.id] = (!through || (a.x === 0 && a.y === 0)) ? { x: 0, y: 0 }
          : (a.x >= a.y ? { x: 0, y: -ASIDE } : { x: -ASIDE, y: 0 });
      });
    }
    return asideCache[stop.id] || { x: 0, y: 0 };
  }

  /** Where a stop's building is actually drawn, which is not always its cell. */
  function placed(flow, stop) {
    var a = asideOf(flow, stop);
    return { x: stop.grid.x + a.x, y: stop.grid.y + a.y };
  }

  /*
   * The point on the line from `stop` toward `toward` where the rail stops. A
   * station that has stepped aside no longer needs trimming — the rail runs
   * clean past it — so its apron is treated as zero.
   */
  function haltPoint(flow, stop, toward) {
    var a = asideOf(flow, stop);
    if (a.x || a.y) return { x: stop.grid.x, y: stop.grid.y };
    var dx = toward.x - stop.grid.x, dy = toward.y - stop.grid.y;
    var L = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / L, uy = dy / L;
    var ap = APRON[stop.kind] || [0.46, 0.40];
    var r = ap[0] * Math.abs(ux) + ap[1] * Math.abs(uy);
    return { x: stop.grid.x + ux * r, y: stop.grid.y + uy * r };
  }

  function drawBelt(ctx, canvas, flow, a, b, now, z, track) {
    var pa = placed(flow, a), pb = placed(flow, b);
    var dxg = pb.x - pa.x, dyg = pb.y - pa.y;
    var lenG = Math.sqrt(dxg * dxg + dyg * dyg) || 1;
    var deck = 9;                                          // belt height, world px
    var speedMult   = (track && track.beltSpeed)   || 1;
    var densityMult = (track && track.beltDensity) || 1;

    /*
     * Stop the belt at the destination's doorway, not at its centre.
     *
     * Running to the centre put the belt under the building: it was occluded by
     * the near wall at ground level, which reads as passing beneath the floor
     * rather than going in through a door. Ending it at the annex's outer face —
     * the same Sprites.S3_DOCK the building places that annex with — and letting
     * it tuck a little way past means the last thing you see is the belt meeting
     * the open bay.
     */
    var eFace = 1 - entryOffset(b) / lenG;
    var eBelt = eFace + 0.10 / lenG;
    var at = function (e) {
      return { x: pa.x + dxg * e, y: pa.y + dyg * e };
    };
    var endG = at(eBelt);
    var p = Iso.toScreen(pa.x, pa.y, canvas);
    var q = Iso.toScreen(endG.x, endG.y, canvas);
    var pd = { x: p.x, y: p.y - deck * z }, qd = { x: q.x, y: q.y - deck * z };

    // Trestles, spaced by the run's actual length rather than a fixed count —
    // a short belt with nine legs is a fence.
    var legs = Math.max(3, Math.round(lenG * eBelt * 2.5));
    for (var i = 1; i < legs; i++) {
      var lp = at(eBelt * (i / legs));
      var lg = Iso.toScreen(lp.x, lp.y, canvas);
      ctx.strokeStyle = '#6a7178';
      ctx.lineWidth = 2.2 * z;
      ctx.beginPath();
      ctx.moveTo(lg.x, lg.y);
      ctx.lineTo(lg.x, lg.y - deck * z);
      ctx.stroke();
    }

    stroke(ctx, [pd, qd], '#4b5157', 13 * z);              // belt bed
    stroke(ctx, [pd, qd], '#6d757c', 10 * z);              // running surface

    // Roller ticks across the belt, sliding along it so the belt reads as
    // moving even where there is no box on it.
    var vx = qd.x - pd.x, vy = qd.y - pd.y;
    var len = Math.sqrt(vx * vx + vy * vy) || 1;
    var nx = -vy / len, ny = vx / len;
    var spacing = 11 * z;
    var slide = ((now || 0) * speedMult / 34) % spacing;
    ctx.strokeStyle = 'rgba(30,36,41,.45)';
    ctx.lineWidth = 1.2 * z;
    ctx.beginPath();
    for (var d = slide; d < len; d += spacing) {
      var cx = pd.x + vx * (d / len), cy = pd.y + vy * (d / len);
      ctx.moveTo(cx - nx * 5 * z, cy - ny * 5 * z);
      ctx.lineTo(cx + nx * 5 * z, cy + ny * 5 * z);
    }
    ctx.stroke();

    stroke(ctx, [pd, qd], '#868e95', 1.4 * z);             // side rail highlight

    /*
     * The stream. The run is extended past both buildings so a box is already
     * on the belt when it comes out from behind the Archive, rather than
     * winking into existence at its wall. The overshoot is asymmetric because
     * the buildings are: the Archive is the larger block and swallows a box
     * well before its centre, while a box run as deep into EA-S3 would come out
     * the far side.
     *
     * The box count is derived, not fixed. The gap is meant to be three
     * box-lengths, and a box's length along the run depends on which way the
     * run goes — a belt along the grid's y axis presents the box's short side,
     * one along x its long side. A hard-coded count that looked right on one
     * bearing came out crowded on another.
     */
    var IN_G = 0.55, OUT_G = 0.48;                         // grid units, not fractions
    var eStart = -IN_G / lenG;
    var eEnd = eFace + OUT_G / lenG;
    var span = eEnd - eStart;

    var ux = Math.abs(dxg / lenG), uy = Math.abs(dyg / lenG);
    var boxLen = 2 * (ux * 0.058 + uy * 0.042);            // grid units along the run
    var BOXES = Math.max(2, Math.round((lenG * span) / (boxLen * 4) * densityMult));
    var phase = ((now || 0) * speedMult / 9000) % (1 / BOXES);
    for (i = 0; i < BOXES; i++) {
      var e = eStart + ((phase + i / BOXES) % 1) * span;
      var bp = at(e);
      Sprites.beltBox(ctx, canvas, bp.x, bp.y, deck, z);
    }
  }

  /*
   * The cargo carousel: two conveyor runs between two buildings, one going and
   * one coming back, with a continuous stream of packages on both.
   *
   * Drawn in the FLAT pass, before any building, and that is the whole trick
   * behind the occlusion the brief asks for: both buildings are painted
   * afterwards and simply cover the ends of the run, so a package reaching a
   * wall goes behind it and one leaving comes out from behind it. No clip, no
   * fade, no per-package depth test — and because the belt is covered rather
   * than truncated, the package is still there, just inside.
   *
   * The two runs are offset either side of the centre line by CAROUSEL_GAUGE,
   * perpendicular in GRID space so the offset lies on the isometric plane and
   * the pair stays parallel however the buildings are placed.
   */
  var CAROUSEL_GAUGE = 0.16;

  function drawCarousel(ctx, canvas, flow, a, b, now, z) {
    var pa = placed(flow, a), pb = placed(flow, b);
    var dxg = pb.x - pa.x, dyg = pb.y - pa.y;
    var lenG = Math.sqrt(dxg * dxg + dyg * dyg) || 1;
    var ux = dxg / lenG, uy = dyg / lenG;
    var nx = -uy * CAROUSEL_GAUGE, ny = ux * CAROUSEL_GAUGE;
    var deck = 9;

    [1, -1].forEach(function (side) {
      var ga = { x: pa.x + nx * side, y: pa.y + ny * side };
      var gb = { x: pb.x + nx * side, y: pb.y + ny * side };
      var p = Iso.toScreen(ga.x, ga.y, canvas);
      var q = Iso.toScreen(gb.x, gb.y, canvas);
      var pd = { x: p.x, y: p.y - deck * z }, qd = { x: q.x, y: q.y - deck * z };

      var legs = Math.max(3, Math.round(lenG * 2.2));
      ctx.strokeStyle = '#6a7178';
      ctx.lineWidth = 2 * z;
      ctx.beginPath();
      for (var i = 1; i < legs; i++) {
        var lp = Iso.toScreen(ga.x + (gb.x - ga.x) * (i / legs),
                              ga.y + (gb.y - ga.y) * (i / legs), canvas);
        ctx.moveTo(lp.x, lp.y);
        ctx.lineTo(lp.x, lp.y - deck * z);
      }
      ctx.stroke();

      stroke(ctx, [pd, qd], '#4b5157', 11 * z);
      stroke(ctx, [pd, qd], '#6d757c', 8.5 * z);

      // Roller ticks, running the way this side of the carousel runs.
      var vx = qd.x - pd.x, vy = qd.y - pd.y;
      var len = Math.sqrt(vx * vx + vy * vy) || 1;
      var rx = -vy / len, ry = vx / len;
      var spacing = 10 * z;
      var slide = side > 0 ? ((now || 0) / 30) % spacing
                           : spacing - (((now || 0) / 30) % spacing);
      ctx.strokeStyle = 'rgba(30,36,41,.45)';
      ctx.lineWidth = 1.1 * z;
      ctx.beginPath();
      for (var d = slide; d < len; d += spacing) {
        var cx = pd.x + vx * (d / len), cy = pd.y + vy * (d / len);
        ctx.moveTo(cx - rx * 4 * z, cy - ry * 4 * z);
        ctx.lineTo(cx + rx * 4 * z, cy + ry * 4 * z);
      }
      ctx.stroke();
      stroke(ctx, [pd, qd], '#868e95', 1.3 * z);

      /*
       * The stream. Both ends of the run are extended past the building walls
       * so a package is already on the belt when it emerges and is still on it
       * when it goes in — a package that starts existing at the wall pops into
       * being, and one that stops at the wall reads as hitting it.
       */
      var OVER = 0.34 / lenG;
      var eStart = -OVER, eEnd = 1 + OVER, span = eEnd - eStart;
      var BOXES = Math.max(3, Math.round(lenG * span / 0.44));
      var phase = ((now || 0) / 7000) % (1 / BOXES);
      for (i = 0; i < BOXES; i++) {
        var k = (phase + i / BOXES) % 1;
        // The far side of the carousel runs the other way, which is what makes
        // the pair a carousel rather than two belts pointing the same way.
        var e = eStart + (side > 0 ? k : 1 - k) * span;
        Sprites.packageBox(ctx, canvas, ga.x + (gb.x - ga.x) * e,
                           ga.y + (gb.y - ga.y) * e, deck, '#c2a06a', z);
      }
    });
  }

  /** The retry loop: a rail that leaves a station and comes back to it. */
  function loopPoints(canvas, stop) {
    var pts = [];
    for (var i = 0; i <= 40; i++) {
      var pt = Iso.loopPoint(stop.grid.x, stop.grid.y, i / 40);
      pts.push(Iso.toScreen(pt.x, pt.y, canvas));
    }
    return pts;
  }

  function drawTrack(ctx, canvas, flow, track, active, now) {
    var a = stopById(flow, track.from), b = stopById(flow, track.to);
    if (!a || !b) return;
    var z = Iso.cam.zoom;
    var dead = track.transport === 'retry' || track.transport === 'dlt';

    if (track.transport === 'retry') {
      drawRail(ctx, canvas, loopPoints(canvas, a), active, true, false, z);
      return;
    }

    if (track.transport === 'belt' || track.transport === 'carousel') {
      if (track.transport === 'carousel') drawCarousel(ctx, canvas, flow, a, b, now, z);
      else drawBelt(ctx, canvas, flow, a, b, now, z, track);
      return;
    }

    /*
     * Rails run to the cells, trimmed back at any end that did not step aside.
     * Roads run building to building, because a road is the last few metres to
     * a door — it has to arrive at the building, not at the track beside it.
     */
    var ga, gb;
    if (isRail(track) || track.layer) {
      ga = haltPoint(flow, a, b.grid);
      gb = haltPoint(flow, b, a.grid);
    } else {
      ga = placed(flow, a);
      gb = placed(flow, b);
    }
    var pts = edgePoints(canvas, ga, gb, track);

    /*
     * Config sync and audit plumbing. Real edges, but not the document's
     * journey, and at full weight they buried the railway. Drawn as a thin
     * dashed service line — a footpath beside the estate rather than a route
     * through it.
     */
    if (track.layer) {
      ctx.save();
      ctx.globalAlpha = track.unverified ? 0.28 : 0.42;
      stroke(ctx, pts, C.faint, 2.2 * z, track.unverified ? [1.5 * z, 6 * z] : [5 * z, 5 * z]);
      ctx.restore();
      return;
    }

    if (isRail(track)) drawRail(ctx, canvas, pts, active, dead, false, z);
    else drawRoad(ctx, canvas, pts, active, z);
  }

  // --------------------------------------------------------------- buildings

  /*
   * Approximate world-pixel height of each building type. Used to size the LST
   * at 1.5× the adjacent building so it is always visibly taller. Values cover
   * the tallest visible element, not just the main hall — cranes, silos, frames
   * and roof kits are included in the estimate.
   */
  /*
   * How far to place the LST from the building's placed centre, in grid units,
   * along the +x / -y diagonal. The default (0.60) clears every standard-sized
   * building; the yards are oversized so their LST needs a wider berth.
   * railyard apron hw ≈ 0.94 (ALERT_HW + 0.14); frame rib at ±0.86 → need > 0.86.
   * terminal apron hw ≈ 0.74 (TERM_HW + 0.12); frame rib at ±0.67 → need > 0.74.
   */
  var LST_OFF = { railyard: 1.10, terminal: 0.95, 'audit-vault': 0.72, 'data-indexer': 0.92 };

  var BUILD_H = {
    archive:       60,    // large external record store
    sorting:       45,    // works stations on the new line (frame is WORKS_H + 12)
    filtering:     45,
    scanning:      45,
    metering:      45,
    cognition:     45,
    railyard:      45,
    terminal:      42,    // B + TERM_H + roof kit ≈ 2 + 26 + 14
    depot:         34,    // S3 / Mongo main hall
    vault:         26,
    siding:        12,
    'audit-vault': 54,    // AUDIT_BASE + AUDIT_H + deck + tower = 3 + 38 + 4 + 24 + 2.5 ≈ LST taller at 81
    'ui-portal':   38,    // 5 + 28 + 5 (25% larger)
    'data-indexer':48,    // B(2) + DI_H(34) + deck(4) + portal ribs
    'es-silo':     42,    // 4 + 10 + 3 + silo 22 + cap 3
    'config-engine':34    // 4 + 26 + 4
  };

  function drawStop(ctx, canvas, stop, state, z, t) {
    if (stop.kind === 'edge') return;                    // a bare end of line
    // The three works on the new line. Same bones, different roof machinery —
    // see the WORKS section of sprites.js.
    if (stop.kind === 'sorting') return Sprites.sortingStation(ctx, canvas, stop, state, z, t);
    if (stop.kind === 'filtering') return Sprites.filterStation(ctx, canvas, stop, state, z, t);
    if (stop.kind === 'scanning') return Sprites.scanStation(ctx, canvas, stop, state, z, t);
    if (stop.kind === 'metering') return Sprites.meterStation(ctx, canvas, stop, state, z, t);
    if (stop.kind === 'cognition') return Sprites.cognitionWorks(ctx, canvas, stop, state, z, t);
    // Yards: buildings the line runs into rather than past.
    if (stop.kind === 'railyard') return Sprites.railYard(ctx, canvas, stop, state, z, t);
    if (stop.kind === 'terminal') return Sprites.terminalYard(ctx, canvas, stop, state, z, t);
    if (stop.kind === 'archive') return Sprites.archive(ctx, canvas, stop, state, z, t);
    if (stop.kind === 'station') return Sprites.station(ctx, canvas, stop, state, z);
    if (stop.kind === 'yard') return Sprites.depot(ctx, canvas, stop, state, z);
    if (stop.kind === 'siding') return Sprites.siding(ctx, canvas, stop, state, z);
    if (stop.kind === 'terminus') return Sprites.terminus(ctx, canvas, stop, state, z);
    if (stop.kind === 'external') return Sprites.external(ctx, canvas, stop, state, z);
    if (stop.kind === 'depot') {
      return stop.tech === 'MongoDB' ? Sprites.vault(ctx, canvas, stop, state, z)
                                     : Sprites.s3Depot(ctx, canvas, stop, state, z, t);
    }
    // New infrastructure added in the railway-map refactor.
    if (stop.kind === 'audit-vault')   return Sprites.auditVault(ctx, canvas, stop, state, z, t);
    if (stop.kind === 'ui-portal')     return Sprites.uiPortalSprite(ctx, canvas, stop, state, z, t);
    if (stop.kind === 'data-indexer')  return Sprites.dataIndexer(ctx, canvas, stop, state, z, t);
    if (stop.kind === 'es-silo')       return Sprites.esSilo(ctx, canvas, stop, state, z, t);
    if (stop.kind === 'config-engine') return Sprites.configEngine(ctx, canvas, stop, state, z, t);
    return Sprites.station(ctx, canvas, stop, state, z);
  }

  /*
   * Trees, placed on cells the estate does not use. Positions come from a hash
   * of the cell, so the countryside is the same every frame and every reload
   * without storing anything.
   */
  var sceneryCache = { key: '', list: [] };

  function scenery(bounds, occupied) {
    // Recomputed only when the visible span changes, not every frame — the
    // result depends on nothing else, because the hash makes it deterministic.
    var key = bounds.x0 + ':' + bounds.x1 + ':' + bounds.y0 + ':' + bounds.y1;
    if (sceneryCache.key === key) return sceneryCache.list;

    var out = [];
    for (var gy = bounds.y0; gy <= bounds.y1 && out.length < 140; gy++) {
      for (var gx = bounds.x0; gx <= bounds.x1 && out.length < 140; gx++) {
        if (occupied[gx + ':' + gy]) continue;
        var h = Sprites.hash(gx + ',' + gy);
        if ((h % 100) >= 10) continue;                       // ~10% of free cells
        out.push({
          gx: gx + (((h >> 7) % 100) / 100 - 0.5) * 0.6,
          gy: gy + (((h >> 13) % 100) / 100 - 0.5) * 0.6,
          seed: h
        });
      }
    }
    sceneryCache = { key: key, list: out };
    return out;
  }

  /*
   * Which cells the railway owns, so a tree never grows through a platform or
   * up between the rails. Depends only on the model, so it is built once.
   */
  var occupiedCache = null;

  function occupiedCells(flow) {
    if (occupiedCache) return occupiedCache;
    var occ = {};
    flow.stops.forEach(function (s) {
      var q = placed(flow, s);
      for (var dx = -1; dx <= 1; dx++) {
        for (var dy = -1; dy <= 1; dy++) {
          occ[Math.round(q.x + dx) + ':' + Math.round(q.y + dy)] = true;
          occ[(s.grid.x + dx) + ':' + (s.grid.y + dy)] = true;   // and its track cell
        }
      }
    });
    flow.tracks.forEach(function (t) {
      var a = stopById(flow, t.from), b = stopById(flow, t.to);
      if (!a || !b) return;
      var n = Math.max(Math.abs(b.grid.x - a.grid.x), Math.abs(b.grid.y - a.grid.y)) * 2 + 1;
      for (var i = 0; i <= n; i++) {
        var gx = Math.round(a.grid.x + (b.grid.x - a.grid.x) * (i / n));
        var gy = Math.round(a.grid.y + (b.grid.y - a.grid.y) * (i / n));
        occ[gx + ':' + gy] = true;
      }
    });
    occupiedCache = occ;
    return occ;
  }

  // -------------------------------------------------------------------- draw

  var identitiesDone = false;

  function draw(ctx, canvas, flow, state) {
    var z = Iso.cam.zoom;

    // Hand every stop its own roof colour and silhouette feature, once, in the
    // model's own order so the assignment is stable between reloads.
    if (!identitiesDone) {
      Sprites.assign(flow.stops.map(function (s) { return s.id; }));
      identitiesDone = true;
    }
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    var bounds = groundBounds(canvas);
    drawGround(ctx, canvas, bounds);

    var occupied = occupiedCells(flow);

    flow.tracks.forEach(function (t) {
      if (t.layer && state.hideLayers) return;
      drawTrack(ctx, canvas, flow, t, state.activeTrack === t.from + '>' + t.to, state.now);
    });

    /*
     * The standing-up pass. Everything gets a depth key of gx + gy — the
     * painter's algorithm on the footprint's front corner — so a building in
     * front correctly hides one behind, and the train passes behind the far
     * platform and in front of the near one.
     */
    var drawables = [];
    if (!state.hideScenery) {
      scenery(bounds, occupied).forEach(function (t) {
        drawables.push({ key: t.gx + t.gy, paint: function () {
          Sprites.tree(ctx, canvas, t.gx, t.gy, t.seed, z);
        } });
      });
    }
    flow.stops.forEach(function (s) {
      var pos = placed(flow, s);
      var aside = asideOf(flow, s);

      /*
       * The archway straddles the track, so it is two drawables: the far pier
       * goes down before the train and the near pier after it. Sorted as one
       * lump the train would always land in front of the whole arch and never
       * look like it was inside it.
       */
      if (s.kind === 'archway') {
        drawables.push({ key: pos.x - Sprites.ARCH_SPAN + pos.y, paint: function () {
          Sprites.archway(ctx, canvas, s, state.stopState(s.id), z, 'back');
        } });
        drawables.push({ key: pos.x + Sprites.ARCH_SPAN + pos.y, paint: function () {
          Sprites.archway(ctx, canvas, s, state.stopState(s.id), z, 'front');
        } });
        // Gateway LST — sorted just behind the front pier so the arch frames it.
        drawables.push({ key: pos.x + pos.y - 0.1, paint: function () {
          var loff = LST_OFF[s.kind] || 0.60;
          var lstE = (state.lstEnergy || {})[s.id] || 0;
          Sprites.latticeTower(ctx, canvas, pos.x + loff, pos.y - loff,
                               (BUILD_H[s.kind] || 36) * 1.5 * z, z,
                               { energy: lstE, now: state.now });
        } });
        return;
      }
      drawables.push({ key: pos.x + pos.y, paint: function () {
        // A station that stepped aside gets a platform strip bridging the gap
        // back to its track, so the arrangement reads building / platform /
        // track rather than a building marooned beside a line.
        if (aside.x || aside.y) Sprites.platformStrip(ctx, canvas, s, aside, z);
        drawStop(ctx, canvas, { id: s.id, name: s.name, kind: s.kind, tech: s.tech,
                                role: s.role, axis: s.axis, kit: s.kit, grid: pos },
                 state.stopState(s.id), z, state.now);
        /*
         * Lattice Steel Tower, drawn within the same sorted slot as its building
         * so it never slips behind. Positioned at (+0.60, -0.60) from the placed
         * centre — 70 screen-px to the right at default zoom, outside every
         * building's apron — with height set to 1.5× the building's world-pixel
         * height so it is always visibly taller. Edge nodes (bare rail ends) are
         * skipped; they have no structure to attach to.
         */
        if (s.kind !== 'edge') {
          var loff = LST_OFF[s.kind] || 0.60;
          var lstE = (state.lstEnergy || {})[s.id] || 0;
          Sprites.latticeTower(ctx, canvas, pos.x + loff, pos.y - loff,
                               (BUILD_H[s.kind] || 36) * 1.5 * z, z,
                               { energy: lstE, now: state.now });
        }
      } });
    });
    /*
     * Per-station short rail segments drawn at each aside station's depth,
     * so the rail appears on top of the platform strip rather than under it.
     *
     * The previous approach re-drew the FULL track keyed at the FAR station's
     * depth (the Math.max across connected asides). Two bugs followed:
     *   (a) a track keyed at the far station's depth was painted above the
     *       flatbed anywhere between the two stations;
     *   (b) tracks running INTO a yard (e.g. quota → alerting) were re-drawn
     *       on top of the building, breaking the "cart disappears inside" look.
     *
     * Short segments fix both. Each segment spans ±SEG_HALF around its aside
     * station only, keyed at that station's own depth. The flatbed at that
     * halt point is at station.depth + 0.015 > segment depth + 0.01, so the
     * flatbed always paints above the segment. And the segment never reaches
     * the flatbed at a different station because the drawn line doesn't extend
     * that far.
     */
    var SEG_HALF = 0.90;
    flow.stops.forEach(function (s) {
      var aside = asideOf(flow, s);
      if (!aside.x && !aside.y) return;
      var stationDepth = s.grid.x + s.grid.y + 0.01;
      flow.tracks.forEach(function (t) {
        if (t.layer && state.hideLayers) return;
        if (t.transport === 'belt' || t.transport === 'carousel') return;
        if (t.from !== s.id && t.to !== s.id) return;
        if (t.from === t.to) return;            // retry loop — no strip to cover
        var otherId = t.from === s.id ? t.to : t.from;
        var other = stopById(flow, otherId);
        if (!other) return;
        // Tracks that enter a yard must disappear under the building rather
        // than be re-drawn above it.
        if (other.kind === 'railyard' || other.kind === 'terminal') return;
        // Use the control-point direction rather than the straight-line vector
        // to the other stop. A curved track (e.g. evaluator → quota) departs
        // horizontally from evaluator even though quota's grid cell is diagonal;
        // the straight-line vector would draw a diagonal segment across the strip.
        var ctrl = Iso.trackControl(t, s.grid, other.grid);
        var toX = ctrl ? ctrl.x : other.grid.x;
        var toY = ctrl ? ctrl.y : other.grid.y;
        var dx = toX - s.grid.x, dy = toY - s.grid.y;
        var L = Math.sqrt(dx * dx + dy * dy) || 1;
        var ux = dx / L, uy = dy / L;
        // Only draw the segment if the track leaves along the station's main
        // axis (perpendicular to the aside direction). Diagonal spurs would
        // draw a stripe across the platform strip that was never covered by it.
        var mainIsX = Math.abs(aside.y) > Math.abs(aside.x);
        if (mainIsX ? Math.abs(uy) >= Math.abs(ux) : Math.abs(ux) >= Math.abs(uy)) return;
        var ga = { x: s.grid.x - ux * SEG_HALF, y: s.grid.y - uy * SEG_HALF };
        var gb = { x: s.grid.x + ux * SEG_HALF, y: s.grid.y + uy * SEG_HALF };
        var active = state.activeTrack === t.from + '>' + t.to;
        var dead = t.transport === 'retry' || t.transport === 'dlt';
        var rail = isRail(t);
        drawables.push({ key: stationDepth,
          paint: (function (ga2, gb2, act, d, r) { return function () {
            var pts = [Iso.toScreen(ga2.x, ga2.y, canvas),
                       Iso.toScreen(gb2.x, gb2.y, canvas)];
            if (r) drawRail(ctx, canvas, pts, act, d, false, z);
            else drawRoad(ctx, canvas, pts, act, z);
          }; })(ga, gb, active, dead, rail)
        });
      });
    });
    /*
     * Packages walking a platform between a flatbed and a doorway. Sorted with
     * everything else rather than painted over the top, so a package crossing
     * in front of a building is in front of it and one that has reached the
     * door is behind it — which is what makes it disappear INTO the building
     * rather than fade out against its wall.
     */
    (state.parcels || []).forEach(function (p) {
      drawables.push({ key: p.gx + p.gy + 0.012, paint: function () {
        Sprites.packageBox(ctx, canvas, p.gx, p.gy, p.h, p.tint, z, p.alpha);
      } });
    });
    (state.flatbeds || []).forEach(function (f) {
      // `key` is set by the engine only when the flatbed has driven inside a
      // yard, where it must be painted BEFORE the shed instead of after it.
      drawables.push({ key: f.key === null || f.key === undefined ? f.gx + f.gy + 0.015 : f.key,
                       paint: function () {
        var a = f.alpha !== undefined ? f.alpha : 1;
        if (a < 1) { ctx.save(); ctx.globalAlpha = a; }
        Sprites.flatbed(ctx, canvas, f.gx, f.gy, f.heading, z,
                        { load: f.load, tint: f.tint });
        if (a < 1) ctx.restore();
      } });
    });
    // The tunnel mouth sits on the approach track and occludes the flatbed while
    // it is still "inside" (depth key +0.05 ensures it sorts in front of the
    // flatbed at the same grid position, whose key is gx + gy + 0.015).
    drawables.push({
      key: Sprites.TUNNEL_GX + Sprites.TUNNEL_GY + 0.05,
      paint: function () {
        Sprites.tunnelMouth(ctx, canvas, Sprites.TUNNEL_GX, Sprites.TUNNEL_GY, z);
      }
    });
    drawables.sort(function (a, b) { return a.key - b.key; });
    drawables.forEach(function (d) { d.paint(); });

    /*
     * Overhead transmission wires — drawn after all buildings so they read as
     * cables strung high in the air above the estate. Each wire runs from the
     * LST apex of its station to the Centralized Audit LST apex. The base cable
     * is always visible; the glow and bolt appear only when that stage is active.
     */
    var WIRE_STOPS = ['gateway', 'qualifier', 'filter', 'evaluator',
                      'quota', 'alerting', 'echo-engine'];
    var auditSt = stopById(flow, 'audit');
    if (auditSt) {
      var auLoff  = LST_OFF[auditSt.kind] || 0.60;
      var auLstH  = (BUILD_H[auditSt.kind] || 36) * 1.5 * z;
      var auFoot  = Iso.toScreen(auditSt.grid.x + auLoff, auditSt.grid.y - auLoff, canvas);
      var auApex  = { x: auFoot.x, y: auFoot.y - auLstH };
      WIRE_STOPS.forEach(function (wid) {
        var ws = stopById(flow, wid);
        if (!ws) return;
        var wpos  = placed(flow, ws);
        var wloff = LST_OFF[ws.kind] || 0.60;
        var wlstH = (BUILD_H[ws.kind] || 36) * 1.5 * z;
        var wfoot = Iso.toScreen(wpos.x + wloff, wpos.y - wloff, canvas);
        var wapex = { x: wfoot.x, y: wfoot.y - wlstH };
        var wireE = (state.wireEnergy || {})[wid] || 0;
        var wZapT = state.zapT ? (state.zapT[wid] !== undefined ? state.zapT[wid] : -1) : -1;

        // Support poles spaced every 3 grid units along the span. The pole top
        // sits exactly on the full-span bezier, and those same (x, y) points
        // are passed to transmissionWire as waypoints so each cable segment sags
        // between its own pair of support points and visually touches both.
        var pmx   = (wapex.x + auApex.x) / 2;
        var pspan = Math.hypot(auApex.x - wapex.x, auApex.y - wapex.y);
        var psag  = Math.max(6 * z, Math.min(36 * z, pspan * 0.05));
        var pmy   = Math.max(wapex.y, auApex.y) + psag;
        var gridDist = Math.hypot(auditSt.grid.x - wpos.x, auditSt.grid.y - wpos.y);
        var nPoles = Math.max(0, Math.floor(gridDist / 3) - 1);
        var polePts = [];
        for (var pi = 1; pi <= nPoles; pi++) {
          var pt = pi / (nPoles + 1);
          var pu = 1 - pt;
          var pbx = pu*pu*wapex.x + 2*pu*pt*pmx + pt*pt*auApex.x;
          var pby = pu*pu*wapex.y + 2*pu*pt*pmy + pt*pt*auApex.y;
          polePts.push({ x: pbx, y: pby });
          Sprites.supportPole(ctx, pbx, pby, z, wireE, wZapT, state.now);
        }

        // Pass polePts so the wire is segmented pole-to-pole; each short span
        // sags naturally rather than one long arc skipping over the supports.
        Sprites.transmissionWire(ctx, wapex.x, wapex.y, auApex.x, auApex.y,
                                 wireE, wZapT, z, state.now, polePts);
      });
    }

    /*
     * Inbound forward wires — evaluator→indexer and alerting→indexer. Each
     * fires during the second half of its transmit phase, after the bolt has
     * arrived at Audit. Support poles follow the same 3-grid-unit rule.
     */
    var INDEXER_WIRE_SOURCES = ['evaluator', 'alerting'];
    var indexerSt = stopById(flow, 'indexer');
    if (indexerSt) {
      var ixPos  = placed(flow, indexerSt);
      var ixLoff = LST_OFF[indexerSt.kind] || 0.60;
      var ixLstH = (BUILD_H[indexerSt.kind] || 36) * 1.5 * z;
      var ixFoot = Iso.toScreen(ixPos.x + ixLoff, ixPos.y - ixLoff, canvas);
      var ixApex = { x: ixFoot.x, y: ixFoot.y - ixLstH };

      INDEXER_WIRE_SOURCES.forEach(function (sid) {
        var src = stopById(flow, sid);
        if (!src) return;
        var sPos  = placed(flow, src);
        var sLoff = LST_OFF[src.kind] || 0.60;
        var sLstH = (BUILD_H[src.kind] || 36) * 1.5 * z;
        var sFoot = Iso.toScreen(sPos.x + sLoff, sPos.y - sLoff, canvas);
        var sApex = { x: sFoot.x, y: sFoot.y - sLstH };

        var wireE = (state.indexerWireEnergy || {})[sid] || 0;
        var wZapT = state.indexerZapT ? (state.indexerZapT[sid] !== undefined ? state.indexerZapT[sid] : -1) : -1;

        var pmx      = (sApex.x + ixApex.x) / 2;
        var pspan    = Math.hypot(ixApex.x - sApex.x, ixApex.y - sApex.y);
        var psag     = Math.max(6 * z, Math.min(36 * z, pspan * 0.05));
        var pmy      = Math.max(sApex.y, ixApex.y) + psag;
        var gridDist = Math.hypot(indexerSt.grid.x - sPos.x, indexerSt.grid.y - sPos.y);
        var nPoles   = Math.max(0, Math.floor(gridDist / 3) - 1);
        var polePts  = [];
        for (var pi = 1; pi <= nPoles; pi++) {
          var pt = pi / (nPoles + 1);
          var pu = 1 - pt;
          var pbx = pu*pu*sApex.x + 2*pu*pt*pmx + pt*pt*ixApex.x;
          var pby = pu*pu*sApex.y + 2*pu*pt*pmy + pt*pt*ixApex.y;
          polePts.push({ x: pbx, y: pby });
          Sprites.supportPole(ctx, pbx, pby, z, wireE, wZapT, state.now);
        }

        Sprites.transmissionWire(ctx, sApex.x, sApex.y, ixApex.x, ixApex.y,
                                 wireE, wZapT, z, state.now, polePts);
      });
    }

    /*
     * UI Portal wire network. Five overhead cables connect the Portal LST to
     * the Gateway, Indexer, Config Curator, Review Service, and Reporting LSTs.
     * The base cables are always visible. During the broadcast sequence, bolts
     * travel outward from the Portal simultaneously on all five wires, hold for
     * 1 s, then all five targets fire return bolts back. Support poles are
     * placed every 3 grid units per the established rule (Portal moved to x=5,
     * so some runs are long enough to warrant 1–4 poles).
     */
    var PORTAL_WIRE_STOPS = ['gateway', 'indexer', 'config-curator', 'review-service', 'reporting'];
    var uiPSt = stopById(flow, 'ui-portal');
    if (uiPSt) {
      var upPos  = placed(flow, uiPSt);
      var upLoff = LST_OFF[uiPSt.kind] || 0.60;
      var upLstH = (BUILD_H[uiPSt.kind] || 36) * 1.5 * z;
      var upFoot = Iso.toScreen(upPos.x + upLoff, upPos.y - upLoff, canvas);
      var upApex = { x: upFoot.x, y: upFoot.y - upLstH };

      var pSt      = state.portalState || {};
      var pOutE    = pSt.wireE    || 0;
      var pOutZap  = (pSt.zapT    !== undefined) ? pSt.zapT    : -1;
      var pRetE    = pSt.retWireE || 0;
      var pRetZap  = (pSt.retZapT !== undefined) ? pSt.retZapT : -1;
      // Merge outgoing and return into a single transmissionWire call per wire.
      // Return bolt travels target→portal, which is 1→0 in the portal→target
      // frame, so retZapT is flipped: 1 - retZapT.
      var pActiveE   = Math.max(pOutE, pRetE);
      var pActiveZap = pOutZap >= 0 ? pOutZap : pRetZap >= 0 ? 1 - pRetZap : -1;

      PORTAL_WIRE_STOPS.forEach(function (pwid) {
        var pwStop = stopById(flow, pwid);
        if (!pwStop) return;
        var pwPos  = placed(flow, pwStop);
        var pwLoff = LST_OFF[pwStop.kind] || 0.60;
        var pwLstH = (BUILD_H[pwStop.kind] || 36) * 1.5 * z;
        var pwFoot = Iso.toScreen(pwPos.x + pwLoff, pwPos.y - pwLoff, canvas);
        var pwApex = { x: pwFoot.x, y: pwFoot.y - pwLstH };

        var pmx2      = (upApex.x + pwApex.x) / 2;
        var pspan2    = Math.hypot(pwApex.x - upApex.x, pwApex.y - upApex.y);
        var psag2     = Math.max(6 * z, Math.min(36 * z, pspan2 * 0.05));
        var pmy2      = Math.max(upApex.y, pwApex.y) + psag2;
        var gridDist2 = Math.hypot(uiPSt.grid.x - pwPos.x, uiPSt.grid.y - pwPos.y);
        var nPoles2   = Math.max(0, Math.floor(gridDist2 / 3) - 1);
        var polePts2  = [];
        for (var pi2 = 1; pi2 <= nPoles2; pi2++) {
          var pt2 = pi2 / (nPoles2 + 1);
          var pu2 = 1 - pt2;
          var pbx2 = pu2*pu2*upApex.x + 2*pu2*pt2*pmx2 + pt2*pt2*pwApex.x;
          var pby2 = pu2*pu2*upApex.y + 2*pu2*pt2*pmy2 + pt2*pt2*pwApex.y;
          polePts2.push({ x: pbx2, y: pby2 });
          Sprites.supportPole(ctx, pbx2, pby2, z, pActiveE, pActiveZap, state.now);
        }

        Sprites.transmissionWire(ctx, upApex.x, upApex.y, pwApex.x, pwApex.y,
                                 pActiveE, pActiveZap, z, state.now, polePts2);
      });
    }
  }

  return { draw: draw, colours: C, placed: placed, asideOf: asideOf,
           haltPoint: haltPoint };
})();
