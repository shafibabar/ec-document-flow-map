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

  return {
    TILE_W: TILE_W, TILE_H: TILE_H, cam: cam,
    toWorld: toWorld, toScreen: toScreen,
    lookAt: lookAt, glideTo: glideTo, pan: pan, zoomBy: zoomBy,
    frame: frame, tilePath: tilePath
  };
})();
