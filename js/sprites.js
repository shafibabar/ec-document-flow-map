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
   * S3: a modern distribution facility with a solar roof. Two blocks — a tall
   * main hall and a lower annex of roller-shutter bays — a band of blue glazing,
   * and photovoltaic arrays covering the roof.
   *
   * The reason it is not a shed: an S3 bucket is where the estate's documents
   * physically live, and it is the busiest building on the map. It should look
   * like current infrastructure rather than a barn.
   */
  function s3Depot(ctx, canvas, stop, state, z) {
    var gx = stop.grid.x, gy = stop.grid.y;
    var HW = 0.42, HH = 0.32, H = 30;
    var wall = state === 'current' ? '#e4e9ee' : '#d6dce2';
    var glassBlue = '#6f9dc4';

    I.box(ctx, canvas, gx, gy, HW + 0.14, HH + 0.14, 2, '#b7bdc3');       // apron

    /*
     * The goods annex, on the +y side — the side the conveyor arrives from.
     * Its outer face stands S3_DOCK from the building's centre, and render.js
     * ends the belt on that same number, so the belt meets the doorway instead
     * of sliding under the building. The middle bay is a real opening at the
     * belt's own height; the two beside it are shuttered.
     */
    var AHW = 0.34, AHH = 0.22, AH = 18;
    var ax = gx, ay = gy + S3_DOCK - AHH;
    I.box(ctx, canvas, ax, ay, AHW, AHH, AH, wall, 2);
    I.box(ctx, canvas, ax, ay, AHW + 0.03, AHH + 0.03, 2, '#c3cad1', AH + 2);
    var ac = I.corners(ax, ay, AHW, AHH, canvas);
    var af = function (u, v) {
      return facePoint(I.up(ac.w, 2), I.up(ac.s, 2), I.up(ac.w, 2 + AH), I.up(ac.s, 2 + AH), u, v);
    };

    [[0.05, 0.29], [0.71, 0.95]].forEach(function (bay) {                  // shuttered bays
      faceQuad(ctx, af, bay[0], bay[1], 0.06, 0.60, '#9aa4ad');
      for (var sl = 0; sl < 4; sl++) {
        var vv = 0.11 + sl * 0.13;
        I.poly(ctx, [af(bay[0], vv), af(bay[1], vv), af(bay[1], vv + 0.03), af(bay[0], vv + 0.03)],
               '#88939d');
      }
    });

    // The open bay the belt runs into. Deliberately tall enough to clear a box
    // on the belt, and centred on u = 0.5 because the belt runs along x = gx.
    faceQuad(ctx, af, 0.36, 0.64, 0.05, 0.86, '#1b2228');
    ctx.strokeStyle = '#8d979f';
    ctx.lineWidth = Math.max(0.5, 1.2 * z);
    I.poly(ctx, [af(0.36, 0.05), af(0.64, 0.05), af(0.64, 0.86), af(0.36, 0.86)]);
    ctx.stroke();
    I.poly(ctx, [af(0.33, 0.86), af(0.67, 0.86), af(0.67, 0.93), af(0.33, 0.93)], '#e0902c');

    // --- the main hall -------------------------------------------------------
    I.box(ctx, canvas, gx, gy, HW, HH, H, wall, 2);
    I.box(ctx, canvas, gx, gy, HW + 0.03, HH + 0.03, 3, '#c3cad1', H + 2);  // parapet

    // Glazing band, on both visible faces so the building reads as one storey
    // of offices over the hall.
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


    // --- solar arrays on the roof -------------------------------------------
    var rc = I.corners(gx, gy, HW - 0.05, HH - 0.05, canvas);
    var tc = { n: I.up(rc.n, H + 5), e: I.up(rc.e, H + 5),
               s: I.up(rc.s, H + 5), w: I.up(rc.w, H + 5) };
    for (var pu = 0; pu < 2; pu++) {
      for (var pv = 0; pv < 3; pv++) {
        var u1 = 0.06 + pu * 0.48, v1 = 0.05 + pv * 0.315;
        var quad = [topPoint(tc, u1, v1), topPoint(tc, u1 + 0.42, v1),
                    topPoint(tc, u1 + 0.42, v1 + 0.27), topPoint(tc, u1, v1 + 0.27)];
        I.poly(ctx, quad, '#2f5c8a');
        // Cell divisions, drawn in the panel's own two directions so they lie
        // flat on the roof rather than across it.
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
        I.poly(ctx, quad);                                   // panel edge
        ctx.strokeStyle = '#9fb4c6';
        ctx.stroke();
      }
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

  function worksFrame(ctx, canvas, gx, gy, part) {
    var LEG = 0.028, span = WORKS_HW * 0.74;
    [gx - span, gx + span].forEach(function (px) {
      if (part === 'back') {
        I.box(ctx, canvas, px, gy - FRAME_BACK, LEG, LEG, FRAME_H, WORKS.steel, WORKS_BASE);
      } else {
        I.box(ctx, canvas, px, gy + FRAME_FRONT, LEG, LEG, FRAME_H, WORKS.steel, WORKS_BASE);
        I.box(ctx, canvas, px, gy + (FRAME_FRONT - FRAME_BACK) / 2, LEG,
              (FRAME_FRONT + FRAME_BACK) / 2, 4, WORKS.trim, FRAME_TOP);   // cross tie
      }
    });
    if (part === 'front') {
      // A longitudinal tie joining the two portals, so the frame reads as a
      // cage around the building rather than two unrelated hoops. It rides
      // above the roof, so nothing can occlude it and its order is free.
      [gy - FRAME_BACK, gy + FRAME_FRONT].forEach(function (py) {
        I.box(ctx, canvas, gx, py, span, LEG * 0.8, 3, WORKS.trim, FRAME_TOP + 4);
      });
    }
  }

  /*
   * The hoist: a trolley running along the front tie of the frame, lowering and
   * raising a hook over the platform.
   *
   * It hangs on the FRONT tie rather than crossing the roof on purpose. A
   * travelling crane over the deck would have to thread between whatever
   * machinery that particular works carries, and it would collide with the
   * canisters on one of them; on the front tie it is clear of all three, it is
   * visibly serving the platform, and it costs the shared shell nothing.
   */
  function worksHoist(ctx, canvas, gx, gy, z, t) {
    var top = FRAME_TOP + 4;
    var cyc = ((t || 0) % 7000) / 7000;
    var run = Math.sin(cyc * Math.PI * 2);                 // travel along the tie
    var tx = gx + run * WORKS_HW * 0.62, ty = gy + FRAME_FRONT;
    // The hook drops while the trolley is near the ends of its run and rides
    // high across the middle, so it reads as fetching and carrying.
    var drop = 6 + 13 * Math.max(0, Math.cos(cyc * Math.PI * 4));

    I.box(ctx, canvas, tx, ty, 0.035, 0.030, 4, WORKS.steel, top - 4);   // trolley
    var p = I.up(I.toScreen(tx, ty, canvas), top - 4);
    ctx.strokeStyle = '#5f6a74';
    ctx.lineWidth = Math.max(0.5, 1 * z);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, p.y + drop * z);
    ctx.stroke();
    // The load, in crate brown rather than steel: a bare hook reads as a smudge
    // against the wall behind it, a crate reads as a crane doing something.
    I.box(ctx, canvas, tx, ty, 0.026, 0.020, 5, '#c2a06a', top - 4 - drop);
  }

  /*
   * The shell every works shares: the platform it stands on, the layered
   * blocks, the frame around them and the flat roof deck on top. The caller
   * adds only its own roof machinery, on WORKS_ROOF.
   */
  function worksShell(ctx, canvas, gx, gy, state, accent, z, t) {
    var wall = state === 'current' ? '#dde3e8' : WORKS.wall;
    var lo = state === 'current' ? '#bcc5cc' : WORKS.wallLo;

    /*
     * The dedicated railway platform. This is the buffer the brief asks for —
     * the works never touches the ballast, it stands on a deck that ends short
     * of the line. render.js lays a second strip from here out to the track
     * itself; both are PALETTE.platform at height 3 so the two read as one
     * continuous deck rather than two slabs at slightly different levels.
     */
    I.box(ctx, canvas, gx, gy + 0.03, 0.74, 0.44, WORKS_BASE, PALETTE.platform);
    var pc = I.corners(gx, gy + 0.03, 0.74, 0.44, canvas);
    ctx.strokeStyle = 'rgba(90,80,64,.30)';
    ctx.lineWidth = Math.max(0.5, 1 * z);
    I.poly(ctx, [I.up(pc.n, WORKS_BASE), I.up(pc.e, WORKS_BASE),
                 I.up(pc.s, WORKS_BASE), I.up(pc.w, WORKS_BASE)]);
    ctx.stroke();

    worksFrame(ctx, canvas, gx, gy, 'back');

    worksBlocks(ctx, canvas, [
      // Rear range: a run of low utility blocks butted against the back wall.
      { x: gx - 0.24, y: gy - 0.30, hw: 0.24, hh: 0.07, h: 21, c: lo, base: WORKS_BASE },
      { x: gx + 0.26, y: gy - 0.30, hw: 0.16, hh: 0.07, h: 14, c: lo, base: WORKS_BASE },
      // The main hall.
      { x: gx, y: gy, hw: WORKS_HW, hh: WORKS_HH, h: WORKS_H, c: wall, base: WORKS_BASE },
      // The stair core, off the hall's east end — the one thing that breaks
      // the flat skyline, and deliberately not a chimney or a spire.
      { x: gx + 0.56, y: gy - 0.12, hw: 0.09, hh: 0.11, h: 44, c: lo, base: WORKS_BASE },
      // Front annex and a plant kiosk, on the platform side. Kept inboard of
      // FRAME_FRONT so the frame's front legs land on clear platform.
      { x: gx + 0.26, y: gy + 0.29, hw: 0.18, hh: 0.06, h: 13, c: lo, base: WORKS_BASE },
      { x: gx - 0.30, y: gy + 0.29, hw: 0.14, hh: 0.06, h: 9, c: lo, base: WORKS_BASE }
    ]);

    /*
     * The stair core's glazed slot and cap. Drawn here rather than inside the
     * block list because a block is a solid and this is a face treatment; the
     * core sits at a greater depth than the hall, so by this point it has
     * already been painted and nothing else will cover it.
     */
    var sc = I.corners(gx + 0.56, gy - 0.12, 0.09, 0.11, canvas);
    var sf = function (u, v) {
      return facePoint(I.up(sc.w, WORKS_BASE), I.up(sc.s, WORKS_BASE),
                       I.up(sc.w, WORKS_BASE + 44), I.up(sc.s, WORKS_BASE + 44), u, v);
    };
    faceQuad(ctx, sf, 0.30, 0.70, 0.10, 0.90, WORKS.glass);
    for (var fl = 0; fl < 5; fl++) {
      faceQuad(ctx, sf, 0.34, 0.66, 0.14 + fl * 0.155, 0.14 + fl * 0.155 + 0.10, WORKS.pane);
    }
    I.box(ctx, canvas, gx + 0.56, gy - 0.12, 0.105, 0.125, 3, WORKS.trim, WORKS_BASE + 44);
    I.box(ctx, canvas, gx + 0.56, gy - 0.12, 0.05, 0.05, 4, accent, WORKS_BASE + 47);

    // --- the walls -----------------------------------------------------------
    var c = I.corners(gx, gy, WORKS_HW, WORKS_HH, canvas);
    var B = WORKS_BASE, T = WORKS_BASE + WORKS_H;
    var fL = function (u, v) {           // the wall facing the track
      return facePoint(I.up(c.w, B), I.up(c.s, B), I.up(c.w, T), I.up(c.s, T), u, v);
    };
    var fR = function (u, v) {           // the east gable wall
      return facePoint(I.up(c.s, B), I.up(c.e, B), I.up(c.s, T), I.up(c.e, T), u, v);
    };

    /*
     * A continuous glazing band on both visible walls, and pilasters between
     * the bays so the wall has relief rather than being a flat painted panel.
     *
     * The pilaster tone is derived from the FACE, not from the wall colour.
     * Iso.box already darkens the two visible faces by different amounts, so a
     * pilaster shaded off the raw wall colour comes out lighter than the wall
     * it is supposed to be standing on — it read as white stripes, not relief.
     */
    [[fL, 9, -0.44], [fR, 4, -0.26]].forEach(function (spec) {
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

    // The goods door, on the track side, with a painted threshold.
    faceQuad(ctx, fL, 0.40, 0.60, 0.02, 0.36, WORKS.dark);
    I.poly(ctx, [fL(0.38, 0.02), fL(0.62, 0.02), fL(0.62, 0.055), fL(0.38, 0.055)], accent);

    // --- the flat roof -------------------------------------------------------
    // A deck slab with a parapet standing proud of a darker membrane, so the
    // roof reads as a surface with an edge rather than a lid. Everything each
    // works puts on its roof stands on the membrane, at WORKS_ROOF.
    I.box(ctx, canvas, gx, gy, WORKS_HW + 0.025, WORKS_HH + 0.025, 3, WORKS.deck, T);
    I.box(ctx, canvas, gx, gy, WORKS_HW - 0.02, WORKS_HH - 0.02, 0.8, WORKS.membrane, T + 3);

    worksFrame(ctx, canvas, gx, gy, 'front');
    worksHoist(ctx, canvas, gx, gy, z, t);
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

    worksShell(ctx, canvas, gx, gy, state, accent, z, t);

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

    worksShell(ctx, canvas, gx, gy, state, accent, z, t);

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

    worksShell(ctx, canvas, gx, gy, state, accent, z, t);

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

  // ---------------------------------------------------------------- vehicles

  /*
   * The train: a locomotive and one wagon, drawn along the direction of travel
   * so it leans into the line rather than sitting square to the screen. The
   * wagon carries the document, and its colour is the cargo's colour, because
   * what the cart is carrying is the thing this whole map exists to show.
   */
  function train(ctx, canvas, gx, gy, heading, cargo, z, opts) {
    var c = I.toScreen(gx, gy, canvas);
    var back = I.toScreen(gx - heading.x * 0.34, gy - heading.y * 0.34, canvas);

    shadowBlob(ctx, c.x, c.y, 26 * z, 10 * z);
    shadowBlob(ctx, back.x, back.y, 22 * z, 9 * z);

    // Wagon first — it is behind the locomotive along the direction of travel.
    wagon(ctx, back.x, back.y, cargo, z);
    locomotive(ctx, c.x, c.y, z, opts);
  }

  function locomotive(ctx, x, y, z, opts) {
    var w = 40 * z, h = 20 * z, y0 = y - 7 * z;

    roundRect(ctx, x - w / 2, y0 - h, w, h, 3 * z);     // boiler and frame
    ctx.fillStyle = '#2f4858'; ctx.fill();
    roundRect(ctx, x - w / 2, y0 - h, w, h * 0.42, 3 * z);
    ctx.fillStyle = '#3d5c70'; ctx.fill();

    roundRect(ctx, x - w * 0.14, y0 - h - 11 * z, w * 0.44, 12 * z, 2 * z);   // cab
    ctx.fillStyle = '#263a48'; ctx.fill();
    ctx.fillStyle = 'rgba(160,205,225,.8)';                                   // cab window
    ctx.fillRect(x - w * 0.06, y0 - h - 8 * z, 7 * z, 5 * z);

    ctx.fillStyle = '#1d2b36';                                                // chimney
    ctx.fillRect(x - w * 0.42, y0 - h - 9 * z, 5.5 * z, 9 * z);

    wheels(ctx, x, y0, w, z, '#141b22');

    // Steam, only while the train is actually moving.
    if (opts && opts.puff > 0) {
      for (var i = 0; i < 3; i++) {
        var t = (opts.puff + i * 0.33) % 1;
        ctx.beginPath();
        ctx.arc(x - w * 0.39, y0 - h - 12 * z - t * 26 * z, (2.5 + t * 6) * z, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,' + (0.42 * (1 - t)).toFixed(3) + ')';
        ctx.fill();
      }
    }
  }

  function wagon(ctx, x, y, cargo, z) {
    var w = 34 * z, h = 17 * z, y0 = y - 6 * z;
    roundRect(ctx, x - w / 2, y0 - h, w, h, 2.5 * z);
    ctx.fillStyle = cargo.tint; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = Math.max(0.5, 1 * z);
    roundRect(ctx, x - w / 2, y0 - h, w, h, 2.5 * z);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0,0,0,.18)';                 // planking
    for (var i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x - w / 2 + (w / 4) * i, y0 - h + 3 * z);
      ctx.lineTo(x - w / 2 + (w / 4) * i, y0 - 3 * z);
      ctx.stroke();
    }
    (cargo.stamps || []).forEach(function (_, i) {       // stamps, as crates
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fillRect(x - w / 2 + (4 + i * 5) * z, y0 - h + 2.5 * z, 3 * z, 3 * z);
    });
    wheels(ctx, x, y0, w, z, '#1a222b');
  }

  function wheels(ctx, x, y0, w, z, colour) {
    ctx.fillStyle = colour;
    [-0.3, 0, 0.3].forEach(function (f) {
      ctx.beginPath();
      ctx.arc(x + w * f, y0, 3.6 * z, 0, Math.PI * 2);
      ctx.fill();
    });
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

  return {
    PALETTE: PALETTE, S3_DOCK: S3_DOCK,
    ARCHIVE_PLATFORM: ARCHIVE_PLATFORM, ARCHIVE_TRACK: ARCHIVE_TRACK,
    identity: identity, assign: assign, hash: hash,
    station: station, s3Depot: s3Depot, depot: depot, vault: vault,
    siding: siding, terminus: terminus, external: external, archive: archive,
    archway: archway, ARCH_SPAN: ARCH_SPAN,
    sortingStation: sortingStation, filterStation: filterStation,
    scanStation: scanStation,
    platformStrip: platformStrip,
    train: train, cart: cart, beltBox: beltBox, tree: tree,
    nameboard: nameboard, roundRect: roundRect, shadowBlob: shadowBlob
  };
})();
