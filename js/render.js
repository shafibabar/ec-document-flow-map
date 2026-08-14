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
    depot:    '#26303f'
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

  function drawTrack(ctx, canvas, flow, track, active) {
    var a = stopById(flow, track.from), b = stopById(flow, track.to);
    if (!a || !b) return;
    var p = Iso.toScreen(a.grid.x, a.grid.y, canvas);
    var q = Iso.toScreen(b.grid.x, b.grid.y, canvas);
    var z = Iso.cam.zoom;

    ctx.save();
    if (track.transport === 'cdc') {
      ctx.setLineDash([10 * z, 8 * z]);
    } else if (track.transport === 's3') {
      ctx.setLineDash([3 * z, 6 * z]);
    }

    ctx.lineCap = 'round';
    ctx.strokeStyle = active ? C.railHot : C.rail;
    ctx.lineWidth = (track.transport === 'elastic' ? 7 : 5) * z;
    ctx.globalAlpha = active ? 1 : 0.55;
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

    var body = stop.kind === 'yard' ? C.yard : (stop.kind === 'depot' ? C.depot : C.station);
    if (state === 'current') body = '#243b53';

    // The building.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = 14 * z;
    ctx.shadowOffsetY = 5 * z;
    roundRect(ctx, s.x - w / 2, s.y - lift - h, w, h, 7 * z);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = state === 'current' ? C.railHot
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
      drawCart(ctx, canvas, state.cart.gx, state.cart.gy, state.cart.cargo, { pulse: state.cart.pulse });
    }
  }

  return { draw: draw, colours: C };
})();
