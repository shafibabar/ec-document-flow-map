'use strict';
/*
 * iso.js — isometric projection, camera, and nothing else.
 *
 * Deliberately free of domain knowledge: it knows about tiles, not about
 * services or topics. That separation is the reason ChipTycoon's iso layer can
 * be lifted wholesale, and it is kept here for the same reason.
 */
var Iso = (function () {
  var TILE_W = 116;   // full width of a tile diamond
  var TILE_H = 58;    // full height

  var cam = { x: 0, y: 0, zoom: 1, minZoom: 0.4, maxZoom: 2.4 };

  /** Grid (x, y) -> unscaled world pixels, at the tile centre. */
  function toWorld(gx, gy) {
    return { x: (gx - gy) * (TILE_W / 2), y: (gx + gy) * (TILE_H / 2) };
  }

  /** Grid -> screen, applying the camera. */
  function toScreen(gx, gy, canvas) {
    var w = toWorld(gx, gy);
    return {
      x: (w.x - cam.x) * cam.zoom + canvas.clientWidth / 2,
      y: (w.y - cam.y) * cam.zoom + canvas.clientHeight / 2
    };
  }

  function lookAt(gx, gy) {
    var w = toWorld(gx, gy);
    cam.x = w.x; cam.y = w.y;
  }

  /** Ease the camera toward a grid position — follow mode. */
  function glideTo(gx, gy, t) {
    var w = toWorld(gx, gy);
    cam.x += (w.x - cam.x) * t;
    cam.y += (w.y - cam.y) * t;
  }

  function pan(dxPx, dyPx) {
    cam.x -= dxPx / cam.zoom;
    cam.y -= dyPx / cam.zoom;
  }

  function zoomBy(factor) {
    cam.zoom = Math.max(cam.minZoom, Math.min(cam.maxZoom, cam.zoom * factor));
  }

  /** Fit every supplied grid point on screen with a margin. */
  function frame(points, canvas, marginPx) {
    if (!points.length) return;
    var m = marginPx === undefined ? 130 : marginPx;
    var xs = [], ys = [];
    points.forEach(function (p) {
      var w = toWorld(p.x, p.y);
      xs.push(w.x); ys.push(w.y);
    });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    cam.x = (minX + maxX) / 2;
    cam.y = (minY + maxY) / 2;
    var zx = (canvas.clientWidth - m * 2) / Math.max(1, maxX - minX + TILE_W * 2);
    var zy = (canvas.clientHeight - m * 2) / Math.max(1, maxY - minY + TILE_H * 4);
    cam.zoom = Math.max(cam.minZoom, Math.min(cam.maxZoom, Math.min(zx, zy)));
  }

  /*
   * A point on a loop that leaves a grid cell and returns to it, parameterised
   * k = 0..1. At k = 0 and k = 1 it is exactly on the cell; at k = 0.5 it is a
   * full diameter away. Used for anything that goes round and comes back to
   * where it started — the engine animates along it and the renderer draws the
   * curve from it, so the two cannot disagree.
   */
  var LOOP_R = 0.5;

  function loopPoint(gx, gy, k, r) {
    var R = r === undefined ? LOOP_R : r;
    var ang = -Math.PI / 2 + Math.PI * 2 * k;
    return { x: gx + Math.cos(ang) * R, y: gy + R + Math.sin(ang) * R };
  }

  /*
   * A point on a quadratic curve through three grid points. Used for railway
   * curves, where the control point is placed where the two tangent lines meet
   * so a track leaves one stop and arrives at the next on chosen bearings
   * rather than incidental ones. The renderer draws the rail from this and the
   * engine runs the train along it, so the two cannot disagree.
   */
  function quadPoint(p0, c, p1, t) {
    var u = 1 - t;
    return { x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
             y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y };
  }

  /** Trace a tile diamond centred on a grid cell. Caller strokes or fills. */
  function tilePath(ctx, gx, gy, canvas, inset) {
    var s = toScreen(gx, gy, canvas);
    var hw = (TILE_W / 2 - (inset || 0)) * cam.zoom;
    var hh = (TILE_H / 2 - (inset || 0) / 2) * cam.zoom;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - hh);
    ctx.lineTo(s.x + hw, s.y);
    ctx.lineTo(s.x, s.y + hh);
    ctx.lineTo(s.x - hw, s.y);
    ctx.closePath();
    return s;
  }

  // -------------------------------------------------------------- solids
  /*
   * Primitives for building things out of, in grid units so a caller never has
   * to think in screen pixels. Still domain-free: these know about boxes and
   * roofs, not about services or topics.
   *
   * Every solid is drawn from its footprint — a diamond centred on (gx, gy)
   * with half-extents hw, hh in grid units — extruded upward by `h` world
   * pixels. The three visible faces are painted back to front within the solid,
   * which is what lets the global sort treat a whole building as one drawable.
   */

  /** Lighten (+) or darken (-) a #rrggbb by an amount in 0..1. */
  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var f = amt < 0 ? 0 : 255, t = amt < 0 ? -amt : amt;
    r = Math.round(r + (f - r) * t);
    g = Math.round(g + (f - g) * t);
    b = Math.round(b + (f - b) * t);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /** The four footprint corners, in screen space: north, east, south, west. */
  function corners(gx, gy, hw, hh, canvas) {
    return {
      n: toScreen(gx - hw, gy - hh, canvas),
      e: toScreen(gx + hw, gy - hh, canvas),
      s: toScreen(gx + hw, gy + hh, canvas),
      w: toScreen(gx - hw, gy + hh, canvas)
    };
  }

  function poly(ctx, pts, fill) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  }

  var up = function (p, h) { return { x: p.x, y: p.y - h * cam.zoom }; };

  /*
   * A box. `base` lifts the whole solid off the ground (for anything stacked on
   * a platform), `h` is its height. Faces are shaded from one light direction so
   * every solid on the map agrees about where the sun is.
   */
  function box(ctx, canvas, gx, gy, hw, hh, h, colour, base) {
    var b = base || 0;
    var c = corners(gx, gy, hw, hh, canvas);
    var bn = up(c.n, b), be = up(c.e, b), bs = up(c.s, b), bw = up(c.w, b);
    var tn = up(c.n, b + h), te = up(c.e, b + h), ts = up(c.s, b + h), tw = up(c.w, b + h);

    poly(ctx, [bw, bs, ts, tw], shade(colour, -0.34));   // left face, in shadow
    poly(ctx, [bs, be, te, ts], shade(colour, -0.16));   // right face
    poly(ctx, [tn, te, ts, tw], shade(colour, 0.10));    // roof / top, lit
    return { n: tn, e: te, s: ts, w: tw, cx: (tn.x + ts.x) / 2, cy: (tn.y + ts.y) / 2 };
  }

  /*
   * A pitched roof sitting on a box: a ridge running along the grid-x axis,
   * with two slopes falling to the eaves. This is the single detail that stops
   * a building reading as a cardboard block.
   */
  function roof(ctx, canvas, gx, gy, hw, hh, base, rise, colour) {
    var c = corners(gx, gy, hw, hh, canvas);
    var bn = up(c.n, base), be = up(c.e, base), bs = up(c.s, base), bw = up(c.w, base);
    var ridgeA = up(toScreen(gx - hw, gy, canvas), base + rise);
    var ridgeB = up(toScreen(gx + hw, gy, canvas), base + rise);

    poly(ctx, [bw, bs, ridgeB, ridgeA], shade(colour, -0.28));  // near slope
    poly(ctx, [bn, be, ridgeB, ridgeA], shade(colour, 0.14));   // far slope
    ctx.strokeStyle = shade(colour, -0.45);
    ctx.lineWidth = Math.max(0.6, 1 * cam.zoom);
    ctx.beginPath();
    ctx.moveTo(ridgeA.x, ridgeA.y);
    ctx.lineTo(ridgeB.x, ridgeB.y);
    ctx.stroke();
  }

  /** An upright cylinder — water towers, silos, chimneys. */
  function cylinder(ctx, canvas, gx, gy, r, h, colour, base) {
    var b = base || 0;
    var c = toScreen(gx, gy, canvas);
    var rx = r * TILE_W * cam.zoom, ry = r * TILE_H * cam.zoom;
    var by = c.y - b * cam.zoom, ty = by - h * cam.zoom;

    ctx.beginPath();                                   // barrel
    ctx.moveTo(c.x - rx, ty);
    ctx.lineTo(c.x - rx, by);
    ctx.ellipse(c.x, by, rx, ry, 0, Math.PI, 0, true);
    ctx.lineTo(c.x + rx, ty);
    ctx.closePath();
    ctx.fillStyle = shade(colour, -0.22);
    ctx.fill();

    ctx.beginPath();                                   // lit cap
    ctx.ellipse(c.x, ty, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = shade(colour, 0.16);
    ctx.fill();
  }

  return {
    TILE_W: TILE_W, TILE_H: TILE_H, LOOP_R: LOOP_R, cam: cam,
    toWorld: toWorld, toScreen: toScreen,
    lookAt: lookAt, glideTo: glideTo, pan: pan, zoomBy: zoomBy,
    frame: frame, tilePath: tilePath, loopPoint: loopPoint, quadPoint: quadPoint,
    shade: shade, corners: corners, poly: poly, up: up,
    box: box, roof: roof, cylinder: cylinder
  };
})();
