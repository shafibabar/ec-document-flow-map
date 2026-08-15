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
   * Queue Qualifier: a station whose job is written into its architecture.
   *
   * The service takes a communication and decides which of the tenant's
   * pipelines it belongs to — it sorts a queue. So the building carries a
   * sorting gate: a gantry over the platform with three semaphore arms that
   * drop in sequence, and a departure-board display whose rows advance. Both
   * animate off the same clock, which is what makes it read as machinery
   * working rather than decoration bolted on.
   *
   * Everything else follows the Archive's arrangement — the building set back,
   * a platform between it and the track, and its name on the standard board
   * rather than painted across the wall.
   */
  function sortingStation(ctx, canvas, stop, state, z, t) {
    var gx = stop.grid.x, gy = stop.grid.y;
    var HW = 0.44, HH = 0.30, H = 30;
    var wall = state === 'current' ? '#e6dcc9' : PALETTE.wall;
    var accent = state === 'current' ? '#f0a132' : '#b5842f';
    var beat = ((t || 0) % 2600) / 2600;

    I.box(ctx, canvas, gx, gy, HW + 0.10, HH + 0.10, 2, PALETTE.stone);   // apron
    I.box(ctx, canvas, gx, gy, HW, HH, H, wall, 2);                       // hall
    I.roof(ctx, canvas, gx, gy, HW + 0.06, HH + 0.06, H + 2, 13, accent);

    // --- the departure board, on the face toward the track -------------------
    var c = I.corners(gx, gy, HW, HH, canvas);
    var f = function (u, v) {
      return facePoint(I.up(c.w, 2), I.up(c.s, 2), I.up(c.w, H + 2), I.up(c.s, H + 2), u, v);
    };
    faceQuad(ctx, f, 0.10, 0.62, 0.44, 0.80, '#1d242a');
    for (var r = 0; r < 4; r++) {
      // Rows advance up the board, one leaving the top as one joins the bottom:
      // a queue being worked off.
      var slot = (r + beat) % 4;
      var v0 = 0.47 + slot * 0.075;
      var lit = slot < 1;
      I.poly(ctx, [f(0.13, v0), f(0.13 + (lit ? 0.30 : 0.44), v0),
                   f(0.13 + (lit ? 0.30 : 0.44), v0 + 0.045),
                   f(0.13, v0 + 0.045)], lit ? '#f0b040' : '#3f8f6a');
    }

    // --- the sorting gate: a gantry over the platform ------------------------
    // Two legs planted between the building and the track, a beam across them,
    // and three arms that drop in turn like a router picking a lane.
    var gyGate = gy + 0.52;
    [-0.34, 0.34].forEach(function (o) {
      I.box(ctx, canvas, gx + o, gyGate, 0.045, 0.045, 26, PALETTE.steel, 2);
    });
    I.box(ctx, canvas, gx, gyGate, 0.40, 0.05, 6, '#8a929a', 28);

    for (var a = 0; a < 3; a++) {
      var phase = (beat * 3 + a * 0.34) % 1;
      var drop = phase < 0.30 ? Math.sin(phase / 0.30 * Math.PI) : 0;
      var ax = gx - 0.24 + a * 0.24;
      var pivot = I.up(I.toScreen(ax, gyGate, canvas), 28);
      var len = 11 * z;
      var ang = -Math.PI / 2 + drop * (Math.PI / 2.1);       // hangs down when dropped
      ctx.strokeStyle = drop > 0.1 ? '#e0902c' : '#9aa4ad';
      ctx.lineWidth = Math.max(0.9, 2.2 * z);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pivot.x, pivot.y);
      ctx.lineTo(pivot.x + Math.cos(ang) * len * 0.35, pivot.y - Math.sin(ang) * len);
      ctx.stroke();
      ctx.fillStyle = drop > 0.1 ? '#f0b040' : '#5f6a74';
      ctx.beginPath();
      ctx.arc(pivot.x, pivot.y, 2.2 * z, 0, Math.PI * 2);
      ctx.fill();
    }

    if (state === 'current') haloRing(ctx, canvas, gx, gy, 0.66, '#f0a132', z);

    var top = I.up(I.toScreen(gx, gy, canvas), 2);
    nameboard(ctx, top.x, top.y - 60 * z, stop.name, stop.tech, z);
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
    archway: archway, ARCH_SPAN: ARCH_SPAN, sortingStation: sortingStation,
    platformStrip: platformStrip,
    train: train, cart: cart, beltBox: beltBox, tree: tree,
    nameboard: nameboard, roundRect: roundRect, shadowBlob: shadowBlob
  };
})();
