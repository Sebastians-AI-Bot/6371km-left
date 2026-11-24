/* Line section for "6.371 km left".
   Open index.html in a browser (no server). The wheel zooms from the
   10 m² patch to a section of the Earth. Hold Alt and the wheel
   scrolls the section. Keys 1, 2 and 3 jump to the soils, the crust,
   and the globe. */

(function () {
  "use strict";

  var R_KM = 6371;
  var R = R_KM * 1000;
  var PATCH = Math.sqrt(10);
  var PIT_W = 1.2;
  var PIT_D = 0.22;
  var PAPER = "#f3f0e8";
  var INK = "#3a4654";
  var MID = "#5c6c7c";
  var FAINT = "#8e9bab";
  var HAIR = "#b7c0c8";
  var HATCH = "#667688";

  /* Simplified continental column. Depths are the base of each unit, in metres.
     Fluids are pockets, not shells. Patterns that would only repeat a neighbour
     (peat, silt, till, dolomite, salt, the other igneous names, eclogite,
     coal, iron ore) are left out. */
  var COLUMN = [
    { to: 0.3, name: "topsoil", hatch: "roots" },
    { to: 1.2, name: "clay", hatch: "clay" },
    { to: 3, name: "sand", hatch: "sand" },
    { to: 8, name: "gravel", hatch: "gravel" },
    { to: 60, name: "shale", hatch: "shale" },
    { to: 400, name: "sandstone", hatch: "sandstone" },
    { to: 2000, name: "limestone", hatch: "limestone" },
    { to: 15000, name: "granite", hatch: "granite" },
    { to: 35000, name: "gneiss", hatch: "gneiss" },
    { to: 410000, name: "peridotite", hatch: "peridotite" },
    { to: 660000, name: "transition", hatch: "transition" },
    { to: 2740000, name: "lower mantle", hatch: "mantle" },
    { to: 2890000, name: "D''", hatch: "dlayer" },
    { to: 5150000, name: "outer core", hatch: "outer" },
    { to: 6371000, name: "inner core", hatch: "inner" }
  ];

  var POCKETS = [
    { name: "water", hatch: "groundwater", d0: 1.65, d1: 2.25, x0: -0.35, x1: 2.15 },
    { name: "gas", hatch: "gas", d0: 32, d1: 52, x0: -320, x1: 280 },
    { name: "oil", hatch: "oil", d0: 120, d1: 190, x0: -480, x1: 520 },
    { name: "brine", hatch: "brine", d0: 7000, d1: 11000, x0: -4000, x1: 4000 },
    { name: "magma", hatch: "magma", d0: 37000, d1: 47000, x0: -8000, x1: 8000 }
  ];

  var LAYERS = [
    { depth: 0.3 },
    { depth: 1.2 },
    { depth: 3 },
    { depth: 8 },
    { depth: 60 },
    { depth: 400 },
    { depth: 2000 },
    { depth: 15000 },
    { depth: 35000, name: "Moho", rank: "shell" },
    { depth: 410000, name: "410 km", rank: "shell", dash: true },
    { depth: 660000, name: "660 km", rank: "shell", dash: true },
    { depth: 2740000, name: "D''", rank: "shell", dash: true },
    { depth: 2890000, name: "core–mantle", rank: "shell" },
    { depth: 5150000, name: "inner core", rank: "shell" }
  ];

  var canvas = document.getElementById("sheet");
  var ctx = canvas.getContext("2d");
  var cssW = 1;
  var cssH = 1;
  var dpr = 1;

  var logW = Math.log10(nearWidth());
  var lock = "near";
  /* 0 is the opening 3 m frame. 1 is the centre of the Earth. */
  var scrollT = 0;
  var pointerY = null;
  var OPEN_DEPTH = 3;
  /* Presented frames, not a tight redraw loop. A bucket of about a tenth
     of a second: frames in the bucket divided by the time those frames spanned. */
  var fpsLabel = "— fps";
  var fpsValue = 0;
  var fpsFrames = 0;
  var fpsElapsed = 0;
  var fpsLast = 0;
  var fpsPubs = 0;
  var hatchZoom = 1;
  var hatchAnchor = { x: 0, y: 0 };

  function nearWidth() {
    return PATCH / 0.4;
  }

  function closeWidth() {
    return 2;
  }

  function farWidth(aspect) {
    return 2.75 * R * Math.max(aspect, 1);
  }

  /* At the shallow stop the horizon sits one third of the way down the
     screen. Zooming on a deeper point keeps that depth still instead. */
  function skyFraction(box) {
    var fromTop = cssH / 3 - box.y;
    return clamp(fromTop / Math.max(1, box.h), 0.08, 0.8);
  }

  function openWorldH(box) {
    return OPEN_DEPTH / (1 - skyFraction(box));
  }

  function shallowTop(worldH, box) {
    return -skyFraction(box) * worldH;
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(t) {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function trimNum(s) {
    if (s.indexOf(".") === -1) return s;
    return s.replace(/\.?0+$/, "");
  }

  function groupInt(n) {
    var s = String(Math.round(n));
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  function formatLength(meters) {
    var m = Math.abs(meters);
    if (m >= 1000) {
      var km = m / 1000;
      if (km >= 100) return groupInt(km) + " km";
      return trimNum(km.toFixed(1)) + " km";
    }
    if (m >= 1) {
      var d = m >= 10 ? 1 : 2;
      return trimNum(m.toFixed(d)) + " m";
    }
    var cm = m * 100;
    return trimNum(cm.toFixed(cm >= 10 ? 0 : 1)) + " cm";
  }

  function formatTickDepth(meters) {
    var m = Math.min(R, Math.max(0, meters));
    if (m >= 1000) {
      var km = m / 1000;
      if (km >= 100) return groupInt(Math.round(km)) + " km";
      if (km >= 10) return trimNum(km.toFixed(1)) + " km";
      return trimNum(km.toFixed(2)) + " km";
    }
    if (m >= 10) return trimNum(m.toFixed(1)) + " m";
    return trimNum(m.toFixed(2)) + " m";
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = Math.max(1, window.innerWidth);
    cssH = Math.max(1, window.innerHeight);
    var bw = Math.round(cssW * dpr);
    var bh = Math.round(cssH * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
      patternCache = {};
      patternCount = 0;
    }
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function sheetBox() {
    var m = cssW < 720 ? 14 : 22;
    var right = m + stripGutter();
    var w = cssW - m - right;
    if (w < 280) {
      right = Math.max(m, cssW - m - 280);
      w = cssW - m - right;
    }
    return { x: m, y: m, w: Math.max(80, w), h: cssH - m * 2 };
  }

  /* Clear of a 30 px tick and the depth label beside it. */
  function stripGutter() {
    return 128;
  }

  function titleBlock(box) {
    var w = Math.min(268, box.w - 24);
    var h = 184;
    return {
      x: box.x + box.w - w - 10,
      y: box.y + box.h - h - 10,
      w: w,
      h: h
    };
  }

  function placedView(worldW, t) {
    var box = sheetBox();
    var aspect = box.w / Math.max(1, box.h);
    var worldH = worldW / aspect;
    var top0 = shallowTop(worldH, box);
    var top1 = R - worldH;
    var useT = t;
    if (!(top1 > top0) && useT >= 0) useT = 0;
    var bot0 = OPEN_DEPTH;
    var bot = bot0 + useT * (R - bot0);
    var top = bot - worldH;
    if (!(top1 > top0) && useT >= 0) top = top0;
    else if (top > top1) top = top1;
    else if (useT >= 0 && top < top0) top = top0;
    /* Once the disk fits, ease the horizon pin toward a centred globe.
       Fully zoomed out, the core sits on the middle of the screen. */
    var farH = farWidth(aspect) / aspect;
    if (worldH >= 2 * R && farH > 2 * R) {
      var u = clamp((worldH - 2 * R) / (farH - 2 * R), 0, 1);
      u = u * u * (3 - 2 * u);
      top = lerp(top, R - worldH / 2, u);
    }
    return {
      box: box,
      worldW: worldW,
      worldH: worldH,
      left: -worldW / 2,
      top: top,
      px: box.w / worldW
    };
  }

  function viewOf(worldW) {
    return placedView(worldW, scrollT);
  }

  /* Strip position, linear from the 3 m frame to the centre. */
  function stripDepth(t) {
    var tt = clamp(t, 0, 1);
    return OPEN_DEPTH + tt * (R - OPEN_DEPTH);
  }

  function worldToScreen(v, x, y) {
    return {
      x: v.box.x + (x - v.left) * v.px,
      y: v.box.y + (y - v.top) * v.px
    };
  }

  function surfaceY(x) {
    var rr = R * R - x * x;
    if (rr <= 0) return 0;
    return R - Math.sqrt(rr);
  }

  function setFont(px, weight) {
    ctx.font = (weight || 400) + " " + px + "px ui-sans-serif, 'Helvetica Neue', Helvetica, Arial, sans-serif";
  }

  function clipSheet(box) {
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
  }

  function inBlock(tb, x, y, pad) {
    pad = pad || 0;
    return x > tb.x - pad && x < tb.x + tb.w + pad && y > tb.y - pad && y < tb.y + tb.h + pad;
  }

  function strokeLine(x0, y0, x1, y1) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  function drawShell(v, radius, skip) {
    if (radius <= 1) return;
    var px = radius * v.px;
    var c = worldToScreen(v, 0, R);
    var far = px > 120000 || c.y > v.box.y + v.box.h + px;
    if (far) {
      var xLeft = v.left;
      var xRight = v.left + v.worldW;
      var spanL = radius * radius - xLeft * xLeft;
      var spanR = radius * radius - xRight * xRight;
      if (spanL <= 0 || spanR <= 0) return;
      var yL = R - Math.sqrt(spanL);
      var yR = R - Math.sqrt(spanR);
      var view0 = v.top - v.worldH;
      var view1 = v.top + v.worldH * 2;
      if (Math.max(yL, yR) < view0 || Math.min(yL, yR) > view1) return;
    }
    if (!far) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, px, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    var x0 = v.left - v.worldW * 0.02;
    var x1 = v.left + v.worldW * 1.02;
    var limit = radius * 0.999999;
    var n = 80;
    ctx.beginPath();
    var started = false;
    var prevInside = false;
    for (var i = 0; i <= n; i++) {
      var x = x0 + (x1 - x0) * (i / n);
      if (x < -limit || x > limit) continue;
      var inside = !!(skip && x > skip[0] && x < skip[1]);
      if (inside) {
        if (started) {
          var yEdge = R - Math.sqrt(radius * radius - skip[0] * skip[0]);
          var edge = worldToScreen(v, skip[0], yEdge);
          ctx.lineTo(edge.x, edge.y);
        }
        started = false;
        prevInside = true;
        continue;
      }
      var y = R - Math.sqrt(radius * radius - x * x);
      var p = worldToScreen(v, x, y);
      if (!started) {
        if (prevInside) {
          var yOpen = R - Math.sqrt(radius * radius - skip[1] * skip[1]);
          var open = worldToScreen(v, skip[1], yOpen);
          ctx.moveTo(open.x, open.y);
          ctx.lineTo(p.x, p.y);
        } else {
          ctx.moveTo(p.x, p.y);
        }
        started = true;
      } else {
        ctx.lineTo(p.x, p.y);
      }
      prevInside = false;
    }
    ctx.stroke();
  }

  function hatch(points, spacing, angle) {
    if (points.length < 3) return;
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    var i;
    for (i = 0; i < points.length; i++) {
      minX = Math.min(minX, points[i].x);
      minY = Math.min(minY, points[i].y);
      maxX = Math.max(maxX, points[i].x);
      maxY = Math.max(maxY, points[i].y);
    }
    if (maxX - minX < 2 || maxY - minY < 2) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.clip();
    ctx.strokeStyle = HAIR;
    ctx.lineWidth = 0.7;
    ctx.setLineDash([]);
    var diag = Math.hypot(maxX - minX, maxY - minY) + spacing * 4;
    var cx = (minX + maxX) / 2;
    var cy = (minY + maxY) / 2;
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    var span = diag;
    for (var d = -span; d <= span; d += spacing) {
      strokeLine(-span, d, span, d);
    }
    ctx.restore();
  }

  function screenPoly(v, pts) {
    var out = [];
    for (var i = 0; i < pts.length; i++) out.push(worldToScreen(v, pts[i][0], pts[i][1]));
    return out;
  }


  function depthY(depth, x) {
    var r = R - depth;
    if (r <= 0) return R;
    var under = r * r - x * x;
    if (under <= 0) return R;
    return R - Math.sqrt(under);
  }

  function ringMode(v, d0) {
    var px = (R - d0) * v.px;
    if (px > 5000 || px < 8) return false;
    var c = worldToScreen(v, 0, R);
    return c.y > v.box.y - 30 && c.y < v.box.y + v.box.h + 30;
  }

  function visiblePx(v, d0, d1) {
    if (ringMode(v, d0)) return (d1 - d0) * v.px;
    var top = Math.max(d0, v.top);
    var bot = Math.min(d1, v.top + v.worldH);
    if (bot <= top) return 0;
    return (bot - top) * v.px;
  }

  function clipRing(v, d0, d1) {
    var c = worldToScreen(v, 0, R);
    var px0 = Math.max(0.5, (R - d0) * v.px);
    var px1 = Math.max(0, (R - d1) * v.px);
    ctx.beginPath();
    ctx.arc(c.x, c.y, px0, 0, Math.PI * 2, false);
    if (px1 > 0.8) ctx.arc(c.x, c.y, px1, 0, Math.PI * 2, true);
    ctx.clip("evenodd");
  }

  /* Hatches stay inside the earth. A huge radius is drawn as the surface
     arc across the view; the disk itself is used once it fits. */
  function clipBelowSurface(v) {
    var ySurf = depthY(0, 0);
    var view0 = v.top;
    var view1 = v.top + v.worldH;
    if (ySurf > view1 + v.worldH * 0.05) {
      ctx.beginPath();
      ctx.rect(0, 0, 0, 0);
      ctx.clip();
      return;
    }
    /* A close view of deep ground is entirely below the surface. A clip
       that reaches up to the surface carries coordinates of billions of
       pixels and the rasteriser drops frames. The sheet clip is enough. */
    if (ySurf < view0 - 0.5 && R * v.px >= 800000) return;
    var c = worldToScreen(v, 0, R);
    var rad = R * v.px;
    ctx.beginPath();
    if (rad < 800000) {
      ctx.arc(c.x, c.y, Math.max(1, rad), 0, Math.PI * 2);
      ctx.clip();
      return;
    }
    var n = 48;
    var left = v.left;
    var right = v.left + v.worldW;
    var p = worldToScreen(v, left, depthY(0, left));
    ctx.moveTo(v.box.x, v.box.y + v.box.h);
    ctx.lineTo(p.x, p.y);
    for (var i = 1; i <= n; i++) {
      var x = left + (right - left) * (i / n);
      p = worldToScreen(v, x, depthY(0, x));
      ctx.lineTo(p.x, p.y);
    }
    ctx.lineTo(v.box.x + v.box.w, v.box.y + v.box.h);
    ctx.closePath();
    ctx.clip();
  }

  function clipStrip(v, d0, d1, x0, x1) {
    var n = 28;
    var pts = [];
    var i;
    var x;
    for (i = 0; i <= n; i++) {
      x = x0 + (x1 - x0) * (i / n);
      pts.push([x, depthY(d0, x)]);
    }
    for (i = n; i >= 0; i--) {
      x = x0 + (x1 - x0) * (i / n);
      pts.push([x, depthY(d1, x)]);
    }
    var s = screenPoly(v, pts);
    ctx.beginPath();
    ctx.moveTo(s[0].x, s[0].y);
    for (i = 1; i < s.length; i++) ctx.lineTo(s[i].x, s[i].y);
    ctx.closePath();
    ctx.clip();
  }

  function stripBox(v, d0, d1, x0, x1) {
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    var n = 16;
    for (var i = 0; i <= n; i++) {
      var x = x0 + (x1 - x0) * (i / n);
      var p0 = worldToScreen(v, x, depthY(d0, x));
      var p1 = worldToScreen(v, x, depthY(d1, x));
      minX = Math.min(minX, p0.x, p1.x);
      maxX = Math.max(maxX, p0.x, p1.x);
      minY = Math.min(minY, p0.y, p1.y);
      maxY = Math.max(maxY, p0.y, p1.y);
    }
    var xA = Math.max(v.box.x, minX);
    var yA = Math.max(v.box.y, minY);
    var xB = Math.min(v.box.x + v.box.w, maxX);
    var yB = Math.min(v.box.y + v.box.h, maxY);
    return { x: xA, y: yA, w: Math.max(0, xB - xA), h: Math.max(0, yB - yA) };
  }

  function ringBox(v, d0) {
    var c = worldToScreen(v, 0, R);
    var px = (R - d0) * v.px;
    var xA = Math.max(v.box.x, c.x - px);
    var yA = Math.max(v.box.y, c.y - px);
    var xB = Math.min(v.box.x + v.box.w, c.x + px);
    var yB = Math.min(v.box.y + v.box.h, c.y + px);
    return { x: xA, y: yA, w: Math.max(0, xB - xA), h: Math.max(0, yB - yA) };
  }

  function hatchInk() {
    ctx.strokeStyle = HATCH;
    ctx.fillStyle = HATCH;
    ctx.lineWidth = 0.75;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash([]);
  }

  var patternCache = {};
  var patternCount = 0;

  /* Repeat step, and the smallest drawn mark, in CSS pixels at the surface. */
  var STEP = {
    roots: 28, clay: 8, sand: 11, gravel: 22, shale: 7, sandstone: 11,
    limestone: 13, granite: 22, gneiss: 12, peridotite: 26, transition: 12,
    mantle: 18, dlayer: 8, outer: 9, inner: 11, groundwater: 9, gas: 16,
    oil: 8, brine: 9, magma: 7
  };
  var MARK = {
    roots: 3.2, clay: 8, sand: 1.4, gravel: 3.4, shale: 7, sandstone: 11,
    limestone: 13, granite: 6.4, gneiss: 4.8, peridotite: 8.4, transition: 12,
    mantle: 6.4, dlayer: 5.2, outer: 6.8, inner: 14, groundwater: 2.1, gas: 4.6,
    oil: 2.3, brine: 3.4, magma: 6.4
  };
  var HAIR = 0.75;
  /* Pitch closer than this, with a hairline stroke, reads as a grey fill. */
  var MIN_PITCH = 5;

  /* Same tile as the legend. Screen size tracks the ground: nearWidth/worldW.
     1 at the surface, smaller as the window widens. */
  function zoomScale(v) {
    var fit = nearWidth() / Math.max(v.worldW, nearWidth());
    if (fit > 1) fit = 1;
    return Math.round(fit * 32) / 32;
  }

  /* Hold a pattern when its marks would be finer than a hairline, or when
     the repeat would close up into a solid fill. Same drawing, just not smaller. */
  function patternScale(key) {
    var step = STEP[key] || 12;
    var mark = MARK[key] || step;
    var scale = hatchZoom;
    var floor = Math.max(HAIR / mark, MIN_PITCH / step);
    if (scale < floor) scale = floor;
    if (scale > 1) scale = 1;
    return Math.round(scale * 32) / 32;
  }

  /* One tile per hatch and scale, painted once and repeated. The cell is
     rounded to whole CSS pixels. A fractional cell makes the browser repeat
     the tile on a slow path, and a close view of one layer then misses
     frames. Geometry is scaled; the stroke stays a hairline. */
  function fillPattern(box, key, w, h, paint) {
    if (box.w < 1 || box.h < 1) return;
    var scale = patternScale(key);
    var tw = Math.max(2, Math.round(w * scale));
    var th = Math.max(2, Math.round(h * scale));
    var id = key + "@" + dpr + "@" + tw + "x" + th;
    var pat = patternCache[id];
    if (!pat) {
      if (patternCount > 160) {
        patternCache = {};
        patternCount = 0;
      }
      patternCount += 1;
      var tile = document.createElement("canvas");
      tile.width = tw * dpr;
      tile.height = th * dpr;
      var g = tile.getContext("2d");
      var sx = tw / w;
      var sy = th / h;
      g.setTransform(dpr * sx, 0, 0, dpr * sy, 0, 0);
      g.strokeStyle = HATCH;
      g.fillStyle = HATCH;
      g.lineWidth = 0.75 / sx;
      g.lineCap = "round";
      g.lineJoin = "round";
      paint(g, w, h);
      pat = ctx.createPattern(tile, "repeat");
      pat.setTransform(new DOMMatrix().scale(1 / dpr, 1 / dpr));
      patternCache[id] = pat;
    }
    /* Phase of the surface, folded into one cell and snapped to a device
       pixel. A fractional offset makes the repeat resample every pixel,
       which is what drops a close view of a full layer below the display rate. */
    var ox = hatchAnchor.x % tw;
    var oy = hatchAnchor.y % th;
    if (ox < 0) ox += tw;
    if (oy < 0) oy += th;
    ox = Math.round(ox * dpr) / dpr;
    oy = Math.round(oy * dpr) / dpr;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.fillStyle = pat;
    ctx.fillRect(box.x - ox, box.y - oy, box.w, box.h);
    ctx.restore();
  }

  function stamp(g, w, h, places, drawOne) {
    g.save();
    g.beginPath();
    g.rect(0, 0, w, h);
    g.clip();
    for (var j = -1; j <= 1; j++) {
      for (var i = -1; i <= 1; i++) {
        for (var p = 0; p < places.length; p++) {
          drawOne(
          g,
          places[p][0] + i * w,
          places[p][1] + j * h,
          places[p][0],
          places[p][1]
        );
        }
      }
    }
    g.restore();
  }

  function lattice(step, n) {
    var places = [];
    var span = n * step;
    for (var row = 0; row < n; row++) {
      var shift = (row % 2) ? step * 0.5 : 0;
      for (var col = 0; col < n; col++) {
        var x = col * step + shift;
        if (x >= span - 0.01) x -= span;
        places.push([x, row * step]);
      }
    }
    return places;
  }

  function paintRuled(g, w, h, dash) {
    g.save();
    g.lineCap = "butt";
    g.setLineDash(dash || []);
    g.beginPath();
    g.moveTo(0, h / 2);
    g.lineTo(w, h / 2);
    g.stroke();
    g.restore();
  }

  function paintWave(g, w, h, amp, freq, dash, yShift) {
    g.save();
    g.lineCap = "butt";
    g.setLineDash(dash || []);
    var steps = Math.max(8, Math.ceil(w / 3));
    for (var k = -1; k <= 1; k++) {
      var y0 = h / 2 + (yShift || 0) + k * h;
      g.beginPath();
      for (var i = 0; i <= steps; i++) {
        var x = (w * i) / steps;
        var y = y0 + Math.sin(x * freq) * amp;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    g.restore();
  }

  function unitHash(x, y) {
    var n = Math.sin(x * 0.017 + y * 0.013) * 43758.5453;
    return n - Math.floor(n);
  }

  function paintRoot(g, x, y, ox, oy) {
    var hv = unitHash(Math.round(ox), Math.round(oy));
    var s = 0.8 + hv * 0.45;
    x += (hv - 0.5) * 8;
    y += (unitHash(Math.round(oy), Math.round(ox)) - 0.5) * 4;
    g.beginPath();
    g.moveTo(x, y - 2 * s);
    g.lineTo(x, y + 3 * s);
    g.moveTo(x, y);
    g.lineTo(x - 4.2 * s, y + 3.4 * s);
    g.moveTo(x, y + 0.6 * s);
    g.lineTo(x + 3.6 * s, y + 3.6 * s);
    g.moveTo(x, y - 0.4 * s);
    g.lineTo(x - 3.2 * s, y - 2.6 * s);
    g.stroke();
  }

  function paintGravel(g, x, y, ox, oy) {
    var hv = unitHash(Math.round(ox), Math.round(oy));
    var jx = (hv - 0.5) * 8;
    var jy = (unitHash(Math.round(oy), Math.round(ox)) - 0.5) * 6;
    g.beginPath();
    g.ellipse(x + jx, y + jy, 2.4 + hv * 2.2, 1.7 + (1 - hv) * 1.5, (hv - 0.5) * 1.1, 0, Math.PI * 2);
    g.stroke();
  }

  function paintPlus(g, x, y) {
    g.beginPath();
    g.moveTo(x - 3.2, y);
    g.lineTo(x + 3.2, y);
    g.moveTo(x, y - 3.2);
    g.lineTo(x, y + 3.2);
    g.stroke();
  }

  function paintCube(g, x, y) {
    var s = 4.2;
    var t = 3.1;
    g.beginPath();
    g.moveTo(x, y - s);
    g.lineTo(x + t, y - s * 0.45);
    g.lineTo(x + t, y + s * 0.55);
    g.lineTo(x, y + s);
    g.lineTo(x - t, y + s * 0.55);
    g.lineTo(x - t, y - s * 0.45);
    g.closePath();
    g.moveTo(x, y - s);
    g.lineTo(x, y + s);
    g.moveTo(x - t, y - s * 0.45);
    g.lineTo(x + t, y - s * 0.45);
    g.stroke();
  }

  function paintTri(g, x, y) {
    g.beginPath();
    g.moveTo(x, y - 3.4);
    g.lineTo(x + 3.2, y + 2.4);
    g.lineTo(x - 3.2, y + 2.4);
    g.closePath();
    g.stroke();
  }

  function paintHex(g, x, y) {
    var r = 7;
    g.beginPath();
    for (var k = 0; k < 6; k++) {
      var a = Math.PI / 6 + k * Math.PI / 3;
      var px = x + r * Math.cos(a);
      var py = y + r * Math.sin(a);
      if (k === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.stroke();
  }

  function paintDot(g, x, y, r) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  var PATTERNS = {
    roots: function (box) {
      fillPattern(box, "roots", 112, 112, function (g, w, h) {
        stamp(g, w, h, lattice(28, 4), paintRoot);
      });
    },
    clay: function (box) {
      fillPattern(box, "clay", 8, 8, function (g, w, h) { paintRuled(g, w, h, null); });
    },
    sand: function (box) {
      fillPattern(box, "sand", 44, 44, function (g, w, h) {
        stamp(g, w, h, lattice(11, 4), function (gg, x, y) { paintDot(gg, x, y, 0.7); });
      });
    },
    gravel: function (box) {
      fillPattern(box, "gravel", 88, 88, function (g, w, h) {
        stamp(g, w, h, lattice(22, 4), paintGravel);
      });
    },
    shale: function (box) {
      fillPattern(box, "shale", 9, 7, function (g, w, h) { paintRuled(g, w, h, [5, 4]); });
    },
    sandstone: function (box) {
      fillPattern(box, "sandstone", 16, 11, function (g, w, h) { paintRuled(g, w, h, [9, 7]); });
    },
    limestone: function (box) {
      fillPattern(box, "limestone", 22, 26, function (g) {
        g.save();
        g.lineCap = "butt";
        g.beginPath();
        g.moveTo(0, 6.5);
        g.lineTo(22, 6.5);
        g.moveTo(0, 19.5);
        g.lineTo(22, 19.5);
        g.moveTo(0, 0);
        g.lineTo(0, 13);
        g.moveTo(22, 0);
        g.lineTo(22, 13);
        g.moveTo(11, 13);
        g.lineTo(11, 26);
        g.stroke();
        g.restore();
      });
    },
    granite: function (box) {
      fillPattern(box, "granite", 88, 88, function (g, w, h) {
        stamp(g, w, h, lattice(22, 4), paintPlus);
      });
    },
    gneiss: function (box) {
      var period = Math.PI * 2 / 0.28;
      fillPattern(box, "gneiss", period, 12, function (g, w, h) {
        paintWave(g, w, h, 2.4, 0.28, null, 0);
      });
    },
    peridotite: function (box) {
      fillPattern(box, "peridotite", 104, 104, function (g, w, h) {
        stamp(g, w, h, lattice(26, 4), paintCube);
      });
    },
    transition: function (box) {
      fillPattern(box, "transition", 12, 12, function (g, w, h) {
        g.save();
        g.lineCap = "butt";
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(w, h);
        g.moveTo(w, 0);
        g.lineTo(0, h);
        g.stroke();
        g.restore();
      });
    },
    mantle: function (box) {
      fillPattern(box, "mantle", 72, 72, function (g, w, h) {
        stamp(g, w, h, lattice(18, 4), paintTri);
      });
    },
    dlayer: function (box) {
      var period = Math.PI * 2 / 0.52;
      fillPattern(box, "dlayer", period, 8, function (g, w, h) {
        paintWave(g, w, h, 2.6, 0.52, null, 0);
      });
    },
    outer: function (box) {
      var period = Math.PI * 2 / 0.16;
      fillPattern(box, "outer", period, 9, function (g, w, h) {
        paintWave(g, w, h, 3.4, 0.16, null, 0);
      });
    },
    inner: function (box) {
      var dx = 7 * 1.75;
      var dy = 7 * 1.52;
      fillPattern(box, "inner", dx, dy * 2, function (g, w, h) {
        stamp(g, w, h, [[0, 0], [dx / 2, dy]], paintHex);
      });
    },
    groundwater: function (box) {
      var period = Math.PI * 2 / 0.35;
      fillPattern(box, "groundwater", period, 18, function (g, w, h) {
        paintWave(g, w, h, 2.2, 0.35, [7, 4], 0);
        stamp(g, w, h, [[0, 4], [8, 13]], function (gg, x, y) { paintDot(gg, x, y, 1.05); });
      });
    },
    gas: function (box) {
      fillPattern(box, "gas", 64, 64, function (g, w, h) {
        stamp(g, w, h, lattice(16, 4), function (gg, x, y) {
          gg.beginPath();
          gg.arc(x, y, 2.3, 0, Math.PI * 2);
          gg.stroke();
        });
      });
    },
    oil: function (box) {
      var period = Math.PI * 2 / 0.42;
      fillPattern(box, "oil", period, 16, function (g, w, h) {
        paintWave(g, w, h, 2.1, 0.42, [3, 3], 0);
        stamp(g, w, h, [[2, 4], [9, 12]], function (gg, x, y) { paintDot(gg, x, y, 1.15); });
      });
    },
    brine: function (box) {
      var period = Math.PI * 2 / 0.33;
      fillPattern(box, "brine", period, 18, function (g, w, h) {
        paintWave(g, w, h, 2.2, 0.33, null, 0);
        stamp(g, w, h, [[4, 4], [12, 13]], function (gg, x, y) {
          gg.strokeRect(x - 1.7, y - 1.7, 3.4, 3.4);
        });
      });
    },
    magma: function (box) {
      var period = Math.PI * 2 / 0.2;
      fillPattern(box, "magma", period, 14, function (g, w, h) {
        paintWave(g, w, h, 3.2, 0.2, null, 0);
        paintWave(g, w, h, 1.5, 0.48, null, 3.5);
      });
    }
  };


  function paintRegion(v, d0, d1, patternName, x0, x1, paper) {
    var tall = visiblePx(v, d0, d1);
    if (tall < (x0 == null ? 18 : 14)) return false;
    var ring = x0 == null && ringMode(v, d0);
    var top = v.top;
    var bot = v.top + v.worldH;
    if (!ring && (d1 < top || d0 > bot)) return false;
    var inside = !ring && x0 == null && d0 <= Math.max(0, top) + 0.01 && d1 >= Math.min(R, bot) - 0.01;
    var wx0 = x0 == null ? v.left : x0;
    var wx1 = x1 == null ? v.left + v.worldW : x1;
    ctx.save();
    if (ring) clipRing(v, d0, d1);
    else if (!inside) clipStrip(v, d0, d1, wx0, wx1);
    var box = inside ? { x: v.box.x, y: v.box.y, w: v.box.w, h: v.box.h }
      : (ring ? ringBox(v, d0) : stripBox(v, d0, d1, wx0, wx1));
    if (box.w < 2 || box.h < 2) {
      ctx.restore();
      return false;
    }
    if (paper) {
      ctx.fillStyle = PAPER;
      ctx.fillRect(box.x - 8, box.y - 8, box.w + 16, box.h + 16);
    }
    hatchInk();
    var draw = PATTERNS[patternName];
    if (draw) draw(box);
    ctx.restore();
    return true;
  }

  function labelPoint(v, d0, d1, pocket) {
    if (pocket) {
      var p = worldToScreen(v, (pocket.x0 + pocket.x1) / 2, (d0 + d1) / 2);
      return { x: p.x, y: p.y, align: "center" };
    }
    if (ringMode(v, d0)) {
      var c = worldToScreen(v, 0, R);
      var outer = (R - d0) * v.px;
      if (d1 >= R - 1) return { x: c.x, y: c.y + outer + 16, align: "center" };
      var inner = Math.max(0, (R - d1) * v.px);
      var rm = (outer + inner) * 0.5;
      var ang = Math.PI * 0.78;
      return {
        x: c.x + Math.cos(ang) * rm,
        y: c.y - Math.sin(ang) * rm,
        align: "center"
      };
    }
    var top = Math.max(d0, v.top);
    var bot = Math.min(d1, v.top + v.worldH);
    return { x: v.box.x + 18, y: worldToScreen(v, 0, (top + bot) / 2).y, align: "left" };
  }

  function drawMaterials(v, tb) {
    var nextZoom = zoomScale(v);
    if (nextZoom !== hatchZoom) hatchZoom = nextZoom;
    hatchAnchor = worldToScreen(v, 0, 0);
    var labels = [];
    var from = 0;
    var i;
    ctx.save();
    clipBelowSurface(v);
    for (i = 0; i < COLUMN.length; i++) {
      var unit = COLUMN[i];
      var drew = paintRegion(v, from, unit.to, unit.hatch, null, null, false);
      if (drew && visiblePx(v, from, unit.to) >= 22) {
        labels.push({ name: unit.name, d0: from, d1: unit.to, pocket: null });
      }
      from = unit.to;
    }
    for (i = 0; i < POCKETS.length; i++) {
      var pocket = POCKETS[i];
      var ok = paintRegion(v, pocket.d0, pocket.d1, pocket.hatch, pocket.x0, pocket.x1, true);
      if (ok && visiblePx(v, pocket.d0, pocket.d1) >= 26) {
        labels.push({ name: pocket.name, d0: pocket.d0, d1: pocket.d1, pocket: pocket });
      }
    }
    ctx.restore();
    setFont(12);
    ctx.textBaseline = "middle";
    var used = [];
    for (i = 0; i < labels.length; i++) {
      var item = labels[i];
      var pt = labelPoint(v, item.d0, item.d1, item.pocket);
      if (pt.y < v.box.y + 12 || pt.y > v.box.y + v.box.h - 12) continue;
      if (pt.x < v.box.x + 8 || pt.x > v.box.x + v.box.w - 8) continue;
      if (inBlock(tb, pt.x, pt.y, 12)) continue;
      var clash = false;
      for (var j = 0; j < used.length; j++) {
        if (Math.abs(used[j].y - pt.y) < 16 && Math.abs(used[j].x - pt.x) < 140) {
          clash = true;
          break;
        }
      }
      if (clash) continue;
      var tw = ctx.measureText(item.name).width;
      var rx = pt.align === "center" ? pt.x - tw / 2 : pt.x;
      ctx.fillStyle = PAPER;
      ctx.fillRect(rx - 3, pt.y - 8, tw + 6, 16);
      ctx.fillStyle = INK;
      ctx.textAlign = pt.align;
      ctx.fillText(item.name, pt.x, pt.y);
      used.push(pt);
    }
  }


  function drawHatch(v) {
    if (!(PIT_D * v.px > 6 && PIT_W * v.px > 14)) return;
    var pit = PIT_W / 2;
    var sL = surfaceY(-pit);
    var sR = surfaceY(pit);
    var pts = [[-pit, sL], [pit, sR], [pit, sR + PIT_D], [-pit, sL + PIT_D]];
    var sp = screenPoly(v, pts);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sp[0].x, sp[0].y);
    for (var i = 1; i < sp.length; i++) ctx.lineTo(sp[i].x, sp[i].y);
    ctx.closePath();
    ctx.fillStyle = PAPER;
    ctx.fill();
    ctx.restore();
    hatch(sp, 5, -Math.PI / 4);
  }

  function layerSeparated(kept, radius, pxPerM) {
    var px = radius * pxPerM;
    for (var k = 0; k < kept.length; k++) {
      if (Math.abs(kept[k] - px) < 13) return false;
    }
    kept.push(px);
    return true;
  }

  function drawLayers(v) {
    var kept = [R * v.px];
    var i;
    for (i = 0; i < LAYERS.length; i++) {
      var layer = LAYERS[i];
      var radius = R - layer.depth;
      if (radius <= 0) continue;
      if (layer.depth * v.px < 2.4) continue;
      var onScreen = layer.depth + v.top < v.worldH && layer.depth > v.top - v.worldH;
      var shellVisible = radius * v.px < v.box.w * 2.2;
      if (!onScreen && !shellVisible) continue;
      if (!layerSeparated(kept, radius, v.px)) continue;
      ctx.setLineDash(layer.dash ? [5, 4] : []);
      ctx.lineWidth = layer.rank === "shell" && !layer.dash ? 1.05 : 0.8;
      ctx.strokeStyle = layer.rank === "shell" && !layer.dash ? INK : MID;
      drawShell(v, radius, null);
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.35;
    var openPit = PIT_W * v.px > 10;
    drawShell(v, R, openPit ? [-PIT_W / 2, PIT_W / 2] : null);
  }

  function drawPitAndSurfaceCut(v) {
    var pit = PIT_W / 2;
    var pw = PIT_W * v.px;
    var ph = PIT_D * v.px;
    if (pw < 8 || ph < 4) return;
    var sL = surfaceY(-pit);
    var sR = surfaceY(pit);
    var a = worldToScreen(v, -pit, sL);
    var b = worldToScreen(v, pit, sR);
    var c = worldToScreen(v, pit, sR + PIT_D);
    var d = worldToScreen(v, -pit, sL + PIT_D);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.15;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(d.x, d.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  function arrowHead(x, y, angle) {
    var len = 8;
    var spread = 2.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - len * Math.cos(angle) + spread * Math.sin(angle), y - len * Math.sin(angle) - spread * Math.cos(angle));
    ctx.lineTo(x - len * Math.cos(angle) - spread * Math.sin(angle), y - len * Math.sin(angle) + spread * Math.cos(angle));
    ctx.closePath();
    ctx.fill();
  }

  function dimHorizontal(v, x0, y0, x1, y1, label, offsetY, tb) {
    var a = worldToScreen(v, x0, y0);
    var b = worldToScreen(v, x1, y1);
    if (Math.abs(b.x - a.x) < 28) return;
    var y = (a.y + b.y) / 2 + offsetY;
    var mid = (a.x + b.x) / 2;
    if (inBlock(tb, mid, y, 8)) return;
    ctx.save();
    ctx.strokeStyle = MID;
    ctx.fillStyle = INK;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([]);
    var gap = 3;
    strokeLine(a.x, a.y - Math.sign(offsetY) * gap, a.x, y);
    strokeLine(b.x, b.y - Math.sign(offsetY) * gap, b.x, y);
    setFont(12);
    var tw = ctx.measureText(label).width;
    var half = tw / 2 + 6;
    strokeLine(a.x, y, mid - half, y);
    strokeLine(mid + half, y, b.x, y);
    arrowHead(a.x, y, Math.PI);
    arrowHead(b.x, y, 0);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var tw2 = ctx.measureText(label).width;
    ctx.fillStyle = PAPER;
    ctx.fillRect(mid - tw2 / 2 - 2, y - 8, tw2 + 4, 16);
    ctx.fillStyle = INK;
    ctx.fillText(label, mid, y);
    ctx.restore();
  }

  function dimVertical(v, x, y0, y1, label, offsetX, tb) {
    var a = worldToScreen(v, x, y0);
    var b = worldToScreen(v, x, y1);
    if (Math.abs(b.y - a.y) < 22) return;
    var xLine = (a.x + b.x) / 2 + offsetX;
    var mid = (a.y + b.y) / 2;
    if (inBlock(tb, xLine, mid, 8)) return;
    ctx.save();
    ctx.strokeStyle = MID;
    ctx.fillStyle = INK;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([]);
    strokeLine(a.x, a.y, xLine, a.y);
    strokeLine(b.x, b.y, xLine, b.y);
    setFont(12);
    var tw = ctx.measureText(label).width;
    var half = tw / 2 + 5;
    strokeLine(xLine, a.y, xLine, mid - half);
    strokeLine(xLine, mid + half, xLine, b.y);
    arrowHead(xLine, a.y, -Math.PI / 2);
    arrowHead(xLine, b.y, Math.PI / 2);
    ctx.translate(xLine, mid);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var tw2 = ctx.measureText(label).width;
    ctx.fillStyle = PAPER;
    ctx.fillRect(-tw2 / 2 - 2, -8, tw2 + 4, 16);
    ctx.fillStyle = INK;
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  function drawPatchDims(v, tb) {
    var half = PATCH / 2;
    var pit = PIT_W / 2;
    var widthPx = PATCH * v.px;
    if (widthPx < 70) return;
    var yS = surfaceY(0);
    dimHorizontal(v, -half, yS, half, yS, "3.16 m", -46, tb);
    setFont(11);
    ctx.fillStyle = MID;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    var p = worldToScreen(v, 0, yS);
    var noteY = p.y - 58;
    if (!inBlock(tb, p.x, noteY, 4) && noteY > v.box.y + 8) {
      ctx.fillText("10 m\u00b2", p.x, noteY);
    }
    if (PIT_W * v.px > 64) {
      dimHorizontal(v, -pit, yS, pit, yS, "1.20 m", -24, tb);
    }
    if (PIT_D * v.px > 26) {
      dimVertical(v, pit, yS, yS + PIT_D, "22 cm", 32, tb);
    }
  }

  function niceStep(pxPerM) {
    var raw = 64 / Math.max(pxPerM, 1e-15);
    var pow = Math.pow(10, Math.floor(Math.log10(raw)));
    var m = raw / pow;
    var mant = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
    return mant * pow;
  }

  function drawDepthScale(v, tb) {
    var center = worldToScreen(v, 0, R);
    var surface = worldToScreen(v, 0, 0);
    var globe = center.y > v.box.y + 40 && center.y < v.box.y + v.box.h - 40 &&
      surface.y > v.box.y && surface.y < v.box.y + v.box.h;
    if (globe && (R * 2) * v.px < Math.min(v.box.w, v.box.h) * 1.15) return;

    var bottomWorld = Math.min(v.top + v.worldH, R);
    if (bottomWorld <= 0) return;
    var origin = worldToScreen(v, 0, 0);
    var x = origin.x + Math.max(58, (PATCH / 2) * v.px + 28);
    if (x > v.box.x + v.box.w - 78) x = origin.x - Math.max(72, (PATCH / 2) * v.px + 54);

    var yTop = worldToScreen(v, 0, Math.max(0, v.top)).y;
    var yBot = worldToScreen(v, 0, bottomWorld).y;
    yTop = clamp(yTop, v.box.y + 8, v.box.y + v.box.h - 8);
    yBot = clamp(yBot, v.box.y + 8, v.box.y + v.box.h - 8);
    if (yBot - yTop < 30) return;

    ctx.strokeStyle = FAINT;
    ctx.lineWidth = 0.7;
    ctx.setLineDash([]);
    strokeLine(x, yTop, x, yBot);

    var step = niceStep(v.px);
    var major = step;
    while (major * v.px < 92) major *= 2;
    var labels = [];

    function pushLabel(depth, text, named) {
      if (depth < -step * 0.01 || depth > bottomWorld + step * 0.01) return;
      var y = worldToScreen(v, 0, depth).y;
      if (y < v.box.y + 10 || y > v.box.y + v.box.h - 10) return;
      if (inBlock(tb, x, y, 12)) return;
      labels.push({ y: y, text: text, depth: depth, named: !!named });
    }

    /* Only the ticks that fall inside the view. Walking from the surface
       made a close, deep slice visit millions of off-screen marks. */
    var d = Math.max(0, Math.ceil((Math.max(0, v.top) / step) - 1e-6)) * step;
    var limit = bottomWorld + step * 0.5;
    var guard = 0;
    var majorSteps = Math.max(1, Math.round(major / step));
    for (; d <= limit && guard < 500; d += step, guard++) {
      var y = worldToScreen(v, 0, d).y;
      if (y < v.box.y - 2 || y > v.box.y + v.box.h + 2) continue;
      var isMajor = Math.round(d / step) % majorSteps === 0;
      ctx.strokeStyle = isMajor ? MID : HAIR;
      ctx.lineWidth = isMajor ? 0.9 : 0.6;
      var len = isMajor ? 8 : 4;
      strokeLine(x - len, y, x, y);
      if (isMajor) pushLabel(d, d === 0 ? "0" : formatLength(d), false);
    }

    for (var i = 0; i < LAYERS.length; i++) {
      var layer = LAYERS[i];
      if (!layer.name) continue;
      if (layer.depth * v.px < 18) continue;
      if (layer.rank === "local" && layer.depth * v.px < 28) continue;
      var lenText = formatLength(layer.depth);
      var text = layer.name && layer.name !== lenText ? lenText + "  " + layer.name : lenText;
      pushLabel(layer.depth, text, true);
    }

    labels.sort(function (a, b) { return a.y - b.y; });
    var kept = [];
    for (i = 0; i < labels.length; i++) {
      var place = true;
      for (var j = 0; j < kept.length; j++) {
        if (Math.abs(labels[i].y - kept[j].y) < 16) {
          place = false;
          if (labels[i].named && !kept[j].named) kept[j] = labels[i];
          break;
        }
      }
      if (place) kept.push(labels[i]);
    }
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    setFont(11);
    for (i = 0; i < kept.length; i++) ctx.fillText(kept[i].text, x + 8, kept[i].y);
  }

  function drawCenterlines(v) {
    var c = worldToScreen(v, 0, R);
    var topPt = worldToScreen(v, 0, 0);
    var pxR = R * v.px;
    var full = pxR * 2 < Math.min(v.box.w, v.box.h) * 1.2 &&
      c.y > v.box.y + 30 && c.y < v.box.y + v.box.h - 30 &&
      topPt.y > v.box.y && topPt.y < v.box.y + v.box.h;

    ctx.strokeStyle = MID;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([18, 4, 3, 4]);

    if (full) {
      var over = 22;
      strokeLine(c.x, topPt.y - over, c.x, c.y + pxR + over);
      strokeLine(c.x - pxR - over, c.y, c.x + pxR + over, c.y);
      ctx.setLineDash([]);
      ctx.lineWidth = 0.9;
      tickEnds(c.x, topPt.y - over, c.x, c.y + pxR + over, true);
      tickEnds(c.x - pxR - over, c.y, c.x + pxR + over, c.y, false);
      ctx.beginPath();
      ctx.arc(c.x, c.y, 3.2, 0, Math.PI * 2);
      ctx.stroke();
      strokeLine(c.x - 7, c.y, c.x + 7, c.y);
      strokeLine(c.x, c.y - 7, c.x, c.y + 7);
    } else {
      var y0 = Math.max(v.box.y + 8, topPt.y - 18);
      var y1 = v.box.y + v.box.h - 16;
      if (y1 - y0 > 20) strokeLine(topPt.x, y0, topPt.x, y1);
      ctx.setLineDash([]);
    }
  }

  function tickEnds(x0, y0, x1, y1, vertical) {
    var s = 6;
    ctx.setLineDash([]);
    if (vertical) {
      strokeLine(x0 - s, y0, x0 + s, y0);
      strokeLine(x1 - s, y1, x1 + s, y1);
    } else {
      strokeLine(x0, y0 - s, x0, y0 + s);
      strokeLine(x1, y1 - s, x1, y1 + s);
    }
  }

  function drawRadiusDim(v, tb) {
    var c = worldToScreen(v, 0, R);
    var edge = worldToScreen(v, R, R);
    var pxR = R * v.px;
    if (pxR < 80) return;
    if (c.x < v.box.x + 20 || edge.x > v.box.x + v.box.w - 8) return;
    if (Math.abs(c.y - edge.y) > 2 && Math.hypot(edge.x - c.x, edge.y - c.y) < 40) return;
    var y = c.y - 32;
    if (y < v.box.y + 16) y = c.y + 26;
    var label = "6 371 km";
    setFont(13);
    var tw = ctx.measureText(label).width;
    var mid = (c.x + edge.x) / 2;
    if (inBlock(tb, mid, y, 6)) return;
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = 0.85;
    ctx.setLineDash([]);
    strokeLine(c.x, c.y, c.x, y);
    strokeLine(edge.x, edge.y, edge.x, y);
    var half = tw / 2 + 7;
    if (edge.x - c.x > tw + 28) {
      strokeLine(c.x, y, mid - half, y);
      strokeLine(mid + half, y, edge.x, y);
    } else {
      strokeLine(c.x, y, edge.x, y);
    }
    arrowHead(c.x, y, Math.PI);
    arrowHead(edge.x, y, 0);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, mid, y);
  }

  function drawLocator(v, tb) {
    var widthPx = PATCH * v.px;
    if (widthPx > 18) return;
    var p = worldToScreen(v, 0, surfaceY(0));
    if (p.x < v.box.x || p.x > v.box.x + v.box.w || p.y < v.box.y || p.y > v.box.y + v.box.h) return;
    ctx.strokeStyle = INK;
    ctx.fillStyle = PAPER;
    ctx.lineWidth = 1.1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    strokeLine(p.x - 3.2, p.y, p.x + 3.2, p.y);
    strokeLine(p.x, p.y - 3.2, p.x, p.y + 3.2);
    var label = "10 m\u00b2";
    setFont(12);
    var tw = ctx.measureText(label).width;
    var lx = p.x - 18 - tw;
    var ly = p.y - 30;
    if (ly < v.box.y + 16) {
      ly = p.y - 16;
      lx = p.x + 16;
    }
    if (inBlock(tb, lx, ly, 12) || lx < v.box.x + 8) {
      lx = p.x + 16;
      ly = p.y - 30;
    }
    ctx.strokeStyle = MID;
    ctx.lineWidth = 0.7;
    var anchorX = lx + tw < p.x - 8 ? lx + tw : lx;
    ctx.beginPath();
    ctx.moveTo(p.x - 4.6, p.y - 4.6);
    ctx.lineTo(anchorX, ly);
    ctx.stroke();
    ctx.fillStyle = PAPER;
    ctx.fillRect(lx - 3, ly - 8, tw + 6, 16);
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, lx, ly);
  }

  /* Dots per inch as the browser reports them. A match of 96 × devicePixelRatio
     is the CSS inch, not a measurement of the glass. */
  var knownDpi = 0;
  var knownDpr = 0;

  function browserDpi() {
    var real = window.devicePixelRatio || 1;
    if (knownDpi && knownDpr === real) return knownDpi;
    knownDpr = real;
    var cssDpi = 96 * real;
    var dpi = 0;
    if (window.matchMedia) {
      var rounded = Math.round(cssDpi);
      if (window.matchMedia("(resolution: " + rounded + "dpi)").matches) dpi = rounded;
      if (!dpi) {
        var d;
        for (d = 1; d <= 1000; d++) {
          if (window.matchMedia("(resolution: " + d + "dpi)").matches) {
            dpi = d;
            break;
          }
        }
      }
    }
    if (!dpi) dpi = cssDpi;
    knownDpi = dpi;
    return dpi;
  }

  /* Metres across cssPx, using the browser's inch. One number: the CSS inch
     when that is all the resolution query knows. */
  function glassMetres(cssPx) {
    var real = window.devicePixelRatio || 1;
    var dpi = browserDpi();
    var inches = Math.abs(dpi - 96 * real) < 0.51 ? cssPx / 96 : (cssPx * real) / dpi;
    return inches * 0.0254;
  }

  /* Nearest 1-2-5 step to world metres per metre of glass. */
  function snapRatio(ratio) {
    var best = 1;
    var bestD = Infinity;
    var base = Math.pow(10, Math.floor(Math.log10(Math.max(ratio, 1e-9))));
    var e;
    var i;
    for (e = -2; e <= 2; e++) {
      var mag = base * Math.pow(10, e);
      var steps = [1, 2, 5];
      for (i = 0; i < steps.length; i++) {
        var s = steps[i] * mag;
        var d = Math.abs(Math.log(ratio / s));
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
    }
    return best;
  }

  function scaleText(worldW, cssPx) {
    var glass = glassMetres(cssPx);
    if (!(glass > 0) || !(worldW > 0)) return "1:1";
    var n = snapRatio(worldW / glass);
    if (n < 1) return String(Math.round(1 / n)) + ":1";
    return "1:" + String(Math.round(n));
  }

  function formatRawRatio(n) {
    if (!(n > 0) || !isFinite(n)) return "—";
    if (n >= 1000) return groupInt(n);
    if (n >= 10) return trimNum(n.toFixed(1));
    return trimNum(n.toFixed(2));
  }

  /* Values the drawing already reads. Nothing here is measured twice. */
  function debugRows(v) {
    var glass = glassMetres(v.box.w);
    var raw = glass > 0 ? v.worldW / glass : 0;
    var zoom = trimNum(logW.toFixed(3));
    if (lock) zoom += "  " + lock;
    return [
      ["screen", cssW + " \u00d7 " + cssH + " px"],
      ["dpi", String(Math.round(browserDpi()))],
      ["glass", trimNum(glass.toFixed(3)) + " m"],
      ["width", formatLength(v.worldW)],
      ["depth", shownDepth(v).text],
      ["scale", formatRawRatio(raw) + " \u2192 " + scaleText(v.worldW, v.box.w)],
      ["zoom", zoom],
      ["scroll", formatTickDepth(stripDepth(clamp(scrollT, 0, 1)))],
      ["fps", fpsLabel]
    ];
  }

  var debugOpen = true;
  var debugHit = null;

  function drawDebug(v) {
    var rows = debugOpen ? debugRows(v) : [];
    ctx.save();
    setFont(12, 500);
    var header = "debug";
    var maxW = ctx.measureText(header).width;
    setFont(12);
    var i;
    for (i = 0; i < rows.length; i++) {
      var pair = ctx.measureText(rows[i][0]).width + ctx.measureText(rows[i][1]).width + 18;
      if (pair > maxW) maxW = pair;
    }
    var pad = 8;
    var headH = 22;
    var rowH = 16;
    var w = Math.ceil(maxW + pad * 2);
    var h = debugOpen ? headH + 4 + rows.length * rowH + 4 : headH;
    var x = 10;
    var y = 42;
    debugHit = { x: x, y: y, w: w, h: headH };

    ctx.fillStyle = PAPER;
    ctx.strokeStyle = MID;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([]);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    setFont(12, 500);
    ctx.fillText(header, x + pad, y + headH / 2);
    if (!debugOpen) {
      ctx.restore();
      return;
    }
    ctx.strokeStyle = MID;
    ctx.beginPath();
    ctx.moveTo(x, y + headH);
    ctx.lineTo(x + w, y + headH);
    ctx.stroke();

    var yy = y + headH + 12;
    for (i = 0; i < rows.length; i++) {
      setFont(12);
      ctx.fillStyle = FAINT;
      ctx.textAlign = "left";
      ctx.fillText(rows[i][0], x + pad, yy);
      ctx.fillStyle = INK;
      ctx.textAlign = "right";
      ctx.fillText(rows[i][1], x + w - pad, yy);
      yy += rowH;
    }
    ctx.restore();
  }

  function pointerOnDebug(x, y) {
    var g = debugHit;
    if (!g) return false;
    return x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h;
  }

  function shownDepth(v) {
    var bottom = v.top + v.worldH;
    if (v.top < R && bottom > R && (2 * R) * v.px < Math.min(v.box.w, v.box.h) * 1.25) {
      return { text: "full section", full: true };
    }
    var depth = clamp(bottom, 0, R) - Math.max(v.top, 0);
    if (v.top < 0) depth = Math.min(bottom, R);
    return { text: formatLength(Math.max(0, depth)), full: false };
  }

  function drawFrame(v, tb) {
    var box = v.box;
    ctx.save();
    ctx.setLineDash([]);
    ctx.strokeStyle = "#c9c3b6";
    ctx.lineWidth = 1.25;
    ctx.strokeRect(box.x - 6, box.y - 6, box.w + 12, box.h + 12);
    ctx.lineWidth = 0.6;
    ctx.strokeRect(box.x, box.y, box.w, box.h);

    ctx.fillStyle = PAPER;
    ctx.fillRect(tb.x, tb.y, tb.w, tb.h);
    ctx.strokeStyle = MID;
    ctx.lineWidth = 0.9;
    ctx.strokeRect(tb.x, tb.y, tb.w, tb.h);
    strokeLine(tb.x, tb.y + 46, tb.x + tb.w, tb.y + 46);

    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    setFont(16, 500);
    ctx.fillText("6.371 km left", tb.x + 12, tb.y + 22);
    setFont(11);
    ctx.fillStyle = MID;
    ctx.fillText("line section", tb.x + 12, tb.y + 38);

    var depth = shownDepth(v);
    var rows = [
      ["patch", "3.16 m \u00d7 3.16 m"],
      ["area", "10 m\u00b2"],
      ["radius", "6 371 km"],
      ["window", formatLength(v.worldW)],
      ["depth", depth.text],
      ["scale", scaleText(v.worldW, v.box.w)]
    ];
    var y = tb.y + 66;
    for (var i = 0; i < rows.length; i++) {
      setFont(11);
      ctx.fillStyle = FAINT;
      ctx.textAlign = "left";
      ctx.fillText(rows[i][0], tb.x + 12, y);
      ctx.fillStyle = INK;
      ctx.textAlign = "right";
      ctx.fillText(rows[i][1], tb.x + tb.w - 12, y);
      y += 16;
    }
    setFont(10);
    ctx.fillStyle = FAINT;
    ctx.textAlign = "left";
    ctx.fillText("wheel zooms    1  2  3", tb.x + 12, tb.y + tb.h - 10);
    ctx.restore();
  }

  function widthForLock(aspect) {
    if (lock === "near") return openWorldH(sheetBox()) * aspect;
    if (lock === "middle") return 60000 * aspect;
    if (lock === "globe") return farWidth(aspect);
    return null;
  }

  var stripGeom = null;
  var stripHot = -1;
  var stripDrag = false;
  /* Set for the frame after an Alt-wheel, so the raised tick tracks the
     scrolled depth instead of the pointer. */
  var wheelLift = false;

  function scrollStripGeom() {
    var pad = 12;
    var y0 = pad;
    var y1 = Math.max(y0 + 40, cssH - pad);
    var n = Math.max(24, Math.round((y1 - y0) / 8) + 1);
    var maxLen = 30;
    var right = cssW - 10;
    return {
      x: right - maxLen - 96,
      y: 0,
      w: maxLen + 106,
      h: cssH,
      n: n,
      y0: y0,
      y1: y1,
      right: right
    };
  }

  function stripIndexAt(g, y) {
    return clamp((y - g.y0) / Math.max(1, g.y1 - g.y0), 0, 1) * (g.n - 1);
  }

  /* The round earth essentially fits in the sheet. */
  function globeInView(worldW) {
    var box = sheetBox();
    var px = box.w / Math.max(worldW, 1e-9);
    return (2 * R) * px < Math.min(box.w, box.h) * 1.35;
  }

  /* How many ticks, either side of the pointer, leave the short rest.
     Zoomed in, only the tick under the pointer. Zoomed out to the globe,
     the whole strip. Halfway along the log zoom, about half the ticks.
     Once the globe is in view the half stays wide enough that every tick
     is raised, even when the active tick sits at one end of the strip. */
  function liftHalf(worldW, n) {
    var aspect = sheetBox().w / Math.max(1, sheetBox().h);
    var log0 = Math.log(closeWidth());
    var log1 = Math.log(farWidth(aspect));
    var t = clamp((Math.log(Math.max(worldW, closeWidth())) - log0) / Math.max(1e-6, log1 - log0), 0, 1);
    var curved = 0.72 + (n * 0.95 - 0.72) * Math.pow(t, 1.6);
    if (globeInView(worldW)) return Math.max(curved, n * 1.35);
    return curved;
  }

  function dockWeight(dist, half) {
    var a = Math.abs(dist);
    if (a >= half) return 0;
    var u = 1 - a / half;
    return Math.pow(u, 0.55);
  }

  function drawTickDepth(g, worldW) {
    if (stripHot < 0) return;
    var t = clamp(stripHot / Math.max(1, g.n - 1), 0, 1);
    var text = formatTickDepth(stripDepth(t));
    var y = g.y0 + (g.y1 - g.y0) * t;
    setFont(13);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    var tw = ctx.measureText(text).width;
    var tx = g.right - 38;
    ctx.fillStyle = PAPER;
    ctx.fillRect(tx - tw - 5, y - 9, tw + 8, 18);
    ctx.fillStyle = INK;
    ctx.fillText(text, tx, y);
  }

  function drawScrollStrip(worldW) {
    var g = scrollStripGeom();
    stripGeom = g;
    var active = Math.max(0, Math.min(g.n - 1, scrollT * (g.n - 1)));
    var center = (wheelLift || stripHot < 0) ? Math.round(active) : Math.round(stripHot);
    wheelLift = false;
    var half = liftHalf(worldW, g.n);
    var rest = 15;
    var grow = 15;
    var i;
    var marks = [];
    for (i = 0; i < g.n; i++) {
      var w = dockWeight(i - center, half);
      marks.push({
        y: g.y0 + (g.y1 - g.y0) * (i / (g.n - 1)),
        w: w,
        len: rest + w * grow
      });
    }
    marks.sort(function (a, b) { return a.w - b.w; });
    for (i = 0; i < marks.length; i++) {
      var mark = marks[i];
      var w = mark.w;
      ctx.strokeStyle = w > 0.8 ? INK : w > 0.45 ? MID : w > 0.05 ? FAINT : "#b7c0c8";
      ctx.lineWidth = w > 0.8 ? 1.45 : w > 0.45 ? 1.2 : 1;
      ctx.lineCap = "butt";
      ctx.setLineDash([]);
      strokeLine(g.right - mark.len, mark.y, g.right, mark.y);
    }
    drawTickDepth(g, worldW);
  }

  function pointerOnStrip(x, y) {
    var g = stripGeom;
    if (!g) return false;
    return x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h;
  }

  function scrollFromPointer(y) {
    var g = stripGeom;
    if (!g) return;
    scrollT = clamp((y - g.y0) / Math.max(1, g.y1 - g.y0), 0, 1);
  }

  /* Alt-wheel scrolls by a fifth of the depth in the window. One notch
     (deltaY 100) is that far up or down. The 3 m frame and the centre stay
     the stops. Strip drag is still linear in depth. */
  function scrollByWheel(dy) {
    var v = viewOf(currentWorldW());
    var bottom = Math.min(R, v.top + v.worldH);
    var origin = Math.max(0, v.top);
    var height = bottom - origin;
    if (!(height > 1e-6)) height = v.worldH;
    var metres = (dy / 100) * (height / 5);
    var next = clamp(bottom + metres, OPEN_DEPTH, R);
    scrollT = (next - OPEN_DEPTH) / (R - OPEN_DEPTH);
    wheelLift = true;
  }

  function drawFps() {
    setFont(14, 500);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    var tw = ctx.measureText(fpsLabel).width;
    ctx.fillStyle = PAPER;
    ctx.fillRect(10, 10, tw + 16, 24);
    ctx.strokeStyle = MID;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([]);
    ctx.strokeRect(10.5, 10.5, tw + 15, 23);
    ctx.fillStyle = INK;
    ctx.fillText(fpsLabel, 18, 14);
  }

  function draw() {
    resize();
    var aspect = sheetBox().w / Math.max(1, sheetBox().h);
    var forced = widthForLock(aspect);
    var worldW = forced === null
      ? clamp(Math.pow(10, logW), closeWidth(), farWidth(aspect))
      : forced;
    logW = Math.log10(worldW);
    var v = viewOf(worldW);
    var tb = titleBlock(v.box);

    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, cssW, cssH);

    ctx.save();
    clipSheet(v.box);
    drawMaterials(v, tb);
    drawHatch(v);
    drawLayers(v);
    drawPitAndSurfaceCut(v);
    drawCenterlines(v);
    drawPatchDims(v, tb);
    drawDepthScale(v, tb);
    drawRadiusDim(v, tb);
    drawLocator(v, tb);
    ctx.restore();

    drawFrame(v, tb);
    drawScrollStrip(worldW);
    drawFps();
    drawDebug(v);
  }

  function zoomBy(dy) {
    var y = pointerY == null ? cssH / 3 : pointerY;
    zoomAt(dy, y);
  }

  function currentWorldW() {
    var aspect = sheetBox().w / Math.max(1, sheetBox().h);
    var forced = widthForLock(aspect);
    if (forced !== null) return forced;
    return clamp(Math.pow(10, logW), closeWidth(), farWidth(aspect));
  }

  /* Wheel zoom is vertical only, about the depth under the pointer.
     The shallow stop is the opening frame (horizon at one third).
     The deep stop is the centre of the Earth. */
  function zoomAt(dy, screenY) {
    var before = viewOf(currentWorldW());
    var depth = before.top + (screenY - before.box.y) / before.px;
    lock = null;
    logW += dy * 0.00115;
    var aspect = before.box.w / Math.max(1, before.box.h);
    var worldW = clamp(Math.pow(10, logW), closeWidth(), farWidth(aspect));
    logW = Math.log10(worldW);
    var worldH = worldW / aspect;
    var top0 = shallowTop(worldH, before.box);
    var top1 = R - worldH;
    var top = top0;
    if (depth > 0) {
      top = depth - (screenY - before.box.y) * worldH / before.box.h;
      if (top > top1) top = top1;
    }
    scrollT = scrollForTop(worldW, top);
  }

  function scrollForTop(worldW, top) {
    var box = sheetBox();
    var aspect = box.w / Math.max(1, box.h);
    var worldH = worldW / aspect;
    var top0 = shallowTop(worldH, box);
    var top1 = R - worldH;
    if (!(top1 > top0)) return 0;
    var bot = Math.min(R, top + worldH);
    var t = (bot - OPEN_DEPTH) / (R - OPEN_DEPTH);
    if (!(top1 > top0) && t >= 0) return 0;
    if (t > 1) return 1;
    return t;
  }

  function applyPreset(name) {
    if (name === "near" || name === "1") lock = "near";
    else if (name === "middle" || name === "crust" || name === "2") lock = "middle";
    else if (name === "globe" || name === "3") lock = "globe";
    else return false;
    scrollT = 0;
    return true;
  }

  function readLocation() {
    var q = new URLSearchParams(location.search);
    var zoom = (q.get("zoom") || "").toLowerCase();
    var hash = (location.hash || "").replace("#", "").toLowerCase();
    var w = q.get("w");
    if (w && isFinite(Number(w)) && Number(w) > 0) {
      lock = null;
      logW = Math.log10(Number(w));
      return;
    }
    applyPreset(zoom || hash);
  }

  function onFrame(now) {
    if (fpsLast) {
      var dt = now - fpsLast;
      if (dt > 0 && dt < 250) {
        fpsElapsed += dt;
        fpsFrames += 1;
      } else {
        fpsElapsed = 0;
        fpsFrames = 0;
      }
      if (fpsElapsed >= 100 && fpsFrames > 0) {
        fpsValue = fpsFrames * 1000 / fpsElapsed;
        fpsLabel = Math.round(fpsValue) + " fps";
        fpsPubs += 1;
        fpsElapsed = 0;
        fpsFrames = 0;
      }
    }
    fpsLast = now;
    draw();
    requestAnimationFrame(onFrame);
  }

  window.addEventListener("resize", function () { resize(); });
  window.addEventListener("wheel", function (event) {
    event.preventDefault();
    var dy = event.deltaY;
    if (event.deltaMode === 1) dy *= 16;
    else if (event.deltaMode === 2) dy *= 400;
    pointerY = event.clientY;
    if (event.altKey) scrollByWheel(dy);
    else zoomBy(dy);
  }, { passive: false });

  function pointerXY(event) {
    return { x: event.clientX, y: event.clientY };
  }

  window.addEventListener("mousemove", function (event) {
    var p = pointerXY(event);
    pointerY = p.y;
    if (stripDrag) {
      scrollFromPointer(p.y);
      if (stripGeom) stripHot = stripIndexAt(stripGeom, p.y);
      return;
    }
    if (pointerOnDebug(p.x, p.y)) {
      canvas.style.cursor = "pointer";
      return;
    }
    if (pointerOnStrip(p.x, p.y)) {
      stripHot = stripIndexAt(stripGeom, p.y);
      canvas.style.cursor = "ns-resize";
    } else {
      stripHot = -1;
      canvas.style.cursor = "crosshair";
    }
  });

  window.addEventListener("mousedown", function (event) {
    if (event.button !== 0) return;
    var p = pointerXY(event);
    if (pointerOnDebug(p.x, p.y)) {
      debugOpen = !debugOpen;
      event.preventDefault();
      return;
    }
    if (!pointerOnStrip(p.x, p.y)) return;
    stripDrag = true;
    scrollFromPointer(p.y);
    stripHot = stripIndexAt(stripGeom, p.y);
    event.preventDefault();
  });

  window.addEventListener("mouseup", function () {
    stripDrag = false;
  });

  window.addEventListener("keydown", function (event) {
    var key = event.key;
    if (key === "1" || key === "2" || key === "3") {
      applyPreset(key);
      return;
    }
    if (key === "+" || key === "=" || key === "ArrowUp") zoomBy(-80);
    else if (key === "-" || key === "_" || key === "ArrowDown") zoomBy(80);
  });

  window.ZOOM = {
    setWorldWidth: function (meters) {
      lock = null;
      logW = Math.log10(meters);
    },
    preset: function (name) {
      applyPreset(name);
    },
    fps: function () {
      return fpsLabel;
    },
    frameStats: function () {
      return { label: fpsLabel, fps: fpsValue, frames: fpsFrames, ms: fpsElapsed, pubs: fpsPubs };
    },
    state: function () {
      var aspect = sheetBox().w / Math.max(1, sheetBox().h);
      var forced = widthForLock(aspect);
      var worldW = forced === null
        ? clamp(Math.pow(10, logW), closeWidth(), farWidth(aspect))
        : forced;
      var v = viewOf(worldW);
      return {
        worldW: v.worldW,
        worldH: v.worldH,
        depth: shownDepth(v).text,
        scale: scaleText(v.worldW, v.box.w),
        top: v.top,
        scroll: scrollT,
        strip: stripGeom
      };
    }
  };

  resize();
  readLocation();
  window.addEventListener("load", readLocation);
  requestAnimationFrame(onFrame);
})();
