'use strict';
/*
 * render.js — draws the railway.
 *
 * Tracks are Kafka topics. Stations are K8s services. Depots are S3 and Mongo.
 * Classification yards are the Elasticsearch indexes. The cart carries one
 * document, and what it carries is drawn on it, because the cargo changing at
 * every stop is the whole point.
 *
 * Transport is legible without reading a label:
 *   kafka    solid rail with sleepers
 *   cdc      dashed rail — the outbox pattern; nobody publishes it directly
 *   s3       thin spur to a depot
 *   elastic  thick spur into a yard
 *   retry    a loop siding back into the same station, in warning red
 *   dlt      a short dead end with a buffer stop; nothing leaves it
 *   mongo    thin spur to a document store
 */
var Render = (function () {

  var C = {
    ground:   '#0d1117',
    tile:     '#161d27',
    tileEdge: '#1f2937',
    rail:     '#3f4d63',
    railHot:  '#f59e0b',
    sleeper:  '#2b3546',
    station:  '#1e293b',
    stationT: '#334155',
    text:     '#e6edf6',
    dim:      '#93a4bd',
    yard:     '#16324a',
    depot:    '#26303f',
    // The failure family. Kept clearly apart from the amber "active" colour so
    // that a hot retry rail never reads as an ordinary hop going well.
    railDead:    '#6b3340',
    railDeadHot: '#f87171',
    siding:      '#3b1d24',
    sidingEdge:  '#7f1d1d',
    // A terminus is where the surveillance line ends without anything having
    // gone wrong. Deliberately grey rather than red: not qualified is a normal
    // outcome, and colouring it like a failure would teach the wrong thing.
    terminus:     '#2a2f3a',
    terminusEdge: '#6b7280',
    external:     '#1a2430',
    externalEdge: '#3f5470'
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function stopById(flow, id) {
    for (var i = 0; i < flow.stops.length; i++) if (flow.stops[i].id === id) return flow.stops[i];
    return null;
  }

  function drawGround(ctx, canvas, flow) {
    // A tile under each stop, plus a one-tile skirt, so the estate reads as a
    // place rather than as floating boxes.
    var seen = {};
    flow.stops.forEach(function (s) {
      for (var dx = -1; dx <= 1; dx++) {
        for (var dy = -1; dy <= 1; dy++) {
          var k = (s.grid.x + dx) + ':' + (s.grid.y + dy);
          if (seen[k]) continue;
          seen[k] = true;
          Iso.tilePath(ctx, s.grid.x + dx, s.grid.y + dy, canvas, 2);
          ctx.fillStyle = (dx === 0 && dy === 0) ? C.tile : C.ground;
          ctx.fill();
          ctx.strokeStyle = C.tileEdge;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    });
  }

  /*
   * The loop siding a retry runs round. Traced by sampling Iso.loopPoint — the
   * exact curve js/main.js animates the cart along — so the rail is guaranteed
   * to be under the cart rather than approximately near it. Projecting each
   * sample individually is also what keeps the circle correctly foreshortened
   * into an isometric ellipse.
   */
  function loopPath(ctx, canvas, stop) {
    var SEGMENTS = 48;
    for (var i = 0; i <= SEGMENTS; i++) {
      var pt = Iso.loopPoint(stop.grid.x, stop.grid.y, i / SEGMENTS);
      var s = Iso.toScreen(pt.x, pt.y, canvas);
      if (i === 0) { ctx.beginPath(); ctx.moveTo(s.x, s.y); }
      else ctx.lineTo(s.x, s.y);
    }
  }

  /*
   * A buffer stop: the barrier that says a line ends here. Solid red on a DLT,
   * where the document is stuck for good; dashed grey on a terminus, where the
   * surveillance line ends but a record still travels on.
   */
  function drawBufferStop(ctx, canvas, stop, colour, dashed) {
    var s = Iso.toScreen(stop.grid.x, stop.grid.y, canvas);
    var z = Iso.cam.zoom;
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.lineWidth = 4 * z;
    ctx.lineCap = 'round';
    if (dashed) ctx.setLineDash([5 * z, 4 * z]);
    ctx.beginPath();
    ctx.moveTo(s.x - 22 * z, s.y - 10 * z);
    ctx.lineTo(s.x + 22 * z, s.y - 10 * z);
    ctx.stroke();
    ctx.restore();
  }

  function drawTrack(ctx, canvas, flow, track, active) {
    var a = stopById(flow, track.from), b = stopById(flow, track.to);
    if (!a || !b) return;
    var p = Iso.toScreen(a.grid.x, a.grid.y, canvas);
    var q = Iso.toScreen(b.grid.x, b.grid.y, canvas);
    var z = Iso.cam.zoom;
    var dead = track.transport === 'retry' || track.transport === 'dlt';

    ctx.save();
    if (track.transport === 'cdc') {
      ctx.setLineDash([10 * z, 8 * z]);
    } else if (track.transport === 's3' || track.transport === 'mongo') {
      ctx.setLineDash([3 * z, 6 * z]);
    } else if (track.transport === 'dlt') {
      ctx.setLineDash([7 * z, 5 * z]);
    }

    ctx.lineCap = 'round';
    ctx.strokeStyle = active ? (dead ? C.railDeadHot : C.railHot)
                             : (dead ? C.railDead : C.rail);
    ctx.lineWidth = (track.transport === 'elastic' ? 7 : 5) * z;
    ctx.globalAlpha = active ? 1 : 0.55;

    /*
     * An edge only one end of the corpus documents. Drawn thin and faint so it
     * is visibly weaker evidence than everything around it, rather than being
     * dropped (which hides the gap) or drawn normally (which invents a fact).
     */
    if (track.unverified) {
      ctx.setLineDash([2 * z, 7 * z]);
      ctx.lineWidth = 2.5 * z;
      ctx.globalAlpha = active ? 0.8 : 0.3;
    }

    if (track.transport === 'retry') {
      // from === to, so there is no line to draw between two points. The rail
      // is the loop itself.
      loopPath(ctx, canvas, a);
      ctx.stroke();
      ctx.restore();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();

    // Sleepers, on solid kafka rails only — they read as railway at a glance.
    if (track.transport === 'kafka') {
      ctx.setLineDash([]);
      var dx = q.x - p.x, dy = q.y - p.y;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / len, ny = dx / len;
      var step = 20 * z;
      ctx.strokeStyle = active ? 'rgba(245,158,11,.55)' : C.sleeper;
      ctx.lineWidth = 2 * z;
      for (var d = step; d < len - step; d += step) {
        var cx = p.x + (dx * d) / len, cy = p.y + (dy * d) / len;
        ctx.beginPath();
        ctx.moveTo(cx - nx * 6 * z, cy - ny * 6 * z);
        ctx.lineTo(cx + nx * 6 * z, cy + ny * 6 * z);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawStop(ctx, canvas, stop, state) {
    var s = Iso.toScreen(stop.grid.x, stop.grid.y, canvas);
    var z = Iso.cam.zoom;
    var w = 128 * z, h = 44 * z;
    var lift = (stop.kind === 'station' ? 26 : 16) * z;

    // Footprint on the tile.
    Iso.tilePath(ctx, stop.grid.x, stop.grid.y, canvas, 12);
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fill();

    var body = stop.kind === 'yard' ? C.yard
             : stop.kind === 'depot' ? C.depot
             : stop.kind === 'siding' ? C.siding
             : stop.kind === 'terminus' ? C.terminus
             : stop.kind === 'external' ? C.external
             : C.station;
    // A siding keeps its warning colour even when the cart is standing on it —
    // turning it the ordinary "current" blue would say the document arrived
    // somewhere, and arriving in a DLT is not an arrival.
    if (state === 'current' && stop.kind !== 'siding') body = '#243b53';

    // The building.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = 14 * z;
    ctx.shadowOffsetY = 5 * z;
    roundRect(ctx, s.x - w / 2, s.y - lift - h, w, h, 7 * z);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = stop.kind === 'siding' ? C.sidingEdge
      : state === 'current' ? C.railHot
      : stop.kind === 'terminus' ? C.terminusEdge
      : stop.kind === 'external' ? C.externalEdge
      : (state === 'visited' ? '#4b607d' : C.stationT);
    ctx.lineWidth = (state === 'current' ? 2.5 : 1.5) * z;
    roundRect(ctx, s.x - w / 2, s.y - lift - h, w, h, 7 * z);
    ctx.stroke();

    // Yards get a roofline so they read as bigger than a station.
    if (stop.kind === 'yard') {
      ctx.fillStyle = 'rgba(56,189,248,.22)';
      roundRect(ctx, s.x - w / 2, s.y - lift - h, w, 8 * z, 4 * z);
      ctx.fill();
    }

    // Both kinds of end-of-line get a buffer stop, told apart by its weight.
    if (stop.kind === 'siding') drawBufferStop(ctx, canvas, stop, C.sidingEdge, false);
    if (stop.kind === 'terminus') drawBufferStop(ctx, canvas, stop, C.terminusEdge, true);

    ctx.textAlign = 'center';
    ctx.fillStyle = C.text;
    ctx.font = '600 ' + Math.max(9, 13 * z) + 'px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(stop.name, s.x, s.y - lift - h / 2 + 1 * z);

    ctx.fillStyle = C.dim;
    ctx.font = Math.max(8, 10 * z) + 'px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(stop.role || stop.tech, s.x, s.y - lift - h + 34 * z);
  }

  /** The cart, drawn at an interpolated position, carrying its current cargo. */
  function drawCart(ctx, canvas, gx, gy, cargo, opts) {
    var s = Iso.toScreen(gx, gy, canvas);
    var z = Iso.cam.zoom;
    var y = s.y - 12 * z;
    var w = 62 * z, h = 30 * z;

    // Shadow on the ground.
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + 4 * z, 30 * z, 11 * z, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Container.
    ctx.save();
    if (opts && opts.pulse) {
      ctx.shadowColor = cargo.tint;
      ctx.shadowBlur = 22 * z * opts.pulse;
    }
    roundRect(ctx, s.x - w / 2, y - h, w, h, 5 * z);
    ctx.fillStyle = cargo.tint;
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,.65)';
    ctx.lineWidth = 1.5 * z;
    roundRect(ctx, s.x - w / 2, y - h, w, h, 5 * z);
    ctx.stroke();

    // Corrugation, so it reads as freight rather than a coloured box.
    ctx.strokeStyle = 'rgba(0,0,0,.22)';
    ctx.lineWidth = 1 * z;
    for (var i = 1; i < 5; i++) {
      var lx = s.x - w / 2 + (w / 5) * i;
      ctx.beginPath();
      ctx.moveTo(lx, y - h + 4 * z);
      ctx.lineTo(lx, y - 4 * z);
      ctx.stroke();
    }

    // Wheels.
    ctx.fillStyle = '#0b1220';
    [-0.26, 0.26].forEach(function (f) {
      ctx.beginPath();
      ctx.arc(s.x + w * f, y + 3 * z, 5 * z, 0, Math.PI * 2);
      ctx.fill();
    });

    // Stamps accreted so far, as pips along the top edge.
    (cargo.stamps || []).forEach(function (_, i) {
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath();
      ctx.arc(s.x - w / 2 + (7 + i * 9) * z, y - h + 6 * z, 2.2 * z, 0, Math.PI * 2);
      ctx.fill();
    });

    // The tag above the cart naming what it is carrying right now.
    var label = cargo.label;
    ctx.font = '600 ' + Math.max(9, 12 * z) + 'px ui-sans-serif, system-ui, sans-serif';
    var tw = ctx.measureText(label).width + 18 * z;
    roundRect(ctx, s.x - tw / 2, y - h - 30 * z, tw, 20 * z, 10 * z);
    ctx.fillStyle = 'rgba(8,12,20,.92)';
    ctx.fill();
    ctx.strokeStyle = cargo.tint;
    ctx.lineWidth = 1.2 * z;
    roundRect(ctx, s.x - tw / 2, y - h - 30 * z, tw, 20 * z, 10 * z);
    ctx.stroke();
    ctx.fillStyle = C.text;
    ctx.textAlign = 'center';
    ctx.fillText(label, s.x, y - h - 16 * z);

    /*
     * The attempt counter, under the cart. It belongs on the cart rather than
     * only in the panel because the retry ladder is the one part of this map
     * where the same station is visited three times — without a counter on the
     * thing that is moving, the second and third visits look like a rendering
     * fault rather than the point.
     */
    if (opts && opts.badge) {
      ctx.font = '600 ' + Math.max(8, 10.5 * z) + 'px ui-sans-serif, system-ui, sans-serif';
      var bw = ctx.measureText(opts.badge).width + 14 * z;
      var by = y + 12 * z;
      roundRect(ctx, s.x - bw / 2, by, bw, 17 * z, 8.5 * z);
      ctx.fillStyle = 'rgba(127,29,29,.92)';
      ctx.fill();
      ctx.strokeStyle = C.railDeadHot;
      ctx.lineWidth = 1 * z;
      roundRect(ctx, s.x - bw / 2, by, bw, 17 * z, 8.5 * z);
      ctx.stroke();
      ctx.fillStyle = '#fecaca';
      ctx.fillText(opts.badge, s.x, by + 12 * z);
    }
  }

  function draw(ctx, canvas, flow, state) {
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    ctx.fillStyle = C.ground;
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    drawGround(ctx, canvas, flow);

    flow.tracks.forEach(function (t) {
      drawTrack(ctx, canvas, flow, t, state.activeTrack === t.from + '>' + t.to);
    });

    // Painter's order: back tiles first, so nearer buildings overlap farther ones.
    flow.stops.slice().sort(function (a, b) {
      return (a.grid.x + a.grid.y) - (b.grid.x + b.grid.y);
    }).forEach(function (s) {
      drawStop(ctx, canvas, s, state.stopState(s.id));
    });

    if (state.cart) {
      drawCart(ctx, canvas, state.cart.gx, state.cart.gy, state.cart.cargo,
        { pulse: state.cart.pulse, badge: state.cart.badge });
    }
  }

  return { draw: draw, colours: C };
})();
