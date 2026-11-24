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
  var HAIRLINE = "#b7c0c8";
  var HATCH = "#667688";
  var FRAME = "#c9c3b6";
  var THEME_KEY = "zoom-lines-theme";
  var dark = false;

  /* Same six inks, with the paper and the marks exchanged. */
  function invertHex(hex) {
    var v = (0xffffff ^ parseInt(hex.slice(1), 16)).toString(16);
    while (v.length < 6) v = "0" + v;
    return "#" + v;
  }

  function applyTheme(next) {
    dark = !!next;
    var paper = "#f3f0e8";
    var ink = "#3a4654";
    var mid = "#5c6c7c";
    var faint = "#8e9bab";
    var hairline = "#b7c0c8";
    var hatch = "#667688";
    var frame = "#c9c3b6";
    PAPER = dark ? invertHex(paper) : paper;
    INK = dark ? invertHex(ink) : ink;
    MID = dark ? invertHex(mid) : mid;
    FAINT = dark ? invertHex(faint) : faint;
    HAIRLINE = dark ? invertHex(hairline) : hairline;
    HATCH = dark ? invertHex(hatch) : hatch;
    FRAME = dark ? invertHex(frame) : frame;
    var ground = PAPER;
    document.documentElement.style.background = ground;
    if (document.body) document.body.style.background = ground;
    patternCache = {};
    patternCount = 0;
  }

  function readTheme() {
    try { return localStorage.getItem(THEME_KEY) === "dark"; }
    catch (e) { return false; }
  }

  function writeTheme() {
    try { localStorage.setItem(THEME_KEY, dark ? "dark" : "light"); }
    catch (e) {}
  }

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
  /* 0 is the shallow frame (the surface on screen). 1 is the centre. */
  var scrollT = 0;
  /* While a zoom is keeping the core in the middle, this is the view top.
     Scroll and a crust or soil slice clear it and follow scrollT. */
  var zoomTop = null;
  var coreHold = false;
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

  function pageMargin() {
    return cssW < 720 ? 14 : 22;
  }

  function sheetBox() {
    var m = pageMargin();
    var right = m + stripGutter();
    var w = cssW - m - right;
    if (w < 280) {
      right = Math.max(m, cssW - m - 280);
      w = cssW - m - right;
    }
    return { x: m, y: m, w: Math.max(80, w), h: cssH - m * 2 };
  }

  /* The margin past the ticks matches the left margin. Between the drawing
     and the ticks is the same gap again, so the strip does not cover the
     sheet. 30 px is the fully raised tick. 6 px is the frame outside the box. */
  function stripGutter() {
    return 30 + pageMargin() + 6;
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

  /* View bottom when the surface sits one third down. At the opening zoom
     this is 3 m. Zoomed in closer it is shallower, so the surface can
     still be brought on screen. */
  function shallowBottom(worldH, box) {
    var bot = shallowTop(worldH, box) + worldH;
    if (bot < 0) bot = 0;
    if (bot > R) bot = R;
    return bot;
  }

  function placedView(worldW, t) {
    var box = sheetBox();
    var aspect = box.w / Math.max(1, box.h);
    var worldH = worldW / aspect;
    var top0 = shallowTop(worldH, box);
    var top1 = R - worldH;
    var useT = t;
    if (!(top1 > top0) && useT >= 0) useT = 0;
    var bot0 = shallowBottom(worldH, box);
    var bot = bot0 + useT * (R - bot0);
    var top = bot - worldH;
    if (!(top1 > top0) && useT >= 0) top = top0;
    else if (top > top1) top = top1;
    else if (useT >= 0 && top < top0) top = top0;
    if (coreHold && zoomTop != null) {
      top = zoomTop;
    } else {
      /* Zooming out eases the horizon pin toward a centred globe.
         Fully zoomed out, the core sits on the middle of the screen. */
      var farH = farWidth(aspect) / aspect;
      if (worldH >= 2 * R && farH > 2 * R) {
        var u = clamp((worldH - 2 * R) / (farH - 2 * R), 0, 1);
        u = u * u * (3 - 2 * u);
        top = lerp(top, R - worldH / 2, u);
      }
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

  /* Strip position, linear in metres from the shallow frame to the centre. */
  function stripDepth(t) {
    var box = sheetBox();
    var aspect = box.w / Math.max(1, box.h);
    var bot0 = shallowBottom(currentWorldW() / aspect, box);
    var tt = clamp(t, 0, 1);
    return bot0 + tt * (R - bot0);
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

  /* Thickness of each rock unit. Outside the patch when the margin can
     hold it, otherwise inside that band at the side. Nothing on the globe,
     and nothing on a band too thin to read. */
  function drawLayerDims(v, tb) {
    if (globeInView(v.worldW)) return;
    var place = layerDimPlace(v);
    if (!place) return;
    var from = 0;
    var i;
    setFont(12);
    for (i = 0; i < COLUMN.length; i++) {
      var unit = COLUMN[i];
      var y0 = worldToScreen(v, 0, from).y;
      var y1 = worldToScreen(v, 0, unit.to).y;
      var label = formatLength(unit.to - from);
      var need = ctx.measureText(label).width + 8;
      if (y0 >= v.box.y - 1 && y1 <= v.box.y + v.box.h + 1 && y1 - y0 >= Math.max(34, need)) {
        dimVertical(v, place.x, from, unit.to, label, place.offset, tb);
      }
      from = unit.to;
    }
  }

  function layerDimPlace(v) {
    var edge = PATCH / 2;
    var leftPx = worldToScreen(v, -edge, 0).x;
    var rightPx = worldToScreen(v, edge, 0).x;
    var roomL = leftPx - v.box.x;
    var roomR = v.box.x + v.box.w - rightPx;
    if (roomL >= 56) return { x: -edge, offset: -30 };
    if (roomR >= 72) return { x: edge, offset: 30 };
    var sx = v.box.x + 44;
    var wx = v.left + (sx - v.box.x) / v.px;
    return { x: wx, offset: 16 };
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
  var machinesHit = null;

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
    var controlW = ctx.measureText("machines").width + ctx.measureText("open").width + 18;
    if (controlW > maxW) maxW = controlW;
    var pad = 8;
    var headH = 22;
    var rowH = 16;
    var controlH = 22;
    var w = Math.ceil(maxW + pad * 2);
    var h = debugOpen ? headH + 4 + rows.length * rowH + controlH : headH;
    var x = 10;
    var y = 42;
    debugHit = { x: x, y: y, w: w, h: headH };
    machinesHit = debugOpen ? { x: x, y: y + h - controlH, w: w, h: controlH } : null;

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
    ctx.strokeStyle = MID;
    ctx.beginPath();
    ctx.moveTo(x, machinesHit.y);
    ctx.lineTo(x + w, machinesHit.y);
    ctx.stroke();
    setFont(12, 500);
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("machines", x + pad, machinesHit.y + controlH / 2);
    ctx.textAlign = "right";
    ctx.fillText("open", x + w - pad, machinesHit.y + controlH / 2);
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
    ctx.strokeStyle = FRAME;
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
    drawThemeIcon(tb);
    ctx.restore();
  }

  var themeHit = null;

  /* Moon while the drawing is light, sun while it is dark. Same ink. */
  function drawThemeIcon(tb) {
    var s = 15;
    var x = tb.x + tb.w - 14 - s;
    var y = tb.y + (46 - s) / 2;
    themeHit = { x: x - 5, y: y - 5, w: s + 10, h: s + 10 };
    ctx.save();
    ctx.fillStyle = INK;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.15;
    ctx.lineCap = "round";
    ctx.setLineDash([]);
    if (dark) drawSun(x, y, s);
    else drawMoon(x, y, s);
    ctx.restore();
  }

  function drawMoon(x, y, s) {
    var cx = x + s / 2;
    var cy = y + s / 2;
    var r = s * 0.44;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0.65, Math.PI * 2 - 0.65, false);
    ctx.arc(cx + r * 0.62, cy, r * 0.78, Math.PI * 2 - 0.42, 0.42, true);
    ctx.closePath();
    ctx.fill();
  }

  function drawSun(x, y, s) {
    var cx = x + s / 2;
    var cy = y + s / 2;
    var r = s * 0.22;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    var n = 8;
    var i;
    for (i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r + 1.7), cy + Math.sin(a) * (r + 1.7));
      ctx.lineTo(cx + Math.cos(a) * (r + 3.5), cy + Math.sin(a) * (r + 3.5));
      ctx.stroke();
    }
  }

  function pointerOnTheme(x, y) {
    var g = themeHit;
    if (!g) return false;
    return x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h;
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
    var right = cssW - pageMargin();
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
      ctx.strokeStyle = w > 0.8 ? INK : w > 0.45 ? MID : w > 0.05 ? FAINT : HAIRLINE;
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
    zoomTop = null;
    coreHold = false;
    scrollT = clamp((y - g.y0) / Math.max(1, g.y1 - g.y0), 0, 1);
  }

  /* Alt-wheel scrolls by a fifth of the depth in the window. One notch
     (deltaY 100) is that far up or down. The shallow stop is the surface
     on screen. The deep stop is the centre. Strip drag stays linear. */
  function scrollByWheel(dy) {
    var v = viewOf(currentWorldW());
    var bottom = v.top + v.worldH;
    var origin = Math.max(0, v.top);
    var limit = Math.min(R, bottom);
    var height = limit - origin;
    if (!(height > 1e-6)) height = v.worldH;
    var metres = (dy / 100) * (height / 5);
    var minBot = shallowBottom(v.worldH, v.box);
    var next = clamp(bottom + metres, minBot, R);
    var span = R - minBot;
    zoomTop = null;
    coreHold = false;
    scrollT = span > 1 ? (next - minBot) / span : 0;
    wheelLift = true;
  }

  /* A timbered shaft in the patch, from the surface into the gravel.
     Dropped once it would be a speck, same idea as the layer dimensions. */
  var SHAFT = { x0: 0.66, x1: 1.36, y0: 0, y1: 6.2 };
  var CHAMBER = { x0: 1.36, x1: 1.74, y0: 1.76, y1: 2.42 };

  function shaftReadable(v) {
    if (globeInView(v.worldW)) return false;
    return (SHAFT.x1 - SHAFT.x0) * v.px >= 16;
  }

  function wline(v, x0, y0, x1, y1) {
    var a = worldToScreen(v, x0, y0);
    var b = worldToScreen(v, x1, y1);
    strokeLine(a.x, a.y, b.x, b.y);
  }

  function drawWorks(v) {
    if (!shaftReadable(v)) return;
    ctx.save();
    ctx.fillStyle = PAPER;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.15;
    ctx.lineJoin = "miter";
    ctx.lineCap = "butt";
    ctx.setLineDash([]);

    var s0 = worldToScreen(v, SHAFT.x0, SHAFT.y0);
    var s1 = worldToScreen(v, SHAFT.x1, SHAFT.y1);
    var c0 = worldToScreen(v, CHAMBER.x0, CHAMBER.y0);
    var c1 = worldToScreen(v, CHAMBER.x1, CHAMBER.y1);
    ctx.beginPath();
    ctx.moveTo(s0.x, s0.y);
    ctx.lineTo(s0.x, s1.y);
    ctx.lineTo(s1.x, s1.y);
    ctx.lineTo(s1.x, c1.y);
    ctx.lineTo(c1.x, c1.y);
    ctx.lineTo(c1.x, c0.y);
    ctx.lineTo(s1.x, c0.y);
    ctx.lineTo(s1.x, s0.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    var inset = 0.06;
    ctx.lineWidth = 0.9;
    wline(v, SHAFT.x0 + inset, 0.12, SHAFT.x0 + inset, SHAFT.y1 - 0.1);
    wline(v, SHAFT.x1 - inset, 0.12, SHAFT.x1 - inset, SHAFT.y1 - 0.1);
    var y;
    for (y = 0.45; y < SHAFT.y1 - 0.25; y += 0.55) {
      var xR = (y > CHAMBER.y0 && y < CHAMBER.y1) ? SHAFT.x1 - inset : SHAFT.x1;
      wline(v, SHAFT.x0, y, xR, y);
    }
    wline(v, CHAMBER.x0, CHAMBER.y0 + 0.1, CHAMBER.x1 - 0.06, CHAMBER.y0 + 0.1);
    wline(v, CHAMBER.x0, CHAMBER.y1 - 0.08, CHAMBER.x1 - 0.06, CHAMBER.y1 - 0.08);

    ctx.strokeStyle = MID;
    ctx.lineWidth = 0.8;
    var wy = 2.02;
    var wx = SHAFT.x0 + 0.1;
    ctx.beginPath();
    var a = worldToScreen(v, wx, wy);
    ctx.moveTo(a.x, a.y);
    while (wx < CHAMBER.x1 - 0.08) {
      wx += 0.08;
      a = worldToScreen(v, wx, wy + ((Math.round(wx * 12) % 2) ? 0.035 : -0.035));
      ctx.lineTo(a.x, a.y);
    }
    ctx.stroke();

    drawCage(v);
    drawPump(v);
    drawHandTools(v);
    ctx.restore();
  }

  function drawCage(v) {
    var x0 = SHAFT.x0 + 0.1;
    var x1 = SHAFT.x1 - 0.1;
    var y0 = 0.48;
    var y1 = 1.22;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    wline(v, x0, y0, x1, y0);
    wline(v, x0, y1, x1, y1);
    wline(v, x0, y0, x0, y1);
    wline(v, x1, y0, x1, y1);
    var i;
    for (i = 1; i <= 3; i++) wline(v, x0 + (x1 - x0) * i / 4, y0, x0 + (x1 - x0) * i / 4, y1);
    var mid = (x0 + x1) / 2;
    wline(v, mid, 0.06, mid, y0);
  }

  function drawPump(v) {
    var x = CHAMBER.x0 + 0.06;
    var y = CHAMBER.y1 - 0.12;
    var w = 0.22;
    var h = 0.16;
    var a = worldToScreen(v, x, y - h);
    var b = worldToScreen(v, x + w, y);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    var c = worldToScreen(v, x + w * 0.72, y - h * 0.5);
    var r = Math.abs(b.x - a.x) * 0.22;
    ctx.beginPath();
    ctx.arc(c.x, c.y, Math.max(1.5, r), 0, Math.PI * 2);
    ctx.stroke();
    wline(v, x, y - h * 0.55, x - 0.1, y - h * 0.55);
  }

  function drawHandTools(v) {
    var shovel = worldToScreen(v, -2.62, 0);
    var pick = worldToScreen(v, -2.18, 0);
    var s = v.px;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    strokeLine(shovel.x, shovel.y - 0.78 * s, shovel.x, shovel.y - 0.22 * s);
    ctx.beginPath();
    ctx.moveTo(shovel.x - 0.11 * s, shovel.y - 0.22 * s);
    ctx.lineTo(shovel.x - 0.13 * s, shovel.y - 0.04 * s);
    ctx.lineTo(shovel.x + 0.13 * s, shovel.y - 0.04 * s);
    ctx.lineTo(shovel.x + 0.11 * s, shovel.y - 0.22 * s);
    ctx.stroke();
    strokeLine(shovel.x - 0.06 * s, shovel.y - 0.78 * s, shovel.x + 0.06 * s, shovel.y - 0.78 * s);
    strokeLine(pick.x - 0.22 * s, pick.y - 0.46 * s, pick.x, pick.y - 0.62 * s);
    strokeLine(pick.x, pick.y - 0.62 * s, pick.x + 0.24 * s, pick.y - 0.44 * s);
    strokeLine(pick.x, pick.y - 0.58 * s, pick.x, pick.y - 0.04 * s);
  }

  var modalOpen = false;
  var modalBox = null;
  var modalClose = null;

  function hitRect(r, x, y) {
    return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  function ink(w) {
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = w || 1.15;
    ctx.lineJoin = "miter";
    ctx.lineCap = "butt";
    ctx.setLineDash([]);
  }

  function bolt(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  function gearAt(cx, cy, r, n) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    var i;
    for (i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      strokeLine(
        cx + Math.cos(a) * r,
        cy + Math.sin(a) * r,
        cx + Math.cos(a) * (r + Math.max(3, r * 0.18)),
        cy + Math.sin(a) * (r + Math.max(3, r * 0.18))
      );
    }
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(2, r * 0.28), 0, Math.PI * 2);
    ctx.stroke();
  }

  function leader(x0, y0, x1, y1) {
    ctx.save();
    ctx.strokeStyle = MID;
    ctx.lineWidth = 0.75;
    ctx.setLineDash([3, 2.5]);
    var bend = y0 + (y1 - y0) * 0.72;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0, bend);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.restore();
  }

  function callout(x, y, n, name) {
    ctx.save();
    ctx.setLineDash([]);
    ink(0.9);
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.stroke();
    setFont(10, 500);
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(n), x, y + 0.5);
    setFont(12);
    ctx.textAlign = "left";
    var tw = ctx.measureText(name).width;
    ctx.fillStyle = PAPER;
    ctx.fillRect(x + 10, y - 8, tw + 4, 16);
    ctx.fillStyle = INK;
    ctx.fillText(name, x + 12, y);
    ctx.restore();
  }

  function placed(a, dw, dh, gutterX, gutterY) {
    var aw = Math.max(20, a.w - (gutterX || 0));
    var ah = Math.max(20, a.h - (gutterY || 0));
    var s = Math.min(aw / dw, ah / dh);
    return {
      s: s,
      x: a.x + (aw - dw * s) / 2,
      y: a.y + (ah - dh * s) / 2
    };
  }

  function drawMachinesModal() {
    var box = { x: 0, y: 16, w: Math.max(280, cssW - 52), h: Math.max(220, cssH - 32) };
    var close = { x: box.x + box.w - 28, y: box.y + 8, w: 18, h: 18 };
    modalBox = box;
    modalClose = close;
    ctx.save();
    ctx.fillStyle = PAPER;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.1;
    ctx.setLineDash([]);
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
    setFont(16, 500);
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("machines", box.x + 16, box.y + 18);
    ink(1.15);
    strokeLine(close.x + 4, close.y + 4, close.x + close.w - 4, close.y + close.h - 4);
    strokeLine(close.x + close.w - 4, close.y + 4, close.x + 4, close.y + close.h - 4);
    ctx.strokeStyle = MID;
    ctx.lineWidth = 0.8;
    strokeLine(box.x, box.y + 36, box.x + box.w, box.y + 36);

    var inner = { x: box.x + 8, y: box.y + 44, w: box.w - 16, h: box.h - 56 };
    var expH = Math.round(inner.h * 0.48);
    var catH = inner.h - expH;
    var row1 = Math.round(catH * 0.48);
    var row2 = catH - row1;
    var topW = [0.15, 0.17, 0.34, 0.34];
    var botW = [0.24, 0.46, 0.30];
    var names = [
      ["hand shovel", "0.9 m", iconShovel],
      ["pickaxe", "0.7 m", iconPick],
      ["elevator cage", "4 m", iconCage],
      ["water pump", "0.8 m", iconPump],
      ["rotary drill", "8 m", iconDrill],
      ["bucket conveyor", "6 m", iconConveyor],
      ["boring head", "4 m", iconHead]
    ];
    var acc = 0;
    var i;
    for (i = 0; i < 4; i++) {
      var cw = inner.w * topW[i];
      drawMachineCell(
        { x: inner.x + acc, y: inner.y, w: cw, h: row1 },
        names[i][0], names[i][1], names[i][2]
      );
      acc += cw;
    }
    acc = 0;
    for (i = 0; i < 3; i++) {
      var cw2 = inner.w * botW[i];
      drawMachineCell(
        { x: inner.x + acc, y: inner.y + row1, w: cw2, h: row2 },
        names[i + 4][0], names[i + 4][1], names[i + 4][2]
      );
      acc += cw2;
    }
    ctx.strokeStyle = MID;
    ctx.lineWidth = 0.7;
    strokeLine(inner.x, inner.y + catH, inner.x + inner.w, inner.y + catH);
    drawExploded(inner.x, inner.y + catH + 6, inner.w, expH - 8);
    ctx.restore();
  }

  function drawMachineCell(cell, name, dim, drawIcon) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(cell.x, cell.y, cell.w, cell.h);
    ctx.clip();
    var area = {
      x: cell.x + 8,
      y: cell.y + 2,
      w: cell.w - 16,
      h: cell.h - 22
    };
    drawIcon(area, dim);
    setFont(12);
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(name, cell.x + cell.w / 2, cell.y + cell.h - 3);
    ctx.restore();
  }

  function dimTick(x0, y0, x1, y1, label, below) {
    ctx.save();
    ctx.strokeStyle = MID;
    ctx.fillStyle = INK;
    ctx.lineWidth = 0.7;
    ctx.setLineDash([]);
    setFont(10);
    var horiz = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
    var tw = ctx.measureText(label).width;
    if (horiz) {
      var y = y0;
      var mid = (x0 + x1) / 2;
      strokeLine(x0, y, x1, y);
      strokeLine(x0, y - 3, x0, y + 3);
      strokeLine(x1, y - 3, x1, y + 3);
      ctx.fillStyle = PAPER;
      if (below) ctx.fillRect(mid - tw / 2 - 2, y + 2, tw + 4, 12);
      else ctx.fillRect(mid - tw / 2 - 2, y - 13, tw + 4, 12);
      ctx.fillStyle = INK;
      ctx.textAlign = "center";
      ctx.textBaseline = below ? "top" : "bottom";
      ctx.fillText(label, mid, below ? y + 3 : y - 2);
    } else {
      var x = x0;
      var my = (y0 + y1) / 2;
      strokeLine(x, y0, x, y1);
      strokeLine(x - 3, y0, x + 3, y0);
      strokeLine(x - 3, y1, x + 3, y1);
      ctx.translate(x, my);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = PAPER;
      ctx.fillRect(-tw / 2 - 2, -6, tw + 4, 12);
      ctx.fillStyle = INK;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, 0, 0);
    }
    ctx.restore();
  }

  function iconShovel(a, dim) {
    var g = placed(a, 48, 140, 22, 0);
    var s = g.s;
    var ox = g.x;
    var oy = g.y;
    function X(v) { return ox + v * s; }
    function Y(v) { return oy + v * s; }
    ink(1.2);
    ctx.beginPath();
    ctx.moveTo(X(17), Y(18));
    ctx.lineTo(X(17), Y(12));
    ctx.quadraticCurveTo(X(6), Y(13), X(6), Y(6));
    ctx.quadraticCurveTo(X(6), Y(0), X(20), Y(0));
    ctx.quadraticCurveTo(X(34), Y(0), X(34), Y(6));
    ctx.quadraticCurveTo(X(34), Y(13), X(23), Y(12));
    ctx.lineTo(X(23), Y(18));
    ctx.stroke();
    strokeLine(X(10), Y(7), X(30), Y(7));
    strokeLine(X(18), Y(16), X(18), Y(86));
    strokeLine(X(22), Y(16), X(22), Y(86));
    ctx.strokeRect(X(15), Y(82), X(25) - X(15), Y(92) - Y(82));
    ctx.beginPath();
    ctx.moveTo(X(16), Y(90));
    ctx.lineTo(X(5), Y(100));
    ctx.quadraticCurveTo(X(2), Y(122), X(20), Y(136));
    ctx.quadraticCurveTo(X(38), Y(122), X(35), Y(100));
    ctx.lineTo(X(24), Y(90));
    ctx.stroke();
    strokeLine(X(20), Y(96), X(20), Y(132));
    strokeLine(X(8), Y(104), X(32), Y(104));
    dimTick(X(44), Y(0), X(44), Y(136), dim);
  }

  function iconPick(a, dim) {
    var g = placed(a, 128, 132, 8, 0);
    var s = g.s;
    var ox = g.x;
    var oy = g.y;
    function X(v) { return ox + v * s; }
    function Y(v) { return oy + v * s; }
    ink(1.2);
    ctx.beginPath();
    ctx.moveTo(X(2), Y(28));
    ctx.quadraticCurveTo(X(22), Y(16), X(44), Y(18));
    ctx.lineTo(X(44), Y(36));
    ctx.quadraticCurveTo(X(22), Y(34), X(2), Y(28));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(X(108), Y(34));
    ctx.quadraticCurveTo(X(88), Y(14), X(62), Y(18));
    ctx.lineTo(X(62), Y(36));
    ctx.quadraticCurveTo(X(88), Y(36), X(108), Y(34));
    ctx.stroke();
    ctx.strokeRect(X(44), Y(14), X(62) - X(44), Y(40) - Y(14));
    strokeLine(X(49), Y(40), X(49), Y(122));
    strokeLine(X(57), Y(40), X(57), Y(122));
    strokeLine(X(46), Y(118), X(60), Y(118));
    strokeLine(X(47), Y(122), X(59), Y(122));
    dimTick(X(118), Y(4), X(118), Y(122), dim);
  }

  function iconCage(a, dim) {
    var g = placed(a, 200, 128, 28, 0);
    var s = g.s;
    var ox = g.x;
    var oy = g.y;
    function X(v) { return ox + v * s; }
    function Y(v) { return oy + v * s; }
    ink(1.15);
    ctx.strokeRect(X(28), Y(112), X(172) - X(28), Y(124) - Y(112));
    bolt(X(40), Y(118), 1.6 * s);
    bolt(X(160), Y(118), 1.6 * s);
    strokeLine(X(46), Y(16), X(46), Y(112));
    strokeLine(X(54), Y(16), X(54), Y(112));
    strokeLine(X(146), Y(16), X(146), Y(112));
    strokeLine(X(154), Y(16), X(154), Y(112));
    ctx.strokeRect(X(36), Y(4), X(164) - X(36), Y(16) - Y(4));
    ctx.beginPath();
    ctx.arc(X(100), Y(10), 5 * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(X(100), Y(10), 2 * s, 0, Math.PI * 2);
    ctx.stroke();
    strokeLine(X(54), Y(16), X(100), Y(52));
    strokeLine(X(146), Y(16), X(100), Y(52));
    strokeLine(X(54), Y(78), X(146), Y(28));
    ink(0.9);
    strokeLine(X(100), Y(15), X(100), Y(58));
    ink(1.15);
    ctx.strokeRect(X(72), Y(58), X(128) - X(72), Y(100) - Y(58));
    strokeLine(X(68), Y(100), X(132), Y(100));
    strokeLine(X(68), Y(104), X(132), Y(104));
    var i;
    for (i = 1; i <= 4; i++) {
      var bx = 72 + (56 * i) / 5;
      strokeLine(X(bx), Y(58), X(bx), Y(100));
    }
    strokeLine(X(72), Y(74), X(128), Y(74));
    dimTick(X(184), Y(4), X(184), Y(124), dim);
  }

  function iconPump(a, dim) {
    var g = placed(a, 250, 108, 0, 0);
    var s = g.s;
    var ox = g.x;
    var oy = g.y;
    function X(v) { return ox + v * s; }
    function Y(v) { return oy + v * s; }
    ink(1.15);
    ctx.strokeRect(X(8), Y(78), X(236) - X(8), Y(88) - Y(78));
    bolt(X(18), Y(83), 1.7 * s);
    bolt(X(226), Y(83), 1.7 * s);
    strokeLine(X(22), Y(88), X(22), Y(94));
    strokeLine(X(222), Y(88), X(222), Y(94));
    ctx.beginPath();
    ctx.arc(X(68), Y(56), 24 * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(X(70), Y(54), 26 * s, -0.2, Math.PI * 1.25);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(X(68), Y(56), 9 * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect(X(6), Y(48), X(44) - X(6), Y(64) - Y(48));
    strokeLine(X(6), Y(44), X(6), Y(68));
    bolt(X(6), Y(48), 1.5 * s);
    bolt(X(6), Y(64), 1.5 * s);
    ctx.strokeRect(X(58), Y(10), X(80) - X(58), Y(34) - Y(10));
    strokeLine(X(54), Y(10), X(84), Y(10));
    bolt(X(58), Y(10), 1.4 * s);
    bolt(X(80), Y(10), 1.4 * s);
    strokeLine(X(92), Y(52), X(112), Y(52));
    strokeLine(X(92), Y(60), X(112), Y(60));
    ctx.strokeRect(X(100), Y(50), X(106) - X(100), Y(62) - Y(50));
    ctx.strokeRect(X(114), Y(36), X(214) - X(114), Y(74) - Y(36));
    var i;
    for (i = 0; i < 9; i++) strokeLine(X(122 + i * 8), Y(36), X(122 + i * 8), Y(74));
    ctx.beginPath();
    ctx.arc(X(214), Y(55), 19 * s, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.strokeRect(X(142), Y(22), X(170) - X(142), Y(36) - Y(22));
    ctx.save();
    ctx.strokeStyle = MID;
    ctx.lineWidth = 0.6;
    ctx.setLineDash([2, 2]);
    strokeLine(X(44), Y(56), X(214), Y(56));
    ctx.restore();
    dimTick(X(8), Y(102), X(236), Y(102), dim);
  }

  function iconDrill(a, dim) {
    var g = placed(a, 124, 170, 8, 0);
    var s = g.s;
    var ox = g.x;
    var oy = g.y;
    function X(v) { return ox + v * s; }
    function Y(v) { return oy + v * s; }
    ink(1.15);
    ctx.strokeRect(X(22), Y(140), X(96) - X(22), Y(150) - Y(140));
    strokeLine(X(22), Y(150), X(10), Y(162));
    strokeLine(X(96), Y(150), X(108), Y(162));
    strokeLine(X(10), Y(162), X(10), Y(168));
    strokeLine(X(108), Y(162), X(108), Y(168));
    strokeLine(X(40), Y(12), X(40), Y(140));
    strokeLine(X(47), Y(12), X(47), Y(140));
    strokeLine(X(67), Y(12), X(67), Y(140));
    strokeLine(X(74), Y(12), X(74), Y(140));
    var i;
    for (i = 0; i < 6; i++) strokeLine(X(47), Y(30 + i * 16), X(67), Y(30 + i * 16));
    ctx.strokeRect(X(34), Y(2), X(80) - X(34), Y(14) - Y(2));
    ctx.beginPath();
    ctx.arc(X(57), Y(8), 4 * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect(X(28), Y(36), X(86) - X(28), Y(60) - Y(36));
    ctx.beginPath();
    ctx.arc(X(57), Y(48), 7 * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(X(57), Y(48), 2.5 * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect(X(4), Y(38), X(28) - X(4), Y(58) - Y(38));
    for (i = 0; i < 4; i++) strokeLine(X(8 + i * 4.5), Y(38), X(8 + i * 4.5), Y(58));
    strokeLine(X(52), Y(60), X(52), Y(112));
    strokeLine(X(62), Y(60), X(62), Y(112));
    for (i = 0; i < 6; i++) {
      var yy = 112 + i * 6;
      ctx.beginPath();
      ctx.moveTo(X(44), Y(yy));
      ctx.quadraticCurveTo(X(57), Y(yy - 5), X(70), Y(yy));
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(X(48), Y(146));
    ctx.lineTo(X(57), Y(160));
    ctx.lineTo(X(66), Y(146));
    ctx.stroke();
    ink(0.9);
    ctx.beginPath();
    ctx.moveTo(X(28), Y(56));
    ctx.quadraticCurveTo(X(14), Y(96), X(30), Y(138));
    ctx.stroke();
    dimTick(X(116), Y(2), X(116), Y(166), dim);
  }

  function iconConveyor(a, dim) {
    var g = placed(a, 360, 128, 0, 0);
    var s = g.s;
    var ox = g.x;
    var oy = g.y;
    function X(v) { return ox + v * s; }
    function Y(v) { return oy + v * s; }
    ink(1.15);
    var x0 = 48;
    var y0 = 86;
    var x1 = 300;
    var y1 = 26;
    var dx = x1 - x0;
    var dy = y1 - y0;
    var len = Math.sqrt(dx * dx + dy * dy);
    var nx = dy / len;
    var ny = -dx / len;
    if (ny < 0) { nx = -nx; ny = -ny; }
    strokeLine(X(x0), Y(y0), X(x1), Y(y1));
    strokeLine(X(x0 + nx * 5), Y(y0 + ny * 5), X(x1 + nx * 5), Y(y1 + ny * 5));
    strokeLine(X(x0 + nx * 16), Y(y0 + ny * 16), X(x1 + nx * 16), Y(y1 + ny * 16));
    function pulley(px, py, r) {
      ctx.beginPath();
      ctx.arc(X(px), Y(py), r * s, 0, Math.PI * 2);
      ctx.stroke();
      strokeLine(X(px - r), Y(py), X(px + r), Y(py));
      strokeLine(X(px), Y(py - r), X(px), Y(py + r));
    }
    pulley(x1, y1, 12);
    pulley(x0, y0, 9);
    var i;
    for (i = 1; i <= 3; i++) {
      var t = i / 4;
      var ix = x0 + dx * t + nx * 16;
      var iy = y0 + dy * t + ny * 16;
      ctx.beginPath();
      ctx.arc(X(ix), Y(iy), 3 * s, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (i = 0; i < 4; i++) {
      var u = 0.18 + i * 0.18;
      var bx = x0 + dx * u;
      var by = y0 + dy * u;
      strokeLine(X(bx), Y(by), X(bx + nx * 8), Y(by + ny * 8));
      var lip = 7;
      var deep = 16;
      ctx.beginPath();
      ctx.moveTo(X(bx + nx * 8 - lip), Y(by + ny * 8));
      ctx.lineTo(X(bx + nx * deep - lip - 2), Y(by + ny * deep));
      ctx.lineTo(X(bx + nx * deep + lip + 2), Y(by + ny * deep));
      ctx.lineTo(X(bx + nx * 8 + lip), Y(by + ny * 8));
      ctx.closePath();
      ctx.stroke();
    }
    var postT = 0.42;
    var postX = x0 + dx * postT;
    strokeLine(X(postX), Y(y0 + dy * postT + ny * 16), X(postX), Y(112));
    strokeLine(X(postX - 10), Y(112), X(postX + 10), Y(112));
    ctx.strokeRect(X(8), Y(78), X(40) - X(8), Y(104) - Y(78));
    var fin;
    for (fin = 0; fin < 3; fin++) strokeLine(X(12 + fin * 5), Y(78), X(12 + fin * 5), Y(104));
    ctx.beginPath();
    ctx.arc(X(30), Y(91), 6 * s, 0, Math.PI * 2);
    ctx.stroke();
    strokeLine(X(40), Y(86), X(48), Y(82));
    strokeLine(X(40), Y(96), X(48), Y(92));
    strokeLine(X(16), Y(116), X(332), Y(116));
    dimTick(X(20), Y(116), X(324), Y(116), dim);
  }

  function iconHead(a, dim) {
    var g = placed(a, 150, 150, 0, 18);
    var s = g.s;
    var cx = g.x + 75 * s;
    var cy = g.y + 75 * s;
    var r = 68 * s;
    ink(1.2);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
    ctx.stroke();
    var i;
    var k;
    for (i = 0; i < 6; i++) {
      var ang = -Math.PI / 2 + i * Math.PI / 3;
      var c = Math.cos(ang);
      var sn = Math.sin(ang);
      var px = -sn;
      var py = c;
      var inner = r * 0.24;
      var outer = r * 0.88;
      var slot = Math.max(3.5, r * 0.055);
      strokeLine(cx + c * inner + px * slot, cy + sn * inner + py * slot, cx + c * outer + px * slot, cy + sn * outer + py * slot);
      strokeLine(cx + c * inner - px * slot, cy + sn * inner - py * slot, cx + c * outer - px * slot, cy + sn * outer - py * slot);
      for (k = 0; k < 3; k++) {
        var t = 0.35 + k * 0.22;
        var mx = cx + c * (inner + (outer - inner) * t);
        var my = cy + sn * (inner + (outer - inner) * t);
        ctx.beginPath();
        ctx.arc(mx, my, slot * 0.85, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect(cx - r * 0.06, cy - r * 0.06, r * 0.12, r * 0.12);
    for (i = 0; i < 12; i++) {
      var ba = (i / 12) * Math.PI * 2;
      bolt(cx + Math.cos(ba) * r * 0.78, cy + Math.sin(ba) * r * 0.78, Math.max(1.3, r * 0.018));
    }
    dimTick(cx - r, cy + r + 12, cx + r, cy + r + 12, dim);
  }

  function drawExploded(x, y, w, h) {
    ink(1.05);
    setFont(13, 500);
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("drill, exploded", x + 4, y);

    var top = y + 26;
    var H = Math.max(100, h - 32);
    var motorW = Math.max(120, Math.min(210, w * 0.16));
    var motorH = Math.max(100, Math.min(H * 0.58, 200));
    var motorX = x + 42;
    var motorY = top + 2;
    var reelW = Math.max(96, Math.min(160, w * 0.12));
    var reelH = Math.max(52, Math.min(motorH * 0.5, 100));
    var gearR = Math.max(15, Math.min(28, reelH * 0.32));
    var caseW = Math.max(84, Math.min(130, w * 0.1));
    var caseH = Math.max(54, gearR * 2.5);
    var reelX = x + w - 16 - reelW;
    var looseX = reelX - 40 - gearR;
    var caseX = looseX - gearR - 44 - caseW;
    var axis = motorY + motorH * 0.38;
    var midL = motorX + motorW + 36;
    var midR = caseX - 48;
    var mid = Math.max(120, midR - midL);
    var headLen = Math.max(78, Math.min(128, mid * 0.2));
    var gap = Math.max(36, Math.min(52, mid * 0.08));
    var rodW = mid - headLen - gap;
    var rodX = midL;
    var headTip = rodX + rodW + gap;

    drawMotorHousing(motorX, motorY, motorW, motorH);
    dimTick(motorX - 16, motorY + 4, motorX - 16, motorY + motorH - 4, "1.4 m");
    var motorLabelY = Math.min(motorY + motorH + 20, top + H - 12);
    leader(motorX + motorW * 0.3, motorY + motorH - 6, motorX + 18, motorLabelY);
    callout(motorX + 18, motorLabelY, 1, "motor");

    drawDrillRod(rodX, axis, rodW);
    dimTick(rodX + 8, axis + 16, rodX + rodW - 8, axis + 16, "3 m", true);
    var rodLabelY = axis - 24;
    leader(rodX + rodW * 0.28, axis - 5, rodX + 14, rodLabelY);
    callout(rodX + 14, rodLabelY, 3, "drill rod");

    drawCuttingHead(headTip, axis, headLen);
    ctx.save();
    ctx.strokeStyle = MID;
    ctx.lineWidth = 0.65;
    ctx.setLineDash([2, 3]);
    strokeLine(rodX + rodW + 4, axis, headTip - 4, axis);
    ctx.restore();
    var headLabelY = axis + headLen * 0.62 + 18;
    leader(headTip + headLen * 0.7, axis + headLen * 0.2, headTip + 8, headLabelY);
    callout(headTip + 10, headLabelY, 4, "cutting head");

    var frameX = rodX;
    var frameY = axis + 40;
    var frameW = Math.max(80, rodW * 0.92);
    var frameH = Math.max(56, top + H - frameY - 30);
    drawRigFrame(frameX, frameY, frameW, frameH);
    var frameLabelY = Math.min(frameY + frameH + 14, top + H - 10);
    leader(frameX + frameW * 0.45, frameY + frameH, frameX + 12, frameLabelY);
    callout(frameX + 12, frameLabelY, 5, "frame");

    drawGearCase(caseX, axis - caseH / 2, caseW, caseH);
    ink(1.15);
    gearAt(looseX, axis, gearR, 16);
    drawCableReel(reelX, axis, reelW, reelH);
    ctx.save();
    ctx.strokeStyle = MID;
    ctx.lineWidth = 0.65;
    ctx.setLineDash([2, 3]);
    strokeLine(caseX + caseW + 10, axis, looseX - gearR - 4, axis);
    strokeLine(looseX + gearR + 4, axis, reelX - 4, axis);
    ctx.restore();
    var gearLabelY = axis - caseH / 2 - 18;
    if (gearLabelY < top + 8) gearLabelY = top + 8;
    leader(caseX + caseW * 0.45, axis - caseH / 2, caseX + 8, gearLabelY);
    callout(caseX + 8, gearLabelY, 2, "gearbox");
    var reelLabelY = axis - reelH / 2 - 18;
    if (reelLabelY < top + 8) reelLabelY = top + 8;
    leader(reelX + reelW * 0.55, axis - reelH / 2, reelX + 6, reelLabelY);
    callout(reelX + 6, reelLabelY, 6, "cable reel");
  }

  function drawMotorHousing(x, y, w, h) {
    ink(1.15);
    var baseY = y + h * 0.86;
    ctx.strokeRect(x, baseY, w, h - (baseY - y));
    bolt(x + 8, baseY + (y + h - baseY) / 2, 2);
    bolt(x + w - 8, baseY + (y + h - baseY) / 2, 2);
    var caseY = y + h * 0.3;
    var caseH = baseY - caseY;
    ctx.strokeRect(x + w * 0.05, caseY, w * 0.9, caseH);
    var rcx = x + w * 0.36;
    var rcy = caseY + caseH * 0.58;
    var rr = Math.min(w * 0.16, caseH * 0.32);
    ctx.beginPath();
    ctx.arc(rcx, rcy, rr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(rcx, rcy, rr * 0.3, 0, Math.PI * 2);
    ctx.stroke();
    strokeLine(rcx - rr, rcy, rcx + rr, rcy);
    strokeLine(rcx, rcy - rr, rcx, rcy + rr);
    strokeLine(x + w * 0.58, caseY, x + w * 0.58, caseY + caseH);
    gearAt(x + w * 0.75, caseY + caseH * 0.42, Math.min(w * 0.09, caseH * 0.22), 10);
    var sx = x + w * 0.4;
    strokeLine(sx - 5, y + h * 0.05, sx - 5, caseY);
    strokeLine(sx + 5, y + h * 0.05, sx + 5, caseY);
    var i;
    var span = caseY - (y + h * 0.1);
    for (i = 0; i < 6; i++) {
      var ty = y + h * 0.08 + (span * i) / 5;
      strokeLine(sx - 5, ty, sx + 5, ty + 3);
    }
    ctx.beginPath();
    ctx.moveTo(sx - 8, y + h * 0.05);
    ctx.lineTo(sx - 8, y);
    ctx.lineTo(sx + 8, y);
    ctx.lineTo(sx + 8, y + h * 0.05);
    ctx.stroke();
    ctx.strokeRect(x + w * 0.66, y + h * 0.06, w * 0.14, h * 0.2);
    strokeLine(x + w * 0.73, y + h * 0.06, x + w * 0.73, caseY);
    strokeLine(x + w * 0.95, caseY + caseH * 0.3, x + w + 12, caseY + caseH * 0.15);
    ctx.strokeRect(x + w * 0.62, caseY + 4, w * 0.16, caseH * 0.22);
  }

  function drawDrillRod(x, y, len) {
    ink(1.15);
    var t = 4;
    strokeLine(x, y - t, x + len, y - t);
    strokeLine(x, y + t, x + len, y + t);
    strokeLine(x, y - t, x, y + t);
    ctx.strokeRect(x + len - 12, y - t - 3, 12, (t + 3) * 2);
    var n = Math.max(8, Math.floor(len / 16));
    var i;
    for (i = 0; i < n; i++) {
      var xx = x + 10 + i * (len - 28) / (n - 1);
      strokeLine(xx, y - t, xx + 6, y + t);
    }
  }

  function drawCuttingHead(tipX, cy, len) {
    var faceRx = len * 0.2;
    var faceRy = len * 0.46;
    var faceX = tipX + len * 0.7;
    ink(1.2);
    strokeLine(tipX, cy - 3, faceX - faceRx * 0.2, cy - faceRy * 0.28);
    strokeLine(tipX, cy + 3, faceX - faceRx * 0.2, cy + faceRy * 0.28);
    ctx.beginPath();
    ctx.moveTo(tipX + len * 0.16, cy - 5);
    ctx.lineTo(faceX, cy - faceRy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tipX + len * 0.16, cy + 5);
    ctx.lineTo(faceX, cy + faceRy);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(faceX, cy, faceRx, faceRy, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(faceX, cy, faceRx * 0.4, faceRy * 0.32, 0, 0, Math.PI * 2);
    ctx.stroke();
    var i;
    var n = 12;
    for (i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      var px = faceX + Math.cos(a) * faceRx;
      var py = cy + Math.sin(a) * faceRy;
      var ox = faceX + Math.cos(a) * (faceRx + faceRy * 0.28);
      var oy = cy + Math.sin(a) * (faceRy + faceRy * 0.16);
      var tx = -Math.sin(a) * 3.5;
      var ty = Math.cos(a) * 3.5;
      ctx.beginPath();
      ctx.moveTo(px + tx, py + ty);
      ctx.lineTo(ox, oy);
      ctx.lineTo(px - tx, py - ty);
      ctx.stroke();
    }
  }

  function drawRigFrame(x, y, w, h) {
    var dx = Math.min(18, w * 0.06);
    var dy = -Math.min(12, h * 0.12);
    ink(1.15);
    strokeLine(x, y + h, x + w, y + h);
    strokeLine(x, y, x + w, y);
    strokeLine(x, y, x, y + h);
    strokeLine(x + w, y, x + w, y + h);
    strokeLine(x + w * 0.33, y, x + w * 0.33, y + h);
    strokeLine(x + w * 0.66, y, x + w * 0.66, y + h);
    strokeLine(x, y + h * 0.5, x + w, y + h * 0.5);
    strokeLine(x, y + h, x + w * 0.33, y);
    strokeLine(x + w * 0.33, y + h, x + w * 0.66, y);
    strokeLine(x + dx, y + dy, x + w + dx, y + dy);
    strokeLine(x + dx, y + h + dy, x + w + dx, y + h + dy);
    strokeLine(x + dx, y + dy, x + dx, y + h + dy);
    strokeLine(x + w + dx, y + dy, x + w + dx, y + h + dy);
    strokeLine(x, y, x + dx, y + dy);
    strokeLine(x + w, y, x + w + dx, y + dy);
    strokeLine(x, y + h, x + dx, y + h + dy);
    strokeLine(x + w, y + h, x + w + dx, y + h + dy);
    bolt(x + 6, y + h - 6, 1.8);
    bolt(x + w - 6, y + h - 6, 1.8);
  }

  function drawGearCase(x, y, w, h) {
    var cx = x + w * 0.4;
    var cy = y + h * 0.5;
    var r = Math.min(w, h) * 0.42;
    ink(1.15);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.stroke();
    var i;
    for (i = 0; i < 6; i++) {
      var a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
      bolt(cx + Math.cos(a) * (r + 3), cy + Math.sin(a) * (r + 3), 1.6);
    }
    gearAt(cx, cy, r * 0.58, 14);
    strokeLine(cx + r + 6, cy - 3, x + w + 10, cy - 3);
    strokeLine(cx + r + 6, cy + 3, x + w + 10, cy + 3);
  }

  function drawCableReel(x, cy, w, h) {
    var r = h / 2;
    ink(1.15);
    ctx.beginPath();
    ctx.ellipse(x, cy, Math.max(3, r * 0.2), r, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x + w, cy, Math.max(3, r * 0.2), r, 0, 0, Math.PI * 2);
    ctx.stroke();
    strokeLine(x, cy - r, x + w, cy - r);
    strokeLine(x, cy + r, x + w, cy + r);
    var drum = r * 0.55;
    strokeLine(x + r * 0.15, cy - drum, x + w - r * 0.15, cy - drum);
    strokeLine(x + r * 0.15, cy + drum, x + w - r * 0.15, cy + drum);
    var i;
    for (i = 0; i < 6; i++) {
      var xx = x + r * 0.3 + i * (w - r * 0.6) / 5;
      ctx.beginPath();
      ctx.moveTo(xx, cy - drum);
      ctx.quadraticCurveTo(xx + 4, cy, xx, cy + drum);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, cy, Math.max(2, r * 0.14), 0, Math.PI * 2);
    ctx.stroke();
    strokeLine(x - 8, cy, x, cy);
    strokeLine(x + w, cy, x + w + 10, cy);
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
    drawWorks(v);
    drawCenterlines(v);
    drawPatchDims(v, tb);
    drawLayerDims(v, tb);
    drawDepthScale(v, tb);
    drawRadiusDim(v, tb);
    drawLocator(v, tb);
    ctx.restore();

    drawFrame(v, tb);
    drawScrollStrip(worldW);
    drawFps();
    drawDebug(v);
    if (modalOpen) drawMachinesModal();
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

  /* The core is already in the middle, and the window is still taller than
     a crust slice. Pointer zoom returns once the view is crust or soil. */
  function coreIsSubject(v) {
    if (v.worldH < 80000) return false;
    var coreY = v.box.y + (R - v.top) * v.px;
    var mid = v.box.y + v.box.h / 2;
    return Math.abs(coreY - mid) <= v.box.h * 0.16;
  }

  /* Wheel zoom is vertical only. While the core is the picture, the zoom
     is about the screen centre so the core stays put. On a crust or soil
     slice it is about the depth under the pointer again. The horizon stays
     one third down when the pointer is on the surface. The deep stop of a
     slice is the centre. */
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
    var lookPast = before.top + before.worldH > R + 0.5;
    var top;
    if (coreIsSubject(before)) {
      coreHold = true;
      top = R - worldH / 2;
    } else if (!(depth > 0)) {
      coreHold = false;
      top = top0;
    } else {
      coreHold = false;
      top = depth - (screenY - before.box.y) * worldH / before.box.h;
      if (!lookPast && top > top1) top = top1;
    }
    zoomTop = top;
    scrollT = scrollForTop(worldW, top);
  }

  function scrollForTop(worldW, top) {
    var box = sheetBox();
    var aspect = box.w / Math.max(1, box.h);
    var worldH = worldW / aspect;
    var bot0 = shallowBottom(worldH, box);
    var span = R - bot0;
    if (!(span > 1)) return 0;
    var bot = Math.min(R, top + worldH);
    var t = (bot - bot0) / span;
    if (t > 1) return 1;
    return t;
  }

  function applyPreset(name) {
    if (name === "near" || name === "1") lock = "near";
    else if (name === "middle" || name === "crust" || name === "2") lock = "middle";
    else if (name === "globe" || name === "3") lock = "globe";
    else return false;
    scrollT = 0;
    zoomTop = null;
    coreHold = false;
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
    if (modalOpen) return;
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
    if (modalOpen) {
      canvas.style.cursor = hitRect(modalClose, p.x, p.y) ? "pointer" : "default";
      return;
    }
    if (stripDrag) {
      scrollFromPointer(p.y);
      if (stripGeom) stripHot = stripIndexAt(stripGeom, p.y);
      return;
    }
    if (pointerOnDebug(p.x, p.y) || hitRect(machinesHit, p.x, p.y) || pointerOnTheme(p.x, p.y)) {
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
    if (modalOpen) {
      if (!hitRect(modalBox, p.x, p.y) || hitRect(modalClose, p.x, p.y)) modalOpen = false;
      event.preventDefault();
      return;
    }
    if (hitRect(machinesHit, p.x, p.y)) {
      modalOpen = true;
      event.preventDefault();
      return;
    }
    if (pointerOnDebug(p.x, p.y)) {
      debugOpen = !debugOpen;
      event.preventDefault();
      return;
    }
    if (pointerOnTheme(p.x, p.y)) {
      applyTheme(!dark);
      writeTheme();
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
    if (modalOpen && key === "Escape") {
      modalOpen = false;
      return;
    }
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

  applyTheme(readTheme());
  resize();
  readLocation();
  window.addEventListener("load", readLocation);
  requestAnimationFrame(onFrame);
})();
