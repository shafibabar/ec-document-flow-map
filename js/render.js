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

  function drawBelt(ctx, canvas, flow, a, b, now, z) {
    var pa = placed(flow, a), pb = placed(flow, b);
    var dxg = pb.x - pa.x, dyg = pb.y - pa.y;
    var lenG = Math.sqrt(dxg * dxg + dyg * dyg) || 1;
    var deck = 9;                                          // belt height, world px

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
    var slide = ((now || 0) / 34) % spacing;
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
    var IN_G = 0.36, OUT_G = 0.34;                         // grid units, not fractions
    var eStart = -IN_G / lenG;
    var eEnd = eFace + OUT_G / lenG;
    var span = eEnd - eStart;

    var ux = Math.abs(dxg / lenG), uy = Math.abs(dyg / lenG);
    var boxLen = 2 * (ux * 0.058 + uy * 0.042);            // grid units along the run
    var BOXES = Math.max(2, Math.round((lenG * span) / (boxLen * 4)));
    var phase = ((now || 0) / 9000) % (1 / BOXES);
    for (i = 0; i < BOXES; i++) {
      var e = eStart + ((phase + i / BOXES) % 1) * span;
      var bp = at(e);
      Sprites.beltBox(ctx, canvas, bp.x, bp.y, deck, z);
    }
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

    if (track.transport === 'belt') {
      drawBelt(ctx, canvas, flow, a, b, now, z);
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

  function drawStop(ctx, canvas, stop, state, z, t) {
    if (stop.kind === 'edge') return;                    // a bare end of line
    // The three works on the new line. Same bones, different roof machinery —
    // see the WORKS section of sprites.js.
    if (stop.kind === 'sorting') return Sprites.sortingStation(ctx, canvas, stop, state, z, t);
    if (stop.kind === 'filtering') return Sprites.filterStation(ctx, canvas, stop, state, z, t);
    if (stop.kind === 'scanning') return Sprites.scanStation(ctx, canvas, stop, state, z, t);
    if (stop.kind === 'archive') return Sprites.archive(ctx, canvas, stop, state, z, t);
    if (stop.kind === 'station') return Sprites.station(ctx, canvas, stop, state, z);
    if (stop.kind === 'yard') return Sprites.depot(ctx, canvas, stop, state, z);
    if (stop.kind === 'siding') return Sprites.siding(ctx, canvas, stop, state, z);
    if (stop.kind === 'terminus') return Sprites.terminus(ctx, canvas, stop, state, z);
    if (stop.kind === 'external') return Sprites.external(ctx, canvas, stop, state, z);
    if (stop.kind === 'depot') {
      return stop.tech === 'MongoDB' ? Sprites.vault(ctx, canvas, stop, state, z)
                                     : Sprites.s3Depot(ctx, canvas, stop, state, z);
    }
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
        return;
      }
      drawables.push({ key: pos.x + pos.y, paint: function () {
        // A station that stepped aside gets a platform strip bridging the gap
        // back to its track, so the arrangement reads building / platform /
        // track rather than a building marooned beside a line.
        if (aside.x || aside.y) Sprites.platformStrip(ctx, canvas, s, aside, z);
        drawStop(ctx, canvas, { id: s.id, name: s.name, kind: s.kind, tech: s.tech,
                                role: s.role, grid: pos },
                 state.stopState(s.id), z, state.now);
      } });
    });
    (state.carts || []).forEach(function (c) {
      drawables.push({ key: c.gx + c.gy + 0.01, paint: function () {
        Sprites.cart(ctx, canvas, c.gx, c.gy, c.tint, z, c.load);
      } });
    });
    (state.sceneTrains || []).forEach(function (t) {
      drawables.push({ key: t.gx + t.gy + 0.015, paint: function () {
        Sprites.train(ctx, canvas, t.gx, t.gy, t.heading, t.cargo, z, { puff: t.puff });
      } });
    });
    if (state.cart) {
      drawables.push({ key: state.cart.gx + state.cart.gy + 0.02, paint: function () {
        Sprites.train(ctx, canvas, state.cart.gx, state.cart.gy,
          state.cart.heading || { x: 1, y: 0 }, state.cart.cargo, z,
          { puff: state.cart.puff || 0 });
      } });
    }

    drawables.sort(function (a, b) { return a.key - b.key; });
    drawables.forEach(function (d) { d.paint(); });
  }

  return { draw: draw, colours: C, placed: placed, asideOf: asideOf };
})();
