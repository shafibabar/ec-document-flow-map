'use strict';
/*
 * sprites.js — the things that stand on the ground.
 *
 * One painter per kind of building, each drawing all of its own parts in the
 * right internal order. That is what lets render.js sort whole buildings against
 * each other without rooftops and chimneys leaking into the global sort.
 *
 * Nothing here knows what a Kafka topic is. It is told "draw a station called
 * Gateway here" and does that. The mapping from estate concepts to buildings
 * lives in render.js, and the estate facts live in data/flow.js.
 *
 * Every service gets a face of its own. A map where fourteen K8s services are
 * fourteen identical boxes is a map you cannot navigate, so the roof colour and
 * the silhouette feature are both derived from the service's own name — stable
 * across reloads, and different enough that you learn "the one with the water
 * tower is Policy Evaluator" without reading a label.
 */
var Sprites = (function () {

  var I = Iso;

  var PALETTE = {
    wall:      '#ece2cf',
    wallWarm:  '#e3d3b8',
    platform:  '#cfc6b4',
    stone:     '#b9b0a0',
    timber:    '#8a6b4a',
    steel:     '#9aa6b4',
    slate:     '#5d6b7a',
    brick:     '#a5624c',
    glass:     '#7fb2c9',
    ink:       '#2b2f38'
  };

  // Roof colours a station can be given. Chosen to stay distinct from each
  // other and from the grass, so two neighbouring stations never read as one.
  var ROOFS = ['#c2503f', '#3f7fa8', '#4c8f5a', '#b5842f', '#7a5aa3',
               '#2f8f88', '#b85f8a', '#5b6f9c', '#8f7a3a'];

  var FEATURES = ['clock', 'water', 'signal', 'chimney', 'vent', 'mast'];

  /*
   * How far an S3 depot's goods entrance stands from the building's centre, in
   * grid units. Exported because render.js has to end the conveyor on exactly
   * this number: a belt that runs to the building's centre instead disappears
   * under the wall, which reads as going beneath the building rather than into
   * it. One constant, used by the building that defines it and by the belt that
   * has to meet it.
   */
  var S3_DOCK = 0.76;

  /*
   * How far the Archive's platform stands off the building's centre, and where
   * the line therefore has to run. Exported for the same reason S3_DOCK is: the
   * building draws the platform with it and data/flow.js places the track just
   * beyond it, so the two cannot drift apart.
   */
  var ARCHIVE_PLATFORM = 1.02;
  var ARCHIVE_TRACK = 1.55;

  /** Stable small hash, so a name always produces the same building. */
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h;
  }

  /*
   * Give every stop a look of its own, derived from its name and guaranteed not
   * to repeat.
   *
   * Hashing alone is not enough. With 9 roofs and 6 features there are only 54
   * combinations, and the birthday problem does the rest — hashing the real
   * names put three pairs of services in identical buildings, which defeats the
   * entire purpose of giving them faces. So the hash chooses where to start
   * looking and a deterministic probe finds the first free combination from
   * there. Same input, same output, every reload; no two alike.
   *
   * (Use >>> and not >>. The FNV hash fills all 32 bits, so a signed shift goes
   * negative for about half of all names and indexes off the front of the
   * array — which is exactly the bug that produced featureless buildings.)
   */
  var assigned = null;

  function assign(ids) {
    assigned = {};
    var taken = {};
    ids.forEach(function (id) {
      var h = hash(id);
      var r0 = h % ROOFS.length, f0 = (h >>> 5) % FEATURES.length;
      for (var n = 0; n < ROOFS.length * FEATURES.length; n++) {
        var r = (r0 + n) % ROOFS.length;
        var f = (f0 + Math.floor(n / ROOFS.length)) % FEATURES.length;
        var key = r + ':' + f;
        if (taken[key]) continue;
        taken[key] = true;
        assigned[id] = { roof: ROOFS[r], feature: FEATURES[f] };
        return;
      }
      assigned[id] = { roof: ROOFS[r0], feature: FEATURES[f0] };   // more stops than looks
    });
    return assigned;
  }

  function identity(id) {
    if (assigned && assigned[id]) return assigned[id];
    var h = hash(id);
    return { roof: ROOFS[h % ROOFS.length], feature: FEATURES[(h >>> 5) % FEATURES.length] };
  }

  // ------------------------------------------------------------------ labels

  /*
   * A station nameboard. Drawn in screen space on purpose — text that follows
   * the isometric plane is authentic and unreadable, and the whole point of the
   * map is that you can read it.
   */
  function nameboard(ctx, x, y, text, sub, z) {
    var fs = Math.max(9, 12 * z);
    ctx.font = '650 ' + fs + 'px ui-sans-serif, system-ui, sans-serif';
    var w = ctx.measureText(text).width + 16 * z;
    var h = (sub ? 30 : 20) * z;
    var top = y - h;

    ctx.save();
    ctx.shadowColor = 'rgba(20,26,20,.35)';
    ctx.shadowBlur = 7 * z;
    ctx.shadowOffsetY = 2 * z;
    roundRect(ctx, x - w / 2, top, w, h, 4 * z);
    ctx.fillStyle = 'rgba(252,250,244,.96)';
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(70,62,48,.5)';
    ctx.lineWidth = Math.max(0.6, 1 * z);
    roundRect(ctx, x - w / 2, top, w, h, 4 * z);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#33302a';
    ctx.fillText(text, x, top + (sub ? 13 : 14) * z);
    if (sub) {
      ctx.font = Math.max(7, 9 * z) + 'px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = '#7a7264';
      ctx.fillText(sub, x, top + 24 * z);
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------------------------------------------------------------- features

  /** The silhouette detail that makes one station recognisably not another. */
  function feature(ctx, canvas, gx, gy, kind, base, accent, z) {
    if (kind === 'clock') {
      I.box(ctx, canvas, gx - 0.24, gy - 0.24, 0.10, 0.10, 34, PALETTE.wallWarm, base);
      var c = I.up(I.toScreen(gx - 0.24, gy - 0.24, canvas), base + 34);
      ctx.beginPath();
      ctx.arc(c.x, c.y - 5 * z, 5.5 * z, 0, Math.PI * 2);
      ctx.fillStyle = '#f6f1e2'; ctx.fill();
      ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = Math.max(0.5, 1 * z); ctx.stroke();
      ctx.beginPath();                                  // hands, fixed at 10:10
      ctx.moveTo(c.x, c.y - 5 * z); ctx.lineTo(c.x - 2.6 * z, c.y - 7.5 * z);
      ctx.moveTo(c.x, c.y - 5 * z); ctx.lineTo(c.x + 2.4 * z, c.y - 7.6 * z);
      ctx.stroke();
      I.box(ctx, canvas, gx - 0.24, gy - 0.24, 0.12, 0.12, 5, accent, base + 34);
    } else if (kind === 'water') {
      I.box(ctx, canvas, gx + 0.26, gy - 0.2, 0.05, 0.05, 26, PALETTE.timber, base);
      I.cylinder(ctx, canvas, gx + 0.26, gy - 0.2, 0.17, 17, PALETTE.steel, base + 26);
    } else if (kind === 'signal') {
      var s = I.up(I.toScreen(gx + 0.3, gy + 0.16, canvas), base);
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = Math.max(0.8, 1.8 * z);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y - 32 * z);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s.x, s.y - 34 * z, 3.4 * z, 0, Math.PI * 2);
      ctx.fillStyle = accent; ctx.fill();
    } else if (kind === 'chimney') {
      I.box(ctx, canvas, gx - 0.2, gy + 0.18, 0.06, 0.06, 30, PALETTE.brick, base);
    } else if (kind === 'vent') {
      I.cylinder(ctx, canvas, gx - 0.18, gy - 0.16, 0.09, 13, PALETTE.steel, base);
      I.cylinder(ctx, canvas, gx + 0.02, gy - 0.2, 0.07, 9, PALETTE.steel, base);
    } else if (kind === 'mast') {
      var m = I.up(I.toScreen(gx - 0.26, gy - 0.1, canvas), base);
      ctx.strokeStyle = PALETTE.steel;
      ctx.lineWidth = Math.max(0.7, 1.5 * z);
      ctx.beginPath();
      ctx.moveTo(m.x, m.y); ctx.lineTo(m.x, m.y - 40 * z);
      ctx.moveTo(m.x - 6 * z, m.y - 28 * z); ctx.lineTo(m.x + 6 * z, m.y - 28 * z);
      ctx.moveTo(m.x - 4 * z, m.y - 34 * z); ctx.lineTo(m.x + 4 * z, m.y - 34 * z);
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------- painters

  /*
   * A K8s service: a platform with a station house on it. The platform is what
   * makes it read as somewhere a train stops rather than just a building beside
   * the line.
   */
  function station(ctx, canvas, stop, state, z) {
    var id = identity(stop.id);
    var gx = stop.grid.x, gy = stop.grid.y;
    var accent = state === 'current' ? '#f0a132' : id.roof;

    I.box(ctx, canvas, gx, gy, 0.46, 0.46, 5, PALETTE.platform);          // platform
    I.box(ctx, canvas, gx, gy, 0.30, 0.30, 24, PALETTE.wall, 5);          // house
    I.roof(ctx, canvas, gx, gy, 0.36, 0.36, 29, 15, accent);              // pitched roof
    feature(ctx, canvas, gx, gy, id.feature, 5, accent, z);

    // Platform edging, so the platform has a lip rather than a painted line.
    var c = I.corners(gx, gy, 0.46, 0.46, canvas);
    ctx.strokeStyle = 'rgba(90,80,64,.35)';
    ctx.lineWidth = Math.max(0.5, 1 * z);
    I.poly(ctx, [I.up(c.n, 5), I.up(c.e, 5), I.up(c.s, 5), I.up(c.w, 5)]);
    ctx.stroke();

    if (state === 'current') haloRing(ctx, canvas, gx, gy, 0.62, '#f0a132', z);

    var top = I.up(I.toScreen(gx, gy, canvas), 5);
    nameboard(ctx, top.x, top.y - 52 * z, stop.name, stop.tech, z);
  }

  /*
   * A point on a solid's top face, parameterised across the rhombus: u runs
   * along the north-to-east edge, v along north-to-west. Affine, so it lands
   * exactly on the isometric plane — this is what lets roof furniture sit flat
   * on a roof instead of hovering at a slightly wrong angle.
   */
  function topPoint(c, u, v) {
    return { x: c.n.x + (c.e.x - c.n.x) * u + (c.w.x - c.n.x) * v,
             y: c.n.y + (c.e.y - c.n.y) * u + (c.w.y - c.n.y) * v };
  }

  /*
   * S3: a modern distribution facility. Two blocks — a tall main hall and a
   * lower annex of roller-shutter bays — a band of blue glazing, and either
   * photovoltaic arrays (EA-S3, +y annex) or an animated industrial storage
   * matrix (EC-S3, +x annex) covering the roof.
   *
   * stop.orientation === '+x' flags the EC-S3 variant: the annex is rotated
   * to the right (+x) face so the belt arriving from Gateway (at higher gx)
   * meets the open bay, and the static solar panels are replaced with moving
   * intake manifolds, sliding loading arms, and pneumatic sorting gates.
   */
  function s3Depot(ctx, canvas, stop, state, z, t) {
    var gx = stop.grid.x, gy = stop.grid.y;
    var now = t || 0;
    var xOrient = stop.orientation === '+x';
    var HW = 0.42, HH = 0.32, H = 30;
    var wall = state === 'current' ? '#e4e9ee' : '#d6dce2';
    var glassBlue = '#6f9dc4';

    I.box(ctx, canvas, gx, gy, HW + 0.14, HH + 0.14, 2, '#b7bdc3');       // apron

    /*
     * The goods annex. For EA-S3 (no orientation) the annex is on the +y side
     * — the direction the archive belt arrives from. For EC-S3 (+x orientation)
     * it is rotated to the +x side so the Gateway belt meets the open bay.
     * S3_DOCK is the distance from building centre to the outer annex face;
     * render.js stops the belt at exactly that distance, so the belt runs into
     * the opening rather than sliding under the building.
     */
    var AHW = 0.34, AHH = 0.22, AH = 18;
    var ax, ay, ac, af;
    if (xOrient) {
      // +x annex: displaced toward higher gx (Gateway side).
      ax = gx + S3_DOCK - AHH; ay = gy;
      I.box(ctx, canvas, ax, ay, AHH, AHW, AH, wall, 2);
      I.box(ctx, canvas, ax, ay, AHH + 0.03, AHW + 0.03, 2, '#c3cad1', AH + 2);
      ac = I.corners(ax, ay, AHH, AHW, canvas);
      // Right face (s→e) faces the belt arriving from higher gx.
      af = function (u, v) {
        return facePoint(I.up(ac.s, 2), I.up(ac.e, 2), I.up(ac.s, 2 + AH), I.up(ac.e, 2 + AH), u, v);
      };
    } else {
      // +y annex: original EA-S3 layout, belt arrives from higher gy.
      ax = gx; ay = gy + S3_DOCK - AHH;
      I.box(ctx, canvas, ax, ay, AHW, AHH, AH, wall, 2);
      I.box(ctx, canvas, ax, ay, AHW + 0.03, AHH + 0.03, 2, '#c3cad1', AH + 2);
      ac = I.corners(ax, ay, AHW, AHH, canvas);
      // Left face (w→s) faces the belt arriving from the archive direction.
      af = function (u, v) {
        return facePoint(I.up(ac.w, 2), I.up(ac.s, 2), I.up(ac.w, 2 + AH), I.up(ac.s, 2 + AH), u, v);
      };
    }

    [[0.05, 0.29], [0.71, 0.95]].forEach(function (bay) {                  // shuttered bays
      faceQuad(ctx, af, bay[0], bay[1], 0.06, 0.60, '#9aa4ad');
      for (var sl = 0; sl < 4; sl++) {
        var vv = 0.11 + sl * 0.13;
        I.poly(ctx, [af(bay[0], vv), af(bay[1], vv), af(bay[1], vv + 0.03), af(bay[0], vv + 0.03)],
               '#88939d');
      }
    });

    // The open bay the belt runs into.
    faceQuad(ctx, af, 0.36, 0.64, 0.05, 0.86, '#1b2228');
    ctx.strokeStyle = '#8d979f';
    ctx.lineWidth = Math.max(0.5, 1.2 * z);
    I.poly(ctx, [af(0.36, 0.05), af(0.64, 0.05), af(0.64, 0.86), af(0.36, 0.86)]);
    ctx.stroke();
    I.poly(ctx, [af(0.33, 0.86), af(0.67, 0.86), af(0.67, 0.93), af(0.33, 0.93)], '#e0902c');

    // --- the main hall -------------------------------------------------------
    I.box(ctx, canvas, gx, gy, HW, HH, H, wall, 2);
    I.box(ctx, canvas, gx, gy, HW + 0.03, HH + 0.03, 3, '#c3cad1', H + 2);  // parapet

    // Glazing band on both visible faces.
    var c = I.corners(gx, gy, HW, HH, canvas);
    var right = function (u, v) {
      return facePoint(I.up(c.s, 2), I.up(c.e, 2), I.up(c.s, H + 2), I.up(c.e, H + 2), u, v);
    };
    var left = function (u, v) {
      return facePoint(I.up(c.w, 2), I.up(c.s, 2), I.up(c.w, H + 2), I.up(c.s, H + 2), u, v);
    };
    [right, left].forEach(function (face) {
      faceQuad(ctx, face, 0.06, 0.94, 0.58, 0.82, '#3f5f7d');
      for (var i = 0; i < 7; i++) {
        var w0 = 0.09 + i * 0.122;
        faceQuad(ctx, face, w0, w0 + 0.088, 0.61, 0.79, glassBlue);
      }
    });

    // --- roof ----------------------------------------------------------------
    var rc = I.corners(gx, gy, HW - 0.05, HH - 0.05, canvas);
    var tc = { n: I.up(rc.n, H + 5), e: I.up(rc.e, H + 5),
               s: I.up(rc.s, H + 5), w: I.up(rc.w, H + 5) };

    if (!xOrient) {
      // EA-S3: static solar arrays.
      for (var pu = 0; pu < 2; pu++) {
        for (var pv = 0; pv < 3; pv++) {
          var u1 = 0.06 + pu * 0.48, v1 = 0.05 + pv * 0.315;
          var quad = [topPoint(tc, u1, v1), topPoint(tc, u1 + 0.42, v1),
                      topPoint(tc, u1 + 0.42, v1 + 0.27), topPoint(tc, u1, v1 + 0.27)];
          I.poly(ctx, quad, '#2f5c8a');
          ctx.strokeStyle = 'rgba(150,195,235,.55)';
          ctx.lineWidth = Math.max(0.4, 0.9 * z);
          ctx.beginPath();
          for (var g = 1; g < 3; g++) {
            var a1 = topPoint(tc, u1 + 0.42 * (g / 3), v1);
            var a2 = topPoint(tc, u1 + 0.42 * (g / 3), v1 + 0.27);
            ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y);
          }
          for (g = 1; g < 2; g++) {
            var b1 = topPoint(tc, u1, v1 + 0.27 * (g / 2));
            var b2 = topPoint(tc, u1 + 0.42, v1 + 0.27 * (g / 2));
            ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y);
          }
          ctx.stroke();
          I.poly(ctx, quad);
          ctx.strokeStyle = '#9fb4c6';
          ctx.stroke();
        }
      }
    } else {
      // EC-S3: active industrial storage matrix.
      // Dark base slab.
      I.poly(ctx, [tc.n, tc.e, tc.s, tc.w], '#1e2830');

      // Three intake manifolds — circular ports that pulse in brightness.
      [0.22, 0.50, 0.78].forEach(function (mu, mi) {
        var mc = topPoint(tc, mu, 0.35);
        var pulse = 0.55 + 0.45 * Math.abs(Math.sin(now * 0.0018 + mi * 1.1));
        ctx.fillStyle = 'rgba(32,180,120,' + pulse.toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(mc.x, mc.y, 5.5 * z, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#4dd4a0';
        ctx.lineWidth = Math.max(0.5, 1.1 * z);
        ctx.beginPath(); ctx.arc(mc.x, mc.y, 5.5 * z, 0, Math.PI * 2); ctx.stroke();
        // Inner dot pulses in phase
        var innerPulse = 0.3 + 0.7 * Math.abs(Math.sin(now * 0.0028 + mi * 1.4));
        ctx.fillStyle = 'rgba(150,255,200,' + innerPulse.toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(mc.x, mc.y, 2.2 * z, 0, Math.PI * 2); ctx.fill();
      });

      // Two sliding loading arms — horizontal bars that translate along u.
      [0.28, 0.72].forEach(function (av, ai) {
        var slide = 0.06 + 0.50 * (0.5 + 0.5 * Math.sin(now * 0.0012 + ai * Math.PI));
        var arm0 = topPoint(tc, slide, av);
        var arm1 = topPoint(tc, slide + 0.32, av);
        ctx.strokeStyle = '#8fb8d0';
        ctx.lineWidth = Math.max(1.2, 2.4 * z);
        ctx.beginPath(); ctx.moveTo(arm0.x, arm0.y); ctx.lineTo(arm1.x, arm1.y); ctx.stroke();
        // End cap
        ctx.fillStyle = '#c0d8e8';
        ctx.beginPath(); ctx.arc(arm1.x, arm1.y, 2.5 * z, 0, Math.PI * 2); ctx.fill();
      });

      // Three pneumatic sorting gates — angled flaps that open and close.
      [0.15, 0.50, 0.85].forEach(function (gu, gi) {
        var gv = 0.68;
        var angle = Math.PI * 0.12 * Math.sin(now * 0.0022 + gi * 0.9);
        var pivot = topPoint(tc, gu, gv);
        var tipU = gu + 0.08 * Math.cos(angle);
        var tipV = gv - 0.14 * Math.abs(Math.sin(angle));
        var tip   = topPoint(tc, tipU, tipV);
        ctx.strokeStyle = '#e8b84c';
        ctx.lineWidth = Math.max(0.9, 1.8 * z);
        ctx.beginPath(); ctx.moveTo(pivot.x, pivot.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
        ctx.fillStyle = '#f0cc70';
        ctx.beginPath(); ctx.arc(pivot.x, pivot.y, 1.8 * z, 0, Math.PI * 2); ctx.fill();
      });

      // Roof border
      ctx.strokeStyle = '#3d5060';
      ctx.lineWidth = Math.max(0.5, 1.0 * z);
      I.poly(ctx, [tc.n, tc.e, tc.s, tc.w]);
      ctx.stroke();
    }

    if (state === 'current') haloRing(ctx, canvas, gx, gy, 0.72, '#f0a132', z);

    var top = I.up(I.toScreen(gx, gy, canvas), 2);
    nameboard(ctx, top.x, top.y - 62 * z, stop.name, stop.tech, z);
  }

  /*
   * An Elasticsearch index: a classification depot. Three bays under one long
   * roof, which is what a depot looks like and also happens to say "this holds
   * many documents, sorted" better than another shed would.
   */
  function depot(ctx, canvas, stop, state, z) {
    var gx = stop.grid.x, gy = stop.grid.y;
    var accent = stop.id === 'review' ? '#b4553f' : '#3f8f6a';
    if (state === 'current') accent = '#f0a132';

    I.box(ctx, canvas, gx, gy, 0.52, 0.40, 4, PALETTE.stone);
    for (var i = -1; i <= 1; i++) {
      I.box(ctx, canvas, gx + i * 0.28, gy, 0.12, 0.34, 20, PALETTE.wall, 4);
    }
    I.roof(ctx, canvas, gx, gy, 0.52, 0.40, 24, 13, accent);

    // Bay mouths, dark, facing the road side.
    var c = I.corners(gx, gy, 0.52, 0.40, canvas);
    for (i = -1; i <= 1; i++) {
      var m = I.up(I.toScreen(gx + i * 0.28, gy + 0.40, canvas), 4);
      ctx.fillStyle = 'rgba(30,36,42,.6)';
      ctx.beginPath();
      ctx.moveTo(m.x - 9 * z, m.y);
      ctx.lineTo(m.x + 9 * z, m.y);
      ctx.lineTo(m.x + 9 * z, m.y - 12 * z);
      ctx.lineTo(m.x - 9 * z, m.y - 12 * z);
      ctx.closePath();
      ctx.fill();
    }

    if (state === 'current') haloRing(ctx, canvas, gx, gy, 0.7, '#f0a132', z);

    var top = I.up(I.toScreen(gx, gy, canvas), 4);
    nameboard(ctx, top.x, top.y - 48 * z, stop.name, stop.role || stop.tech, z);
  }

  /*
   * MongoDB: a record office. Squat, stone, shuttered — deliberately not a
   * warehouse, because what lands here is a written record rather than a
   * document waiting to be collected.
   */
  function vault(ctx, canvas, stop, state, z) {
    var gx = stop.grid.x, gy = stop.grid.y;
    I.box(ctx, canvas, gx, gy, 0.34, 0.30, 4, PALETTE.stone);
    I.box(ctx, canvas, gx, gy, 0.28, 0.24, 19, '#c8c0b0', 4);
    I.box(ctx, canvas, gx, gy, 0.32, 0.28, 4, '#8d8578', 23);             // flat cornice
    if (state === 'current') haloRing(ctx, canvas, gx, gy, 0.5, '#f0a132', z);
    var top = I.up(I.toScreen(gx, gy, canvas), 4);
    nameboard(ctx, top.x, top.y - 38 * z, stop.name, stop.tech, z);
  }

  /*
   * A dead-end siding: buffer stop, a scrap of unkempt ground, no building. A
   * DLT is somewhere a document is abandoned, and it should look abandoned.
   */
  function siding(ctx, canvas, stop, state, z) {
    var gx = stop.grid.x, gy = stop.grid.y;
    I.box(ctx, canvas, gx, gy, 0.34, 0.20, 3, '#6f6656');                 // rough ballast
    I.box(ctx, canvas, gx + 0.2, gy + 0.2, 0.10, 0.10, 9, '#7a3b34');     // buffer block
    var b = I.up(I.toScreen(gx + 0.2, gy + 0.2, canvas), 9);
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = Math.max(1, 2.4 * z);
    ctx.beginPath();
    ctx.moveTo(b.x - 11 * z, b.y - 2 * z);
    ctx.lineTo(b.x + 11 * z, b.y - 2 * z);
    ctx.stroke();
    if (state === 'current') haloRing(ctx, canvas, gx, gy, 0.5, '#e05252', z);
    var top = I.up(I.toScreen(gx, gy, canvas), 3);
    nameboard(ctx, top.x, top.y - 30 * z, stop.name, stop.role, z);
  }

  /*
   * A terminus: a short platform with a buffer at the end. The line stops, but
   * unlike the siding it is a proper place — the record carries on from here.
   */
  function terminus(ctx, canvas, stop, state, z) {
    var gx = stop.grid.x, gy = stop.grid.y;
    I.box(ctx, canvas, gx, gy, 0.40, 0.24, 5, PALETTE.platform);
    I.box(ctx, canvas, gx - 0.16, gy, 0.12, 0.16, 14, PALETTE.wall, 5);   // waiting shelter
    I.roof(ctx, canvas, gx - 0.16, gy, 0.18, 0.20, 19, 6, '#7a8490');
    I.box(ctx, canvas, gx + 0.3, gy, 0.05, 0.14, 7, '#6b6357', 5);        // buffer
    if (state === 'current') haloRing(ctx, canvas, gx, gy, 0.55, '#f0a132', z);
    var top = I.up(I.toScreen(gx, gy, canvas), 5);
    nameboard(ctx, top.x, top.y - 36 * z, stop.name, stop.role, z);
  }

  /** Outside the estate: a plain block, no platform — trains do not stop here. */
  function external(ctx, canvas, stop, state, z) {
    var gx = stop.grid.x, gy = stop.grid.y;
    I.box(ctx, canvas, gx, gy, 0.30, 0.26, 26, '#6d7684');
    I.box(ctx, canvas, gx, gy, 0.32, 0.28, 3, '#5a6270', 26);
    if (state === 'current') haloRing(ctx, canvas, gx, gy, 0.5, '#f0a132', z);
    var top = I.toScreen(gx, gy, canvas);
    nameboard(ctx, top.x, top.y - 42 * z, stop.name, 'external', z);
  }

  /*
   * A point on one face of a solid, in the face's own coordinates: u runs 0..1
   * left to right along the wall, v runs 0..1 from the ground to the eaves.
   * Straight bilinear interpolation is exact here, because an isometric face is
   * a parallelogram with no perspective in it.
   */
  function facePoint(bl, br, tl, tr, u, v) {
    var bx = bl.x + (br.x - bl.x) * u, by = bl.y + (br.y - bl.y) * u;
    var tx = tl.x + (tr.x - tl.x) * u, ty = tl.y + (tr.y - tl.y) * u;
    return { x: bx + (tx - bx) * v, y: by + (ty - by) * v };
  }

  function faceQuad(ctx, f, u0, u1, v0, v1, fill) {
    var p = [f(u0, v0), f(u1, v0), f(u1, v1), f(u0, v1)];
    I.poly(ctx, p, fill);
    return p;
  }

  /*
   * The Archive. An external system, and it should look like one: bigger and
   * older than anything the estate runs, set well apart, with its own loading
   * yard rather than a platform. Nothing arrives here by rail.
   *
   * Three things carry its character, all on the wall facing the road:
   *   - an oversized ARCHIVE plaque, the kind bolted to a building that has
   *     been there longer than the software
   *   - a long glass window with high-density shelving racked behind it
   *   - an open cutaway bay where boxes are stamped with metadata before they
   *     go out, which is the part that actually animates
   */
  function archive(ctx, canvas, stop, state, z, t) {
    var gx = stop.grid.x, gy = stop.grid.y;
    var HW = 0.58, HH = 0.44, H = 34;                    // flat-roofed, wide, low
    var wall = '#aab2b9', roofTop = '#c2c8cd', trim = '#6f7981';

    // Concrete apron. Just proud of the footprint on the road side — a slab to
    // back a cart onto, not the parade ground the first version had.
    /*
     * The loading yard IS the railway platform. It runs along the +x side of
     * the building, parallel to the line rather than across it — a platform
     * sits BESIDE a track, never on the end of it — and it is long in y and
     * narrow in x because that is the direction the trains run.
     *
     * It carries no shelter or board of its own. The Archive is the structure;
     * a second little building on the platform would just be clutter.
     */
    I.box(ctx, canvas, gx + ARCHIVE_PLATFORM, gy, 0.30, 0.86, 4, PALETTE.platform);

    // Painted lip along the track edge, which is the only marking a platform
    // needs to read as one.
    var pc = I.corners(gx + ARCHIVE_PLATFORM, gy, 0.30, 0.86, canvas);
    ctx.strokeStyle = 'rgba(236,226,198,.85)';
    ctx.lineWidth = Math.max(0.7, 1.8 * z);
    ctx.beginPath();
    var lipA = I.up(pc.s, 4), lipB = I.up(pc.e, 4);
    ctx.moveTo(lipA.x, lipA.y);
    ctx.lineTo(lipB.x, lipB.y);
    ctx.stroke();

    I.box(ctx, canvas, gx, gy, HW, HH, H, wall, 2);      // the block itself
    I.box(ctx, canvas, gx, gy, HW + 0.02, HH + 0.02, 2, roofTop, H + 2);   // roof slab lip

    // --- rooftop plant --------------------------------------------------------
    // Three extract units with fans, and one flat skylight, as on the reference.
    for (var r = 0; r < 3; r++) {
      var rx = gx - 0.26 + r * 0.26, ry = gy - 0.22 + r * 0.20;
      I.box(ctx, canvas, rx, ry, 0.13, 0.13, 7, '#98a0a7', H + 4);
      var fc = I.up(I.toScreen(rx, ry, canvas), H + 11);
      ctx.fillStyle = '#5d666e';
      ctx.beginPath();
      ctx.ellipse(fc.x, fc.y, 8 * z, 4 * z, 0, 0, Math.PI * 2);
      ctx.fill();
      // Fan blades, turning slowly — the only motion this building needs.
      var a0 = ((t || 0) / 1600 + r * 0.4) % 1 * Math.PI * 2;
      ctx.strokeStyle = '#cdd3d8';
      ctx.lineWidth = Math.max(0.6, 1.4 * z);
      for (var bld = 0; bld < 3; bld++) {
        var ang = a0 + bld * (Math.PI * 2 / 3);
        ctx.beginPath();
        ctx.moveTo(fc.x, fc.y);
        ctx.lineTo(fc.x + Math.cos(ang) * 7 * z, fc.y + Math.sin(ang) * 3.4 * z);
        ctx.stroke();
      }
    }
    I.box(ctx, canvas, gx - 0.34, gy + 0.16, 0.14, 0.10, 4, '#b6bcc2', H + 4);   // skylight

    // The road-facing wall, as a face to draw on: south corner to east corner.
    // The east corner points the way the road leaves, so this is the wall the
    // cart sees.
    var c = I.corners(gx, gy, HW, HH, canvas);
    var bl = I.up(c.s, 2), br = I.up(c.e, 2);
    var tl = I.up(c.s, H + 2), tr = I.up(c.e, H + 2);
    var f = function (u, v) { return facePoint(bl, br, tl, tr, u, v); };

    // --- the window band, with high-density shelving behind it ----------------
    var glass = faceQuad(ctx, f, 0.06, 0.60, 0.42, 0.86, '#1d2b33');
    ctx.save();
    I.poly(ctx, glass);
    ctx.clip();
    // Vertical mullions split the band into bays; each bay is a rack, and the
    // pale rungs across it are the shelf decks. Clipped to the glass so the
    // racking sits behind it rather than on top of it.
    for (var i = 0; i < 7; i++) {
      var u0 = 0.075 + i * 0.075;
      I.poly(ctx, [f(u0, 0.45), f(u0 + 0.055, 0.45), f(u0 + 0.055, 0.83), f(u0, 0.83)],
             i > 4 ? '#243139' : '#2f7d6e');
      if (i <= 4) {
        for (var d = 0; d < 6; d++) {
          var vv = 0.47 + d * 0.062;
          I.poly(ctx, [f(u0 + 0.004, vv), f(u0 + 0.051, vv),
                       f(u0 + 0.051, vv + 0.020), f(u0 + 0.004, vv + 0.020)], '#5fe0bd');
        }
      }
    }
    ctx.restore();
    ctx.strokeStyle = trim;
    ctx.lineWidth = Math.max(0.5, 1.2 * z);
    I.poly(ctx, glass);
    ctx.stroke();

    // No lettering on the wall. The nameboard above the building already says
    // what this is, and a second ARCHIVE painted on the brickwork read as a
    // label stuck onto the model rather than part of it.

    // --- the shutter bay: where boxes are stamped before they go out ----------
    faceQuad(ctx, f, 0.66, 0.94, 0.03, 0.40, '#1b2429');            // the opening
    I.poly(ctx, [f(0.66, 0.03), f(0.94, 0.03), f(0.94, 0.055), f(0.66, 0.055)], '#e0902c');
    for (i = 0; i < 3; i++) {                                        // shutter, part-raised
      var sv2 = 0.34 + i * 0.02;
      I.poly(ctx, [f(0.66, sv2), f(0.94, sv2), f(0.94, sv2 + 0.014), f(0.66, sv2 + 0.014)],
             '#7d868d');
    }

    var beat = ((t || 0) % 1400) / 1400;
    var press = beat < 0.34 ? Math.sin(beat / 0.34 * Math.PI) : 0;

    I.poly(ctx, [f(0.68, 0.115), f(0.92, 0.115), f(0.92, 0.135), f(0.68, 0.135)], '#4a545b');
    for (i = 0; i < 3; i++) {                                        // boxes on the bench
      var bu = 0.705 + i * 0.075;
      var stamped = i < (beat < 0.5 ? 1 : 2);
      I.poly(ctx, [f(bu, 0.135), f(bu + 0.052, 0.135), f(bu + 0.052, 0.225), f(bu, 0.225)],
             stamped ? '#c2a06a' : '#9a8b70');
      if (stamped) {
        I.poly(ctx, [f(bu + 0.011, 0.175), f(bu + 0.041, 0.175),
                     f(bu + 0.041, 0.200), f(bu + 0.011, 0.200)], '#e8dcc0');
      }
    }
    var sv = 0.30 - press * 0.075;                                   // the stamp head
    I.poly(ctx, [f(0.782, sv), f(0.828, sv), f(0.828, sv + 0.055), f(0.782, sv + 0.055)],
           '#5c6672');
    var arm = f(0.805, sv + 0.055);
    ctx.strokeStyle = '#5c6672';
    ctx.lineWidth = Math.max(0.6, 1.4 * z);
    ctx.beginPath();
    ctx.moveTo(arm.x, arm.y);
    ctx.lineTo(arm.x, arm.y - 9 * z);
    ctx.stroke();

    /*
     * The cargo waiting on the loading platform.
     *
     * Four piles of packages, at the far end of the platform from the building
     * so the flatbed that stands here has something to be loaded FROM. They are
     * the same solid the flatbed carries and the carousel runs, so a package is
     * recognisably one thing wherever it appears on the map.
     *
     * Drawn last: every pile is further out along +x than the block itself, so
     * it belongs in front of it, and there is nothing else in this painter it
     * can be behind.
     */
    var PILES = [[-0.60, 5], [-0.22, 3], [0.22, 6], [0.60, 4]];
    PILES.forEach(function (pile) {
      // Two by two on the ground with the rest stacked on top, which is what a
      // neat pile looks like — a single column of crates reads as a totem.
      var spots = [[-0.083, -0.063], [0.083, -0.063], [-0.083, 0.063], [0.083, 0.063]];
      for (var k = 0; k < pile[1]; k++) {
        var sp = spots[k % 4];
        packageBox(ctx, canvas, gx + ARCHIVE_PLATFORM + sp[0], gy + pile[0] + sp[1],
                   4 + Math.floor(k / 4) * 9.9, null, z);
      }
    });

    if (state === 'current') haloRing(ctx, canvas, gx, gy, 0.82, '#f0a132', z);

    var top = I.up(I.toScreen(gx, gy, canvas), 2);
    nameboard(ctx, top.x, top.y - 74 * z, stop.name, null, z);
  }

  /*
   * The platform between a station that has stepped aside and its track. Drawn
   * from the building's new position back to the cell the rails run through, so
   * the arrangement reads building / platform / track the way a real halt does.
   */
  function platformStrip(ctx, canvas, stop, aside, z) {
    var gx = stop.grid.x + aside.x, gy = stop.grid.y + aside.y;
    // Long in the direction the trains run, narrow across it — the Archive's
    // platform is shaped the same way and for the same reason.
    var alongX = aside.y !== 0;                    // stepped off an x-axis line
    var hw = alongX ? 0.72 : Math.abs(aside.x) / 2 + 0.06;
    var hh = alongX ? Math.abs(aside.y) / 2 + 0.06 : 0.72;
    var cx = alongX ? gx : gx + Math.abs(aside.x) / 2;
    var cy = alongX ? gy + Math.abs(aside.y) / 2 : gy;

    I.box(ctx, canvas, cx, cy, hw, hh, 3, PALETTE.platform);
    // A painted edge along the platform lip, on the track side.
    var c = I.corners(cx, cy, hw, hh, canvas);
    ctx.strokeStyle = 'rgba(230,220,190,.75)';
    ctx.lineWidth = Math.max(0.6, 1.6 * z);
    ctx.beginPath();
    var e1 = I.up(alongX ? c.w : c.n, 3), e2 = I.up(alongX ? c.s : c.e, 3);
    ctx.moveTo(e1.x, e1.y);
    ctx.lineTo(e2.x, e2.y);
    ctx.stroke();
  }

  /*
   * ======================================================================
   * THE WORKS: the three pipeline stations on the new line.
   * ======================================================================
   *
   * Queue Qualifier, Surveillance Filter and Policy Evaluator are not station
   * houses. They are industrial works — layered blocks with FLAT roofs, an
   * external steel frame standing proud of the walls, and a roof deck carrying
   * the machinery that says what the service does.
   *
   * Three rules, and they are the whole style:
   *
   *   1. No pitched roof anywhere in here, and no single cuboid standing on its
   *      own. A flat roof is not a preference — it is the deck the machinery
   *      needs, and the machinery is the part that identifies the service.
   *   2. Layered geometry: a main hall, a rear range of smaller utility blocks
   *      butted against it, a front annex, a stair core breaking the skyline.
   *      Assembled from interconnected blocks rather than carved from one.
   *   3. The three share every bone — same plinth, same hall, same frame, same
   *      wall treatment — and differ ONLY in what stands on the roof. That is
   *      what makes the line read as one plant while each stop stays
   *      recognisable from across the map.
   *
   * The blocks are laid out so no two footprints overlap, which is what lets a
   * plain back-to-front sort on gx + gy get the occlusion right inside one
   * building — the same painter's rule render.js uses between buildings.
   */
  /*
   * Every colour here is a literal #rrggbb, and that is load-bearing rather
   * than tidiness: Iso.box re-shades whatever it is handed and parses it as
   * hex, so feeding it an Iso.shade() result — which comes back as "rgb(r,g,b)"
   * — parses to NaN, canvas silently keeps the previous fill, and the surface
   * comes out solid black. Shade results are safe as a strokeStyle or a poly
   * fill; they are never safe as a box colour.
   */
  var WORKS = {
    wall:    '#c9d0d6',
    wallLo:  '#aab3bb',
    deck:    '#aeb6bd',
    membrane:'#8d969e',
    trim:    '#8e979f',
    steel:   '#7f8b95',
    dark:    '#28313a',
    glass:   '#3f5f7d',
    pane:    '#7fb2c9'
  };

  var WORKS_HW = 0.46, WORKS_HH = 0.23, WORKS_H = 30;   // the main hall
  var WORKS_BASE = 3;                                    // platform height
  var WORKS_ROOF = WORKS_BASE + WORKS_H + 3.8;           // the roof membrane

  /*
   * Iso.cylinder and the cone below take a radius in the same units Iso.box
   * takes half-extents, and the two are NOT the same size on screen. A box of
   * half-extent h spans (h + h) * TILE_W / 2 across; a cylinder of radius r
   * spans r * TILE_W. So:
   *
   *   - a vessel of radius r covers 2r of GRID, not r. Spacing roof plant by
   *     eye against the box extents is how three canisters ended up overlapping
   *     each other and hanging off the parapet.
   *   - a box matches a cylinder's screen width when its half-extent equals r.
   *     vesselBox(r, k) is therefore the half-extent of a collar, plinth or cap
   *     k times as wide as the vessel it belongs to.
   */
  function vesselBox(r, k) { return r * k; }

  /** Paint a list of { d, paint } back to front. */
  function sortedPaint(items) {
    items.slice().sort(function (a, b) { return a.d - b.d; })
         .forEach(function (i) { i.paint(); });
  }

  /** Paint a list of solid blocks back to front, by their own footprint depth. */
  function worksBlocks(ctx, canvas, list) {
    sortedPaint(list.map(function (b) {
      return { d: b.x + b.y, paint: function () {
        I.box(ctx, canvas, b.x, b.y, b.hw, b.hh, b.h, b.c, b.base);
      } };
    }));
  }

  /*
   * The external structural frame: two portal frames straddling the main hall,
   * legs planted outside its walls and a tie beam carried over the roof.
   *
   * Drawn in two halves. The legs standing BEHIND the hall go down before it
   * and the rest after, so the hall sits inside its frame rather than in front
   * of it — the same two-part trick the Gateway archway uses to let a train
   * pass through it.
   */
  /*
   * The frame is deliberately ASYMMETRIC: the rear legs stand just clear of the
   * back wall, the front legs stand well out over the platform. That gap is
   * what the hoist below needs — on a symmetric frame its hook comes down
   * within a few centimetres of the front wall and reads as a cable draped
   * down the building rather than a crane working the platform.
   */
  var FRAME_BACK = WORKS_HH + 0.07;
  var FRAME_FRONT = WORKS_HH + 0.16;
  var FRAME_H = WORKS_H + 12;
  var FRAME_TOP = WORKS_BASE + FRAME_H;

  /*
   * ALONG-THE-TRACK COORDINATES, and why the whole shell is written in them.
   *
   * Every part of a works is described in (u, v): u runs ALONG the line the
   * building stands beside, v runs ACROSS it, positive toward the track. On
   * the first leg the line runs along y, so u is x and v is y. On the second
   * leg it runs along x, so u is y and v is x.
   *
   * The alternative — a second copy of the shell with the axes swapped — is
   * how a rotated building ends up with its platform, its frame, its doors or
   * its roof kit left facing the old way. Writing the offsets once, in (u, v),
   * makes it impossible for one of them to be forgotten.
   */
  function worksAxis(gx, gy, axis) {
    var vert = axis === 'y';
    return {
      vert: vert,
      gx: gx, gy: gy,
      x: vert ? function (u, v) { return gx + v; } : function (u, v) { return gx + u; },
      y: vert ? function (u, v) { return gy + u; } : function (u, v) { return gy + v; },
      hw: vert ? function (a, c) { return c; } : function (a, c) { return a; },
      hh: vert ? function (a, c) { return a; } : function (a, c) { return c; }
    };
  }

  /** Iso.box in along-the-track coordinates. */
  function wbox(ctx, canvas, A, u, v, ha, hc, h, colour, base) {
    I.box(ctx, canvas, A.x(u, v), A.y(u, v), A.hw(ha, hc), A.hh(ha, hc), h, colour, base);
  }

  /*
   * The two lit walls of a block, as face samplers. `front` looks at the track
   * and `end` looks along it — and WHICH of the box's two lit faces is which
   * depends on the leg, which is precisely the thing that is easy to get wrong
   * by hand. Iso.box lights the +y wall and the +x wall; on the first leg the
   * track is at +y, on the second it is at +x.
   */
  function worksWalls(canvas, A, u, v, ha, hc, base, h) {
    var c = I.corners(A.x(u, v), A.y(u, v), A.hw(ha, hc), A.hh(ha, hc), canvas);
    var L = function (uu, vv) {
      return facePoint(I.up(c.w, base), I.up(c.s, base), I.up(c.w, base + h), I.up(c.s, base + h), uu, vv);
    };
    var R = function (uu, vv) {
      return facePoint(I.up(c.s, base), I.up(c.e, base), I.up(c.s, base + h), I.up(c.e, base + h), uu, vv);
    };
    return A.vert ? { front: R, end: L } : { front: L, end: R };
  }

  /*
   * The frame is deliberately ASYMMETRIC across the track: the rear legs stand
   * just clear of the back wall, the front legs stand well out over the
   * platform. That gap is what the hoist below needs — on a symmetric frame its
   * hook comes down within a few centimetres of the front wall and reads as a
   * cable draped down the building rather than a crane working the platform.
   */
  function worksFrame(ctx, canvas, A, part) {
    var LEG = 0.028, span = WORKS_HW * 0.74;
    [-span, span].forEach(function (pu) {
      if (part === 'back') {
        wbox(ctx, canvas, A, pu, -FRAME_BACK, LEG, LEG, FRAME_H, WORKS.steel, WORKS_BASE);
      } else {
        wbox(ctx, canvas, A, pu, FRAME_FRONT, LEG, LEG, FRAME_H, WORKS.steel, WORKS_BASE);
        wbox(ctx, canvas, A, pu, (FRAME_FRONT - FRAME_BACK) / 2, LEG,
             (FRAME_FRONT + FRAME_BACK) / 2, 4, WORKS.trim, FRAME_TOP);      // cross tie
      }
    });
    if (part === 'front') {
      // A longitudinal tie joining the two portals, so the frame reads as a
      // cage around the building rather than two unrelated hoops. It rides
      // above the roof, so nothing can occlude it and its order is free.
      [-FRAME_BACK, FRAME_FRONT].forEach(function (pv) {
        wbox(ctx, canvas, A, 0, pv, span, LEG * 0.8, 3, WORKS.trim, FRAME_TOP + 4);
      });
    }
  }

  /*
   * The hoist: a trolley running along the front tie of the frame, lowering and
   * raising a crate over the platform.
   *
   * It hangs on the FRONT tie rather than crossing the roof on purpose. A
   * travelling crane over the deck would have to thread between whatever
   * machinery that particular works carries, and it would collide with the
   * canisters on one of them; on the front tie it is clear of all of them, it
   * is visibly serving the platform, and it costs the shared shell nothing.
   */
  function worksHoist(ctx, canvas, A, z, t) {
    var top = FRAME_TOP + 4;
    var cyc = ((t || 0) % 7000) / 7000;
    var run = Math.sin(cyc * Math.PI * 2);                 // travel along the tie
    var tu = run * WORKS_HW * 0.62, tv = FRAME_FRONT;
    // The hook drops while the trolley is near the ends of its run and rides
    // high across the middle, so it reads as fetching and carrying.
    var drop = 6 + 13 * Math.max(0, Math.cos(cyc * Math.PI * 4));

    wbox(ctx, canvas, A, tu, tv, 0.035, 0.030, 4, WORKS.steel, top - 4);   // trolley
    var p = I.up(I.toScreen(A.x(tu, tv), A.y(tu, tv), canvas), top - 4);
    ctx.strokeStyle = '#5f6a74';
    ctx.lineWidth = Math.max(0.5, 1 * z);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, p.y + drop * z);
    ctx.stroke();
    // The load, in crate brown rather than steel: a bare hook reads as a smudge
    // against the wall behind it, a crate reads as a crane doing something.
    wbox(ctx, canvas, A, tu, tv, 0.026, 0.020, 5, '#c2a06a', top - 4 - drop);
  }

  /*
   * The shell every works shares: the platform it stands on, the layered
   * blocks, the frame around them and the flat roof deck on top. The caller
   * adds only its own roof machinery, on WORKS_ROOF.
   */
  function worksShell(ctx, canvas, A, state, accent, z, t, wp) {
    var wall = state === 'current' ? '#dde3e8' : (wp && wp.wall || WORKS.wall);
    var lo   = state === 'current' ? '#bcc5cc' : (wp && wp.lo   || WORKS.wallLo);

    /*
     * The dedicated railway platform. This is the buffer the brief asks for —
     * the works never touches the ballast, it stands on a deck that ends short
     * of the line. render.js lays a second strip from here out to the track
     * itself; both are PALETTE.platform at height 3 so the two read as one
     * continuous deck rather than two slabs at slightly different levels.
     */
    wbox(ctx, canvas, A, 0, 0.03, 0.74, 0.44, WORKS_BASE, PALETTE.platform);
    var pc = I.corners(A.x(0, 0.03), A.y(0, 0.03), A.hw(0.74, 0.44), A.hh(0.74, 0.44), canvas);
    ctx.strokeStyle = 'rgba(90,80,64,.30)';
    ctx.lineWidth = Math.max(0.5, 1 * z);
    I.poly(ctx, [I.up(pc.n, WORKS_BASE), I.up(pc.e, WORKS_BASE),
                 I.up(pc.s, WORKS_BASE), I.up(pc.w, WORKS_BASE)]);
    ctx.stroke();

    worksFrame(ctx, canvas, A, 'back');

    worksBlocks(ctx, canvas, [
      // Rear range: a run of low utility blocks butted against the back wall.
      { u: -0.24, v: -0.30, ha: 0.24, hc: 0.07, h: 21, c: lo },
      { u:  0.26, v: -0.30, ha: 0.16, hc: 0.07, h: 14, c: lo },
      // The main hall.
      { u: 0, v: 0, ha: WORKS_HW, hc: WORKS_HH, h: WORKS_H, c: wall },
      // The stair core, off the hall's far end — the one thing that breaks the
      // flat skyline, and deliberately not a chimney or a spire.
      { u: 0.56, v: -0.12, ha: 0.09, hc: 0.11, h: 44, c: lo },
      // Front annex and a plant kiosk, on the platform side. Kept inboard of
      // FRAME_FRONT so the frame's front legs land on clear platform.
      { u:  0.26, v: 0.29, ha: 0.18, hc: 0.06, h: 13, c: lo },
      { u: -0.30, v: 0.29, ha: 0.14, hc: 0.06, h: 9, c: lo }
    ].map(function (b) {
      return { x: A.x(b.u, b.v), y: A.y(b.u, b.v), hw: A.hw(b.ha, b.hc),
               hh: A.hh(b.ha, b.hc), h: b.h, c: b.c, base: WORKS_BASE };
    }));

    /*
     * The stair core's glazed slot and cap. Drawn here rather than inside the
     * block list because a block is a solid and this is a face treatment; the
     * core sits at a greater depth than the hall, so by this point it has
     * already been painted and nothing else will cover it.
     */
    var sw = worksWalls(canvas, A, 0.56, -0.12, 0.09, 0.11, WORKS_BASE, 44);
    faceQuad(ctx, sw.front, 0.30, 0.70, 0.10, 0.90, WORKS.glass);
    for (var fl = 0; fl < 5; fl++) {
      faceQuad(ctx, sw.front, 0.34, 0.66, 0.14 + fl * 0.155, 0.14 + fl * 0.155 + 0.10, WORKS.pane);
    }
    wbox(ctx, canvas, A, 0.56, -0.12, 0.105, 0.125, 3, WORKS.trim, WORKS_BASE + 44);
    wbox(ctx, canvas, A, 0.56, -0.12, 0.05, 0.05, 4, accent, WORKS_BASE + 47);

    // --- the walls -----------------------------------------------------------
    var T = WORKS_BASE + WORKS_H;
    var w = worksWalls(canvas, A, 0, 0, WORKS_HW, WORKS_HH, WORKS_BASE, WORKS_H);

    /*
     * A continuous glazing band on both visible walls, and pilasters between
     * the bays so the wall has relief rather than being a flat painted panel.
     *
     * The pilaster tone is derived from the FACE, not from the wall colour.
     * Iso.box already darkens the two visible faces by different amounts, so a
     * pilaster shaded off the raw wall colour comes out lighter than the wall
     * it is supposed to be standing on — it read as white stripes, not relief.
     * Which face gets which darkening depends on the leg, so the tone is keyed
     * off the actual face, not off "front" and "end".
     */
    var LEFT_RIB = -0.44, RIGHT_RIB = -0.26;
    [[w.front, 9, A.vert ? RIGHT_RIB : LEFT_RIB],
     [w.end,   4, A.vert ? LEFT_RIB : RIGHT_RIB]].forEach(function (spec) {
      var f = spec[0], bays = spec[1];
      var rib = I.shade(wall, spec[2]);
      faceQuad(ctx, f, 0.05, 0.95, 0.50, 0.74, WORKS.glass);
      for (var i = 0; i < bays; i++) {
        var u0 = 0.07 + i * (0.86 / bays);
        faceQuad(ctx, f, u0, u0 + 0.86 / bays - 0.022, 0.53, 0.71, WORKS.pane);
      }
      for (i = 1; i < bays; i++) {
        var p = 0.05 + i * (0.90 / bays);
        faceQuad(ctx, f, p - 0.008, p + 0.008, 0.02, 0.98, rib);
      }
    });

    // The goods door, on the track side. This is the doorway a package
    // delivered off a flatbed disappears into — see Sprites.doorPoint, which
    // returns the point in front of it and must stay in step with this.
    faceQuad(ctx, w.front, 0.40, 0.60, 0.02, 0.36, WORKS.dark);
    I.poly(ctx, [w.front(0.38, 0.02), w.front(0.62, 0.02),
                 w.front(0.62, 0.055), w.front(0.38, 0.055)], accent);

    // --- the flat roof -------------------------------------------------------
    // A deck slab with a parapet standing proud of a darker membrane, so the
    // roof reads as a surface with an edge rather than a lid. Everything each
    // works puts on its roof stands on the membrane, at WORKS_ROOF.
    wbox(ctx, canvas, A, 0, 0, WORKS_HW + 0.025, WORKS_HH + 0.025, 3, WORKS.deck, T);
    wbox(ctx, canvas, A, 0, 0, WORKS_HW - 0.02, WORKS_HH - 0.02, 0.8, WORKS.membrane, T + 3);

    worksFrame(ctx, canvas, A, 'front');
    worksHoist(ctx, canvas, A, z, t);
  }

  /*
   * Where a delivery is handed over: the point on the platform directly in
   * front of a works' goods door, at deck height. main.js walks a package from
   * the flatbed to here and fades it out, so this and the door drawn in
   * worksShell have to agree — hence one function rather than a number copied
   * into the engine.
   */
  var DOOR_V = WORKS_HH + 0.02;

  function doorPoint(stop, at) {
    var vert = stop.axis === 'y';
    return vert ? { x: at.x + DOOR_V, y: at.y } : { x: at.x, y: at.y + DOOR_V };
  }

  /** A cyclonic separator's cone: an inverted cone under a lit rim. */
  function cone(ctx, canvas, gx, gy, r, base, h, colour) {
    var z = I.cam.zoom;
    var c = I.toScreen(gx, gy, canvas);
    var rx = r * I.TILE_W * z, ry = r * I.TILE_H * z;
    var ty = c.y - (base + h) * z, by = c.y - base * z;
    ctx.beginPath();
    ctx.moveTo(c.x - rx, ty);
    ctx.lineTo(c.x, by);                                    // down to the apex
    ctx.lineTo(c.x + rx, ty);
    ctx.ellipse(c.x, ty, rx, ry, 0, 0, Math.PI, true);      // back over the far rim
    ctx.closePath();
    ctx.fillStyle = I.shade(colour, -0.24);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(c.x, ty, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = I.shade(colour, 0.16);
    ctx.fill();
  }

  /** A banding ring round a roof cylinder, so it reads as a pressure vessel. */
  function band(ctx, canvas, gx, gy, r, at, colour, z) {
    var c = I.toScreen(gx, gy, canvas);
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(0.7, 2 * z);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y - at * z, r * I.TILE_W * z, r * I.TILE_H * z, 0, 0, Math.PI);
    ctx.stroke();
  }

  /*
   * Queue Qualifier: a multi-lane gating rig across the flat roof.
   *
   * The service takes a communication and decides which of the tenant's
   * pipelines it belongs to — it sorts a queue into lanes. So the roof carries
   * three lanes with parcels running along them and a gantry whose three gate
   * arms drop in turn, letting one lane through at a time. All of it is on one
   * clock, which is what makes it read as machinery working rather than
   * ornament bolted on.
   */
  function sortingStation(ctx, canvas, stop, state, z, t) {
    var gx = stop.grid.x, gy = stop.grid.y;
    var accent = state === 'current' ? '#f0a132' : '#e0902c';
    var beat = ((t || 0) % 2600) / 2600;
    var RB = WORKS_ROOF;

    worksShell(ctx, canvas, worksAxis(gx, gy, stop.axis), state, accent, z, t,
               { wall: '#d4c4a0', lo: '#bcac88' });  // warm beige — Queue Qualifier

    var LANES = [-0.11, 0, 0.11];
    var items = [];

    // The three sorting lanes, and the parcels running along them. A parcel
    // turns the accent colour once it is past the gate: that is the qualifying.
    LANES.forEach(function (off, li) {
      var ly = gy + off;
      items.push({ d: gx + ly - 0.30, paint: function () {
        I.box(ctx, canvas, gx, ly, 0.32, 0.020, 2, '#79828a', RB);
      } });
      for (var p = 0; p < 2; p++) {
        var u = (((t || 0) / 2600) + li * 0.31 + p * 0.5) % 1;
        var px = gx - 0.30 + u * 0.60;
        items.push({ d: px + ly, paint: function () {
          I.box(ctx, canvas, px, ly, 0.030, 0.020, 3.5, u > 0.55 ? accent : '#aab6bf', RB + 2);
        } });
      }
    });

    // The control cabin at the west end, with a lit window.
    items.push({ d: gx - 0.36 + gy, paint: function () {
      I.box(ctx, canvas, gx - 0.36, gy, 0.07, 0.10, 13, WORKS.wall, RB);
      var cc = I.corners(gx - 0.36, gy, 0.07, 0.10, canvas);
      var cf = function (u, v) {
        return facePoint(I.up(cc.w, RB), I.up(cc.s, RB), I.up(cc.w, RB + 13), I.up(cc.s, RB + 13), u, v);
      };
      faceQuad(ctx, cf, 0.15, 0.85, 0.42, 0.80, beat < 0.5 ? '#9fc4d6' : '#7fa8bd');
    } });

    // The collection hopper at the east end, where the sorted lanes converge.
    items.push({ d: gx + 0.34 + gy, paint: function () {
      I.box(ctx, canvas, gx + 0.34, gy, 0.06, 0.15, 6, WORKS.wallLo, RB);
      cone(ctx, canvas, gx + 0.34, gy, 0.062, RB + 6, 9, WORKS.trim);
    } });

    // The gantry, last: it spans every lane, so it belongs over all of them.
    items.push({ d: gx + gy + 0.60, paint: function () {
      var GX = gx + 0.04;
      [-0.19, 0.19].forEach(function (o) {
        I.box(ctx, canvas, GX, gy + o, 0.022, 0.022, 17, WORKS.steel, RB);
      });
      I.box(ctx, canvas, GX, gy, 0.024, 0.19, 4, WORKS.trim, RB + 17);

      LANES.forEach(function (off, a) {
        var phase = (beat * 3 + a * 0.34) % 1;
        var drop = phase < 0.30 ? Math.sin(phase / 0.30 * Math.PI) : 0;
        var pivot = I.up(I.toScreen(GX, gy + off, canvas), RB + 17);
        var ang = -Math.PI / 2 + drop * (Math.PI / 2.1);
        ctx.strokeStyle = drop > 0.1 ? accent : '#9aa4ad';
        ctx.lineWidth = Math.max(0.9, 2 * z);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pivot.x, pivot.y);
        ctx.lineTo(pivot.x + Math.cos(ang) * 9 * z, pivot.y - Math.sin(ang) * 9 * z);
        ctx.stroke();
        ctx.fillStyle = drop > 0.1 ? '#f0b040' : '#5f6a74';
        ctx.beginPath();
        ctx.arc(pivot.x, pivot.y, 2 * z, 0, Math.PI * 2);
        ctx.fill();
      });
    } });

    sortedPaint(items);
    worksSign(ctx, canvas, gx, gy, stop, state, z);
  }

  /*
   * Surveillance Filter: a filtration plant on the flat roof.
   *
   * Three heavy-duty canisters standing on the deck, two cyclonic separators
   * at the east end, and a header duct along the back wall with a spur up into
   * every vessel. The service takes everything the qualifier passed and keeps
   * only what has to be reviewed, and a filter house is what that looks like.
   */
  function filterStation(ctx, canvas, stop, state, z, t) {
    var gx = stop.grid.x, gy = stop.grid.y;
    var accent = state === 'current' ? '#f0a132' : '#3f8f9c';
    var RB = WORKS_ROOF;
    var items = [];

    worksShell(ctx, canvas, worksAxis(gx, gy, stop.axis), state, accent, z, t,
               { wall: '#a0bc9c', lo: '#88a484' });  // sage green — Surveillance Filter

    // The intake header, running along the back of the deck.
    items.push({ d: gx + gy - 0.22, paint: function () {
      I.box(ctx, canvas, gx - 0.05, gy - 0.20, 0.32, 0.022, 7, WORKS.trim, RB);
    } });

    /*
     * Three canisters, each on a collar, banded, with a spur duct back to the
     * header. R is sized against the 2r grid coverage above, so all three plus
     * the two cyclones sit inside the parapet with daylight between them.
     */
    var R = 0.052;
    [-0.28, -0.05, 0.18].forEach(function (ox, i) {
      var cx = gx + ox, cy = gy - 0.02;
      items.push({ d: cx + cy, paint: function () {
        I.box(ctx, canvas, cx, cy - 0.10, 0.014, 0.08, 4, WORKS.trim, RB + 5);  // spur
        I.box(ctx, canvas, cx, cy, vesselBox(R, 1.24), vesselBox(R, 1.24),
              2.5, WORKS.trim, RB);                                            // collar
        I.cylinder(ctx, canvas, cx, cy, R, 22, WORKS.steel, RB + 2.5);
        band(ctx, canvas, cx, cy, R, RB + 11, I.shade(WORKS.steel, -0.34), z);
        band(ctx, canvas, cx, cy, R, RB + 18, I.shade(WORKS.steel, -0.34), z);
        // A gauge collar in the accent, so the vessels carry the station's
        // colour without repainting the whole roof.
        band(ctx, canvas, cx, cy, R + 0.002, RB + 23, accent, z);
        // The pulse of the filter: a level light that fills and fades.
        var lvl = ((((t || 0) / 3000) + i * 0.33) % 1);
        var lc = I.toScreen(cx, cy, canvas);
        ctx.save();
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.30 + 0.55 * Math.sin(lvl * Math.PI);
        ctx.beginPath();
        ctx.arc(lc.x, lc.y - (RB + 7) * z, 1.7 * z, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } });
    });

    // Two cyclonic separators at the east end: a squat cone standing on a
    // plinth on the deck with a short throat above it. Kept inboard of the
    // parapet, because a cone whose apex reaches the roof edge reads as
    // hanging off the side of the building rather than standing on it.
    var CR = 0.042;
    [[0.33, -0.08], [0.33, 0.09]].forEach(function (o) {
      var cx = gx + o[0], cy = gy + o[1];
      items.push({ d: cx + cy, paint: function () {
        I.box(ctx, canvas, cx, cy, vesselBox(CR, 1.0), vesselBox(CR, 1.0),
              3, WORKS.trim, RB);
        cone(ctx, canvas, cx, cy, CR, RB + 3, 8, WORKS.wallLo);
        I.cylinder(ctx, canvas, cx, cy, CR, 7, WORKS.steel, RB + 11);
        I.box(ctx, canvas, cx, cy, vesselBox(CR, 1.0), vesselBox(CR, 1.0),
              2, accent, RB + 18);
      } });
    });

    // An extract fan on the deck's front edge, turning slowly.
    items.push({ d: gx - 0.30 + gy + 0.15, paint: function () {
      var fx = gx - 0.30, fy = gy + 0.15;
      I.box(ctx, canvas, fx, fy, 0.09, 0.07, 5, WORKS.trim, RB);
      var fc = I.up(I.toScreen(fx, fy, canvas), RB + 5);
      ctx.fillStyle = '#5d666e';
      ctx.beginPath();
      ctx.ellipse(fc.x, fc.y, 7 * z, 3.4 * z, 0, 0, Math.PI * 2);
      ctx.fill();
      var a0 = ((t || 0) / 1300) % 1 * Math.PI * 2;
      ctx.strokeStyle = '#cdd3d8';
      ctx.lineWidth = Math.max(0.6, 1.3 * z);
      for (var b = 0; b < 3; b++) {
        var ang = a0 + b * (Math.PI * 2 / 3);
        ctx.beginPath();
        ctx.moveTo(fc.x, fc.y);
        ctx.lineTo(fc.x + Math.cos(ang) * 6 * z, fc.y + Math.sin(ang) * 2.9 * z);
        ctx.stroke();
      }
    } });

    sortedPaint(items);
    worksSign(ctx, canvas, gx, gy, stop, state, z);
  }

  /*
   * Policy Evaluator: a quality-control scanning arch over a roof conveyor.
   *
   * Items run along a short line on the deck, pass under an inspection arch
   * whose validation lights sweep across them, and come out the far side either
   * cleared or flagged — which is exactly what the service decides. Two
   * mechanised testing arms reach in as each item goes under.
   */
  function scanStation(ctx, canvas, stop, state, z, t) {
    var gx = stop.grid.x, gy = stop.grid.y;
    var accent = state === 'current' ? '#f0a132' : '#7a5aa3';
    var RB = WORKS_ROOF;
    var cy = gy + 0.02, AX = gx + 0.05;               // conveyor line, arch position
    var items = [];

    worksShell(ctx, canvas, worksAxis(gx, gy, stop.axis), state, accent, z, t,
               { wall: '#c07860', lo: '#a86048' });  // terracotta — Policy Evaluator

    // The roof conveyor: a bed, a running surface, and roller ticks sliding
    // along it so the line reads as moving even between items.
    items.push({ d: gx + cy - 0.40, paint: function () {
      I.box(ctx, canvas, gx, cy, 0.36, 0.032, 4, '#5b636a', RB);
      I.box(ctx, canvas, gx, cy, 0.35, 0.026, 1.5, '#79828a', RB + 4);
      var p = I.up(I.toScreen(gx - 0.35, cy, canvas), RB + 5.5);
      var q = I.up(I.toScreen(gx + 0.35, cy, canvas), RB + 5.5);
      var vx = q.x - p.x, vy = q.y - p.y, len = Math.hypot(vx, vy) || 1;
      var nx = -vy / len, ny = vx / len, sp = 7 * z;
      ctx.strokeStyle = 'rgba(30,36,41,.45)';
      ctx.lineWidth = Math.max(0.5, 1 * z);
      ctx.beginPath();
      for (var d = ((t || 0) / 40) % sp; d < len; d += sp) {
        var mx = p.x + vx * (d / len), my = p.y + vy * (d / len);
        ctx.moveTo(mx - nx * 2.6 * z, my - ny * 2.6 * z);
        ctx.lineTo(mx + nx * 2.6 * z, my + ny * 2.6 * z);
      }
      ctx.stroke();
    } });

    // The items under evaluation. Grey going in; cleared or flagged coming out,
    // decided per item so the roof shows both outcomes rather than one.
    for (var i = 0; i < 3; i++) {
      (function (n) {
        var u = ((((t || 0) / 5200) + n / 3) % 1);
        var ix = gx - 0.34 + u * 0.68;
        var past = ix > AX;
        var pass = (n % 3) !== 1;
        items.push({ d: ix + cy + 0.01, paint: function () {
          I.box(ctx, canvas, ix, cy, 0.032, 0.021, 4,
                past ? (pass ? '#4ec08a' : '#e0902c') : '#93a0aa', RB + 5.5);
        } });
      })(i);
    }

    // The results cabinet at the west end, its readout ticking over.
    items.push({ d: gx - 0.40 + gy, paint: function () {
      I.box(ctx, canvas, gx - 0.40, gy, 0.06, 0.11, 15, WORKS.wall, RB);
      var cc = I.corners(gx - 0.40, gy, 0.06, 0.11, canvas);
      var cf = function (u, v) {
        return facePoint(I.up(cc.w, RB), I.up(cc.s, RB), I.up(cc.w, RB + 15), I.up(cc.s, RB + 15), u, v);
      };
      faceQuad(ctx, cf, 0.14, 0.86, 0.40, 0.84, '#1d242a');
      for (var r = 0; r < 3; r++) {
        var slot = (r + (((t || 0) / 1700) % 1)) % 3;
        var v0 = 0.44 + slot * 0.13;
        I.poly(ctx, [cf(0.20, v0), cf(0.20 + (slot < 1 ? 0.34 : 0.58), v0),
                     cf(0.20 + (slot < 1 ? 0.34 : 0.58), v0 + 0.07),
                     cf(0.20, v0 + 0.07)], slot < 1 ? accent : '#3f8f6a');
      }
    } });

    // The scanning arch itself, and the testing arms that reach in under it.
    items.push({ d: gx + gy + 0.60, paint: function () {
      [-0.17, 0.21].forEach(function (o) {
        I.box(ctx, canvas, AX, gy + o, 0.026, 0.026, 19, WORKS.steel, RB);
      });
      I.box(ctx, canvas, AX, cy, 0.030, 0.19, 5, accent, RB + 19);
      I.box(ctx, canvas, AX, cy, 0.036, 0.20, 1.5, WORKS.trim, RB + 24);

      // The validation light array, sweeping along the underside of the head.
      var sweep = (((t || 0) / 900) % 1);
      for (var L = 0; L < 5; L++) {
        var ly = gy - 0.15 + L * 0.085;
        var lp = I.up(I.toScreen(AX, ly, canvas), RB + 18);
        var on = Math.abs(((sweep * 5) % 5) - L) < 0.9;
        ctx.fillStyle = on ? '#ffd479' : '#4a545b';
        ctx.beginPath();
        ctx.arc(lp.x, lp.y, (on ? 1.5 : 1.1) * z, 0, Math.PI * 2);
        ctx.fill();
      }

      // Two testing arms, reaching in toward the line and back out again.
      var reach = 0.5 + 0.5 * Math.sin(((t || 0) / 700));
      [-1, 1].forEach(function (s) {
        var base = I.up(I.toScreen(AX - 0.10 * s, cy + 0.13 * s, canvas), RB + 6);
        var tip = I.up(I.toScreen(AX - 0.10 * s + 0.05 * s * reach,
                                  cy + (0.13 - 0.10 * reach) * s, canvas), RB + 9);
        ctx.strokeStyle = WORKS.steel;
        ctx.lineWidth = Math.max(0.8, 1.8 * z);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
        ctx.fillStyle = reach > 0.7 ? '#ffd479' : '#6b7580';
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 1.8 * z, 0, Math.PI * 2);
        ctx.fill();
      });
    } });

    sortedPaint(items);
    worksSign(ctx, canvas, gx, gy, stop, state, z);
  }

  /*
   * Quota Manager: a metering house, and the first works on the second leg.
   *
   * Everything about it is the shared works turned through 90 degrees to face
   * the new track — footprint, platform, frame, doors and roof kit all come
   * from the same (u, v) description, with u now running along y. On the roof:
   * a bank of pressure gauges whose needles sweep, a spinning ball governor
   * that opens as it turns, and a load-balancing beam that tips one way and
   * then the other. Three different ways of saying "this thing measures and
   * apportions", which is what a quota manager does.
   */
  function meterStation(ctx, canvas, stop, state, z, t) {
    var gx = stop.grid.x, gy = stop.grid.y;
    var A = worksAxis(gx, gy, stop.axis);
    var accent = state === 'current' ? '#f0a132' : '#b5842f';
    var RB = WORKS_ROOF;
    var items = [];

    worksShell(ctx, canvas, A, state, accent, z, t,
               { wall: '#c8b060', lo: '#b09848' });  // mustard yellow — Quota Manager

    // --- the gauge bank, at the near end ------------------------------------
    items.push({ d: A.x(-0.33, 0) + A.y(-0.33, 0), paint: function () {
      wbox(ctx, canvas, A, -0.33, 0, 0.10, 0.16, 14, WORKS.wall, RB);
      var gw = worksWalls(canvas, A, -0.33, 0, 0.10, 0.16, RB, 14);
      faceQuad(ctx, gw.front, 0.08, 0.92, 0.30, 0.88, '#1d242a');
      for (var g = 0; g < 3; g++) {
        // Needles sweep at different rates, which is what stops three dials
        // reading as one repeated sprite.
        var c0 = gw.front(0.20 + g * 0.30, 0.59);
        var r = 3.4 * z;
        ctx.fillStyle = '#e8e2d2';
        ctx.beginPath();
        ctx.arc(c0.x, c0.y, r, 0, Math.PI * 2);
        ctx.fill();
        var ang = -Math.PI / 2 + Math.sin(((t || 0) / (900 + g * 320))) * 1.9;
        ctx.strokeStyle = g === 1 ? accent : '#33302a';
        ctx.lineWidth = Math.max(0.5, 1.1 * z);
        ctx.beginPath();
        ctx.moveTo(c0.x, c0.y);
        ctx.lineTo(c0.x + Math.cos(ang) * r * 0.8, c0.y + Math.sin(ang) * r * 0.8);
        ctx.stroke();
      }
    } });

    // --- the ball governor --------------------------------------------------
    items.push({ d: A.x(-0.04, 0) + A.y(-0.04, 0), paint: function () {
      wbox(ctx, canvas, A, -0.04, 0, 0.09, 0.09, 4, WORKS.trim, RB);
      I.cylinder(ctx, canvas, A.x(-0.04, 0), A.y(-0.04, 0), 0.030, 17, WORKS.steel, RB + 4);
      var top = I.up(I.toScreen(A.x(-0.04, 0), A.y(-0.04, 0), canvas), RB + 21);
      // The arms fly out as the governor speeds up and fall back as it slows —
      // the single most legible way to draw "regulating a rate".
      var spin = ((t || 0) / 260) % (Math.PI * 2);
      var open = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(((t || 0) / 1900)));
      for (var a = 0; a < 2; a++) {
        var ang = spin + a * Math.PI;
        var ex = top.x + Math.cos(ang) * 11 * z * open;
        var ey = top.y + Math.sin(ang) * 5.2 * z * open + 6 * z * (1 - open);
        ctx.strokeStyle = '#9aa4ad';
        ctx.lineWidth = Math.max(0.6, 1.3 * z);
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(ex, ey, 2.4 * z, 0, Math.PI * 2);
        ctx.fill();
      }
    } });

    // --- the load-balancing beam -------------------------------------------
    items.push({ d: A.x(0.30, 0) + A.y(0.30, 0), paint: function () {
      var fu = 0.30;
      wbox(ctx, canvas, A, fu, 0, 0.05, 0.05, 15, WORKS.steel, RB);        // fulcrum
      var piv = I.up(I.toScreen(A.x(fu, 0), A.y(fu, 0), canvas), RB + 15);
      var tip = Math.sin(((t || 0) / 1500)) * 0.42;
      // The beam is struck in screen space from the pivot because it TILTS —
      // it is the one part of a works that leaves the isometric plane, and
      // pretending otherwise would make it read as sliding rather than tipping.
      var armU = 0.15;
      var ea = I.up(I.toScreen(A.x(fu - armU, 0), A.y(fu - armU, 0), canvas), RB + 15);
      var eb = I.up(I.toScreen(A.x(fu + armU, 0), A.y(fu + armU, 0), canvas), RB + 15);
      var lift = 7 * z * tip;
      var pa = { x: ea.x, y: ea.y - lift }, pb = { x: eb.x, y: eb.y + lift };
      ctx.strokeStyle = WORKS.trim;
      ctx.lineWidth = Math.max(1, 2.6 * z);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
      [pa, pb].forEach(function (e, i) {                                    // the pans
        ctx.strokeStyle = '#7f8b95';
        ctx.lineWidth = Math.max(0.4, 0.9 * z);
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x, e.y + 6 * z);
        ctx.stroke();
        ctx.fillStyle = i === 0 ? accent : '#8d969e';
        ctx.beginPath();
        ctx.ellipse(e.x, e.y + 7 * z, 5 * z, 2.2 * z, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    } });

    sortedPaint(items);
    worksSign(ctx, canvas, gx, gy, stop, state, z);
  }

  /*
   * Cognition: a processing array, off the running lines.
   *
   * The roof carries a lattice of mechanical nodes wired together by conduit
   * runs, with pulses travelling along the conduits from node to node. It is
   * the one works on the map whose roof is a NETWORK rather than a line of
   * plant, which is the point — everything else on this map processes a queue,
   * this thing reasons over one.
   */
  function cognitionWorks(ctx, canvas, stop, state, z, t) {
    var gx = stop.grid.x, gy = stop.grid.y;
    var A = worksAxis(gx, gy, stop.axis);
    var accent = state === 'current' ? '#f0a132' : '#5a7fb8';
    var RB = WORKS_ROOF;
    var items = [];

    worksShell(ctx, canvas, A, state, accent, z, t);

    // Node positions: three along the roof, two across it. The conduits below
    // are derived from these, so moving a node moves its wiring with it.
    var NU = [-0.30, -0.02, 0.26], NV = [-0.10, 0.10];

    // Conduit runs first — they lie flat on the deck and everything else
    // stands on top of them.
    NV.forEach(function (v, r) {
      items.push({ d: A.x(0, v) + A.y(0, v) - 0.5, paint: function () {
        wbox(ctx, canvas, A, -0.02, v, 0.32, 0.016, 2, WORKS.trim, RB);
      } });
    });
    NU.forEach(function (u) {
      items.push({ d: A.x(u, 0) + A.y(u, 0) - 0.4, paint: function () {
        wbox(ctx, canvas, A, u, 0, 0.016, 0.11, 2, WORKS.trim, RB);
      } });
    });

    // The pulses. Each one runs a lane of the lattice on its own phase, so the
    // roof never settles into a single blinking rhythm.
    for (var p = 0; p < 6; p++) {
      (function (n) {
        var lane = NV[n % 2];
        var ph = ((((t || 0) / 2600) + n * 0.17) % 1);
        var pu = -0.34 + ph * 0.68;
        items.push({ d: A.x(pu, lane) + A.y(pu, lane) + 0.05, paint: function () {
          var s0 = I.up(I.toScreen(A.x(pu, lane), A.y(pu, lane), canvas), RB + 2);
          ctx.save();
          ctx.globalAlpha = 0.45 + 0.55 * Math.sin(ph * Math.PI);
          ctx.fillStyle = '#8fd0ff';
          ctx.beginPath();
          ctx.arc(s0.x, s0.y, 2 * z, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } });
      })(p);
    }

    // The nodes themselves: stubby drums on collars, the taller ones capped in
    // the accent so the array has a hierarchy rather than six identical lumps.
    NV.forEach(function (v, r) {
      NU.forEach(function (u, c) {
        var tall = ((r + c) % 2) === 0;
        items.push({ d: A.x(u, v) + A.y(u, v), paint: function () {
          wbox(ctx, canvas, A, u, v, 0.055, 0.055, 3, WORKS.trim, RB + 2);
          I.cylinder(ctx, canvas, A.x(u, v), A.y(u, v), 0.045, tall ? 15 : 9,
                     WORKS.steel, RB + 5);
          var h = RB + 5 + (tall ? 15 : 9);
          wbox(ctx, canvas, A, u, v, 0.048, 0.048, 2, tall ? accent : WORKS.wallLo, h);
          if (tall) {
            var lp = I.up(I.toScreen(A.x(u, v), A.y(u, v), canvas), h + 2);
            ctx.save();
            ctx.globalAlpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(((t || 0) / 700) + c));
            ctx.fillStyle = '#8fd0ff';
            ctx.beginPath();
            ctx.arc(lp.x, lp.y, 1.8 * z, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        } });
      });
    });

    sortedPaint(items);
    worksSign(ctx, canvas, gx, gy, stop, state, z);
  }

  /*
   * ======================================================================
   * YARDS: buildings the line runs INTO.
   * ======================================================================
   *
   * A yard has no platform and no halt. The track goes through its front bay
   * doors and the cart is swallowed — which is why render.js gives these kinds
   * a zero apron and never trims their rails.
   *
   * The bay is always on the +y wall, because every yard on this map is
   * approached from +y travelling -y. That is NOT the same as the works' idea
   * of "front" (the wall facing the track it stands BESIDE), so these painters
   * do not use worksWalls — they take the +y face directly.
   */
  function yardFace(canvas, gx, gy, hw, hh, base, h) {
    var c = I.corners(gx, gy, hw, hh, canvas);
    return {
      // The +y wall: the one the track comes in through.
      bay: function (u, v) {
        return facePoint(I.up(c.w, base), I.up(c.s, base), I.up(c.w, base + h), I.up(c.s, base + h), u, v);
      },
      // The +x wall: the long flank.
      flank: function (u, v) {
        return facePoint(I.up(c.s, base), I.up(c.e, base), I.up(c.s, base + h), I.up(c.e, base + h), u, v);
      }
    };
  }

  /*
   * A set of bay doors on a yard's front wall. `open` is the index of the door
   * the track actually runs through: it is drawn as a black void with no
   * shutter, so a cart entering it visibly goes inside rather than up against
   * a painted rectangle.
   */
  function bayDoors(ctx, f, n, open, accent, z) {
    for (var i = 0; i < n; i++) {
      var c0 = (i + 0.5) / n;
      var w = 0.30 / n;
      var isOpen = i === open;
      var top = isOpen ? 0.66 : 0.50;
      faceQuad(ctx, f, c0 - w, c0 + w, 0.02, top, isOpen ? '#141a1f' : '#3b444c');
      if (!isOpen) {
        for (var sl = 0; sl < 5; sl++) {
          var v0 = 0.06 + sl * 0.088;
          I.poly(ctx, [f(c0 - w, v0), f(c0 + w, v0), f(c0 + w, v0 + 0.035), f(c0 - w, v0 + 0.035)],
                 '#4d5860');
        }
      }
      I.poly(ctx, [f(c0 - w - 0.012, 0.02), f(c0 + w + 0.012, 0.02),
                   f(c0 + w + 0.012, 0.048), f(c0 - w - 0.012, 0.048)],
             isOpen ? accent : '#6b7580');
    }
  }

  /*
   * Alerting: the railway yard the second leg runs into.
   *
   * Deliberately the biggest structure on the map after the Archive — a long
   * shed with a five-bay frontage, a saw-tooth run of roof lights along the
   * flat deck and a full external frame. The centre bay is open and on the
   * track's own centre line, so the cart drives straight in and is gone.
   */
  var ALERT_HW = 0.80, ALERT_HH = 1.10, ALERT_H = 34;

  function railYard(ctx, canvas, stop, state, z, t) {
    var gx = stop.grid.x, gy = stop.grid.y;
    var accent = state === 'current' ? '#f0a132' : '#c2503f';
    var wall = state === 'current' ? '#dde3e8' : '#8098b4';  // slate blue — Alerting
    var lo   = state === 'current' ? '#bcc5cc' : '#607898';
    var B = 2, T = B + ALERT_H;

    I.box(ctx, canvas, gx, gy, ALERT_HW + 0.14, ALERT_HH + 0.12, B, '#b7bdc3');   // apron

    // Rear plant range, against the back wall and behind the shed in depth, so
    // it is painted first and the shed covers where they meet.
    I.box(ctx, canvas, gx - 0.30, gy - ALERT_HH - 0.10, 0.34, 0.10, 20, lo, B);

    I.box(ctx, canvas, gx, gy, ALERT_HW, ALERT_HH, ALERT_H, wall, B);
    I.box(ctx, canvas, gx, gy, ALERT_HW + 0.03, ALERT_HH + 0.03, 3, WORKS.deck, T);
    I.box(ctx, canvas, gx, gy, ALERT_HW - 0.03, ALERT_HH - 0.03, 0.8, WORKS.membrane, T + 3);

    var f = yardFace(canvas, gx, gy, ALERT_HW, ALERT_HH, B, ALERT_H);

    // The flank: a long glazing band with pilasters, same treatment as a works.
    var rib = I.shade(wall, -0.26);
    faceQuad(ctx, f.flank, 0.05, 0.95, 0.52, 0.76, WORKS.glass);
    for (var i = 0; i < 8; i++) {
      var u0 = 0.07 + i * 0.107;
      faceQuad(ctx, f.flank, u0, u0 + 0.085, 0.55, 0.73, WORKS.pane);
    }
    for (i = 1; i < 8; i++) faceQuad(ctx, f.flank, 0.05 + i * 0.1125 - 0.008,
                                     0.05 + i * 0.1125 + 0.008, 0.02, 0.98, rib);

    // The frontage: five bays, the middle one open on the track's centre line.
    faceQuad(ctx, f.bay, 0.02, 0.98, 0.70, 0.86, I.shade(wall, -0.50));      // fascia
    bayDoors(ctx, f.bay, 5, 2, accent, z);

    // --- the roof: saw-tooth roof lights along the deck ---------------------
    var RB = T + 3.8;
    for (var r = 0; r < 5; r++) {
      var ry = gy - 0.78 + r * 0.39;
      I.box(ctx, canvas, gx, ry, ALERT_HW - 0.10, 0.055, 5, WORKS.trim, RB);
      I.box(ctx, canvas, gx, ry - 0.03, ALERT_HW - 0.14, 0.020, 4, '#7fb2c9', RB + 5);
    }
    // Extract stacks along the far edge, and a rooftop beacon that pulses.
    [-0.44, 0.44].forEach(function (o) {
      I.cylinder(ctx, canvas, gx + o, gy - 0.95, 0.05, 16, WORKS.steel, RB);
    });
    var bc = I.up(I.toScreen(gx, gy + 0.92, canvas), RB + 12);
    I.box(ctx, canvas, gx, gy + 0.92, 0.05, 0.05, 12, WORKS.steel, RB);
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(((t || 0) / 380)));
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(bc.x, bc.y, 3.2 * z, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // External frame: three portal ribs over the shed, in the works family.
    [-0.62, 0, 0.62].forEach(function (o) {
      [-1, 1].forEach(function (sgn) {
        I.box(ctx, canvas, gx + sgn * (ALERT_HW + 0.06), gy + o, 0.03, 0.03, ALERT_H + 12, WORKS.steel, B);
      });
      I.box(ctx, canvas, gx, gy + o, ALERT_HW + 0.06, 0.03, 4, WORKS.trim, B + ALERT_H + 12);
    });

    if (state === 'current') haloRing(ctx, canvas, gx, gy, 1.25, '#f0a132', z);
    var top = I.up(I.toScreen(gx, gy, canvas), B);
    nameboard(ctx, top.x, top.y - 92 * z, stop.name, stop.tech, z);
  }

  /*
   * The three terminal yards at the head of the yard throat. One painter, one
   * shell, and a `kit` that decides what stands on the flat roof — the same
   * arrangement the works use, for the same reason: the family has to read as
   * a family, and the roof is what tells them apart.
   */
  var TERM_HW = 0.62, TERM_HH = 0.80, TERM_H = 26;

  /*
   * Yard footprints, exported because js/main.js needs to know when a flatbed
   * has driven inside one — that is the moment the cart has to start sorting
   * BEHIND the shed instead of in front of it, and the two cannot disagree
   * about where the walls are.
   */
  var YARD_FOOT = { railyard: [ALERT_HW, ALERT_HH], terminal: [TERM_HW, TERM_HH] };

  function terminalYard(ctx, canvas, stop, state, z, t) {
    var gx = stop.grid.x, gy = stop.grid.y;
    var accent = state === 'current' ? '#f0a132'
               : (stop.kit === 'acoustic' ? '#2f8f88'
                 : stop.kit === 'inspect' ? '#7a5aa3' : '#b85f8a');
    var wallBase = stop.kit === 'acoustic' ? '#dccdb0'   // parchment — Echo Engine
                 : stop.kit === 'inspect'  ? '#9abcb0'   // celadon — Review Service
                 :                           '#b87858';  // copper — Reporting
    var loBase   = stop.kit === 'acoustic' ? '#c4b598'
                 : stop.kit === 'inspect'  ? '#82a498'
                 :                           '#9c6040';
    var wall = state === 'current' ? '#dde3e8' : wallBase;
    var B = 2, T = B + TERM_H, RB = T + 3.8;

    I.box(ctx, canvas, gx, gy, TERM_HW + 0.12, TERM_HH + 0.10, B, '#b7bdc3');
    // A low annex against the back wall, so even the small yards are layered
    // rather than a single block with a lid.
    I.box(ctx, canvas, gx - 0.18, gy - TERM_HH - 0.09, 0.26, 0.09, 15, loBase, B);

    I.box(ctx, canvas, gx, gy, TERM_HW, TERM_HH, TERM_H, wall, B);
    I.box(ctx, canvas, gx, gy, TERM_HW + 0.03, TERM_HH + 0.03, 3, WORKS.deck, T);
    I.box(ctx, canvas, gx, gy, TERM_HW - 0.03, TERM_HH - 0.03, 0.8, WORKS.membrane, T + 3);

    var f = yardFace(canvas, gx, gy, TERM_HW, TERM_HH, B, TERM_H);
    var rib = I.shade(wall, -0.26);
    faceQuad(ctx, f.flank, 0.06, 0.94, 0.50, 0.76, WORKS.glass);
    for (var i = 0; i < 5; i++) faceQuad(ctx, f.flank, 0.08 + i * 0.172, 0.08 + i * 0.172 + 0.135, 0.53, 0.73, WORKS.pane);
    for (i = 1; i < 5; i++) faceQuad(ctx, f.flank, 0.06 + i * 0.176 - 0.008, 0.06 + i * 0.176 + 0.008, 0.02, 0.98, rib);

    faceQuad(ctx, f.bay, 0.03, 0.97, 0.72, 0.88, I.shade(wall, -0.50));
    bayDoors(ctx, f.bay, 3, 1, accent, z);

    terminalKit(ctx, canvas, gx, gy, stop.kit, accent, RB, z, t);

    // Two portal ribs, keeping the terminals in the same structural family.
    [-0.42, 0.42].forEach(function (o) {
      [-1, 1].forEach(function (sgn) {
        I.box(ctx, canvas, gx + sgn * (TERM_HW + 0.05), gy + o, 0.026, 0.026, TERM_H + 10, WORKS.steel, B);
      });
      I.box(ctx, canvas, gx, gy + o, TERM_HW + 0.05, 0.026, 3.5, WORKS.trim, B + TERM_H + 10);
    });

    if (state === 'current') haloRing(ctx, canvas, gx, gy, 0.92, '#f0a132', z);
    var top = I.up(I.toScreen(gx, gy, canvas), B);
    nameboard(ctx, top.x, top.y - 74 * z, stop.name, stop.tech, z);
  }

  /** What stands on a terminal yard's flat roof. */
  function terminalKit(ctx, canvas, gx, gy, kit, accent, RB, z, t) {
    var items = [];

    if (kit === 'acoustic') {
      /*
       * Echo Engine: acoustic baffles. Seven ribs across the deck whose heights
       * follow a travelling wave, so the roof visibly ripples end to end — an
       * echo drawn as the shape of one rather than as a speaker symbol.
       */
      for (var b = 0; b < 7; b++) {
        (function (n) {
          var by = gy - 0.58 + n * 0.195;
          var ph = ((t || 0) / 1400) - n * 0.5;
          var h = 6 + 7 * (0.5 + 0.5 * Math.sin(ph));
          items.push({ d: gx + by, paint: function () {
            I.box(ctx, canvas, gx, by, 0.42, 0.035, h, WORKS.trim, RB);
            I.box(ctx, canvas, gx, by, 0.44, 0.045, 1.6, accent, RB + h);
          } });
        })(b);
      }
      items.push({ d: gx + gy + 0.7, paint: function () {
        cone(ctx, canvas, gx + 0.44, gy + 0.62, 0.05, RB + 10, 9, WORKS.wallLo);
        I.box(ctx, canvas, gx + 0.44, gy + 0.62, 0.06, 0.06, 10, WORKS.steel, RB);
      } });

    } else if (kit === 'inspect') {
      /*
       * Review Service: an inspection armature. A carriage runs the length of a
       * rail carrying a magnifier ring, and the ring lights as it passes over
       * each of the three sample plates below it.
       */
      items.push({ d: gx + gy - 0.6, paint: function () {
        I.box(ctx, canvas, gx, gy, 0.05, 0.60, 3, WORKS.trim, RB);
      } });
      [-0.34, 0, 0.34].forEach(function (o) {
        items.push({ d: gx + gy + o - 0.1, paint: function () {
          I.box(ctx, canvas, gx - 0.26, gy + o, 0.12, 0.08, 2.5, '#8d969e', RB);
        } });
      });
      var run = 0.5 + 0.5 * Math.sin(((t || 0) / 2100));
      var cy2 = gy - 0.52 + run * 1.04;
      items.push({ d: gx + cy2 + 0.4, paint: function () {
        I.box(ctx, canvas, gx, cy2, 0.09, 0.07, 13, WORKS.steel, RB + 3);
        var arm = I.up(I.toScreen(gx, cy2, canvas), RB + 16);
        var tip = I.up(I.toScreen(gx - 0.26, cy2, canvas), RB + 9);
        ctx.strokeStyle = '#9aa4ad';
        ctx.lineWidth = Math.max(0.8, 1.8 * z);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(arm.x, arm.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
        ctx.strokeStyle = accent;                                  // the lens ring
        ctx.lineWidth = Math.max(0.8, 1.9 * z);
        ctx.beginPath();
        ctx.ellipse(tip.x, tip.y, 5 * z, 2.6 * z, 0, 0, Math.PI * 2);
        ctx.stroke();
      } });

    } else {
      /*
       * Reporting: ticker tapes and logging drums. Two tapes lie flat on the
       * deck with marks running along them, and three drums turn beside them —
       * a record being written rather than a chart being displayed.
       */
      [-0.30, -0.06].forEach(function (o, r) {
        items.push({ d: gx + gy + o - 0.5, paint: function () {
          I.box(ctx, canvas, gx + o, gy, 0.075, 0.58, 2.5, '#e8e2d2', RB);
          var p0 = I.up(I.toScreen(gx + o, gy - 0.55, canvas), RB + 2.5);
          var p1 = I.up(I.toScreen(gx + o, gy + 0.55, canvas), RB + 2.5);
          var vx = p1.x - p0.x, vy = p1.y - p0.y, L = Math.hypot(vx, vy) || 1;
          var nx = -vy / L, ny = vx / L;
          ctx.fillStyle = '#5d6b7a';
          var sp = 9 * z, slide = (((t || 0) / (30 + r * 9)) % sp);
          for (var d = slide; d < L; d += sp) {
            var mx = p0.x + vx * (d / L), my = p0.y + vy * (d / L);
            ctx.fillRect(mx - nx * 3 * z, my - ny * 3 * z, Math.max(1, 2 * z), Math.max(1, 1.4 * z));
          }
        } });
      });
      [-0.38, 0, 0.38].forEach(function (o, r) {
        items.push({ d: gx + gy + o + 0.3, paint: function () {
          var dx = gx + 0.30, dy = gy + o;
          I.box(ctx, canvas, dx, dy, 0.07, 0.07, 3, WORKS.trim, RB);
          I.cylinder(ctx, canvas, dx, dy, 0.055, 11, WORKS.steel, RB + 3);
          // A painted stripe on the drum, turning: the cheapest way to show
          // rotation on a cylinder that has no other feature.
          var c0 = I.up(I.toScreen(dx, dy, canvas), RB + 14);
          var ang = ((t || 0) / 700) + r;
          ctx.fillStyle = accent;
          ctx.beginPath();
          ctx.ellipse(c0.x + Math.cos(ang) * 3 * z, c0.y + Math.sin(ang) * 1.4 * z,
                      2 * z, 1 * z, 0, 0, Math.PI * 2);
          ctx.fill();
        } });
      });
    }

    sortedPaint(items);
  }

  /*
   * The works' halo and nameboard. One place, so the three cannot drift apart:
   * the plaque carries the service name with its platform — "k8s" — on the
   * line below it, in the same box.
   */
  function worksSign(ctx, canvas, gx, gy, stop, state, z) {
    if (state === 'current') haloRing(ctx, canvas, gx, gy, 0.70, '#f0a132', z);
    var top = I.up(I.toScreen(gx, gy, canvas), WORKS_BASE);
    nameboard(ctx, top.x, top.y - 76 * z, stop.name, stop.tech, z);
  }

  /*
   * The Gateway archway: a grand modern portal the line runs straight through.
   *
   * Two piers either side of the track carrying a deep spanning beam, with a
   * lit soffit under it. Deliberately open rather than a bore through a hill —
   * the train stays visible the whole way through, which is the point of a
   * gateway as opposed to a tunnel.
   *
   * Painted in two parts so it can straddle the depth sort. The far pier goes
   * down before the train and the near pier after it, which is what puts the
   * train genuinely inside the arch rather than pasted in front of it.
   */
  var ARCH_SPAN = 0.62;                      // pier centres either side of the line

  function archway(ctx, canvas, stop, state, z, part) {
    var gx = stop.grid.x, gy = stop.grid.y;
    var PH = 54, BH = 15;                    // pier height, beam depth
    var pier = '#dfe4e8', pierDark = '#b9c1c7', steel = '#7f8b95';
    var accent = state === 'current' ? '#f0a132' : '#3f8f9c';

    if (part === 'back') {
      archPier(ctx, canvas, gx - ARCH_SPAN, gy, PH, pier, pierDark, accent, z);
      return;
    }

    // Near pier, then the beam that spans them, then the sign.
    archPier(ctx, canvas, gx + ARCH_SPAN, gy, PH, pier, pierDark, accent, z);

    var BW = ARCH_SPAN + 0.20;
    I.box(ctx, canvas, gx, gy, BW, 0.19, BH, pier, PH);
    I.box(ctx, canvas, gx, gy, BW + 0.03, 0.22, 3, '#cbd2d8', PH + BH);   // cornice

    // The soffit: a dark recess under the beam between the piers, with a light
    // strip along it. This is what makes it read as something you pass under.
    var c = I.corners(gx, gy, BW, 0.19, canvas);
    var f = function (u, v) {
      return facePoint(I.up(c.w, PH), I.up(c.s, PH), I.up(c.w, PH + BH), I.up(c.s, PH + BH), u, v);
    };
    faceQuad(ctx, f, 0.20, 0.80, 0.00, 0.30, '#2b343b');
    I.poly(ctx, [f(0.22, 0.10), f(0.78, 0.10), f(0.78, 0.16), f(0.22, 0.16)], accent);

    // A glazed band across the face of the beam, and the arch's springing line.
    faceQuad(ctx, f, 0.06, 0.94, 0.42, 0.72, '#5b6b78');
    for (var i = 0; i < 9; i++) {
      var u0 = 0.08 + i * 0.096;
      faceQuad(ctx, f, u0, u0 + 0.072, 0.46, 0.68, '#9fc4d6');
    }

    var top = I.up(I.toScreen(gx, gy, canvas), PH + BH + 3);
    nameboard(ctx, top.x, top.y - 8 * z, stop.name, stop.tech, z);
  }

  /** One pier of the archway: a clean shaft with a base and a collar. */
  function archPier(ctx, canvas, gx, gy, h, pier, pierDark, accent, z) {
    I.box(ctx, canvas, gx, gy, 0.26, 0.26, 5, pierDark);            // base
    I.box(ctx, canvas, gx, gy, 0.19, 0.19, h - 5, pier, 5);         // shaft
    I.box(ctx, canvas, gx, gy, 0.22, 0.22, 4, accent, h - 6);       // collar
  }

  /** A soft ring on the ground marking the stop the document is at now. */
  function haloRing(ctx, canvas, gx, gy, r, colour, z) {
    var c = I.toScreen(gx, gy, canvas);
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = Math.max(1.2, 2.4 * z);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, r * I.TILE_W * z, r * I.TILE_H * z, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- tunnel mouth

  /*
   * The tunnel mouth through which the logistics flatbed enters at the start of
   * each cycle. The approach track runs along constant x = ARCHIVE_TRACK, so the
   * flatbed travels in the +y direction (down-left on screen). The opening faces
   * toward decreasing y — which is the LEFT face of any isometric box here.
   *
   * The mound is purely scenery: no estate fact, not in knowledge/. It is the
   * railway's own infrastructure, in the same category as the trees.
   */
  var TUNNEL_GX = 1.55;   // = ARCHIVE_TRACK
  var TUNNEL_GY = 3.5;

  function tunnelMouth(ctx, canvas, gx, gy, z) {
    var hw = 1.0, hh = 0.80, mh = 38;

    // Hill body: grass-green on all three visible faces.
    I.box(ctx, canvas, gx, gy, hw, hh, mh, '#5a9648');

    // The left face is the approach face (faces toward decreasing y — the
    // direction the flatbed comes from). Compute its two base corners.
    var bW = I.toScreen(gx - hw, gy + hh, canvas);   // bottom-left of face
    var bS = I.toScreen(gx + hw, gy + hh, canvas);   // bottom-right of face
    var dx = bS.x - bW.x;
    var dy = bS.y - bW.y;

    // Concrete portal panel — covers the lower 78 % of the face so the arch
    // sits inside a stone wall, with the grass hill visible above.
    var panelH = mh * 0.78 * z;
    ctx.fillStyle = '#cec8be';
    ctx.beginPath();
    ctx.moveTo(bW.x,          bW.y);
    ctx.lineTo(bS.x,          bS.y);
    ctx.lineTo(bS.x,          bS.y - panelH);
    ctx.lineTo(bW.x,          bW.y - panelH);
    ctx.closePath();
    ctx.fill();

    // Arch opening: spans u = 0.26..0.74 across the face width.
    // The top is a quadratic bezier that produces a proper rounded crown.
    var u1 = 0.26, u2 = 0.74;
    var fL = { x: bW.x + dx * u1, y: bW.y + dy * u1 };   // left arch foot
    var fR = { x: bW.x + dx * u2, y: bW.y + dy * u2 };   // right arch foot
    var archH = 16 * z;
    var tL    = { x: fL.x, y: fL.y - archH };             // left pier top
    var tR    = { x: fR.x, y: fR.y - archH };             // right pier top
    var crownX = (tL.x + tR.x) / 2;
    var crownY = Math.min(tL.y, tR.y) - archH * 0.45;     // arch crown

    // Dark bore — near-black interior behind the arch.
    ctx.fillStyle = '#0c0e12';
    ctx.beginPath();
    ctx.moveTo(fL.x, fL.y);
    ctx.lineTo(tL.x, tL.y);
    ctx.quadraticCurveTo(crownX, crownY, tR.x, tR.y);
    ctx.lineTo(fR.x, fR.y);
    ctx.closePath();
    ctx.fill();

    // Stone arch rim — outlines the arch with a slightly darker masonry stroke.
    ctx.strokeStyle = '#9e9a92';
    ctx.lineWidth = Math.max(1, 2.5 * z);
    ctx.beginPath();
    ctx.moveTo(fL.x, fL.y);
    ctx.lineTo(tL.x, tL.y);
    ctx.quadraticCurveTo(crownX, crownY, tR.x, tR.y);
    ctx.lineTo(fR.x, fR.y);
    ctx.stroke();
  }

  // ---------------------------------------------------------------- vehicles

  /*
   * The flatbed cart: the only vehicle on the railway now.
   *
   * The locomotive-and-wagon that used to run here is gone. What moves on this
   * estate is cargo, not a train service, and a flatbed with a countable stack
   * of packages on it says how much is still aboard — which is the whole point
   * of the run down the line, where one package comes off at every station.
   *
   * Built from isometric solids rather than screen-space rectangles, so it
   * shares its vanishing directions and its light source with every building
   * it drives past. The deck lies along whichever grid axis the cart is
   * actually travelling on, so it turns with the line at the bend instead of
   * sliding round it sideways.
   */
  function flatbed(ctx, canvas, gx, gy, heading, z, opts) {
    var o = opts || {};
    var load = Math.max(0, Math.round(o.load === undefined ? 0 : o.load));
    var alongX = Math.abs(heading.x) >= Math.abs(heading.y);
    var ha = 0.300, hc = 0.165;                       // half-extents along / across (1.5× original)
    var hw = alongX ? ha : hc, hh = alongX ? hc : ha;
    var c = I.toScreen(gx, gy, canvas);

    shadowBlob(ctx, c.x, c.y, 25.5 * z, 10.5 * z);

    I.box(ctx, canvas, gx, gy, hw * 0.86, hh * 0.86, 4.5, '#3d434a');       // chassis
    I.box(ctx, canvas, gx, gy, hw, hh, 3.75, '#8a7a5e', 4.5);               // deck planking
    I.box(ctx, canvas, gx, gy, hw + 0.018, hh + 0.018, 1.8, '#6b6250', 8.25); // deck lip

    // Headstocks at both ends, so the flatbed reads as rolling stock rather
    // than a plank on wheels.
    [-1, 1].forEach(function (sgn) {
      var eu = sgn * (ha - 0.018);
      I.box(ctx, canvas, gx + (alongX ? eu : 0), gy + (alongX ? 0 : eu),
            alongX ? 0.021 : hc, alongX ? hc : 0.021, 6, '#5a6068', 4.5);
    });

    ctx.fillStyle = '#23282e';                                          // wheels
    [[-0.173, 0.102], [0.173, -0.102], [-0.113, -0.102], [0.113, 0.102]].forEach(function (w) {
      var wx = alongX ? w[0] : w[1], wy = alongX ? w[1] : w[0];
      var p = I.toScreen(gx + wx, gy + wy, canvas);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 2.25 * z, 5.1 * z, 2.85 * z, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    /*
     * The payload. Packages stack three along the deck and two high, filled
     * from the bottom row up, so six is a full load and the pile visibly gets
     * shorter as boxes come off at each station. Drawn back to front within
     * the stack — a crate is a solid like anything else.
     */
    var COLS = 3, deck = 10.05, STEP = 0.173;
    var stack = [];
    for (var n = 0; n < Math.min(6, load); n++) {
      var col = n % COLS, row = Math.floor(n / COLS);
      var du = (col - 1) * STEP;
      stack.push({
        x: gx + (alongX ? du : 0), y: gy + (alongX ? 0 : du),
        base: deck + row * 10.35
      });
    }
    stack.sort(function (a, b) { return (a.x + a.y) - (b.x + b.y) || a.base - b.base; })
         .forEach(function (b) {
      packageBox(ctx, canvas, b.x, b.y, b.base, o.tint, z);
    });
  }

  /*
   * One cargo package. The same solid wherever a package appears — on a
   * flatbed, stacked on the Archive platform, riding the carousel, or walking
   * across a platform into a doorway — so the map only ever has one idea of
   * what a package looks like.
   */
  function packageBox(ctx, canvas, gx, gy, base, tint, z, alpha) {
    if (alpha !== undefined && alpha <= 0.01) return;
    if (alpha !== undefined) { ctx.save(); ctx.globalAlpha = Math.min(1, alpha); }
    I.box(ctx, canvas, gx, gy, 0.078, 0.060, 9.9, tint || '#c2a06a', base);
    var c = I.corners(gx, gy, 0.078, 0.060, canvas);
    var top = { n: I.up(c.n, base + 9.9), e: I.up(c.e, base + 9.9),
                s: I.up(c.s, base + 9.9), w: I.up(c.w, base + 9.9) };
    I.poly(ctx, [topPoint(top, 0.26, 0.26), topPoint(top, 0.74, 0.26),
                 topPoint(top, 0.74, 0.74), topPoint(top, 0.26, 0.74)], '#efe3c8');
    if (alpha !== undefined) ctx.restore();
  }

  /*
   * A road cart. These run between a warehouse or depot and the station beside
   * it while the train is standing — the last few metres a document travels are
   * by road, not by rail.
   */
  /*
   * A road cart, built out of the same isometric solids as the buildings.
   *
   * It used to be screen-space rounded rectangles, which is why it looked like
   * it had been cut out of a different drawing: a rectangle does not sit on a
   * 30-degree grid, so the cart read as flat-on while everything around it read
   * as three-quarter view. Boxes on the grid fix that — the deck and the crate
   * now share their vanishing directions and their light source with every
   * warehouse on the map.
   *
   * `load` is 0..1 rather than a boolean, so the crate can be seen arriving
   * rather than appearing. At 0 it is off the deck and back toward the dock; at
   * 1 it is squarely on the bed. The engine sweeps it through the middle while
   * the cart stands still.
   */
  function cart(ctx, canvas, gx, gy, tint, z, load) {
    var L = load === undefined ? 1 : Math.max(0, Math.min(1, load));
    var c = I.toScreen(gx, gy, canvas);

    shadowBlob(ctx, c.x, c.y, 11 * z, 4.5 * z);

    I.box(ctx, canvas, gx, gy, 0.100, 0.072, 3, '#3d434a');          // chassis
    I.box(ctx, canvas, gx, gy, 0.112, 0.082, 2, '#8a7a5e', 3);       // deck

    ctx.fillStyle = '#23282e';                                       // wheels
    [[-0.075, 0.055], [0.075, -0.055]].forEach(function (o) {
      var w = I.toScreen(gx + o[0], gy + o[1], canvas);
      ctx.beginPath();
      ctx.ellipse(w.x, w.y - 1.5 * z, 3.2 * z, 1.8 * z, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    if (L > 0.015) {
      // The crate travels in along the dock direction and settles onto the bed.
      var away = (1 - L) * 0.16;
      var lift = (1 - L) * 13;
      ctx.save();
      ctx.globalAlpha = Math.min(1, L * 1.6);
      I.box(ctx, canvas, gx - away, gy + away, 0.062, 0.045, 8,
            tint || '#c9a227', 5 + lift);
      ctx.restore();
    }
  }

  /*
   * A stamped box riding the conveyor. Same isometric solid as everything else,
   * with the metadata stamp on its lit top face so you can see it has been
   * through the Archive's processing bay rather than just guess.
   */
  function beltBox(ctx, canvas, gx, gy, deck, z) {
    I.box(ctx, canvas, gx, gy, 0.058, 0.042, 7, '#c2a06a', deck);
    var c = I.corners(gx, gy, 0.058, 0.042, canvas);
    var t = { n: I.up(c.n, deck + 7), e: I.up(c.e, deck + 7),
              s: I.up(c.s, deck + 7), w: I.up(c.w, deck + 7) };
    I.poly(ctx, [topPoint(t, 0.28, 0.28), topPoint(t, 0.72, 0.28),
                 topPoint(t, 0.72, 0.72), topPoint(t, 0.28, 0.72)], '#efe3c8');
  }

  function shadowBlob(ctx, x, y, rx, ry) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#1d2a18';
    ctx.beginPath();
    ctx.ellipse(x, y + 2, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ----------------------------------------------------------------- scenery

  /** A tree. Cheap, and the single biggest thing that stops the map feeling dead. */
  function tree(ctx, canvas, gx, gy, seed, z) {
    var c = I.toScreen(gx, gy, canvas);
    var big = (seed % 3) === 0;
    var s = big ? 1.25 : 0.9;
    shadowBlob(ctx, c.x, c.y, 8 * s * z, 3.2 * s * z);
    ctx.fillStyle = '#6b4a2f';
    ctx.fillRect(c.x - 1.4 * s * z, c.y - 11 * s * z, 2.8 * s * z, 11 * s * z);
    var greens = ['#3f7a3a', '#4a8c42', '#356b33'];
    ctx.fillStyle = greens[seed % greens.length];
    ctx.beginPath();
    ctx.arc(c.x, c.y - 15 * s * z, 7.5 * s * z, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.10)';
    ctx.beginPath();
    ctx.arc(c.x - 2.5 * s * z, c.y - 17 * s * z, 4 * s * z, 0, Math.PI * 2);
    ctx.fill();
  }

  // --------------------------------------------------------------- new infra

  /*
   * Centralized Audit (MongoDB): a secure vault facility. Flat-roofed, heavy
   * stone walls, with armored conduit bars laid across the roof surface and
   * corner security beacons. The most monolithic structure on the map — it
   * should read as impenetrable, because it holds the estate's complete record.
   */
  /*
   * Centralized Audit — the hub that receives every transmission line. It is
   * the most important building on the estate and is drawn to match: a wide
   * works-family shed with a central control tower, glazed flanks, portal ribs,
   * and animated rooftop plant. Teal accent colour anchors it to the transmission
   * wires that converge on its LST.
   */
  var AUDIT_HW = 0.56, AUDIT_HH = 0.46;
  var AUDIT_BASE = 3, AUDIT_H = 38;

  function auditVault(ctx, canvas, stop, state, z, t) {
    var gx = stop.grid.x, gy = stop.grid.y;
    var now    = t || 0;
    var accent = state === 'current' ? '#f0a132' : '#2f8f88';
    var wall   = state === 'current' ? '#dde3e8' : '#8c5840';  // burnt umber — Centralized Audit
    var B = AUDIT_BASE, H = AUDIT_H, DECK = B + H;
    var RB = DECK + 3.8;   // roof membrane base, matching other yards

    // ── Shell ────────────────────────────────────────────────────────────────
    // Wide concrete apron (same grey as yard aprons).
    I.box(ctx, canvas, gx, gy, AUDIT_HW + 0.12, AUDIT_HH + 0.10, B, '#b7bdc3');

    // Low rear annex for depth — hides where the back wall meets the ground.
    I.box(ctx, canvas, gx - 0.22, gy - AUDIT_HH - 0.08, 0.30, 0.08, 18, '#744830', B);

    // Main body, deck cap, membrane (standard WORKS layering).
    I.box(ctx, canvas, gx, gy, AUDIT_HW, AUDIT_HH, H, wall, B);
    I.box(ctx, canvas, gx, gy, AUDIT_HW + 0.03, AUDIT_HH + 0.03, 3.0, WORKS.deck, DECK);
    I.box(ctx, canvas, gx, gy, AUDIT_HW - 0.03, AUDIT_HH - 0.03, 0.8, WORKS.membrane, DECK + 3);

    // ── Face detailing ───────────────────────────────────────────────────────
    var f   = yardFace(canvas, gx, gy, AUDIT_HW, AUDIT_HH, B, H);
    var rib = I.shade(wall, -0.26);

    // Flank: full-height glazing band with six bays and pilasters.
    faceQuad(ctx, f.flank, 0.06, 0.94, 0.48, 0.76, WORKS.glass);
    for (var gi = 0; gi < 6; gi++) {
      faceQuad(ctx, f.flank, 0.08 + gi * 0.148, 0.08 + gi * 0.148 + 0.115, 0.52, 0.73, WORKS.pane);
    }
    for (gi = 1; gi < 6; gi++) {
      faceQuad(ctx, f.flank, 0.06 + gi * 0.154 - 0.008, 0.06 + gi * 0.154 + 0.008, 0.02, 0.98, rib);
    }

    // Bay: security fascia stripe and four reinforced shuttered doors.
    faceQuad(ctx, f.bay, 0.02, 0.98, 0.72, 0.88, I.shade(wall, -0.50));
    bayDoors(ctx, f.bay, 4, -1, accent, z);

    // ── Portal ribs ─────────────────────────────────────────────────────────
    [-0.40, 0, 0.40].forEach(function (o) {
      [-1, 1].forEach(function (sgn) {
        I.box(ctx, canvas, gx + sgn * (AUDIT_HW + 0.05), gy + o,
              0.028, 0.028, H + 12, WORKS.steel, B);
      });
      I.box(ctx, canvas, gx, gy + o, AUDIT_HW + 0.05, 0.028, 3.5, WORKS.trim, B + H + 12);
    });

    // ── Roof deck ────────────────────────────────────────────────────────────
    // Four corner watchtowers.
    [[-0.40, -0.32], [0.40, -0.32], [-0.40, 0.32], [0.40, 0.32]].forEach(function (co) {
      I.box(ctx, canvas, gx + co[0], gy + co[1], 0.09, 0.075, 13, WORKS.wallLo, RB);
      I.box(ctx, canvas, gx + co[0], gy + co[1], 0.10, 0.085, 2,  WORKS.trim,   RB + 13);
    });

    // Saw-tooth processing ribs with glass inserts (matches railyard language).
    for (var ri = 0; ri < 4; ri++) {
      var ry2 = gy - 0.32 + ri * 0.22;
      I.box(ctx, canvas, gx - 0.18, ry2, 0.10, 0.034, 4.5, WORKS.trim, RB);
      I.box(ctx, canvas, gx - 0.18, ry2 - 0.03, 0.12, 0.018, 3.5, WORKS.pane, RB + 4.5);
    }

    // Central control tower — the tallest rooftop element.
    var TOWER_H = 24;
    I.box(ctx, canvas, gx, gy, 0.18, 0.15, TOWER_H,     WORKS.dark, RB);
    I.box(ctx, canvas, gx, gy, 0.20, 0.17, 2.5, WORKS.trim, RB + TOWER_H);

    // Three exhaust stacks grouped on one side of the tower.
    [-0.14, 0, 0.14].forEach(function (o) {
      I.cylinder(ctx, canvas, gx + o, gy - 0.24, 0.038, 11, WORKS.steel, RB);
    });

    // ── Animated tower crown ─────────────────────────────────────────────────
    var towerCrown = RB + TOWER_H + 2.5;
    var tc = I.up(I.toScreen(gx, gy, canvas), towerCrown);

    // Rotating radar dish: isometric ellipse (ry = rx * 0.5) swept by an arm.
    var radarAngle = now * 0.0005;
    var rdR = 9 * z;
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth   = Math.max(1.2, 2.2 * z);
    ctx.shadowColor = accent;
    ctx.shadowBlur  = 8 * z;
    ctx.beginPath();
    ctx.ellipse(tc.x, tc.y, rdR, rdR * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Sweep arm.
    ctx.beginPath();
    ctx.moveTo(tc.x, tc.y);
    ctx.lineTo(tc.x + Math.cos(radarAngle) * rdR,
               tc.y + Math.sin(radarAngle) * rdR * 0.5);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // Status beacon at tower apex — pulses with accent colour.
    var pulse = 0.5 + 0.5 * Math.sin(now * 0.0032);
    ctx.save();
    ctx.globalAlpha = 0.45 + 0.55 * pulse;
    ctx.fillStyle   = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur  = 10 * z * pulse;
    ctx.beginPath();
    ctx.arc(tc.x, tc.y - 7 * z, 4 * z, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    // Hydraulic plunger bank on the near deck face — four pistons, large and
    // clearly readable, each on its own phase.
    var plungBase = I.up(I.toScreen(gx + 0.32, gy + 0.14, canvas), RB);
    for (var pi2 = 0; pi2 < 4; pi2++) {
      var px2  = plungBase.x + (pi2 - 1.5) * 5.5 * z;
      var py2  = plungBase.y;
      var bob2 = Math.sin(now * 0.003 + pi2 * 2.1) * 4 * z;
      ctx.fillStyle = WORKS.steel;
      ctx.fillRect(px2 - 2 * z, py2 - 6 * z + bob2, 4 * z, 6 * z);       // shaft
      ctx.fillStyle = WORKS.pane;
      ctx.fillRect(px2 - 3 * z, py2 - 8.5 * z + bob2, 6 * z, 3 * z);     // head
      ctx.strokeStyle = WORKS.dark;
      ctx.lineWidth = Math.max(0.5, 0.9 * z);
      ctx.strokeRect(px2 - 3 * z, py2 - 8.5 * z + bob2, 6 * z, 3 * z);
      ctx.fillStyle = '#505860';
      ctx.fillRect(px2 - 2.5 * z, py2 - 2 * z, 5 * z, 4 * z);            // collar
    }

    if (state === 'current') haloRing(ctx, canvas, gx, gy, 0.82, '#f0a132', z);
    var nameTop = I.up(I.toScreen(gx, gy, canvas), B);
    nameboard(ctx, nameTop.x, nameTop.y - 94 * z, stop.name, stop.tech, z);
  }

  /*
   * UI Portal (k8s): the user-facing gateway into the estate.
   *
   * A vertical hoarding billboard is mounted on the near (south) roof edge and
   * rises straight up in screen-space. Its base follows the iso-slanted near
   * roof edge; the sides go straight up so it reads as a flat vertical display
   * facing the viewer. The screen shows scrolling system-log feeds and a neon
   * waveform bar chart, both clipped to the panel quad.
   */
  function uiPortalSprite(ctx, canvas, stop, state, z, t) {
    var gx  = stop.grid.x, gy = stop.grid.y;
    var now  = t || 0;
    var BASE = 4, H = 22, ROOF = BASE + H;
    var accent = state === 'current' ? '#f0a132' : '#4a8fa8';

    // ── Shell ────────────────────────────────────────────────────────────────
    I.box(ctx, canvas, gx, gy, 0.48, 0.38, BASE, PALETTE.platform);
    I.box(ctx, canvas, gx, gy, 0.38, 0.28, H,    PALETTE.wall, BASE);
    I.box(ctx, canvas, gx, gy, 0.42, 0.32, 4,    '#b8b0a0', ROOF);

    var rc   = I.corners(gx, gy, 0.38, 0.28, canvas);
    var roof = { n: I.up(rc.n, ROOF), e: I.up(rc.e, ROOF),
                 s: I.up(rc.s, ROOF), w: I.up(rc.w, ROOF) };

    // ── Vertical hoarding screen ─────────────────────────────────────────────
    // Base sits on the near (v=1) roof edge; panel rises straight up in screen-
    // space. sp(s, tv): s=0..1 left-to-right along the base, tv=0..1 bottom-to-top.
    var M        = 0.08;
    var SCREEN_H = 44;
    var bL = topPoint(roof, M,   1.0);
    var bR = topPoint(roof, 1-M, 1.0);
    function sp(s, tv) {
      return { x: bL.x + (bR.x - bL.x) * s,
               y: bL.y + (bR.y - bL.y) * s - SCREEN_H * z * tv };
    }

    var pBL = sp(0, 0), pBR = sp(1, 0), pTR = sp(1, 1), pTL = sp(0, 1);

    // Mounting struts from roof to panel base.
    ctx.strokeStyle = I.shade(PALETTE.steel, -0.18);
    ctx.lineWidth   = Math.max(0.9, 1.8 * z);
    [0.28, 0.72].forEach(function (s) {
      var rp = topPoint(roof, M + s * (1 - 2 * M), 0.82);
      var bp = sp(s, 0);
      ctx.beginPath(); ctx.moveTo(rp.x, rp.y); ctx.lineTo(bp.x, bp.y); ctx.stroke();
    });
    ctx.beginPath(); ctx.moveTo(pTL.x, pTL.y); ctx.lineTo(pTR.x, pTR.y); ctx.stroke();

    // Screen fill + clip.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pBL.x, pBL.y); ctx.lineTo(pBR.x, pBR.y);
    ctx.lineTo(pTR.x, pTR.y); ctx.lineTo(pTL.x, pTL.y);
    ctx.closePath();
    ctx.fillStyle = '#060d18';
    ctx.fill();
    ctx.clip();

    // Scrolling system-log lines — climb upward (tv increases with time).
    var scrollT = (now / 1300) % 1;
    for (var li = 0; li < 9; li++) {
      var tPos   = ((li / 9 + scrollT) % 1);
      var logLen = 0.22 + 0.60 * Math.abs(Math.sin(li * 2.3 + now * 0.00049));
      var alpha  = 0.28 + 0.72 * (0.5 + 0.5 * Math.sin(li * 1.8 + now * 0.00057));
      var col    = li % 3 === 0 ? '#00ffc8' : (li % 3 === 1 ? '#66ff99' : '#44c8ff');
      var lp0 = sp(0.04, tPos), lp1 = sp(0.04 + logLen * 0.88, tPos);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = col;
      ctx.lineWidth   = Math.max(0.6, 1.4 * z);
      ctx.shadowColor = col;
      ctx.shadowBlur  = 5 * z;
      ctx.beginPath(); ctx.moveTo(lp0.x, lp0.y); ctx.lineTo(lp1.x, lp1.y); ctx.stroke();
      ctx.shadowBlur  = 0;
      if (li % 3 === 0) {
        var pp = sp(0.04, tPos), pw = sp(0.11, tPos);
        ctx.globalAlpha = alpha * 0.8;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = Math.max(0.5, 1.0 * z);
        ctx.beginPath(); ctx.moveTo(pp.x, pp.y); ctx.lineTo(pw.x, pw.y); ctx.stroke();
      }
    }

    // Neon waveform bar chart along the bottom of the panel.
    var waveT = now * 0.0026;
    for (var bi = 0; bi < 14; bi++) {
      var bs   = 0.04 + (bi / 14) * 0.92;
      var amp  = 0.05 + 0.18 * Math.abs(Math.sin(waveT + bi * 0.57));
      var wb   = sp(bs, 0.06), wt = sp(bs, 0.06 + amp);
      ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(waveT + bi * 0.82));
      ctx.strokeStyle = '#00e8ff';
      ctx.lineWidth   = Math.max(1.3, 2.4 * z);
      ctx.shadowColor = '#00e8ff';
      ctx.shadowBlur  = 7 * z;
      ctx.beginPath(); ctx.moveTo(wb.x, wb.y); ctx.lineTo(wt.x, wt.y); ctx.stroke();
      ctx.shadowBlur  = 0;
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Panel bezel on top of clipped content.
    ctx.strokeStyle = accent;
    ctx.lineWidth   = Math.max(0.9, 1.8 * z);
    ctx.beginPath();
    ctx.moveTo(pBL.x, pBL.y); ctx.lineTo(pBR.x, pBR.y);
    ctx.lineTo(pTR.x, pTR.y); ctx.lineTo(pTL.x, pTL.y);
    ctx.closePath();
    ctx.stroke();

    if (state === 'current') haloRing(ctx, canvas, gx, gy, 0.66, '#f0a132', z);
    var top = I.up(I.toScreen(gx, gy, canvas), BASE);
    nameboard(ctx, top.x, top.y - 48 * z, stop.name, stop.tech, z);
  }

  /*
   * Indexer (k8s): a sorting distributor matrix. An industrial flat-roofed hub
   * with switching-track segments on the roof and an animated routing manifold
   * at the centre — the junction between the pipeline and the downstream stores.
   */
  /*
   * Indexer: scaled up to match the AlertingYard family. A wide works-shed with
   * five glazing bays, portal ribs, and an active roof carrying three animated
   * layers — switching tracks (belt-scale switchers), sorting lifters (vertical
   * actuators), and sliding manifold conduits (cross-axis distribution bars).
   */
  var DI_HW = 0.76, DI_HH = 0.60, DI_H = 34;

  function dataIndexer(ctx, canvas, stop, state, z, t) {
    var gx = stop.grid.x, gy = stop.grid.y;
    var now    = t || 0;
    var accent = state === 'current' ? '#f0a132' : '#c97a2f';
    var wall   = state === 'current' ? '#dde3e8' : '#a0bc9c';  // sage green — Indexer
    var B = 2, T = B + DI_H, RB = T + 3.8;

    // 90° rotation: swap half-extents so the long axis runs along y and the
    // entry doors face the +x (right) side of the isometric viewport.
    var rot90 = stop.orientation === '90';
    var hw = rot90 ? DI_HH : DI_HW;
    var hh = rot90 ? DI_HW : DI_HH;

    // ── Shell ────────────────────────────────────────────────────────────────
    I.box(ctx, canvas, gx, gy, hw + 0.12, hh + 0.10, B, '#b7bdc3');
    if (rot90) {
      I.box(ctx, canvas, gx - hw - 0.08, gy - 0.20, 0.08, 0.28, 18, '#88a484', B);
    } else {
      I.box(ctx, canvas, gx - 0.20, gy - hh - 0.08, 0.28, 0.08, 18, '#88a484', B);
    }
    I.box(ctx, canvas, gx, gy, hw, hh, DI_H, wall, B);
    I.box(ctx, canvas, gx, gy, hw + 0.03, hh + 0.03, 3.0, WORKS.deck, T);
    I.box(ctx, canvas, gx, gy, hw - 0.03, hh - 0.03, 0.8, WORKS.membrane, T + 3);

    // ── Face detailing ───────────────────────────────────────────────────────
    // In the base orientation the glazed band is on f.flank (right face) and
    // the bay doors are on f.bay (left face). The 90° rotation swaps these:
    // entry doors face right, so bay/flank roles exchange.
    var f         = yardFace(canvas, gx, gy, hw, hh, B, DI_H);
    var rib       = I.shade(wall, -0.26);
    var glazeFace = rot90 ? f.bay   : f.flank;
    var bayFace   = rot90 ? f.flank : f.bay;

    faceQuad(ctx, glazeFace, 0.05, 0.95, 0.50, 0.76, WORKS.glass);
    for (var gi = 0; gi < 5; gi++) {
      faceQuad(ctx, glazeFace, 0.07 + gi * 0.176, 0.07 + gi * 0.176 + 0.140, 0.53, 0.73, WORKS.pane);
    }
    for (gi = 1; gi < 5; gi++) {
      faceQuad(ctx, glazeFace, 0.05 + gi * 0.18 - 0.007, 0.05 + gi * 0.18 + 0.007, 0.02, 0.98, rib);
    }
    faceQuad(ctx, bayFace, 0.02, 0.98, 0.70, 0.86, I.shade(wall, -0.50));
    bayDoors(ctx, bayFace, 4, -1, accent, z);

    // ── Portal ribs ─────────────────────────────────────────────────────────
    // Base: rib groups along y, columns at x-extremes, crossbeams span x.
    // Rotated: rib groups along x, columns at y-extremes, crossbeams span y.
    [-0.38, 0, 0.38].forEach(function (o) {
      [-1, 1].forEach(function (sgn) {
        var cx = rot90 ? gx + o               : gx + sgn * (hw + 0.05);
        var cy = rot90 ? gy + sgn * (hh + 0.05) : gy + o;
        I.box(ctx, canvas, cx, cy, 0.028, 0.028, DI_H + 12, WORKS.steel, B);
      });
      var bx  = rot90 ? gx + o : gx,  bhw = rot90 ? 0.028     : hw + 0.05;
      var by  = rot90 ? gy     : gy + o, bhh = rot90 ? hh + 0.05 : 0.028;
      I.box(ctx, canvas, bx, by, bhw, bhh, 3.5, WORKS.trim, B + DI_H + 12);
    });

    // ── Animated roof ────────────────────────────────────────────────────────
    var rc = I.corners(gx, gy, hw - 0.03, hh - 0.03, canvas);
    var roof = { n: I.up(rc.n, T + 3), e: I.up(rc.e, T + 3),
                 s: I.up(rc.s, T + 3), w: I.up(rc.w, T + 3) };

    // 1. Switching tracks: 3 rails spanning u-direction, each with a sliding switcher.
    for (var ski = 0; ski < 3; ski++) {
      var sv   = 0.20 + ski * 0.30;
      var tA   = topPoint(roof, 0.06, sv), tB = topPoint(roof, 0.94, sv);
      ctx.strokeStyle = PALETTE.rail;
      ctx.lineWidth   = Math.max(1, 2 * z);
      ctx.beginPath(); ctx.moveTo(tA.x, tA.y); ctx.lineTo(tB.x, tB.y); ctx.stroke();
      var swU  = (ski % 2 === 0)
        ? (now / 2600 + ski * 0.33) % 1
        : 1 - (now / 2600 + ski * 0.33) % 1;
      var swPt = topPoint(roof, 0.06 + swU * 0.88, sv);
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(swPt.x, swPt.y, 2.8 * z, 0, Math.PI * 2); ctx.fill();
    }

    // 2. Sorting lifters: 4 vertical actuator arms at staggered phases.
    for (var li = 0; li < 4; li++) {
      var lu   = 0.12 + li * 0.25;
      var lPt  = topPoint(roof, lu, 0.50);
      var lBob = Math.sin(now * 0.0038 + li * Math.PI / 2) * 5 * z;
      ctx.strokeStyle = WORKS.steel;
      ctx.lineWidth   = Math.max(0.8, 1.8 * z);
      ctx.beginPath();
      ctx.moveTo(lPt.x, lPt.y - 2 * z);
      ctx.lineTo(lPt.x, lPt.y - 10 * z + lBob);
      ctx.stroke();
      ctx.fillStyle = I.shade(accent, 0.15);
      ctx.fillRect(lPt.x - 3 * z, lPt.y - 12 * z + lBob, 6 * z, 3 * z);
    }

    // 3. Sliding manifold conduits: 3 v-direction bars that drift along u-axis.
    var mSlide = (now / 5200) % 1;
    for (var mi = 0; mi < 3; mi++) {
      var mu  = ((mSlide + mi * 0.333) % 1) * 0.84 + 0.08;
      var mA  = topPoint(roof, mu, 0.06), mB = topPoint(roof, mu, 0.94);
      ctx.strokeStyle = WORKS.trim;
      ctx.lineWidth   = Math.max(1.5, 3 * z);
      ctx.beginPath(); ctx.moveTo(mA.x, mA.y); ctx.lineTo(mB.x, mB.y); ctx.stroke();
      ctx.strokeStyle = I.shade(accent, 0.35);
      ctx.lineWidth   = Math.max(0.6, 1.2 * z);
      ctx.beginPath(); ctx.moveTo(mA.x, mA.y); ctx.lineTo(mB.x, mB.y); ctx.stroke();
    }

    // Roof extract stacks at back face, pulsing beacon at near face.
    var bcGx, bcGy;
    if (rot90) {
      [-0.44, 0.44].forEach(function (o) {
        I.cylinder(ctx, canvas, gx - hw + 0.06, gy + o, 0.05, 14, WORKS.steel, RB);
      });
      I.box(ctx, canvas, gx + hw - 0.10, gy, 0.05, 0.05, 10, WORKS.steel, RB);
      bcGx = gx + hw - 0.10; bcGy = gy;
    } else {
      [-0.44, 0.44].forEach(function (o) {
        I.cylinder(ctx, canvas, gx + o, gy - hh + 0.06, 0.05, 14, WORKS.steel, RB);
      });
      I.box(ctx, canvas, gx, gy + hh - 0.10, 0.05, 0.05, 10, WORKS.steel, RB);
      bcGx = gx; bcGy = gy + hh - 0.10;
    }
    var bc = I.up(I.toScreen(bcGx, bcGy, canvas), RB + 10);
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now / 400));
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(bc.x, bc.y, 3.2 * z, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    if (state === 'current') haloRing(ctx, canvas, gx, gy, 1.06, '#f0a132', z);
    var top = I.up(I.toScreen(gx, gy, canvas), B);
    nameboard(ctx, top.x, top.y - 78 * z, stop.name, stop.tech, z);
  }

  /*
   * Helper: draw one animated ring band on a cylindrical silo.
   *
   * The ring is rendered as a static dark base half-ellipse (the front-visible
   * arc) with a bright accent arc sweeping around the front face over time.
   * `direction` = +1 or −1 so consecutive rings on the same silo rotate in
   * opposite directions, and silos across the two index buildings differ too.
   */
  function siloSpinRing(ctx, canvas, gx, gy, r, at, accentCol, now, direction, z) {
    var c   = I.toScreen(gx, gy, canvas);
    var rx  = r * I.TILE_W * z;
    var ry  = r * I.TILE_H * z;
    var cy2 = c.y - at * z;
    var darkCol = I.shade(PALETTE.steel, -0.32);

    // Base ring — always-visible dark band (front half: 0 → PI).
    ctx.strokeStyle = darkCol;
    ctx.lineWidth   = Math.max(0.8, 2.2 * z);
    ctx.beginPath();
    ctx.ellipse(c.x, cy2, rx, ry, 0, 0, Math.PI);
    ctx.stroke();

    // Bright accent arc sweeping across the front face of the cylinder.
    // Phase drives both position (where the arc is) and brightness (simulating
    // the ring turning toward / away from the viewer).
    var phase  = now * 0.00085 * direction;
    var startA = ((phase % Math.PI) + Math.PI) % Math.PI;        // 0..PI
    var endA   = Math.min(startA + Math.PI * 0.48, Math.PI);
    var bright = 0.45 + 0.55 * Math.abs(Math.cos(phase));

    ctx.save();
    ctx.globalAlpha  = bright;
    ctx.strokeStyle  = accentCol;
    ctx.lineWidth    = Math.max(1.4, 3.2 * z);
    ctx.shadowColor  = accentCol;
    ctx.shadowBlur   = 6 * z * bright;
    ctx.beginPath();
    ctx.ellipse(c.x, cy2, rx, ry, 0, startA, endA);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  /*
   * ES Silo (Elasticsearch): three upright cylindrical tanks on a squat base.
   * The ring colour is the visual identifier between the two index stores:
   *   surveil → neon-green   (#39ff14)
   *   review  → bright orange (#ff7000)
   * Rings at different heights rotate in alternating directions to read as
   * active mechanical storage columns under load.
   */
  function esSilo(ctx, canvas, stop, state, z, t) {
    var gx = stop.grid.x, gy = stop.grid.y;
    var now  = t || 0;
    var BASE = 4, BH = 10, RIM = BASE + BH;

    var ringAccent = state === 'current' ? '#f0a132'
      : (stop.id === 'surveil' ? '#39ff14' : '#4f46e5');

    I.box(ctx, canvas, gx, gy, 0.50, 0.42, BASE, PALETTE.platform);
    var siloWall = state === 'current' ? '#dde3e8'
                 : (stop.id === 'surveil' ? '#c07860' : '#c8b060');  // terracotta/mustard
    I.box(ctx, canvas, gx, gy, 0.42, 0.34, BH,   siloWall, BASE);
    I.box(ctx, canvas, gx, gy, 0.46, 0.38, 3,    '#8a8070', RIM);

    // Three cylindrical silos with animated spinning rings at two heights each.
    [[-0.19, 0], [0, 0], [0.19, 0]].forEach(function (o, siloIdx) {
      var cx = gx + o[0], cy = gy + o[1];
      I.cylinder(ctx, canvas, cx, cy, 0.09, 22, PALETTE.steel, RIM + 3);

      // Lower ring — direction alternates by cylinder index × stop identity
      // for maximum visual variety across the six cylinders on screen.
      var dir1 = (siloIdx % 2 === 0 ? 1 : -1) * (stop.id === 'surveil' ? 1 : -1);
      siloSpinRing(ctx, canvas, cx, cy, 0.09, RIM + 3 + 8,
                   ringAccent, now, dir1, z);
      // Upper ring — opposite direction to lower ring.
      siloSpinRing(ctx, canvas, cx, cy, 0.09, RIM + 3 + 16,
                   ringAccent, now, -dir1, z);

      // Pressure-valve cap.
      var cap = I.up(I.toScreen(cx, cy, canvas), RIM + 3 + 22 + 3);
      ctx.fillStyle = I.shade(ringAccent, 0.1);
      ctx.beginPath(); ctx.arc(cap.x, cap.y, 3 * z, 0, Math.PI * 2); ctx.fill();
    });

    if (state === 'current') haloRing(ctx, canvas, gx, gy, 0.64, '#f0a132', z);
    var top = I.up(I.toScreen(gx, gy, canvas), BASE);
    nameboard(ctx, top.x, top.y - 68 * z, stop.name, stop.tech, z);
  }

  /*
   * Config Curator (k8s): an archive regulator. A flat-roofed building with a
   * slowly rotating gear disc and a pair of pulley frames on the roof — the
   * structure that adjusts the working parameters of everything around it.
   */
  function configEngine(ctx, canvas, stop, state, z, t) {
    var gx = stop.grid.x, gy = stop.grid.y;
    var BASE = 4, H = 26, ROOF = BASE + H;
    var accent = state === 'current' ? '#f0a132' : '#7a6a3a';
    var wall   = state === 'current' ? '#dde3e8' : '#b87858';  // copper — Config Curator

    I.box(ctx, canvas, gx, gy, 0.44, 0.36, BASE, PALETTE.platform);    // apron
    I.box(ctx, canvas, gx, gy, 0.36, 0.28, H,    wall, BASE);          // main body
    I.box(ctx, canvas, gx, gy, 0.40, 0.32, 4,    '#9c6040', ROOF);     // flat parapet

    // A rotating gear disc on the roof's near half.
    var gearC = I.up(I.toScreen(gx - 0.08, gy - 0.04, canvas), ROOF + 8);
    var GR = 7 * z;
    var rotAng = ((t || 0) / 4000) * Math.PI * 2;
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(0.8, 2 * z);
    ctx.beginPath(); ctx.arc(gearC.x, gearC.y, GR, 0, Math.PI * 2); ctx.stroke();
    // Eight radial teeth.
    ctx.strokeStyle = I.shade(accent, -0.2);
    ctx.lineWidth = Math.max(0.5, 1.2 * z);
    for (var ti = 0; ti < 8; ti++) {
      var ta = rotAng + ti * Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(gearC.x + Math.cos(ta) * GR * 0.65, gearC.y + Math.sin(ta) * GR * 0.65);
      ctx.lineTo(gearC.x + Math.cos(ta) * (GR + 3 * z), gearC.y + Math.sin(ta) * (GR + 3 * z));
      ctx.stroke();
    }
    ctx.fillStyle = I.shade(accent, 0.1);
    ctx.beginPath(); ctx.arc(gearC.x, gearC.y, 2 * z, 0, Math.PI * 2); ctx.fill();

    // Pulley frame: two small cylinders with a cross-tie, on the far side.
    var px = gx + 0.18, py = gy;
    I.cylinder(ctx, canvas, px - 0.04, py, 0.024, 10, PALETTE.steel, ROOF);
    I.cylinder(ctx, canvas, px + 0.04, py, 0.024, 10, PALETTE.steel, ROOF);
    var pl = I.up(I.toScreen(px - 0.04, py, canvas), ROOF + 10);
    var pr = I.up(I.toScreen(px + 0.04, py, canvas), ROOF + 10);
    ctx.strokeStyle = PALETTE.steel;
    ctx.lineWidth = Math.max(0.7, 1.5 * z);
    ctx.beginPath(); ctx.moveTo(pl.x, pl.y); ctx.lineTo(pr.x, pr.y); ctx.stroke();

    if (state === 'current') haloRing(ctx, canvas, gx, gy, 0.62, '#f0a132', z);
    var top = I.up(I.toScreen(gx, gy, canvas), BASE);
    nameboard(ctx, top.x, top.y - 50 * z, stop.name, stop.tech, z);
  }

  /*
   * Lattice Steel Tower (LST): a transmission tower sitting beside every
   * standing structure on the map, sharing its ground level.
   *
   * Drawn entirely in screen space from the tower's grid foot. `lstH` is the
   * total tower height in SCREEN PIXELS (already zoom-scaled) — set to 1.5×
   * the adjacent building's world-pixel height by the caller so the tower is
   * always visibly taller than the structure it belongs to.
   *
   * The foot is placed at (building.gx + 0.60, building.gy - 0.60), which is
   * exactly 1.04 isometric units along the +x,-y diagonal — 70 px to the right
   * at default zoom, outside every building's apron, with the same gx+gy depth
   * key so it is drawn within the same sorted slot. A connecting slab runs from
   * the tower foot back toward the building, making the two read as sharing one
   * common base.
   */
  function latticeTower(ctx, canvas, gx, gy, lstH, z, opts) {
    var energy = (opts && opts.energy) || 0;
    var now    = (opts && opts.now)    || 0;
    var foot = I.toScreen(gx, gy, canvas);
    var TH = lstH;                           // total screen-height of the tower
    var W0 = 6.5 * z, W1 = 2 * z;           // half-span at base and apex
    var bx = foot.x, by = foot.y;
    var apex = by - TH;

    // A cream platform pad at the tower foot, matching the PALETTE.platform
    // colour used by every station and works building so the LST reads as
    // sharing the same ground as its neighbour.
    I.box(ctx, canvas, gx, gy, 0.16, 0.13, 3, PALETTE.platform);

    // Cyan energy column — drawn first so the steel frame sits on top of it.
    if (energy > 0.01) {
      ctx.save();
      ctx.globalAlpha = energy * 0.50;
      ctx.shadowColor = '#00e8ff';
      ctx.shadowBlur  = Math.max(6, 22 * z) * energy;
      ctx.strokeStyle = '#00ccff';
      ctx.lineWidth   = Math.max(5, 11 * z);
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, apex); ctx.stroke();
      ctx.shadowBlur  = 0;
      ctx.restore();
    }

    // Two tapering legs.
    ctx.strokeStyle = '#6a7880';
    ctx.lineWidth = Math.max(0.7, 1.7 * z);
    ctx.beginPath();
    ctx.moveTo(bx - W0, by); ctx.lineTo(bx - W1, apex);
    ctx.moveTo(bx + W0, by); ctx.lineTo(bx + W1, apex);
    ctx.stroke();

    // Four bands of X-bracing between the legs.
    var BANDS = 4;
    ctx.strokeStyle = '#566270';
    ctx.lineWidth = Math.max(0.5, 1.1 * z);
    ctx.beginPath();
    for (var bi = 0; bi < BANDS; bi++) {
      var t0 = bi / BANDS, t1 = (bi + 1) / BANDS;
      var lx0 = bx - W0 + (W0 - W1) * t0, rx0 = bx + W0 - (W0 - W1) * t0;
      var lx1 = bx - W0 + (W0 - W1) * t1, rx1 = bx + W0 - (W0 - W1) * t1;
      var y0 = by - TH * t0, y1 = by - TH * t1;
      ctx.moveTo(lx0, y0); ctx.lineTo(rx1, y1);
      ctx.moveTo(rx0, y0); ctx.lineTo(lx1, y1);
    }
    ctx.stroke();

    // Horizontal cross-ties at each bracing level.
    ctx.strokeStyle = '#4a5a68';
    ctx.lineWidth = Math.max(0.4, 0.9 * z);
    ctx.beginPath();
    for (var li = 0; li <= BANDS; li++) {
      var lt = li / BANDS;
      var lw = bx - W0 + (W0 - W1) * lt, rw = bx + W0 - (W0 - W1) * lt;
      var ly = by - TH * lt;
      ctx.moveTo(lw, ly); ctx.lineTo(rw, ly);
    }
    ctx.stroke();

    // Short mast above the apex.
    ctx.strokeStyle = '#506070';
    ctx.lineWidth = Math.max(0.7, 1.5 * z);
    ctx.beginPath(); ctx.moveTo(bx, apex); ctx.lineTo(bx, apex - 7 * z); ctx.stroke();

    // Beacon — pulses crimson when energized, plain red when idle.
    var pulse  = energy > 0 ? 0.5 + 0.5 * Math.sin(now * 0.022) : 0;
    var bR     = (2.2 + energy * pulse * 1.6) * z;
    var bRed   = Math.round(221 + 34 * pulse * energy);
    var bCol   = energy > 0 ? ('rgb(' + bRed + ',0,0)') : '#dd3333';
    ctx.save();
    if (energy > 0) {
      ctx.shadowColor = '#ff0000';
      ctx.shadowBlur  = Math.max(3, 10 * z) * energy * pulse;
    }
    ctx.fillStyle = bCol;
    ctx.beginPath(); ctx.arc(bx, apex - 8 * z, bR, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /*
   * An overhead transmission cable between two screen-space points, with an
   * optional energised-glow state and a travelling bolt.
   *
   * (x1,y1) and (x2,y2) are the LST apex positions in screen pixels.
   * energy 0..1 controls the cyan glow. zapT 0..1 is the bolt position along
   * the wire (-1 = not active). z is the camera zoom.
   */
  /*
   * Draw a transmission wire as a chain of short sagging bezier segments,
   * one per span between consecutive waypoints (endpoints + intermediate poles).
   * Each segment sags independently so the cable reads as physically supported
   * rather than one long droop between distant towers.
   *
   * `poles` is an optional array of {x, y} screen positions (the support pole
   * tops) in order from x1/y1 toward x2/y2. When omitted the wire is a single
   * span, matching old behaviour.
   *
   * `zapT` maps position along the FULL wire to [0,1]; the function re-maps it
   * into the appropriate segment so the bolt travels smoothly across poles.
   */
  function transmissionWire(ctx, x1, y1, x2, y2, energy, zapT, z, now, poles) {
    var waypoints = [{ x: x1, y: y1 }];
    if (poles && poles.length) poles.forEach(function (p) { waypoints.push(p); });
    waypoints.push({ x: x2, y: y2 });
    var nSegs = waypoints.length - 1;

    ctx.save();

    for (var si = 0; si < nSegs; si++) {
      var p0 = waypoints[si], p1 = waypoints[si + 1];
      var smx   = (p0.x + p1.x) / 2;
      var sspan = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      // Shorter segments deserve shallower sag so each span looks independent.
      var ssag  = Math.max(2 * z, Math.min(16 * z, sspan * 0.05));
      var smy   = Math.max(p0.y, p1.y) + ssag;

      // Base cable — always visible as a dark industrial cable.
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y); ctx.quadraticCurveTo(smx, smy, p1.x, p1.y);
      ctx.strokeStyle = '#232830';
      ctx.lineWidth   = Math.max(0.8, 1.3 * z);
      ctx.stroke();

      // Energised glow — pulses on the segment that currently carries the bolt.
      if (energy > 0.01) {
        var segLo    = si / nSegs, segHi = (si + 1) / nSegs;
        var inSeg    = zapT >= segLo && zapT <= segHi;
        var pulse    = inSeg ? 0.5 + 0.5 * Math.sin(now * 0.018) : 1.0;
        ctx.save();
        ctx.globalAlpha = energy * (inSeg ? 0.55 + 0.35 * pulse : 0.80);
        ctx.shadowColor = '#00e8ff';
        ctx.shadowBlur  = (inSeg ? 14 + 8 * pulse : 10) * z;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y); ctx.quadraticCurveTo(smx, smy, p1.x, p1.y);
        ctx.strokeStyle = '#00ccff';
        ctx.lineWidth   = Math.max(1.8, (inSeg ? 3.5 + 1.0 * pulse : 3.0) * z);
        ctx.stroke();
        ctx.shadowBlur  = 0;
        ctx.restore();
      }

      // Travelling bolt — located within its segment by re-mapping zapT.
      if (zapT >= 0 && zapT <= 1) {
        var sLo = si / nSegs, sHi = (si + 1) / nSegs;
        if (zapT >= sLo && zapT <= sHi) {
          var lt = (zapT - sLo) * nSegs;
          var lu = 1 - lt;
          var zx = lu*lu*p0.x + 2*lu*lt*smx + lt*lt*p1.x;
          var zy = lu*lu*p0.y + 2*lu*lt*smy + lt*lt*p1.y;
          var br = Math.max(3, 5.5 * z);
          ctx.save();
          ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 16 * z;
          ctx.fillStyle   = '#ffffff';
          ctx.beginPath(); ctx.arc(zx, zy, br, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle   = '#00e8ff';
          ctx.beginPath(); ctx.arc(zx, zy, br * 0.55, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#aaddff';
          ctx.lineWidth   = Math.max(0.5, 0.9 * z);
          ctx.beginPath();
          for (var fi = 0; fi < 6; fi++) {
            var ang = (fi / 6) * Math.PI * 2 + now * 0.0008;
            var sr  = br * (1.4 + 0.5 * Math.sin(now * 0.028 + fi * 1.3));
            ctx.moveTo(zx, zy);
            ctx.lineTo(zx + Math.cos(ang) * sr, zy + Math.sin(ang) * sr);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.restore();
        }
      }
    }

    ctx.restore();
  }

  /*
   * Intermediate support pole. Drawn at the cable bezier position so the shaft
   * hangs DOWN from that point — the top of the pole IS where the wire rests.
   *
   * Visual spec:
   *   • Brown timber shaft, 50% taller and thicker than the previous version.
   *   • Two stacked crossarms (upper holds the wire insulators, lower is bracing).
   *   • Red aviation beacon on the very top, part of the electrification animation.
   *   • Insulator discs glow cyan when the wire is live.
   */
  function supportPole(ctx, x, y, z, wireE, zapT, now) {
    var poleH   = 27 * z;     // 50% taller (was 18)
    var armW1   = 9 * z;      // upper crossarm half-width
    var armW2   = 6.5 * z;    // lower crossarm half-width (bracing strut)
    var arm1Off = 3.5 * z;    // upper arm drop from wire contact point
    var arm2Off = 11 * z;     // lower arm drop from wire contact point
    var zapActive = zapT >= 0 && zapT <= 1;

    ctx.save();

    // --- shaft (two-pass: dark edge + brown face) ----------------------------
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#3d200a';
    ctx.lineWidth   = Math.max(2.0, 4.0 * z);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + poleH);
    ctx.stroke();

    ctx.strokeStyle = '#7a4e28';
    ctx.lineWidth   = Math.max(1.4, 2.7 * z);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + poleH);
    ctx.stroke();

    // --- upper crossarm (holds the wire insulators) --------------------------
    ctx.strokeStyle = '#7a4e28';
    ctx.lineWidth   = Math.max(1.1, 2.1 * z);
    ctx.beginPath();
    ctx.moveTo(x - armW1, y + arm1Off);
    ctx.lineTo(x + armW1, y + arm1Off);
    ctx.stroke();

    // --- lower crossarm (structural brace) -----------------------------------
    ctx.lineWidth = Math.max(0.9, 1.7 * z);
    ctx.beginPath();
    ctx.moveTo(x - armW2, y + arm2Off);
    ctx.lineTo(x + armW2, y + arm2Off);
    ctx.stroke();

    // Diagonal bracing between the two arms.
    ctx.strokeStyle = '#5e3a1c';
    ctx.lineWidth   = Math.max(0.6, 1.1 * z);
    ctx.beginPath();
    ctx.moveTo(x - armW1, y + arm1Off);
    ctx.lineTo(x - armW2 * 0.6, y + arm2Off);
    ctx.moveTo(x + armW1, y + arm1Off);
    ctx.lineTo(x + armW2 * 0.6, y + arm2Off);
    ctx.stroke();

    // --- insulator discs at the upper arm ends (glow cyan when live) ---------
    var pulse = (wireE > 0.01 && zapActive) ? 0.5 + 0.5 * Math.sin(now * 0.018) : 1.0;
    ctx.shadowColor = wireE > 0.01 ? '#00e8ff' : 'transparent';
    ctx.shadowBlur  = wireE > 0.01 ? 5 * z * wireE * pulse : 0;
    ctx.fillStyle   = wireE > 0.01 ? '#00ccff' : '#7a8fa0';
    ctx.globalAlpha = wireE > 0.01 ? 0.60 + wireE * 0.35 : 0.70;
    [x - armW1, x + armW1].forEach(function (ix) {
      ctx.beginPath();
      ctx.arc(ix, y + arm1Off, 2.0 * z, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.shadowBlur = 0;

    // --- red aviation beacon on top of the pole ------------------------------
    // The beacon sits just above the wire contact point. Its glow intensity is
    // tied to wireE, exactly like the LST beacons, so it lights up during the
    // electrification animation and returns to a dim idle state otherwise.
    var beaconY = y - 4.5 * z;
    var beaconR = Math.max(1.8, 3.0 * z);
    var bPulse  = wireE > 0.01
      ? Math.abs(Math.sin(now * 0.011 + x * 0.004))
      : 0;
    var bAlpha  = wireE > 0.01 ? 0.55 + 0.45 * bPulse : 0.28;

    ctx.globalAlpha = bAlpha;
    if (wireE > 0.01) {
      ctx.shadowColor = '#ff2020';
      ctx.shadowBlur  = (10 + 6 * bPulse) * z * wireE;
    }
    ctx.fillStyle = wireE > 0.01 ? '#ff3838' : '#882222';
    ctx.beginPath(); ctx.arc(x, beaconY, beaconR, 0, Math.PI * 2); ctx.fill();

    if (wireE > 0.01) {
      // Bright core when energised.
      ctx.globalAlpha = 0.80 * wireE;
      ctx.shadowBlur  = 0;
      ctx.fillStyle   = '#ffaaaa';
      ctx.beginPath(); ctx.arc(x, beaconY, beaconR * 0.42, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
  }

  return {
    PALETTE: PALETTE, S3_DOCK: S3_DOCK,
    ARCHIVE_PLATFORM: ARCHIVE_PLATFORM, ARCHIVE_TRACK: ARCHIVE_TRACK,
    identity: identity, assign: assign, hash: hash,
    station: station, s3Depot: s3Depot, depot: depot, vault: vault,
    siding: siding, terminus: terminus, external: external, archive: archive,
    archway: archway, ARCH_SPAN: ARCH_SPAN,
    sortingStation: sortingStation, filterStation: filterStation,
    scanStation: scanStation, meterStation: meterStation,
    cognitionWorks: cognitionWorks, railYard: railYard, terminalYard: terminalYard,
    platformStrip: platformStrip,
    tunnelMouth: tunnelMouth, TUNNEL_GX: TUNNEL_GX, TUNNEL_GY: TUNNEL_GY,
    flatbed: flatbed, packageBox: packageBox, doorPoint: doorPoint,
    YARD_FOOT: YARD_FOOT,
    cart: cart, beltBox: beltBox, tree: tree,
    nameboard: nameboard, roundRect: roundRect, shadowBlob: shadowBlob,
    auditVault: auditVault, uiPortalSprite: uiPortalSprite,
    dataIndexer: dataIndexer, esSilo: esSilo, configEngine: configEngine,
    latticeTower: latticeTower,
    supportPole: supportPole,
    transmissionWire: transmissionWire
  };
})();
