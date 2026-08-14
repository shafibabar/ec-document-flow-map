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
   * S3: a goods warehouse. Long shed, corrugated roof, a loading dock on the
   * side facing the road — because on this map an S3 bucket is a place carts
   * fetch documents from, not a passenger stop.
   */
  function warehouse(ctx, canvas, stop, state, z) {
    var gx = stop.grid.x, gy = stop.grid.y;
    var body = state === 'current' ? '#d8c8a4' : PALETTE.wallWarm;

    I.box(ctx, canvas, gx, gy, 0.44, 0.30, 4, PALETTE.stone);             // apron
    I.box(ctx, canvas, gx, gy, 0.40, 0.26, 22, body, 4);                  // shed
    I.roof(ctx, canvas, gx, gy, 0.44, 0.30, 26, 9, '#7d8794');            // shallow roof

    // Corrugation lines along the roof, and a dock opening on the near face.
    var c = I.corners(gx, gy, 0.40, 0.26, canvas);
    var dockA = I.up(c.w, 4), dockB = I.up(c.s, 4);
    ctx.fillStyle = 'rgba(40,44,50,.55)';
    ctx.beginPath();
    ctx.moveTo(dockA.x + (dockB.x - dockA.x) * 0.28, dockA.y + (dockB.y - dockA.y) * 0.28);
    ctx.lineTo(dockA.x + (dockB.x - dockA.x) * 0.72, dockA.y + (dockB.y - dockA.y) * 0.72);
    ctx.lineTo(dockA.x + (dockB.x - dockA.x) * 0.72, dockA.y + (dockB.y - dockA.y) * 0.72 - 13 * z);
    ctx.lineTo(dockA.x + (dockB.x - dockA.x) * 0.28, dockA.y + (dockB.y - dockA.y) * 0.28 - 13 * z);
    ctx.closePath();
    ctx.fill();

    if (state === 'current') haloRing(ctx, canvas, gx, gy, 0.6, '#f0a132', z);

    var top = I.up(I.toScreen(gx, gy, canvas), 4);
    nameboard(ctx, top.x, top.y - 44 * z, stop.name, stop.tech, z);
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
    I.box(ctx, canvas, gx + 0.20, gy - 0.20, HW + 0.04, HH + 0.04, 2, '#b9bfc4');

    // Ground-level plant, on the apron beside the building.
    for (var p = 0; p < 3; p++) {
      I.box(ctx, canvas, gx - 0.16 + p * 0.24, gy - 0.58, 0.10, 0.10, 6, '#8d959c', 2);
    }

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

    // --- the ARCHIVE sign -----------------------------------------------------
    var plaque = faceQuad(ctx, f, 0.63, 0.955, 0.50, 0.72, '#123f36');
    ctx.strokeStyle = '#5fe0bd';
    ctx.lineWidth = Math.max(0.7, 1.6 * z);
    I.poly(ctx, plaque);
    ctx.stroke();
    var pc = f(0.79, 0.61);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8ff0d4';
    ctx.font = '800 ' + Math.max(7, 11 * z) + 'px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('ARCHIVE', pc.x, pc.y + 4 * z);

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
    nameboard(ctx, top.x, top.y - 74 * z, stop.name, stop.role || 'external', z);
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
  function cart(ctx, canvas, gx, gy, tint, z, loaded) {
    var c = I.toScreen(gx, gy, canvas);
    shadowBlob(ctx, c.x, c.y, 10 * z, 4 * z);
    var w = 15 * z, y0 = c.y - 3 * z;

    // A flat bed rather than a solid block, so "carrying something" and
    // "coming back empty" are actually different silhouettes.
    var bed = 4.5 * z;
    roundRect(ctx, c.x - w / 2, y0 - bed, w, bed, 1.2 * z);
    ctx.fillStyle = '#8a7a5e'; ctx.fill();

    if (loaded !== false) {
      var h = 8 * z;
      roundRect(ctx, c.x - w * 0.38, y0 - bed - h, w * 0.76, h, 1.4 * z);
      ctx.fillStyle = tint || '#c9a227'; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.3)';
      ctx.lineWidth = Math.max(0.4, 0.8 * z);
      roundRect(ctx, c.x - w * 0.38, y0 - bed - h, w * 0.76, h, 1.4 * z);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.35)';   // strapping
      ctx.beginPath();
      ctx.moveTo(c.x, y0 - bed - h);
      ctx.lineTo(c.x, y0 - bed);
      ctx.stroke();
    }

    ctx.fillStyle = '#2a2f36';
    [-0.28, 0.28].forEach(function (f) {
      ctx.beginPath();
      ctx.arc(c.x + w * f, y0, 2.2 * z, 0, Math.PI * 2);
      ctx.fill();
    });
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
    PALETTE: PALETTE, identity: identity, assign: assign, hash: hash,
    station: station, warehouse: warehouse, depot: depot, vault: vault,
    siding: siding, terminus: terminus, external: external, archive: archive,
    train: train, cart: cart, tree: tree,
    nameboard: nameboard, roundRect: roundRect, shadowBlob: shadowBlob
  };
})();
