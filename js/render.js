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
           t.transport === 'retry' || t.transport === 'dlt';
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

  /** The path a rail or road follows, as screen points. Bowed edges curve. */
  function edgePoints(canvas, a, b, bow) {
    var p = Iso.toScreen(a.grid.x, a.grid.y, canvas);
    var q = Iso.toScreen(b.grid.x, b.grid.y, canvas);
    if (!bow) return [p, q];
    var mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    var vx = q.x - p.x, vy = q.y - p.y;
    var len = Math.sqrt(vx * vx + vy * vy) || 1;
    var cx = mx + (-vy / len) * Iso.TILE_H * bow * Iso.cam.zoom;
    var cy = my + (vx / len) * Iso.TILE_H * bow * Iso.cam.zoom;
    var pts = [];
    for (var i = 0; i <= 20; i++) {                    // sample the quadratic
      var t = i / 20, u = 1 - t;
      pts.push({ x: u * u * p.x + 2 * u * t * cx + t * t * q.x,
                 y: u * u * p.y + 2 * u * t * cy + t * t * q.y });
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

  /** The retry loop: a rail that leaves a station and comes back to it. */
  function loopPoints(canvas, stop) {
    var pts = [];
    for (var i = 0; i <= 40; i++) {
      var pt = Iso.loopPoint(stop.grid.x, stop.grid.y, i / 40);
      pts.push(Iso.toScreen(pt.x, pt.y, canvas));
    }
    return pts;
  }

  function drawTrack(ctx, canvas, flow, track, active) {
    var a = stopById(flow, track.from), b = stopById(flow, track.to);
    if (!a || !b) return;
    var z = Iso.cam.zoom;
    var dead = track.transport === 'retry' || track.transport === 'dlt';

    if (track.transport === 'retry') {
      drawRail(ctx, canvas, loopPoints(canvas, a), active, true, false, z);
      return;
    }

    var pts = edgePoints(canvas, a, b, track.bow);

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
    if (stop.kind === 'archive') return Sprites.archive(ctx, canvas, stop, state, z, t);
    if (stop.kind === 'station') return Sprites.station(ctx, canvas, stop, state, z);
    if (stop.kind === 'yard') return Sprites.depot(ctx, canvas, stop, state, z);
    if (stop.kind === 'siding') return Sprites.siding(ctx, canvas, stop, state, z);
    if (stop.kind === 'terminus') return Sprites.terminus(ctx, canvas, stop, state, z);
    if (stop.kind === 'external') return Sprites.external(ctx, canvas, stop, state, z);
    if (stop.kind === 'depot') {
      return stop.tech === 'MongoDB' ? Sprites.vault(ctx, canvas, stop, state, z)
                                     : Sprites.warehouse(ctx, canvas, stop, state, z);
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
      for (var dx = -1; dx <= 1; dx++) {
        for (var dy = -1; dy <= 1; dy++) occ[(s.grid.x + dx) + ':' + (s.grid.y + dy)] = true;
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
      drawTrack(ctx, canvas, flow, t, state.activeTrack === t.from + '>' + t.to);
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
      drawables.push({ key: s.grid.x + s.grid.y, paint: function () {
        drawStop(ctx, canvas, s, state.stopState(s.id), z, state.now);
      } });
    });
    (state.carts || []).forEach(function (c) {
      drawables.push({ key: c.gx + c.gy + 0.01, paint: function () {
        Sprites.cart(ctx, canvas, c.gx, c.gy, c.tint, z, c.load);
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

  return { draw: draw, colours: C };
})();
