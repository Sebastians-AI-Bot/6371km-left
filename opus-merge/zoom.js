/* Line section for "6.371 km left".
   Open index.html in a browser (no server). The wheel zooms from the
   10 m² patch out to the Earth. The section is the centre face of a
   cut in the globe: one patch wide, facing the camera, with a cut face
   at 45° either side. The cut goes down to the base of the unit being
   dug. Hold Alt and the wheel scrolls the section. Keys 1, 2 and 3 jump
   to the soils, the crust, and the globe. ?dig=granite opens the cut at
   that unit and ?face=500 makes the centre face 500 m wide; the debug
   panel sets both, and the wheel speed.
   Zoomed in, the centre face is ground to dig, cell by centimetre cell
   (../dig): left click hits it with the tool from the debug panel,
   middle or right drag pans at any zoom. Digging widens the face so
   10 m stay free on either side of the dug ground. */

(function () {
  "use strict";

  var R_KM = 6371;
  var R = R_KM * 1000;
  var PATCH = Math.sqrt(10);
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
    if (digPaint) digPaint.setColors(digColors());
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

  /* The diggable ground: a window of cells that follows the view over the
     centre face. Changed chunks are kept when the window moves on. */
  var DIG = makeDig(makeColumnWorld(COLUMN, POCKETS));
  var digPaint = null;
  /* The tool in centimetres, and which one (see TOOLS in ../dig/sim.js). */
  var toolW = 10;
  var toolH = 10;
  var toolName = "pickaxe";
  /* Off, the tool only works once the cells are drawn. */
  var digFar = true;
  /* Outlines the simulated window, its frozen edge and its awake chunks. */
  var showSimArea = true;
  var digHover = null;
  var digReach = { key: "", ok: false, at: 0 };
  var simLast = 0;
  var simAcc = 0;
  /* Sim steps per frame stop after this many milliseconds, so heavy
     digging slows the sim down instead of the frame rate. */
  var SIM_BUDGET = 6;
  /* Smoothed milliseconds per frame, for the debug panel. */
  var digTime = { sim: 0, paint: 0 };
  var digStats = { active: 0, awake: 0 };

  function timeDig(key, ms) {
    digTime[key] += (ms - digTime[key]) * 0.1;
  }

  function digColors() {
    return {
      paper: PAPER, ink: INK, mid: MID, faint: FAINT,
      waterInk: "#46698f", water: "#7498b8",
      wet: dark ? "#25323f" : "#d5e1ea",
      oil: dark ? invertHex("#28241f") : "#28241f"
    };
  }

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
  /* 0 is the shallow frame (the surface on screen). 1 has the centre in
     the middle of the screen. */
  var scrollT = 0;
  var pointerY = null;
  var pointerX = null;
  /* Flat x at the middle of the view. Middle or right drag moves it. */
  var panX = 0;
  var pan = null;
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

  /* As close as the dig page: 48 px to the centimetre. */
  function closeWidth() {
    return sheetBox().w / 4800;
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

  /* View tops from the shallow frame to the centre in the middle. */
  function scrollRange(worldH, box) {
    var top0 = shallowTop(worldH, box);
    return { top0: top0, top1: Math.max(top0, R - worldH / 2) };
  }

  function placedView(worldW, t) {
    var box = sheetBox();
    var aspect = box.w / Math.max(1, box.h);
    var worldH = worldW / aspect;
    var range = scrollRange(worldH, box);
    var top = lerp(range.top0, range.top1, clamp(t, 0, 1));
    /* Zooming out eases the horizon pin toward a centred globe.
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
      left: panX - worldW / 2,
      top: top,
      px: box.w / worldW
    };
  }

  function viewOf(worldW) {
    return placedView(worldW, scrollT);
  }

  /* pxY, when set, is the depth scale of the centre face seen from above. */
  function worldToScreen(v, x, y) {
    return {
      x: v.box.x + (x - v.left) * v.px,
      y: v.box.y + (y - v.top) * (v.pxY || v.px)
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

  /* The plane being drawn passes SEC.d from the centre, nearest it at flat
     x = SEC.x. A shell of radius r cuts it in a circle of secRadius(r).
     Zero for a plane through the centre. */
  var SEC = { d: 0, x: 0 };

  function secRadius(r) {
    if (!SEC.d) return r;
    return Math.sqrt(Math.max(0, r * r - SEC.d * SEC.d));
  }

  function secCenter(v) {
    return worldToScreen(v, SEC.x, R);
  }

  function drawShell(v, radius, skip) {
    radius = secRadius(radius);
    if (radius <= 1) return;
    var px = radius * v.px;
    var c = secCenter(v);
    var far = px > 120000 || c.y > v.box.y + v.box.h + px;
    if (far) {
      var xLeft = v.left - SEC.x;
      var xRight = v.left + v.worldW - SEC.x;
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
      if (x - SEC.x < -limit || x - SEC.x > limit) continue;
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
      var y = R - Math.sqrt(radius * radius - (x - SEC.x) * (x - SEC.x));
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
    var r = secRadius(R - depth);
    if (r <= 0) return R;
    var under = r * r - (x - SEC.x) * (x - SEC.x);
    if (under <= 0) return R;
    return R - Math.sqrt(under);
  }

  function ringMode(v, d0) {
    var px = secRadius(R - d0) * v.px;
    if (px > 5000 || px < 8) return false;
    var c = secCenter(v);
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
    var c = secCenter(v);
    var px0 = Math.max(0.5, secRadius(R - d0) * v.px);
    var px1 = Math.max(0, secRadius(R - d1) * v.px);
    ctx.beginPath();
    ctx.arc(c.x, c.y, px0, 0, Math.PI * 2, false);
    if (px1 > 0.8) ctx.arc(c.x, c.y, px1, 0, Math.PI * 2, true);
    ctx.clip("evenodd");
  }

  /* Hatches stay inside the earth. A huge radius is drawn as the surface
     arc across the view; the disk itself is used once it fits. */
  function clipBelowSurface(v) {
    var ySurf = depthY(0, SEC.x);
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
    var c = secCenter(v);
    var rad = secRadius(R) * v.px;
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
    var c = secCenter(v);
    var px = secRadius(R - d0) * v.px;
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

  /* Rock units down to depthMax, and the pockets inside that depth. */
  function paintUnits(v, depthMax, pockets) {
    hatchAnchor = worldToScreen(v, 0, 0);
    ctx.save();
    clipBelowSurface(v);
    var from = 0;
    var i;
    for (i = 0; i < COLUMN.length && from < depthMax; i++) {
      paintRegion(v, from, COLUMN[i].to, COLUMN[i].hatch, null, null, false);
      from = COLUMN[i].to;
    }
    if (pockets) {
      for (i = 0; i < POCKETS.length; i++) {
        var pocket = POCKETS[i];
        if (pocket.d1 > depthMax) continue;
        paintRegion(v, pocket.d0, pocket.d1, pocket.hatch, pocket.x0, pocket.x1, true);
      }
    }
    ctx.restore();
  }

  function layerSeparated(kept, radius, pxPerM) {
    var px = radius * pxPerM;
    for (var k = 0; k < kept.length; k++) {
      if (Math.abs(kept[k] - px) < 13) return false;
    }
    kept.push(px);
    return true;
  }

  /* Boundaries down to depthMax. The base of the cut and the surface are
     edges of the cut, drawn heavier. */
  function drawLayerLines(v, depthMax) {
    var kept = [R * v.px, (R - depthMax) * v.px];
    var i;
    for (i = 0; i < LAYERS.length; i++) {
      var layer = LAYERS[i];
      var radius = R - layer.depth;
      if (radius <= 0 || layer.depth >= depthMax) continue;
      if (layer.depth * v.px < 2.4) continue;
      var onScreen = layer.depth < v.top + v.worldH * 2 && layer.depth > v.top - v.worldH;
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
    if (depthMax < R) drawShell(v, R - depthMax, null);
    drawShell(v, R, null);
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
    for (i = 0; i < COLUMN.length && from < digDepth(); i++) {
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

  /* The depth scale runs down the left edge of the sheet; names in the
     drawing keep clear of this much of it. */
  var DEPTH_SCALE_W = 104;

  function drawDepthScale(v, tb) {
    var center = worldToScreen(v, 0, R);
    var surface = worldToScreen(v, 0, 0);
    var globe = center.y > v.box.y + 40 && center.y < v.box.y + v.box.h - 40 &&
      surface.y > v.box.y && surface.y < v.box.y + v.box.h;
    if (globe && (R * 2) * v.px < Math.min(v.box.w, v.box.h) * 1.15) return;

    var bottomWorld = Math.min(v.top + v.worldH, R);
    if (bottomWorld <= 0) return;
    var x = v.box.x + 12;

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
      if (inBlock(tb, x, y, 12) || inBlock(debugBox, x, y, 10)) return;
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
      if (inBlock(debugBox, x, y, 4)) continue;
      strokeLine(x, y, x + len, y);
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
    for (i = 0; i < kept.length; i++) ctx.fillText(kept[i].text, x + 12, kept[i].y);
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
      strokeLine(c.x, c.y - pxR - over, c.x, c.y + pxR + over);
      strokeLine(c.x - pxR - over, c.y, c.x + pxR + over, c.y);
      ctx.setLineDash([]);
      ctx.lineWidth = 0.9;
      tickEnds(c.x, c.y - pxR - over, c.x, c.y + pxR + over, true);
      tickEnds(c.x - pxR - over, c.y, c.x + pxR + over, c.y, false);
      ctx.beginPath();
      ctx.arc(c.x, c.y, 3.2, 0, Math.PI * 2);
      ctx.stroke();
      strokeLine(c.x - 7, c.y, c.x + 7, c.y);
      strokeLine(c.x, c.y - 7, c.x, c.y + 7);
    } else {
      var y0 = Math.max(v.box.y + 8, topPt.y - 18);
      var y1 = Math.min(v.box.y + v.box.h - 16, worldToScreen(v, 0, digDepth()).y);
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

  /* ---------- cut globe ----------
     Parallel projection from above the front, at the angle of the
     sphere-opus sheet. The top front quarter of the sphere is cut away as
     a \_/ notch: the centre face is FACE_HALF * 2 wide, holds the shaft and
     faces the camera; the camera height only squashes it. Either side a
     face runs off at 45°, and the notch floor is the equator. Past the
     edges of the centre face the flat section is folded onto the side
     faces, so every face of the cut is the same 2D drawing. The notch goes
     down to the base of the unit being dug; below that the next unit
     shows as a curved surface. Parallel, not true perspective, so each
     face is an affine copy of the flat drawing and the faces meet exactly
     at every zoom. Sphere centre at the origin, pole on +y, camera
     toward +z. Metres throughout. */
  var CUT_ELEV = 28.7 * Math.PI / 180;
  var COS_E = Math.cos(CUT_ELEV);
  var SIN_E = Math.sin(CUT_ELEV);
  var FACE_HALF = PATCH / 2;
  /* Digging widens the centre face, easing out to this half width. */
  var faceGoal = FACE_HALF;
  var FACE_ROOM = 10;
  var FACE_MIN = PATCH;
  var FACE_MAX = 1000000;
  var digUnit = COLUMN.length - 1;

  /* Section rings by angle from the pole, as on the sphere-opus sheet. */
  var RINGS = [
    { a: 4, s: "mid" }, { a: 7, s: "ink" }, { a: 10, s: "mid" }, { a: 13, s: "ink" },
    { a: 16, s: "faint" }, { a: 19, s: "ink" }, { a: 23, s: "mid" }, { a: 27, s: "ink" },
    { a: 32, s: "faint" }, { a: 37, s: "mid" }, { a: 43, s: "dash" }, { a: 50, s: "mid" },
    { a: 58, s: "dash" }, { a: 67, s: "faint" }, { a: 78, s: "dash" }, { a: 90, s: "ink" },
    { a: 104, s: "dash" }, { a: 120, s: "faint" }
  ];
  var MERIDIANS = [-120, -80, 80, 120];

  function digDepth() {
    return COLUMN[digUnit].to;
  }

  function digRadius() {
    return R - digDepth();
  }

  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  /* The flat view as it lands on the centre face: x as drawn, depth
     squashed about the middle of the sheet. */
  function cutAnchor(box) {
    return box.y + box.h / 2;
  }

  function faceView(v) {
    var ay = cutAnchor(v.box);
    return {
      box: v.box,
      worldW: v.worldW,
      worldH: v.worldH / COS_E,
      left: v.left,
      top: v.top + (v.box.y - ay) * (1 - COS_E) / (v.px * COS_E),
      px: v.px,
      pxY: v.px * COS_E
    };
  }

  function cutProject(fv, p) {
    return {
      x: fv.box.x + (p[0] - fv.left) * fv.px,
      y: fv.box.y + (R - fv.top) * fv.pxY - (p[1] * COS_E - p[2] * SIN_E) * fv.px
    };
  }

  /* Flat section coordinates (x across, y down from the pole) to the cut.
     A side face is the section folded at the edge of the centre face. It
     passes FACE_HALF / √2 from the centre, so it is drawn with that offset
     (see SEC) and its rings stay true to the sphere at any face width. */
  var PIECES = [
    {
      name: "floor", wedge: true,
      to3: function (x, y) { return [x, 0, R - y]; }
    },
    {
      name: "left", side: -1,
      to3: function (x, y) {
        var s = (-x - FACE_HALF) / Math.SQRT2;
        return [-FACE_HALF - s, R - y, s];
      }
    },
    {
      name: "right", side: 1,
      to3: function (x, y) {
        var s = (x - FACE_HALF) / Math.SQRT2;
        return [FACE_HALF + s, R - y, s];
      }
    },
    {
      name: "face",
      to3: function (x, y) { return [x, R - y, 0]; }
    }
  ];

  /* Flat extent of the piece, and the section offset it is drawn with. */
  function pieceFrame(piece) {
    var h = FACE_HALF;
    if (piece.wedge) return { x0: -h - R, x1: h + R, y0: 0, y1: R, d: 0, x: 0 };
    if (!piece.side) return { x0: -h, x1: h, y0: -R, y1: R, d: 0, x: 0 };
    var foot = h * (1 - Math.SQRT1_2);
    return piece.side > 0
      ? { x0: h, x1: h + R, y0: -R, y1: R, d: h * Math.SQRT1_2, x: foot }
      : { x0: -h - R, x1: -h, y0: -R, y1: R, d: h * Math.SQRT1_2, x: -foot };
  }

  function enterSection(piece) {
    var f = pieceFrame(piece);
    SEC.d = f.d;
    SEC.x = f.x;
  }

  function leaveSection() {
    SEC.d = 0;
    SEC.x = 0;
  }

  function pieceNamed(name) {
    for (var i = 0; i < PIECES.length; i++) if (PIECES[i].name === name) return PIECES[i];
    return null;
  }

  /* Screen = o + x * a + y * b for flat x, y on the piece. */
  function pieceAffine(fv, piece) {
    var o = cutProject(fv, piece.to3(0, 0));
    var a = cutProject(fv, piece.to3(1, 0));
    var b = cutProject(fv, piece.to3(0, 1));
    return { ox: o.x, oy: o.y, ax: a.x - o.x, ay: a.y - o.y, bx: b.x - o.x, by: b.y - o.y };
  }

  function applyAffine(m, x, y) {
    return { x: m.ox + m.ax * x + m.bx * y, y: m.oy + m.ay * x + m.by * y };
  }

  /* Flat coordinates to the screen, through whichever face holds x. */
  function foldToScreen(fv, x, y) {
    var name = x > FACE_HALF ? "right" : x < -FACE_HALF ? "left" : "face";
    return applyAffine(pieceAffine(fv, pieceNamed(name)), x, y);
  }

  /* The part of the piece under the sheet, as a flat view the section
     drawing can cull against. Same metres per pixel as the face. */
  function pieceView(fv, piece, m) {
    var det = m.ax * m.by - m.bx * m.ay;
    if (Math.abs(det) < 1e-18) return null;
    var box = fv.box;
    var pad = 24;
    var corners = [
      [box.x - pad, box.y - pad], [box.x + box.w + pad, box.y - pad],
      [box.x - pad, box.y + box.h + pad], [box.x + box.w + pad, box.y + box.h + pad]
    ];
    var x0 = Infinity;
    var x1 = -Infinity;
    var y0 = Infinity;
    var y1 = -Infinity;
    for (var i = 0; i < 4; i++) {
      var dx = corners[i][0] - m.ox;
      var dy = corners[i][1] - m.oy;
      var x = (dx * m.by - dy * m.bx) / det;
      var y = (m.ax * dy - m.ay * dx) / det;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    var f = pieceFrame(piece);
    x0 = Math.max(x0, f.x0);
    x1 = Math.min(x1, f.x1);
    y0 = Math.max(y0, f.y0);
    y1 = Math.min(y1, f.y1);
    if (!(x1 > x0) || !(y1 > y0)) return null;
    return {
      box: { x: box.x, y: box.y, w: (x1 - x0) * fv.px, h: (y1 - y0) * fv.px },
      worldW: x1 - x0,
      worldH: y1 - y0,
      left: x0,
      top: y0,
      px: fv.px
    };
  }

  /* From the piece view's drawing space onto its face of the cut. */
  function enterPiece(vp, m) {
    var k = 1 / vp.px;
    var wx = vp.left - vp.box.x * k;
    var wy = vp.top - vp.box.y * k;
    ctx.transform(m.ax * k, m.ay * k, m.bx * k, m.by * k,
      m.ox + m.ax * wx + m.bx * wy, m.oy + m.ay * wx + m.by * wy);
  }

  function clipPiece(vp, piece) {
    ctx.beginPath();
    if (piece.wedge) {
      var y0 = vp.top;
      var y1 = vp.top + vp.worldH;
      var pts = [
        [-FACE_HALF - (R - y0), y0], [FACE_HALF + (R - y0), y0],
        [FACE_HALF + (R - y1), y1], [-FACE_HALF - (R - y1), y1]
      ];
      for (var i = 0; i < pts.length; i++) {
        var p = worldToScreen(vp, pts[i][0], pts[i][1]);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
    } else {
      ctx.rect(vp.box.x, vp.box.y, vp.box.w, vp.box.h);
    }
    ctx.clip();
  }

  function drawPiece(fv, piece) {
    var m = pieceAffine(fv, piece);
    var vp = pieceView(fv, piece, m);
    if (!vp) return;
    var face = piece.name === "face";
    var depth = digDepth();
    ctx.save();
    enterPiece(vp, m);
    clipPiece(vp, piece);
    enterSection(piece);
    paintUnits(vp, depth, !piece.wedge);
    drawLayerLines(vp, depth);
    leaveSection();
    if (face) drawDigCells(vp);
    ctx.restore();
  }

  function frontFacing(p) {
    return p[1] * SIN_E + p[2] * COS_E > 0;
  }

  function inNotch(p) {
    return p[1] > 0 && p[2] > 0 && Math.abs(p[0]) < FACE_HALF + p[2];
  }

  /* Strokes a sampled curve, broken wherever keep() fails. */
  function cutCurve(fv, pointAt, n, keep) {
    var open = false;
    ctx.beginPath();
    for (var i = 0; i <= n; i++) {
      var p = pointAt(i / n);
      if (keep && !keep(p)) { open = false; continue; }
      var q = cutProject(fv, p);
      if (open) ctx.lineTo(q.x, q.y);
      else ctx.moveTo(q.x, q.y);
      open = true;
    }
    ctx.stroke();
  }

  /* Segment clipped to the sheet first, so a far end never reaches the
     rasteriser as billions of pixels. */
  function cutSegment(fv, p0, p1) {
    var a = cutProject(fv, p0);
    var b = cutProject(fv, p1);
    var box = fv.box;
    var t0 = 0;
    var t1 = 1;
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var tests = [
      [-dx, a.x - (box.x - 4)], [dx, box.x + box.w + 4 - a.x],
      [-dy, a.y - (box.y - 4)], [dy, box.y + box.h + 4 - a.y]
    ];
    for (var i = 0; i < 4; i++) {
      var p = tests[i][0];
      var q = tests[i][1];
      if (p === 0) {
        if (q < 0) return;
      } else {
        var t = q / p;
        if (p < 0) t0 = Math.max(t0, t);
        else t1 = Math.min(t1, t);
      }
    }
    if (t1 <= t0) return;
    strokeLine(a.x + dx * t0, a.y + dy * t0, a.x + dx * t1, a.y + dy * t1);
  }

  function latitude(r, deg) {
    var t = deg * Math.PI / 180;
    return function (u) {
      var l = u * Math.PI * 2;
      return [r * Math.sin(t) * Math.sin(l), r * Math.cos(t), r * Math.sin(t) * Math.cos(l)];
    };
  }

  function meridian(r, deg) {
    var l = deg * Math.PI / 180;
    return function (u) {
      var t = (4 + u * 130) * Math.PI / 180;
      return [r * Math.sin(t) * Math.sin(l), r * Math.cos(t), r * Math.sin(t) * Math.cos(l)];
    };
  }

  function ringPen(s, faint) {
    ctx.setLineDash(s === "dash" ? [7, 5] : []);
    if (faint) {
      ctx.strokeStyle = FAINT;
      ctx.lineWidth = s === "ink" ? 0.75 : 0.6;
    } else if (s === "ink") {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.05;
    } else if (s === "faint") {
      ctx.strokeStyle = FAINT;
      ctx.lineWidth = 0.6;
    } else {
      ctx.strokeStyle = MID;
      ctx.lineWidth = 0.75;
    }
  }

  function ringSteps(rPx) {
    return Math.max(120, Math.ceil(3.2 * Math.sqrt(Math.max(1, rPx))));
  }

  /* Rings inside the first sheet ring, each at half the angle of the one
     before, down to about a patch from the pole. A ring fades in once it
     is wide enough to read and is left out once it is far wider than the
     sheet, so zooming on the pole always passes rings. */
  function drawPoleRings(fv, r, keep, faint) {
    var big = 8 * Math.max(fv.box.w, fv.box.h);
    var outer = ctx.globalAlpha;
    var deg = RINGS[0].a;
    for (var n = 1; r * deg * Math.PI / 180 >= PATCH; n++) {
      deg /= 2;
      var rPx = r * Math.sin(deg * Math.PI / 180) * fv.px;
      if (rPx < 14 || rPx > big) continue;
      ctx.globalAlpha = outer * smoothstep((rPx - 14) / 50);
      ringPen(n % 2 ? "mid" : "ink", faint);
      cutCurve(fv, latitude(r, deg), ringSteps(rPx), keep);
    }
    ctx.globalAlpha = outer;
    ctx.setLineDash([]);
  }

  /* Outline, rings and meridians of the sphere, and the rings of the next
     unit where the cut has laid it bare. Left out once the globe is far
     bigger than the sheet. */
  function drawGlobeLines(fv) {
    var pxR = R * fv.px;
    var rDig = digRadius();
    var outside = function (p) {
      return frontFacing(p) && !(inNotch(p) && rDig < R);
    };
    var bare = function (p) { return frontFacing(p) && inNotch(p); };
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    drawPoleRings(fv, R, outside, false);
    if (rDig > 0 && rDig < R) drawPoleRings(fv, rDig, bare, true);
    ctx.restore();
    if (pxR > 60000) return;
    var c = cutProject(fv, [0, 0, 0]);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    var i;
    for (i = 0; i < RINGS.length; i++) {
      ringPen(RINGS[i].s, false);
      cutCurve(fv, latitude(R, RINGS[i].a), ringSteps(pxR * Math.sin(RINGS[i].a * Math.PI / 180)), outside);
    }
    ctx.strokeStyle = FAINT;
    ctx.lineWidth = 0.55;
    ctx.setLineDash([3, 5]);
    for (i = 0; i < MERIDIANS.length; i++) cutCurve(fv, meridian(R, MERIDIANS[i]), 200, outside);
    if (rDig > 0 && rDig < R) {
      for (i = 0; i < RINGS.length; i++) {
        if (RINGS[i].a >= 90) continue;
        ringPen(RINGS[i].s, true);
        cutCurve(fv, latitude(rDig, RINGS[i].a), ringSteps(rDig * fv.px * Math.sin(RINGS[i].a * Math.PI / 180)), bare);
      }
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.arc(c.x, c.y, pxR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /* Where the centre face meets the side faces, and the side faces meet
     the floor. The rims are the section's own surface and base lines. */
  function drawCutEdges(fv) {
    var rDig = digRadius();
    var h = FACE_HALF;
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.35;
    ctx.lineCap = "round";
    ctx.setLineDash([]);
    var yTop = Math.sqrt(R * R - h * h);
    var yBot = rDig > h ? Math.sqrt(rDig * rDig - h * h) : 0;
    var along = function (r) {
      if (r <= h) return 0;
      return (-Math.SQRT2 * h + Math.sqrt(4 * r * r - 2 * h * h)) / 2;
    };
    var q0 = along(rDig);
    var q1 = along(R);
    for (var sg = -1; sg <= 1; sg += 2) {
      cutSegment(fv, [sg * h, yTop, 0], [sg * h, yBot, 0]);
      cutSegment(fv, [sg * (h + q0 / Math.SQRT2), 0, q0 / Math.SQRT2],
        [sg * (h + q1 / Math.SQRT2), 0, q1 / Math.SQRT2]);
    }
    ctx.restore();
  }

  function paperLabel(text, x, y, align) {
    var tw = ctx.measureText(text).width;
    var rx = align === "center" ? x - tw / 2 : align === "right" ? x - tw : x;
    ctx.fillStyle = PAPER;
    ctx.fillRect(rx - 3, y - 8, tw + 6, 16);
    ctx.fillStyle = INK;
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
  }

  /* Unit names in their bands: on the left cut face while it shows beside
     the centre face, on the centre face once that fills the sheet. Pocket
     names where the pocket is. */
  function drawUnitLabels(fv, tb) {
    var box = fv.box;
    var faceL = cutProject(fv, [-FACE_HALF, R, 0]).x;
    var onFace = faceL - box.x < 200;
    var piece = pieceNamed(onFace ? "face" : "left");
    var m = pieceAffine(fv, piece);
    enterSection(piece);
    var targetX = onFace ? box.x + DEPTH_SCALE_W + 18 : Math.max(box.x + DEPTH_SCALE_W + 40, (box.x + DEPTH_SCALE_W + faceL) / 2);
    var xAt = (targetX - m.ox) / m.ax;
    var depth = digDepth();
    var items = [];
    var from = 0;
    var i;
    for (i = 0; i < COLUMN.length && from < depth; i++) {
      var d0 = from;
      var d1 = COLUMN[i].to;
      from = d1;
      var rm = R - (d0 + d1) / 2;
      var x = onFace ? clamp(xAt, -FACE_HALF, FACE_HALF) : Math.min(-FACE_HALF, Math.max(xAt, -rm * 0.64));
      var p0 = applyAffine(m, x, Math.max(depthY(d0, x), fv.top));
      var p1 = applyAffine(m, x, depthY(d1, x));
      if (p1.y > box.y + box.h) p1 = { x: p1.x, y: box.y + box.h };
      if (p0.y < box.y) p0 = { x: p0.x, y: box.y };
      if (p1.y - p0.y < 22) continue;
      items.push({ name: COLUMN[i].name, x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2, align: onFace ? "left" : "center" });
    }
    leaveSection();
    for (i = 0; i < POCKETS.length; i++) {
      var pocket = POCKETS[i];
      if (pocket.d1 > depth) continue;
      var a = foldToScreen(fv, (pocket.x0 + pocket.x1) / 2, pocket.d0);
      var b = foldToScreen(fv, (pocket.x0 + pocket.x1) / 2, pocket.d1);
      if (b.y - a.y < 26) continue;
      items.push({ name: pocket.name, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, align: "center" });
    }
    setFont(12);
    ctx.textBaseline = "middle";
    var used = [];
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.y < box.y + 12 || it.y > box.y + box.h - 12) continue;
      if (it.x < box.x + 8 || it.x > box.x + box.w - 8) continue;
      if (inBlock(tb, it.x, it.y, 12)) continue;
      var clash = false;
      for (var j = 0; j < used.length; j++) {
        if (Math.abs(used[j].y - it.y) < 16 && Math.abs(used[j].x - it.x) < 140) clash = true;
      }
      if (clash) continue;
      paperLabel(it.name, it.x, it.y, it.align);
      used.push(it);
    }
  }

  /* The top of the next unit, a little in front of the foot of the centre face. */
  function drawNextLabel(fv, tb) {
    if (digUnit >= COLUMN.length - 1) return;
    var rDig = digRadius();
    var foot = cutProject(fv, [0, rDig, 0]);
    var at = function (deg) {
      var t = deg * Math.PI / 180;
      return cutProject(fv, [0, rDig * Math.cos(t), rDig * Math.sin(t)]);
    };
    var lo = 0;
    var hi = 50;
    if (at(hi).y - foot.y < 34) lo = hi = 28;
    for (var k = 0; k < 40 && hi - lo > 1e-9; k++) {
      var mid = (lo + hi) / 2;
      if (at(mid).y - foot.y < 34) lo = mid;
      else hi = mid;
    }
    var p = at(hi);
    var box = fv.box;
    if (p.y < box.y + 12 || p.y > box.y + box.h - 12 || inBlock(tb, p.x, p.y, 12)) return;
    setFont(12);
    ctx.textBaseline = "middle";
    paperLabel("next: " + COLUMN[digUnit + 1].name, p.x, p.y, "center");
  }

  function drawCutGlobe(v, fv, tb) {
    drawGlobeLines(fv);
    for (var i = 0; i < PIECES.length; i++) drawPiece(fv, PIECES[i]);
    drawCutEdges(fv);
    drawCenterlines(fv);
    drawUnitLabels(fv, tb);
    drawNextLabel(fv, tb);
    drawPatchDims(fv, tb);
    drawLayerDims(fv, tb);
    drawDepthScale(fv, tb);
    drawRadiusDim(fv, tb);
    drawLocator(fv, tb);
  }

  function digByName(name) {
    var key = String(name || "").toLowerCase().replace(/[-_]/g, " ");
    for (var i = 0; i < COLUMN.length; i++) {
      if (COLUMN[i].name.toLowerCase() === key) return i;
    }
    return -1;
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
      ["scroll", formatTickDepth(v.top + v.worldH / 2)],
      ["fps", fpsLabel],
      ["sim", digTime.sim.toFixed(1) + " ms"],
      ["dig paint", digTime.paint.toFixed(1) + " ms"],
      ["awake", digStats.active + " of " + digStats.chunks + " chunks, " + digStats.coarse + " coarse"],
      ["clumps", digStats.awake + " moving"]
    ];
  }

  var debugOpen = true;
  var debugBox = { x: 0, y: 0, w: 0, h: 0 };
  var debugHit = null;
  var machinesHit = null;
  var toolModeHit = null;
  var toolPrevHit = null;
  var toolNextHit = null;
  var digFarHit = null;
  var simAreaHit = null;
  var digUpHit = null;
  var digDownHit = null;
  /* Shift turns the wheel at 1×, whatever the slider says. */
  var wheelSpeed = 0.33;
  /* Views wider than this step all the dig ground coarsely. */
  var coarseFrom = 20;

  /* Log sliders in the debug panel. */
  var SLIDERS = [
    {
      label: "2D width", min: FACE_MIN, max: FACE_MAX,
      get: function () { return FACE_HALF * 2; },
      set: function (w) { FACE_HALF = faceGoal = w / 2; },
      text: function (w) { return formatLength(w); }
    },
    {
      label: "wheel speed", min: 0.25, max: 4,
      get: function () { return wheelSpeed; },
      set: function (k) { wheelSpeed = k; },
      text: function (k) { return trimNum(k.toFixed(2)) + "\u00d7"; }
    },
    {
      label: "coarse sim wider than", min: 1, max: 1000,
      get: function () { return coarseFrom; },
      set: function (w) { coarseFrom = w; },
      text: function (w) { return formatLength(w); }
    }
  ];
  var sliderHits = [];
  var sliderDrag = null;

  /* Tool size fields in metres, laid over the debug panel. */
  function sizeField(id, get, set) {
    var el = document.getElementById(id);
    el.value = get() / 100;
    el.addEventListener("input", function () {
      var m = Number(el.value);
      if (m > 0) set(clamp(Math.round(m * 100), 1, 1000));
    });
    el.addEventListener("change", function () { el.value = get() / 100; });
    return { el: el, at: "" };
  }
  var toolWField = sizeField("toolW", function () { return toolW; }, function (cm) { toolW = cm; });
  var toolHField = sizeField("toolH", function () { return toolH; }, function (cm) { toolH = cm; });

  function placeField(f, x, y, show) {
    var at = show ? x + "," + y + "," + INK : "";
    if (at === f.at) return;
    f.at = at;
    f.el.style.display = show ? "block" : "none";
    if (!show) return;
    f.el.style.left = x + "px";
    f.el.style.top = y + "px";
    f.el.style.color = INK;
    f.el.style.borderColor = MID;
  }

  function sliderT(sl) {
    return Math.log(sl.get() / sl.min) / Math.log(sl.max / sl.min);
  }

  function slideTo(hit, x) {
    var t = clamp((x - hit.x0) / Math.max(1, hit.x1 - hit.x0), 0, 1);
    hit.slider.set(hit.slider.min * Math.pow(hit.slider.max / hit.slider.min, t));
  }

  function sliderAt(x, y) {
    for (var i = 0; i < sliderHits.length; i++) {
      var g = sliderHits[i];
      if (x >= g.x0 - 8 && x <= g.x1 + 8 && y >= g.y && y <= g.y + g.h) return g;
    }
    return null;
  }

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
    var digText = "\u2039  " + COLUMN[digUnit].name + "  \u203a";
    var digW = ctx.measureText("dug to").width + ctx.measureText("\u2039  lower mantle  \u203a").width + 18;
    if (digW > maxW) maxW = digW;
    var pad = 8;
    var headH = 22;
    var rowH = 16;
    var controlH = 22;
    var sliderH = 34;
    var w = Math.ceil(maxW + pad * 2);
    var h = debugOpen ? headH + 4 + rows.length * rowH + SLIDERS.length * sliderH + controlH * 7 : headH;
    var x = 10;
    var y = 42;
    debugHit = { x: x, y: y, w: w, h: headH };
    machinesHit = debugOpen ? { x: x, y: y + h - controlH, w: w, h: controlH } : null;
    simAreaHit = debugOpen ? { x: x, y: y + h - controlH * 3, w: w, h: controlH } : null;
    toolModeHit = debugOpen ? { x: x, y: y + h - controlH * 4, w: w, h: controlH } : null;
    digFarHit = debugOpen ? { x: x, y: y + h - controlH * 5, w: w, h: controlH } : null;
    var toolText = "\u2039  " + toolName + "  \u203a";
    toolPrevHit = debugOpen ? { x: x + w - pad - ctx.measureText(toolText).width - 4, y: toolModeHit.y, w: 22, h: controlH } : null;
    toolNextHit = debugOpen ? { x: x + w - pad - 18, y: toolModeHit.y, w: 22, h: controlH } : null;
    var fieldY = y + h - controlH * 7;
    placeField(toolWField, x + w - pad - 78, fieldY + 2, debugOpen);
    placeField(toolHField, x + w - pad - 78, fieldY + controlH + 2, debugOpen);
    var digY = y + h - controlH * 2;
    digUpHit = debugOpen ? { x: x + w - pad - ctx.measureText(digText).width - 4, y: digY, w: 22, h: controlH } : null;
    digDownHit = debugOpen ? { x: x + w - pad - 18, y: digY, w: 22, h: controlH } : null;
    debugBox = { x: x, y: y, w: w, h: h };

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
      sliderHits = [];
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
    sliderHits = [];
    var sy = y + headH + 4 + rows.length * rowH;
    for (i = 0; i < SLIDERS.length; i++) {
      var sl = SLIDERS[i];
      var top = sy + i * sliderH;
      ctx.strokeStyle = MID;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + w, top);
      ctx.stroke();
      setFont(12, 500);
      ctx.fillStyle = INK;
      ctx.textAlign = "left";
      ctx.fillText(sl.label, x + pad, top + 11);
      setFont(12);
      ctx.textAlign = "right";
      ctx.fillText(sl.text(sl.get()), x + w - pad, top + 11);
      var x0 = x + pad + 4;
      var x1 = x + w - pad - 4;
      var ty = top + 25;
      var kx = x0 + (x1 - x0) * clamp(sliderT(sl), 0, 1);
      ctx.strokeStyle = FAINT;
      ctx.lineWidth = 1;
      strokeLine(x0, ty, x1, ty);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.4;
      strokeLine(x0, ty, kx, ty);
      ctx.fillStyle = PAPER;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(kx, ty, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 0.8;
      sliderHits.push({ slider: sl, x0: x0, x1: x1, y: top + 16, h: sliderH - 16 });
    }
    ctx.strokeStyle = MID;
    ctx.beginPath();
    ctx.moveTo(x, digY);
    ctx.lineTo(x + w, digY);
    ctx.moveTo(x, machinesHit.y);
    ctx.lineTo(x + w, machinesHit.y);
    ctx.moveTo(x, toolModeHit.y);
    ctx.lineTo(x + w, toolModeHit.y);
    ctx.moveTo(x, digFarHit.y);
    ctx.lineTo(x + w, digFarHit.y);
    ctx.moveTo(x, simAreaHit.y);
    ctx.lineTo(x + w, simAreaHit.y);
    ctx.moveTo(x, fieldY);
    ctx.lineTo(x + w, fieldY);
    ctx.moveTo(x, fieldY + controlH);
    ctx.lineTo(x + w, fieldY + controlH);
    ctx.stroke();
    setFont(12, 500);
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("dug to", x + pad, digY + controlH / 2);
    ctx.textAlign = "right";
    ctx.fillText(digText, x + w - pad, digY + controlH / 2);
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("machines", x + pad, machinesHit.y + controlH / 2);
    ctx.textAlign = "right";
    ctx.fillText("open", x + w - pad, machinesHit.y + controlH / 2);
    ctx.textAlign = "left";
    ctx.fillText("tool", x + pad, toolModeHit.y + controlH / 2);
    ctx.textAlign = "right";
    ctx.fillText(toolText, x + w - pad, toolModeHit.y + controlH / 2);
    ctx.textAlign = "left";
    ctx.fillText("zoomed out", x + pad, digFarHit.y + controlH / 2);
    ctx.textAlign = "right";
    ctx.fillText(digFar ? "digs" : "no tool", x + w - pad, digFarHit.y + controlH / 2);
    ctx.textAlign = "left";
    ctx.fillText("awake chunks", x + pad, simAreaHit.y + controlH / 2);
    ctx.textAlign = "right";
    ctx.fillText(showSimArea ? "shown" : "hidden", x + w - pad, simAreaHit.y + controlH / 2);
    ctx.textAlign = "left";
    ctx.fillText("tool width", x + pad, fieldY + controlH / 2);
    ctx.fillText("tool height", x + pad, fieldY + controlH * 1.5);
    ctx.textAlign = "right";
    ctx.fillText("m", x + w - pad, fieldY + controlH / 2);
    ctx.fillText("m", x + w - pad, fieldY + controlH * 1.5);
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

  /* The strip is a ruler, linear in depth, from the surface at the top
     line to the centre at the bottom line. Its long dark band is the depth
     on screen, never shorter than one line. Lines near the pointer swell
     as on a dock. Band and swell ease toward where they should be. */
  var STRIP_REST = 7;
  var STRIP_BAND = 9;
  var STRIP_SWELL = 14;
  var STRIP_REACH = 7;
  var stripGeom = null;
  var stripPointer = null;
  var stripDrag = false;
  var stripShown = null;
  var stripHover = 0;
  var stripHoverU = 0;
  var stripLabelY = 0;
  var stripLast = 0;

  function scrollStripGeom() {
    var pad = 12;
    var y0 = pad;
    var y1 = Math.max(y0 + 40, cssH - pad);
    var n = Math.max(24, Math.round((y1 - y0) / 8) + 1);
    var right = cssW - pageMargin();
    var len = STRIP_REST + STRIP_BAND + STRIP_SWELL;
    return {
      x: right - len - 10,
      y: 0,
      w: len + 10 + pageMargin(),
      h: cssH,
      n: n,
      y0: y0,
      y1: y1,
      gap: (y1 - y0) / (n - 1),
      right: right
    };
  }

  /* Line i owns the depths from i/n to (i + 1)/n of the radius. */
  function stripU(g, depth) {
    return depth / R * g.n - 0.5;
  }

  function stripDepthAt(g, y) {
    var u = (y - g.y0) / g.gap;
    return clamp((u + 0.5) / g.n, 0, 1) * R;
  }

  function stripBand(g, v) {
    var fv = faceView(v);
    var a = stripU(g, clamp(fv.top, 0, R));
    var b = stripU(g, clamp(fv.top + fv.worldH, 0, R));
    if (b - a < 1) {
      var c = clamp((a + b) / 2, 0, g.n - 1);
      a = c - 0.5;
      b = c + 0.5;
    }
    return { a: a, b: b };
  }

  function bell(x) {
    return x < 1 ? 0.5 + 0.5 * Math.cos(Math.PI * x) : 0;
  }

  function mixHex(a, b, t) {
    var x = parseInt(a.slice(1), 16);
    var y = parseInt(b.slice(1), 16);
    var c = [];
    for (var k = 16; k >= 0; k -= 8) {
      c.push(Math.round(((x >> k) & 255) * (1 - t) + ((y >> k) & 255) * t));
    }
    return "rgb(" + c.join(",") + ")";
  }

  /* The round earth essentially fits in the sheet. */
  function globeInView(worldW) {
    var box = sheetBox();
    var px = box.w / Math.max(worldW, 1e-9);
    return (2 * R) * px < Math.min(box.w, box.h) * 1.35;
  }

  function drawScrollStrip(v) {
    var g = scrollStripGeom();
    var now = performance.now();
    var dt = stripLast ? Math.min(100, now - stripLast) : 0;
    stripLast = now;
    var target = stripBand(g, v);
    if (!stripShown || !stripGeom || stripGeom.n !== g.n) stripShown = target;
    stripGeom = g;
    var kBand = 1 - Math.exp(-dt / 90);
    stripShown = {
      a: lerp(stripShown.a, target.a, kBand),
      b: lerp(stripShown.b, target.b, kBand)
    };
    var on = stripPointer != null;
    if (on) {
      var u = (stripPointer - g.y0) / g.gap;
      stripHoverU = stripHover < 0.02 ? u : lerp(stripHoverU, u, 1 - Math.exp(-dt / 45));
      stripLabelY = stripPointer;
    }
    stripHover = lerp(stripHover, on ? 1 : 0, 1 - Math.exp(-dt / 120));

    ctx.save();
    ctx.lineCap = "butt";
    ctx.setLineDash([]);
    for (var i = 0; i < g.n; i++) {
      var band = Math.max(0, Math.min(i + 0.5, stripShown.b) - Math.max(i - 0.5, stripShown.a));
      var swell = stripHover * bell(Math.abs(i - stripHoverU) / STRIP_REACH);
      var len = STRIP_REST + STRIP_BAND * band + STRIP_SWELL * swell;
      var y = Math.round(g.y0 + i * g.gap) + 0.5;
      ctx.strokeStyle = mixHex(HAIRLINE, INK, Math.max(band, swell * 0.55));
      ctx.lineWidth = 1 + 0.6 * band;
      strokeLine(g.right - len, y, g.right, y);
    }
    if (stripHover > 0.02) {
      var text = formatTickDepth(stripDepthAt(g, stripLabelY));
      setFont(13);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      var tw = ctx.measureText(text).width;
      var tx = g.right - STRIP_REST - STRIP_BAND - STRIP_SWELL - 8;
      ctx.globalAlpha = smoothstep(stripHover);
      ctx.fillStyle = PAPER;
      ctx.fillRect(tx - tw - 5, stripLabelY - 9, tw + 9, 18);
      ctx.fillStyle = INK;
      ctx.fillText(text, tx, stripLabelY);
    }
    ctx.restore();
  }

  function pointerOnStrip(x, y) {
    var g = stripGeom;
    if (!g) return false;
    return x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h;
  }

  /* Alt-wheel scrolls by a fifth of the depth on screen. One notch
     (deltaY 100) is that far up or down. The shallow stop is the surface
     on screen. The deep stop is the centre in the middle of the screen. */
  function scrollByWheel(dy) {
    var worldW = currentWorldW();
    var v = viewOf(worldW);
    var shown = Math.min(R, v.top + v.worldH) - Math.max(0, v.top);
    if (!(shown > 1e-6)) shown = v.worldH;
    scrollT = scrollForTop(worldW, v.top + (dy / 100) * (shown / 5));
  }

  /* Dig cells on the centre face. A cell is a centimetre: x across the
     face, y down from the surface. The cells are lifted onto the curve of
     the surface at the middle of the painter's window. */
  function digLift() {
    var o = digPaint.origin();
    return surfaceY((o.x + digPaint.W / 2) / 100);
  }

  /* 0 far out, where only changed ground is shown over the hatch, to 1
     close in, where the cells replace it. */
  function digLook(px) {
    return smoothstep((px / 100 - 0.8) / 0.7);
  }

  function digFace(v) {
    var fv = faceView(v);
    var lift = digLift();
    return {
      fv: fv,
      sx: function (cx) { return fv.box.x + (cx / 100 - fv.left) * fv.px; },
      sy: function (cy) { return fv.box.y + (cy / 100 + lift - fv.top) * fv.pxY; },
      cx: function (sx) { return (fv.left + (sx - fv.box.x) / fv.px) * 100; },
      cy: function (sy) { return (fv.top + (sy - fv.box.y) / fv.pxY - lift) * 100; }
    };
  }

  /* The dig cell under a screen point, if that point is on the face. */
  function digCellAt(v, sx, sy) {
    var b = v.box;
    if (sx < b.x || sx > b.x + b.w || sy < b.y || sy > b.y + b.h) return null;
    var f = digFace(v);
    var x = f.cx(sx), y = f.cy(sy);
    if (Math.abs(x / 100) > FACE_HALF || y / 100 > digDepth()) return null;
    return { x: x, y: y, f: f };
  }

  var digPaintMs = 0;

  function drawDigCells(vp) {
    var cell = vp.px / 100;
    if (cell < 0.01) return;
    var t0 = performance.now();
    var o = digPaint.origin(), W = digPaint.W, H = digPaint.H;
    var look = digLook(vp.px);
    ctx.save();
    ctx.transform(cell, 0, 0, cell,
      vp.box.x + (o.x / 100 - vp.left) * vp.px,
      vp.box.y + (o.y / 100 + digLift() - vp.top) * vp.px);
    var floor = digDepth() * 100 - o.y;
    if (floor < H) {
      ctx.beginPath();
      ctx.rect(-W, -H, W * 3, floor + H);
      ctx.clip();
    }
    if (look < 1) digPaint.drawOverlay(ctx);
    if (look > 0) {
      ctx.globalAlpha = look;
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, W, H);
      digPaint.draw(ctx, 4);
    }
    ctx.restore();
    digPaintMs += performance.now() - t0;
  }

  /* Keeps the window under the middle of the view while the cells can be
     seen, with no more than 2.56 m of sky in it. */
  function digFollow(v) {
    if (v.px / 100 < 0.3) return;
    var fv = faceView(v);
    var x = clamp(v.left + v.worldW / 2, -FACE_HALF, FACE_HALF);
    var y = fv.top + fv.worldH / 2 - digLift();
    digPaint.follow(x * 100, Math.max(y * 100, digPaint.H / 2 - 256));
  }

  function digReachOf(fp) {
    var key = fp.x0 + "," + fp.y0 + "," + fp.x1;
    var now = performance.now();
    if (key !== digReach.key || now - digReach.at > 150) {
      digReach = { key: key, ok: DIG.canReach(fp), at: now };
    }
    return digReach.ok;
  }

  function drawDigHover(v) {
    if (!digHover || pan || modalOpen || hitRect(debugBox, digHover.x, digHover.y)) return;
    if (!digFar && digLook(v.px) < 0.5) return;
    var c = digCellAt(v, digHover.x, digHover.y);
    if (!c) return;
    var fp = DIG.footprint(c.x, c.y, toolW, toolH);
    var ok = digReachOf(fp);
    var x0 = c.f.sx(fp.x0), y0 = c.f.sy(fp.y0);
    var x1 = c.f.sx(fp.x1 + 1), y1 = c.f.sy(fp.y1 + 1);
    ctx.save();
    ctx.strokeStyle = ok ? INK : FAINT;
    ctx.lineWidth = 1;
    ctx.setLineDash(ok ? [] : [3, 3]);
    var bw = Math.max(3, Math.round(x1 - x0)), bh = Math.max(3, Math.round(y1 - y0));
    if (DIG.TOOLS[toolName].round) {
      ctx.beginPath();
      ctx.ellipse(Math.round(x0) + bw / 2, Math.round(y0) + bh / 2, bw / 2, bh / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, bw, bh);
    var here = DIG.at(c.x, c.y, toolName);
    var parts = [];
    if (here && here.mat !== DIG.AIR) {
      parts.push(here.name + (here.tooHard ? ", too hard for the " + toolName
        : ok && here.hitsLeft > 1 ? ", " + here.hitsLeft + " hits" : ""));
    }
    if (!ok) parts.push("out of reach");
    var label = parts.join(", ");
    if (label) {
      setFont(12);
      var tw = ctx.measureText(label).width;
      var lx = Math.max(x0, x1) + 8, ly = Math.min(y0, y1) - 6;
      ctx.fillStyle = PAPER;
      ctx.fillRect(lx - 3, ly - 12, tw + 6, 16);
      ctx.fillStyle = ok ? INK : FAINT;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(label, lx, ly);
    }
    ctx.restore();
  }

  /* The chunks scanned in the last substep, shaded on the face. */
  function drawSimArea(v) {
    var f = digFace(v), CS = DIG.CS, awake = DIG.awakeChunks();
    if (f.sx(CS) - f.sx(0) < 0.5) return;
    ctx.save();
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.07;
    for (var k = 0; k < awake.length; k++) {
      var cx = awake[k][0], cy = awake[k][1];
      var ax = f.sx(cx * CS), ay = f.sy(cy * CS);
      ctx.fillRect(ax, ay, f.sx((cx + 1) * CS) - ax, f.sy((cy + 1) * CS) - ay);
    }
    ctx.restore();
  }

  function digAt(sx, sy) {
    var v = viewOf(currentWorldW());
    if (!digFar && digLook(v.px) < 0.5) return false;
    var c = digCellAt(v, sx, sy);
    if (!c) return false;
    if (DIG.dig(c.x, c.y, toolW, toolH, toolName).ok) {
      var fp = DIG.footprint(c.x, c.y, toolW, toolH);
      var reach = Math.max(Math.abs(fp.x0), Math.abs(fp.x1 + 1)) / 100;
      faceGoal = clamp(Math.max(faceGoal, reach + FACE_ROOM), FACE_MIN / 2, FACE_MAX / 2);
    }
    digReach.key = "";
    return true;
  }

  /* Ground on screen is stepped closely unless the view is wider than
     coarseFrom; the rest coarsely. */
  function digFocus() {
    var v = viewOf(currentWorldW());
    if (v.worldW > coarseFrom) { DIG.focus(null); return; }
    var f = digFace(v), b = v.box, pad = DIG.CS;
    DIG.focus({ x0: f.cx(b.x) - pad, y0: f.cy(b.y) - pad, x1: f.cx(b.x + b.w) + pad, y1: f.cy(b.y + b.h) + pad });
  }

  function stepDig(now) {
    var dt = simLast ? Math.min(0.1, (now - simLast) / 1000) : 0;
    simAcc += dt;
    simLast = now;
    if (FACE_HALF < faceGoal) {
      FACE_HALF += Math.max(0.002, (faceGoal - FACE_HALF) * (1 - Math.exp(-dt / 0.35)));
      if (FACE_HALF > faceGoal) FACE_HALF = faceGoal;
    }
    digFocus();
    var n = 0, t0 = performance.now();
    while (simAcc >= 1 / 60 && n < 3 && performance.now() - t0 < SIM_BUDGET) {
      DIG.step();
      simAcc -= 1 / 60;
      n++;
    }
    if (simAcc >= 1 / 60) simAcc = 0;
    timeDig("sim", performance.now() - t0);
    digStats = DIG.stats();
  }

  function movePan(p) {
    var v = viewOf(currentWorldW());
    panX = clamp(pan.panX - (p.x - pan.x) / v.px, -R, R);
    scrollT = scrollForTop(v.worldW, pan.top - (p.y - pan.y) / (v.px * COS_E));
  }

  var modalOpen = false;
  var modalBox = null;
  var modalClose = null;

  function hitRect(r, x, y) {
    return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  /* The machines test sheet. Every elevation is drawn in millimetres with
     y up from its own ground line; the exploded drill is an isometric view
     with the drill axis along x. The sheet is 2000 x 1400 units, scaled into
     the modal, and reads the current inks so the dark ground applies. */
  var machineSheet = (function () {
    var W = 2000;
    var H = 1400;
    var PI = Math.PI;

    var PENS = {
      outline: ["ink", 1.35, []],
      part: ["mid", 0.85, []],
      thin: ["mid", 0.55, []],
      hidden: ["faint", 0.8, [5, 3]],
      center: ["faint", 0.6, [16, 3, 2, 3]],
      hatch: ["hatch", 0.5, []]
    };

    function pen(name) {
      var p = PENS[name];
      ctx.strokeStyle = { ink: INK, mid: MID, faint: FAINT, hatch: HATCH }[p[0]];
      ctx.lineWidth = p[1];
      ctx.setLineDash(p[2]);
    }

    function setFont(px, weight) {
      ctx.font = (weight || 400) + " " + px + "px ui-sans-serif, 'Helvetica Neue', Helvetica, Arial, sans-serif";
    }

    function text(s, x, y, px, color, align, weight) {
      setFont(px, weight);
      ctx.fillStyle = color;
      ctx.textAlign = align || "left";
      ctx.textBaseline = "middle";
      ctx.fillText(s, x, y);
    }

    /* ---------- millimetre view ---------- */

    var V = { s: 1, x: 0, y: 0 };

    function view(s, x, y) {
      V.s = s;
      V.x = x;
      V.y = y;
    }

    function X(x) { return V.x + x * V.s; }
    function Y(y) { return V.y - y * V.s; }

    function trace(pts, close) {
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) {
        if (i) ctx.lineTo(X(pts[i][0]), Y(pts[i][1]));
        else ctx.moveTo(X(pts[i][0]), Y(pts[i][1]));
      }
      if (close) ctx.closePath();
    }

    function fillWith(fill) {
      if (!fill) return;
      ctx.fillStyle = fill === true ? PAPER : fill;
      ctx.fill();
    }

    function line(x0, y0, x1, y1, p) {
      trace([[x0, y0], [x1, y1]]);
      pen(p);
      ctx.stroke();
    }

    function polyline(pts, p) {
      trace(pts, false);
      pen(p);
      ctx.stroke();
    }

    function poly(pts, p, fill) {
      trace(pts, true);
      fillWith(fill);
      pen(p);
      ctx.stroke();
    }

    function rectPts(x, y, w, h) {
      return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    }

    function rect(x, y, w, h, p, fill) {
      poly(rectPts(x, y, w, h), p, fill);
    }

    function circle(x, y, r, p, fill) {
      ctx.beginPath();
      ctx.arc(X(x), Y(y), r * V.s, 0, 2 * PI);
      fillWith(fill);
      pen(p);
      ctx.stroke();
    }

    function arcPts(cx, cy, r, a0, a1, n) {
      n = n || 32;
      var out = [];
      for (var i = 0; i <= n; i++) {
        var a = a0 + (a1 - a0) * i / n;
        out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
      return out;
    }

    function quad(p0, c, p1, n) {
      n = n || 12;
      var out = [];
      for (var i = 0; i <= n; i++) {
        var t = i / n;
        var a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, d = t * t;
        out.push([a * p0[0] + b * c[0] + d * p1[0], a * p0[1] + b * c[1] + d * p1[1]]);
      }
      return out;
    }

    function cubic(p0, c0, c1, p1, n) {
      n = n || 24;
      var out = [];
      for (var i = 0; i <= n; i++) {
        var t = i / n, u = 1 - t;
        var a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
        out.push([
          a * p0[0] + b * c0[0] + c * c1[0] + d * p1[0],
          a * p0[1] + b * c0[1] + c * c1[1] + d * p1[1]
        ]);
      }
      return out;
    }

    function roundRectPts(x, y, w, h, r) {
      return [].concat(
        arcPts(x + w - r, y + r, r, -PI / 2, 0, 8),
        arcPts(x + w - r, y + h - r, r, 0, PI / 2, 8),
        arcPts(x + r, y + h - r, r, PI / 2, PI, 8),
        arcPts(x + r, y + r, r, PI, 1.5 * PI, 8)
      );
    }

    function bar(a, b, w, p, fill) {
      var dx = b[0] - a[0], dy = b[1] - a[1];
      var l = Math.hypot(dx, dy);
      var nx = -dy / l * w / 2, ny = dx / l * w / 2;
      poly([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], p, fill);
    }

    /* Section lines, clipped to one or more rings (even-odd). */
    function hatch(rings, gap, deg) {
      ctx.save();
      ctx.beginPath();
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (var r = 0; r < rings.length; r++) {
        var pts = rings[r];
        for (var i = 0; i < pts.length; i++) {
          var sx = X(pts[i][0]), sy = Y(pts[i][1]);
          if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy);
          x0 = Math.min(x0, sx); x1 = Math.max(x1, sx);
          y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
        }
        ctx.closePath();
      }
      ctx.clip("evenodd");
      var a = (deg === undefined ? 45 : deg) * PI / 180;
      var ux = Math.cos(a), uy = -Math.sin(a);
      var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      var R = Math.hypot(x1 - x0, y1 - y0) / 2 + 2;
      pen("hatch");
      ctx.beginPath();
      for (var t = -R; t <= R; t += gap || 6) {
        ctx.moveTo(cx - uy * t - ux * R, cy + ux * t - uy * R);
        ctx.lineTo(cx - uy * t + ux * R, cy + ux * t + uy * R);
      }
      ctx.stroke();
      ctx.restore();
    }

    function ground(x0, x1, y) {
      line(x0, y, x1, y, "outline");
      pen("thin");
      ctx.beginPath();
      for (var t = X(x0) + 6; t <= X(x1); t += 12) {
        ctx.moveTo(t, Y(y));
        ctx.lineTo(t - 6, Y(y) + 6);
      }
      ctx.stroke();
    }

    function unitHash(a, b) {
      var h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
      return h - Math.floor(h);
    }

    /* Soil or gravel stipple inside a polygon. */
    function stipple(pts, step) {
      ctx.save();
      trace(pts, true);
      ctx.clip();
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (var i = 0; i < pts.length; i++) {
        x0 = Math.min(x0, X(pts[i][0])); x1 = Math.max(x1, X(pts[i][0]));
        y0 = Math.min(y0, Y(pts[i][1])); y1 = Math.max(y1, Y(pts[i][1]));
      }
      ctx.fillStyle = MID;
      for (var y = y0; y < y1; y += step) {
        for (var x = x0; x < x1; x += step) {
          var jx = unitHash(x, y) * step, jy = unitHash(y, x) * step;
          ctx.beginPath();
          ctx.arc(x + jx, y + jy, 0.55 + unitHash(x + 1, y) * 0.5, 0, 2 * PI);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    /* External tangent of two circles, on the side `pick` points to. */
    function tangent(c1, r1, c2, r2, pick) {
      var dx = c2[0] - c1[0], dy = c2[1] - c1[1];
      var l = Math.hypot(dx, dy);
      var ux = dx / l, uy = dy / l, px = -uy, py = ux;
      var co = (r1 - r2) / l, si = Math.sqrt(1 - co * co);
      var na = [co * ux + si * px, co * uy + si * py];
      var nb = [co * ux - si * px, co * uy - si * py];
      var n = na[0] * pick[0] + na[1] * pick[1] > nb[0] * pick[0] + nb[1] * pick[1] ? na : nb;
      return {
        a: [c1[0] + r1 * n[0], c1[1] + r1 * n[1]],
        b: [c2[0] + r2 * n[0], c2[1] + r2 * n[1]],
        angle: Math.atan2(n[1], n[0])
      };
    }

    /* ---------- dimensions ---------- */

    function arrowHead(x, y, angle) {
      var len = 8, spread = 2.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - len * Math.cos(angle) + spread * Math.sin(angle), y - len * Math.sin(angle) - spread * Math.cos(angle));
      ctx.lineTo(x - len * Math.cos(angle) - spread * Math.sin(angle), y - len * Math.sin(angle) + spread * Math.cos(angle));
      ctx.closePath();
      ctx.fill();
    }

    /* a, b: measured points; a2, b2: ends of the dimension line (screen). */
    function dimScreen(a, b, a2, b2, label) {
      ctx.save();
      pen("part");
      ctx.lineWidth = 0.8;
      ctx.fillStyle = INK;
      var ends = [[a, a2], [b, b2]];
      for (var i = 0; i < 2; i++) {
        var p = ends[i][0], q = ends[i][1];
        var ex = q[0] - p[0], ey = q[1] - p[1], el = Math.hypot(ex, ey);
        if (el < 4) continue;
        ex /= el; ey /= el;
        ctx.beginPath();
        ctx.moveTo(p[0] + ex * 3, p[1] + ey * 3);
        ctx.lineTo(q[0] + ex * 4, q[1] + ey * 4);
        ctx.stroke();
      }
      var dx = b2[0] - a2[0], dy = b2[1] - a2[1], l = Math.hypot(dx, dy);
      var ux = dx / l, uy = dy / l;
      var mx = (a2[0] + b2[0]) / 2, my = (a2[1] + b2[1]) / 2;
      setFont(12);
      var half = ctx.measureText(label).width / 2 + 6;
      ctx.beginPath();
      ctx.moveTo(a2[0], a2[1]);
      ctx.lineTo(mx - ux * half, my - uy * half);
      ctx.moveTo(mx + ux * half, my + uy * half);
      ctx.lineTo(b2[0], b2[1]);
      ctx.stroke();
      var ang = Math.atan2(uy, ux);
      arrowHead(a2[0], a2[1], ang + PI);
      arrowHead(b2[0], b2[1], ang);
      if (ang > PI / 2 - 0.01) ang -= PI;
      else if (ang < -PI / 2 - 0.01) ang += PI;
      ctx.translate(mx, my);
      ctx.rotate(ang);
      text(label, 0, 0, 12, INK, "center");
      ctx.restore();
    }

    function S(x, y) { return [X(x), Y(y)]; }

    function dimH(x0, y0, x1, y1, yLine, label) {
      dimScreen(S(x0, y0), S(x1, y1), S(x0, yLine), S(x1, yLine), label);
    }

    function dimV(x0, y0, x1, y1, xLine, label) {
      dimScreen(S(x0, y0), S(x1, y1), S(xLine, y0), S(xLine, y1), label);
    }

    function group(n) {
      return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    }

    /* ---------- sheet ---------- */

    var CELLS = [
      { x: 40, y: 40, w: 230, h: 580, name: "hand shovel", draw: shovel },
      { x: 270, y: 40, w: 330, h: 580, name: "pickaxe", draw: pickaxe },
      { x: 600, y: 40, w: 470, h: 580, name: "cable winch elevator cage", draw: cage },
      { x: 1070, y: 40, w: 380, h: 580, name: "vertical rotary drill", draw: rotaryDrill },
      { x: 1450, y: 40, w: 510, h: 580, name: "tunnel boring head", draw: boringHead },
      { x: 40, y: 620, w: 760, h: 390, name: "bucket conveyor", draw: conveyor },
      { x: 40, y: 1010, w: 760, h: 350, name: "water pump", draw: pump },
      { x: 800, y: 620, w: 1160, h: 740, name: "exploded drill", draw: explodedDrill }
    ];

    function drawCell(c, i) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(c.x, c.y, c.w, c.h);
      ctx.clip();
      c.draw(c);
      ctx.restore();
      ctx.save();
      ctx.setLineDash([]);
      ctx.strokeStyle = HAIRLINE;
      ctx.lineWidth = 0.6;
      ctx.strokeRect(c.x, c.y, c.w, c.h);
      text(String(i + 1), c.x + 10, c.y + 14, 10, FAINT);
      text(c.name, c.x + c.w / 2, c.y + c.h - 22, 13, INK, "center");
      ctx.restore();
    }

    function drawFrame() {
      ctx.save();
      ctx.setLineDash([]);
      ctx.strokeStyle = FRAME;
      ctx.lineWidth = 1.25;
      ctx.strokeRect(34, 34, W - 68, H - 68);
      ctx.lineWidth = 0.6;
      ctx.strokeRect(40, 40, W - 80, H - 80);

      var tb = { x: 1690, y: 1238, w: 260, h: 112 };
      ctx.fillStyle = PAPER;
      ctx.fillRect(tb.x, tb.y, tb.w, tb.h);
      ctx.strokeStyle = MID;
      ctx.lineWidth = 0.9;
      ctx.strokeRect(tb.x, tb.y, tb.w, tb.h);
      ctx.beginPath();
      ctx.moveTo(tb.x, tb.y + 46);
      ctx.lineTo(tb.x + tb.w, tb.y + 46);
      ctx.stroke();
      ctx.textBaseline = "alphabetic";
      setFont(16, 500);
      ctx.fillStyle = INK;
      ctx.textAlign = "left";
      ctx.fillText("6.371 km left", tb.x + 12, tb.y + 22);
      setFont(11);
      ctx.fillStyle = MID;
      ctx.fillText("machines \u2014 test sheet", tb.x + 12, tb.y + 38);
      var rows = [["units", "mm"], ["items", "8"], ["drawn", "24 Nov 2026"]];
      for (var i = 0; i < rows.length; i++) {
        var y = tb.y + 66 + i * 16;
        setFont(11);
        ctx.fillStyle = FAINT;
        ctx.textAlign = "left";
        ctx.fillText(rows[i][0], tb.x + 12, y);
        ctx.fillStyle = INK;
        ctx.textAlign = "right";
        ctx.fillText(rows[i][1], tb.x + tb.w - 12, y);
      }
      ctx.restore();
    }

    /* ---------- 1  hand shovel ---------- */

    function shovel(c) {
      view(0.45, c.x + c.w / 2 - 12, c.y + 500);

      var blade = [[-115, 290]]
        .concat(quad([-115, 160], [-108, 30], [0, 0]))
        .concat(quad([0, 0], [108, 30], [115, 160]))
        .concat([[115, 290]]);
      poly(blade, "outline", true);
      line(-115, 274, -36, 274, "part");
      line(36, 274, 115, 274, "part");
      polyline([[-14, 266], [0, 70], [14, 266]], "thin");

      poly([[-36, 282], [36, 282], [19, 450], [-19, 450]], "outline", true);
      polyline([[-16, 450], [-12, 310], [12, 310], [16, 450]], "hidden");
      circle(0, 405, 5, "part");
      circle(0, 330, 5, "part");

      rect(-17, 450, 34, 410, "outline", true);
      polyline([[-6, 470], [-5, 650], [-7, 820]], "thin");
      rect(-19, 820, 38, 50, "part", true);
      circle(0, 845, 4, "part");

      poly([[-17, 870], [-62, 935], [-62, 1000], [62, 1000], [62, 935], [17, 870]], "outline", true);
      poly([[-8, 890], [-46, 942], [-46, 968], [46, 968], [46, 942], [8, 890]], "part", true);
      line(-46, 984, 46, 984, "hidden");
      circle(-54, 984, 3, "part");
      circle(54, 984, 3, "part");

      line(0, -20, 0, 1020, "center");

      dimV(0, 0, 62, 1000, 150, "1 000");
      dimH(-115, 160, 115, 160, -60, "230");
    }

    /* ---------- 2  pickaxe ---------- */

    function pickaxe(c) {
      view(0.47, c.x + c.w / 2, c.y + 500);

      poly([[-20, 0], [20, 0], [21, 25], [16, 70], [16, 700], [22, 832], [-22, 832], [-16, 700], [-16, 70], [-21, 25]], "outline", true);
      polyline([[-5, 60], [-4, 400], [-6, 760]], "thin");

      var head = [[-40, 902]]
        .concat(quad([-40, 902], [-190, 898], [-320, 828]))
        .concat(quad([-320, 828], [-190, 858], [-40, 842]))
        .concat([[40, 842]])
        .concat(quad([40, 842], [190, 856], [316, 826]))
        .concat([[320, 860]])
        .concat(quad([320, 860], [190, 896], [40, 902]));
      poly(head, "outline", true);
      polyline([[-250, 853], [-320, 828]], "thin");
      line(308, 858, 304, 828, "thin");

      rect(-40, 832, 80, 78, "outline", true);
      polyline([[-22, 832], [-24, 910]], "hidden");
      polyline([[22, 832], [24, 910]], "hidden");
      poly([[-4, 910], [4, 910], [0, 864]], "hidden");

      line(0, -20, 0, 940, "center");
      line(-345, 865, 345, 865, "center");

      dimH(-320, 828, 320, 860, 975, "640");
      dimV(20, 0, 40, 910, 95, "910");
    }

    /* ---------- 3  cable winch elevator cage ---------- */

    function cage(c) {
      view(0.1, c.x + 180, c.y + 400);

      var soilL = rectPts(-950, -900, 300, 900);
      var soilR = rectPts(650, -900, 300, 900);
      hatch([soilL], 7, 45);
      hatch([soilR], 7, 45);
      line(-650, 0, -650, -900, "outline");
      line(650, 0, 650, -900, "outline");
      polyline([[-950, -900], [-80, -900], [-40, -860], [40, -940], [80, -900], [950, -900]], "thin");
      ground(-1300, -650, 0);
      ground(650, 2550, 0);

      [-1, 1].forEach(function (k) {
        var fx = k < 0 ? -900 : 650;
        rect(fx, -250, 250, 250, "part", true);
        hatch([rectPts(fx, -250, 250, 250)], 5, 135);
        rect(fx, -250, 250, 250, "part");
      });
      rect(1300, -220, 180, 220, "part", true);
      hatch([rectPts(1300, -220, 180, 220)], 5, 135);
      rect(1300, -220, 180, 220, "part");

      [-1, 1].forEach(function (k) {
        line(k * 600, -900, k * 600, 3180, "part");
        line(k * 620, -900, k * 620, 3180, "part");
        for (var y = 300; y < 3100; y += 700) line(k * 620, y, k * 700, y, "thin");
      });

      bar([780, 3100], [1390, 0], 90, "outline", true);
      rect(-800, 0, 100, 3180, "outline", true);
      rect(700, 0, 100, 3180, "outline", true);
      line(-785, 0, -785, 3180, "thin");
      line(-715, 0, -715, 3180, "thin");
      line(715, 0, 715, 3180, "thin");
      line(785, 0, 785, 3180, "thin");
      bar([-700, 2860], [-440, 3180], 60, "part", true);
      bar([700, 2860], [440, 3180], 60, "part", true);

      rect(-830, 3180, 1660, 120, "outline", true);
      line(-830, 3196, 830, 3196, "thin");
      line(-830, 3284, 830, 3284, "thin");

      var sheave = [190, 3500];
      poly([[80, 3300], [300, 3300], [260, 3470], [120, 3470]], "part", true);
      circle(sheave[0], sheave[1], 200, "outline", true);
      circle(sheave[0], sheave[1], 172, "part");
      circle(sheave[0], sheave[1], 45, "part");
      circle(sheave[0], sheave[1], 14, "part", MID);
      for (var k = 0; k < 6; k++) {
        var a = k * PI / 3 + PI / 12;
        line(sheave[0] + 45 * Math.cos(a), sheave[1] + 45 * Math.sin(a), sheave[0] + 172 * Math.cos(a), sheave[1] + 172 * Math.sin(a), "part");
      }

      rect(-550, 0, 1100, 2000, "outline", true);
      line(-550, 90, 550, 90, "part");
      line(-550, 1910, 550, 1910, "part");
      line(-500, 90, -500, 1910, "part");
      line(500, 90, 500, 1910, "part");
      [140, 1000, 1860].forEach(function (y) { line(-500, y, 500, y, "part"); });
      for (var gx = -400; gx <= 400; gx += 100) line(gx, 140, gx, 1860, "thin");
      [-1, 1].forEach(function (k) {
        rect(k < 0 ? -600 : 550, 1780, 50, 110, "part", true);
        rect(k < 0 ? -600 : 550, 110, 50, 110, "part", true);
      });
      rect(-560, 2000, 1120, 50, "part", true);
      polyline([[-500, 2050], [0, 2250], [500, 2050]], "part");
      circle(0, 2278, 28, "part", true);

      var drum = [1850, 560];
      poly([[1560, 90], [2140, 90], [1900, 560], [1800, 560]], "part", true);
      rect(2000, 90, 380, 300, "outline", true);
      for (var fx = 2240; fx <= 2360; fx += 30) line(fx, 110, fx, 370, "thin");
      rect(1450, 0, 950, 90, "outline", true);
      circle(drum[0], drum[1], 380, "outline", true);
      [330, 305, 280].forEach(function (r) { circle(drum[0], drum[1], r, "thin"); });
      for (var h = 0; h < 4; h++) {
        var ha = PI / 4 + h * PI / 2;
        circle(drum[0] + 180 * Math.cos(ha), drum[1] + 180 * Math.sin(ha), 40, "part");
      }
      circle(drum[0], drum[1], 70, "part");
      circle(drum[0], drum[1], 25, "part", MID);

      var t = tangent(sheave, 190, drum, 330, [1, 0.6]);
      line(0, 3500, 0, 2306, "outline");
      polyline(arcPts(sheave[0], sheave[1], 190, t.angle, PI, 24), "outline");
      line(t.a[0], t.a[1], t.b[0], t.b[1], "outline");

      line(sheave[0] - 260, sheave[1], sheave[0] + 260, sheave[1], "center");
      line(sheave[0], sheave[1] - 260, sheave[0], sheave[1] + 260, "center");
      line(drum[0] - 450, drum[1], drum[0] + 450, drum[1], "center");
      line(drum[0], drum[1] - 450, drum[0], drum[1] + 450, "center");
      line(0, -950, 0, -60, "center");

      dimV(-800, 0, 190, 3700, -1150, "3 700");
    }

    /* ---------- 4  vertical rotary drill ---------- */

    function rotaryDrill(c) {
      view(0.085, c.x + 140, c.y + 410);

      var outer = rectPts(-500, -1150, 1000, 1150);
      var hole = rectPts(-170, -1000, 340, 1000);
      hatch([outer, hole], 7, 45);
      polyline([[-170, 0], [-170, -1000], [170, -1000], [170, 0]], "outline");
      polyline([[-500, -1150], [-60, -1150], [-20, -1110], [40, -1190], [80, -1150], [500, -1150]], "thin");
      ground(-1300, -170, 0);
      ground(170, 2600, 0);

      rect(-40, -880, 80, 940, "outline", true);
      for (var y = -60; y > -860; y -= 220) {
        line(-150, y, 150, y - 110, "outline");
        line(150, y - 110, -150, y - 220, "hidden");
      }
      poly([[-150, -880], [150, -880], [90, -950], [0, -985], [-90, -950]], "outline", true);
      line(-90, -950, 0, -880, "thin");
      line(90, -950, 0, -880, "thin");

      rect(-650, 0, 160, 60, "part", true);
      rect(2100, 0, 160, 60, "part", true);
      rect(-700, 60, 3000, 180, "outline", true);
      for (var rx = -400; rx < 2300; rx += 300) line(rx, 60, rx, 240, "thin");
      line(-40, 60, -40, 240, "hidden");
      line(40, 60, 40, 240, "hidden");

      rect(-200, 240, 60, 4140, "outline", true);
      rect(140, 240, 60, 4140, "outline", true);
      var lace = [];
      for (var ly = 300, side = -1; ly < 4380; ly += 350, side = -side) lace.push([side * 140, ly]);
      polyline(lace, "thin");
      for (var by = 940; by < 4380; by += 700) line(-140, by, 140, by, "part");
      rect(-250, 4380, 500, 120, "outline", true);
      circle(0, 4440, 45, "part");
      circle(0, 4440, 10, "part", MID);

      var A = [-650, 240], B = [-200, 1900];
      var M = [A[0] + 0.58 * (B[0] - A[0]), A[1] + 0.58 * (B[1] - A[1])];
      bar(M, B, 50, "outline", true);
      bar(A, M, 110, "outline", true);
      circle(A[0], A[1], 30, "part", true);
      circle(B[0], B[1], 30, "part", true);
      circle(-170, 300, 30, "part", true);

      rect(-40, 360, 80, 2240, "outline", true);
      rect(-55, 1460, 110, 80, "outline", true);
      rect(-280, 240, 560, 120, "outline", true);
      rect(-80, 250, 160, 100, "hidden");

      rect(-320, 2600, 640, 560, "outline", true);
      [[-170, 2640], [170, 2640], [-170, 3120], [170, 3120]].forEach(function (p) { circle(p[0], p[1], 22, "part"); });
      circle(0, 2850, 170, "hidden");
      circle(0, 2850, 40, "hidden");
      circle(0, 3080, 60, "hidden");
      rect(-140, 3160, 280, 320, "outline", true);
      for (var fy = 3200; fy < 3460; fy += 40) line(-140, fy, 140, fy, "thin");
      line(0, 3080, 0, 3480, "hidden");

      polyline(cubic([320, 3000], [1000, 3250], [1350, 2300], [1500, 1300]), "outline");

      rect(900, 240, 1300, 1060, "outline", true);
      for (var lv = 420; lv <= 1120; lv += 70) line(1650, lv, 2100, lv, "thin");
      line(1550, 280, 1550, 1260, "part");
      rect(1480, 720, 40, 120, "part");
      rect(980, 300, 480, 560, "hidden");
      rect(1950, 1300, 70, 380, "outline", true);
      rect(1920, 1680, 130, 30, "outline", true);

      line(0, -1080, 0, 4560, "center");

      dimV(-650, 0, -250, 4500, -1100, "4 500");
    }

    /* ---------- 5  tunnel boring head ---------- */

    function boringHead(c) {
      view(0.13, c.x + c.w / 2, c.y + 270);

      circle(0, 0, 1500, "outline", true);
      circle(0, 0, 1400, "part");

      for (var m = 0; m < 6; m++) {
        var mid = m * PI / 3;
        var slot = arcPts(0, 0, 1360, mid - 0.2, mid + 0.2, 12).concat(arcPts(0, 0, 1110, mid + 0.2, mid - 0.2, 12));
        hatch([slot], 5, 45);
        poly(slot, "part");
        for (var sc = 0; sc < 3; sc++) {
          var r = 1150 + sc * 75, a = mid - 0.2;
          var px = r * Math.cos(a), py = r * Math.sin(a);
          cutter(px, py, a + PI / 2, 60, 44, "part");
        }
      }

      circle(0, 0, 950, "hidden");
      for (var d = 0; d < 8; d++) {
        var da = d * PI / 4 + PI / 8;
        circle(720 * Math.cos(da), 720 * Math.sin(da), 110, "hidden");
      }

      line(-1650, 0, 1650, 0, "center");
      line(0, -1650, 0, 1650, "center");

      for (var k = 0; k < 6; k++) {
        var sa = PI / 2 + k * PI / 3;
        var ux = Math.cos(sa), uy = Math.sin(sa), nx = -uy, ny = ux;
        line(320 * ux + 180 * nx, 320 * uy + 180 * ny, 1400 * ux + 180 * nx, 1400 * uy + 180 * ny, "part");
        line(320 * ux - 180 * nx, 320 * uy - 180 * ny, 1400 * ux - 180 * nx, 1400 * uy - 180 * ny, "part");
        for (var rr = 450 + 27 * k; rr < 1330; rr += 160) cutter(rr * ux, rr * uy, sa + PI / 2, 300, 70, "outline");
        cutter(1450 * ux, 1450 * uy, sa + PI / 2, 260, 60, "outline");
      }

      circle(0, 0, 320, "outline", true);
      [-150, -50, 50, 150].forEach(function (cy) { cutter(0, cy, 0, 240, 50, "outline"); });
      circle(0, 0, 30, "part");

      dimH(-1500, 0, 1500, 0, -1700, "\u00d8 3 000");
    }

    /* A disc cutter seen from the face: its housing, with the disc edge. */
    function cutter(cx, cy, ang, len, wid, p) {
      var ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
      var hl = len / 2, hw = wid / 2;
      poly([
        [cx - ux * hl - nx * hw, cy - uy * hl - ny * hw],
        [cx + ux * hl - nx * hw, cy + uy * hl - ny * hw],
        [cx + ux * hl + nx * hw, cy + uy * hl + ny * hw],
        [cx - ux * hl + nx * hw, cy - uy * hl + ny * hw]
      ], p, true);
      line(cx - ux * hl * 0.8, cy - uy * hl * 0.8, cx + ux * hl * 0.8, cy + uy * hl * 0.8, "thin");
    }

    /* ---------- 6  bucket conveyor ---------- */

    function conveyor(c) {
      view(0.095, c.x + 50, c.y + c.h - 60);

      var T = [400, 600], Hd = [6000, 2600], r = 220;
      var dx = Hd[0] - T[0], dy = Hd[1] - T[1], L = Math.hypot(dx, dy);
      var u = [dx / L, dy / L], n = [-u[1], u[0]];
      function at(s, o) { return [T[0] + u[0] * s + n[0] * o, T[1] + u[1] * s + n[1] * o]; }
      function local(s, pts, sign) {
        return pts.map(function (p) { return at(s + p[0], sign * (r + p[1])); });
      }

      ground(-300, 7300, 0);

      var pile = [[6250, 0], [6700, 560], [7150, 0]];
      poly(pile, "outline", true);
      stipple(pile, 7);

      poly([[250, 0], [550, 0], [460, 600], [340, 600]], "part", true);
      bar([5700, 0], [5950, 2600], 90, "outline", true);
      bar([6300, 0], [6050, 2600], 90, "outline", true);
      line(5770, 900, 6230, 900, "part");

      [1400, 3000, 4600].forEach(function (s) {
        var top = at(s, -90);
        rect(top[0] - 40, 0, 80, top[1], "outline", true);
        rect(top[0] - 90, 0, 180, 30, "part", true);
      });

      var bucket = [[-30, 240], [10, 0], [170, 0], [210, 240]];
      for (var s = 500; s < L - 400; s += 450) {
        var rb = local(s, bucket, -1);
        poly(rb, "thin", true);
        polyline(rb, "outline");
      }

      var stringer = [at(250, 90), at(L - 250, 90), at(L - 250, -90), at(250, -90)];
      poly(stringer, "outline", true);
      var zig = [];
      for (var zs = 250, side = 1; zs <= L - 250; zs += 180, side = -side) zig.push(at(zs, side * 90));
      polyline(zig, "thin");

      for (var is = 700; is < L - 400; is += 700) {
        var ia = at(is, r - 60), ib = at(is + 350, -(r - 60));
        line(ia[0], ia[1], at(is, 90)[0], at(is, 90)[1], "thin");
        line(ib[0], ib[1], at(is + 350, -90)[0], at(is + 350, -90)[1], "thin");
        circle(ia[0], ia[1], 50, "part", true);
        circle(ib[0], ib[1], 50, "part", true);
      }

      var motor = [5650, 1650];
      poly([[5300, 1500], [5750, 1500], [5830, 1180], [5760, 1180]], "part", true);
      rect(5300, 1500, 450, 300, "outline", true);
      for (var mx = 5340; mx < 5560; mx += 30) line(mx, 1520, mx, 1780, "thin");
      circle(motor[0], motor[1], 70, "part", true);

      var topRun = [at(0, r), at(L, r)], botRun = [at(0, -r), at(L, -r)];
      var na = Math.atan2(n[1], n[0]);
      polyline([topRun[0], topRun[1]], "outline");
      polyline([botRun[0], botRun[1]], "outline");
      polyline(arcPts(T[0], T[1], r, na, na + PI, 20), "outline");
      polyline(arcPts(Hd[0], Hd[1], r, na - PI, na, 20), "outline");

      [T, Hd].forEach(function (p) {
        circle(p[0], p[1], 200, "part", true);
        circle(p[0], p[1], 60, "part");
        circle(p[0], p[1], 22, "part", MID);
      });

      var chain = [tangent(Hd, 130, motor, 70, [1, 0]), tangent(Hd, 130, motor, 70, [-1, 0])];
      circle(Hd[0], Hd[1], 130, "thin");
      chain.forEach(function (t) { line(t.a[0], t.a[1], t.b[0], t.b[1], "part"); });

      for (var bs = 500; bs < L - 400; bs += 450) {
        var bk = local(bs, bucket, 1);
        poly([bk[0], bk[1], bk[2], bk[3], at(bs + 210, r + 240)], "part", true);
        polyline(bk, "outline");
        var soil = [at(bs + 0, r + 150), at(bs + 180, r + 150), at(bs + 200, r + 230), at(bs - 20, r + 230)];
        stipple(soil, 4);
      }

      var hopper = [[-150, 1700], [1250, 1700], [1000, 1320], [300, 1080]];
      poly(hopper, "outline", true);
      polyline([[-80, 1670], [270, 1110]], "thin");
      polyline([[1185, 1670], [985, 1355]], "thin");
      stipple([[-130, 1690], [1230, 1690], [1050, 1500], [140, 1500]], 6);

      var chute = [[6150, 2450], [6430, 2470], [6820, 1360], [6600, 1300]];
      poly(chute, "outline", true);
      line(6300, 2430, 6700, 1340, "thin");

      line(T[0] - 300, T[1], T[0] + 300, T[1], "center");
      line(Hd[0] - 300, Hd[1], Hd[0] + 300, Hd[1], "center");
      line(T[0], T[1] - 300, T[0], T[1] + 300, "center");
      line(Hd[0], Hd[1] - 300, Hd[0], Hd[1] + 300, "center");

      var a = at(0, r), b = at(L, r), a2 = at(0, r + 420), b2 = at(L, r + 420);
      dimScreen(S(a[0], a[1]), S(b[0], b[1]), S(a2[0], a2[1]), S(b2[0], b2[1]), group(Math.round(L / 10) * 10));
    }

    /* ---------- 7  water pump ---------- */

    function pump(c) {
      view(0.33, c.x + 120, c.y + c.h - 75);
      var axis = 380;

      ground(-300, 1700, 0);
      rect(-100, 0, 1650, 90, "outline", true);
      line(-100, 20, 1550, 20, "thin");
      line(0, -150, 0, 90, "hidden");
      line(1450, -150, 1450, 90, "hidden");

      rect(60, 90, 160, 40, "part", true);
      poly([[400, 90], [650, 90], [620, 240], [430, 240]], "outline", true);
      rect(1040, 90, 110, 80, "outline", true);
      rect(1300, 90, 110, 80, "outline", true);

      rect(-150, 270, 30, 300, "outline", true);
      rect(-120, 320, 120, 200, "outline", true);
      line(-150, 290, -120, 290, "hidden");
      line(-150, 550, -120, 550, "hidden");
      var casing = roundRectPts(0, 120, 280, 520, 70);
      var cavity = roundRectPts(28, 148, 224, 464, 46);
      poly(casing, "outline", true);
      rect(70, 640, 140, 80, "outline", true);
      rect(40, 720, 200, 25, "outline", true);
      line(60, 720, 60, 745, "hidden");
      line(220, 720, 220, 745, "hidden");

      rect(280, 260, 70, 240, "outline", true);
      rect(350, 240, 350, 280, "outline", true);
      circle(520, 300, 16, "part");
      line(370, 300, 680, 300, "hidden");

      ctx.save();
      ctx.beginPath();
      ctx.rect(X(-200), Y(800), (1000 + 200) * V.s, (800 - axis) * V.s);
      ctx.clip();
      hatch([casing, cavity], 5, 45);
      poly(cavity, "part");
      ctx.restore();

      hatch([rectPts(280, 465, 70, 35)], 5, 45);
      hatch([rectPts(350, 490, 350, 30)], 5, 45);
      hatch([rectPts(350, 420, 25, 70)], 5, 45);
      hatch([rectPts(675, 420, 25, 70)], 5, 45);
      polyline([[280, 465], [375, 465]], "part");
      polyline([[375, 420], [375, 490], [675, 490], [675, 420]], "part");

      [395, 610].forEach(function (bx) {
        rect(bx, 420, 50, 60, "part", true);
        line(bx, 420, bx + 50, 480, "part");
        line(bx, 480, bx + 50, 420, "part");
      });
      rect(292, 420, 40, 28, "part", true);
      hatch([rectPts(292, 420, 40, 28)], 4, 135);

      line(150, 420, 760, 420, "outline");
      line(150, 340, 700, 340, "hidden");
      line(700, 340, 760, 340, "outline");
      line(150, 340, 150, 420, "part");

      var shroudF = quad([60, 455], [80, 590], [196, 590]).concat(quad([196, 572], [98, 572], [78, 455]));
      hatch([shroudF], 4, 135);
      poly(shroudF, "part");
      hatch([rectPts(196, 420, 22, 170)], 4, 135);
      rect(196, 420, 22, 170, "part");
      hatch([rectPts(180, 380, 82, 40)], 4, 135);
      rect(180, 380, 82, 40, "part");
      polyline(quad([88, 462], [150, 470], [196, 525]), "thin");
      polyline(quad([110, 520], [160, 530], [196, 560]), "thin");
      rect(150, 380, 30, 32, "part", true);

      polyline(quad([60, 305], [80, 170], [196, 170]), "hidden");
      line(207, 170, 207, 340, "hidden");

      rect(730, 280, 215, 200, "hidden");
      rect(760, 320, 70, 120, "outline", true);
      rect(845, 320, 70, 120, "outline", true);
      rect(830, 335, 15, 90, "part", true);
      rect(915, 350, 45, 60, "part", true);

      rect(960, 150, 60, 460, "outline", true);
      rect(1020, 170, 400, 420, "outline", true);
      for (var fy = 195; fy < 580; fy += 38) line(1035, fy, 1405, fy, "thin");
      poly([[1420, 190], [1495, 215], [1520, 380], [1495, 545], [1420, 570]], "outline", true);
      for (var gy = 240; gy <= 520; gy += 35) line(1480, gy, 1505, gy, "thin");
      rect(1120, 590, 170, 70, "outline", true);
      rect(1290, 610, 30, 30, "part", true);
      rect(1040, 210, 360, 340, "hidden");
      rect(1060, 300, 320, 160, "hidden");

      line(-250, axis, 1600, axis, "center");

      dimH(-150, 270, 1520, 380, -100, "1 670");
      dimV(1550, 0, 1520, axis, 1640, "380");
    }

    /* ---------- 8  exploded drill (isometric, drill axis along x) ---------- */

    var ISO = { s: 0.32, x: 0, y: 0 };
    var C30 = Math.cos(PI / 6), S30 = 0.5;
    var VIS0 = -PI / 4, VIS1 = 3 * PI / 4;

    function P(x, y, z) {
      return [ISO.x + ISO.s * (-x * C30 + y * C30), ISO.y + ISO.s * (x * S30 + y * S30 - z)];
    }

    function ring(x, cy, cz, r, a0, a1, n) {
      n = n || 48;
      var out = [];
      for (var i = 0; i <= n; i++) {
        var a = a0 + (a1 - a0) * i / n;
        out.push(P(x, cy + r * Math.cos(a), cz + r * Math.sin(a)));
      }
      return out;
    }

    function sTrace(pts, close) {
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) {
        if (i) ctx.lineTo(pts[i][0], pts[i][1]);
        else ctx.moveTo(pts[i][0], pts[i][1]);
      }
      if (close) ctx.closePath();
    }

    function sPoly(pts, p, fill) {
      sTrace(pts, true);
      fillWith(fill);
      pen(p);
      ctx.stroke();
    }

    function sLine(pts, p) {
      sTrace(pts, false);
      pen(p);
      ctx.stroke();
    }

    /* Cylinder from x0 (far) to x1 (near); the near face is whole, the far
       face shows only its outer half. */
    function cyl(x0, x1, r, cy, cz, p) {
      cy = cy || 0;
      cz = cz || 0;
      var hull = ring(x0, cy, cz, r, VIS0, VIS1).concat(ring(x1, cy, cz, r, VIS1, VIS1 + PI));
      sPoly(hull, p || "outline", true);
      sPoly(ring(x1, cy, cz, r, 0, 2 * PI, 64), p || "outline", true);
    }

    function bands(x0, x1, step, r, cy, cz) {
      for (var x = x0; x <= x1; x += step) sLine(ring(x, cy || 0, cz || 0, r, VIS0, VIS1, 24), "thin");
    }

    function faceHoles(x, rc, rh, count, phase) {
      for (var i = 0; i < count; i++) {
        var a = phase + i * 2 * PI / count;
        sPoly(ring(x, rc * Math.cos(a), rc * Math.sin(a), rh, 0, 2 * PI, 16), "part");
      }
    }

    function toothProfile(rRoot, rTip, teeth) {
      var per = 2 * PI / teeth, out = [];
      var steps = [[0, rRoot], [0.1, rRoot], [0.25, rTip], [0.45, rTip], [0.6, rRoot]];
      for (var k = 0; k < teeth; k++) {
        for (var j = 0; j < steps.length; j++) out.push([k * per + steps[j][0] * per, steps[j][1]]);
      }
      return out;
    }

    function profileAt(x, cy, cz, prof) {
      return prof.map(function (q) { return P(x, cy + q[1] * Math.cos(q[0]), cz + q[1] * Math.sin(q[0])); });
    }

    function gear(x0, x1, rRoot, rTip, teeth, bore, cy, cz) {
      cy = cy || 0;
      cz = cz || 0;
      var prof = toothProfile(rRoot, rTip, teeth);
      var back = profileAt(x0, cy, cz, prof), front = profileAt(x1, cy, cz, prof);
      sPoly(back, "part", true);
      pen("part");
      ctx.beginPath();
      for (var i = 0; i < prof.length; i++) {
        if (prof[i][1] !== rTip) continue;
        var a = prof[i][0];
        if (Math.cos(a) + Math.sin(a) < -0.2) continue;
        ctx.moveTo(back[i][0], back[i][1]);
        ctx.lineTo(front[i][0], front[i][1]);
      }
      ctx.stroke();
      sPoly(front, "outline", true);
      sLine(ring(x1, cy, cz, rRoot * 0.8, 0, 2 * PI, 48), "thin");
      sPoly(ring(x1, cy, cz, bore, 0, 2 * PI, 24), "part", true);
    }

    function box(x0, x1, y0, y1, z0, z1) {
      sPoly([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], "outline", true);
      sPoly([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], "outline", true);
      sPoly([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], "outline", true);
    }

    function leader(anchor, at, num, name, side) {
      ctx.save();
      var dx = anchor[0] - at[0], dy = anchor[1] - at[1], l = Math.hypot(dx, dy);
      pen("part");
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(at[0] + dx / l * 11, at[1] + dy / l * 11);
      ctx.lineTo(anchor[0], anchor[1]);
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(anchor[0], anchor[1], 1.8, 0, 2 * PI);
      ctx.fill();
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      ctx.arc(at[0], at[1], 11, 0, 2 * PI);
      ctx.fill();
      ctx.stroke();
      text(String(num), at[0], at[1] + 0.5, 11, INK, "center");
      if (side < 0) text(name, at[0] - 17, at[1], 11, INK, "right");
      else text(name, at[0] + 17, at[1], 11, INK, "left");
      ctx.restore();
    }

    /* Surface points for leader anchors: upper-left and lower-right sides. */
    function up(x, r, cy, cz) { return P(x, (cy || 0) - 0.55 * r, (cz || 0) + 0.83 * r); }
    function down(x, r, cy, cz) { return P(x, (cy || 0) + 0.9 * r, (cz || 0) - 0.43 * r); }

    function explodedDrill(c) {
      ISO.x = c.x + 1040;
      ISO.y = c.y + 95;

      sLine([P(-160, 0, 0), P(3520, 0, 0)], "center");

      cyl(0, 70, 155);
      cyl(70, 440, 170);
      bands(110, 410, 30, 170);
      faceHoles(440, 140, 10, 4, PI / 4);
      box(140, 320, -80, 80, 150, 245);
      cyl(330, 360, 14, 80, 200, "part");
      cyl(440, 530, 28);
      box(470, 530, -8, 8, 26, 36);

      cyl(620, 680, 70);
      sPoly(ring(680, 0, 0, 28, 0, 2 * PI, 24), "part", true);
      for (var j = 0; j < 3; j++) {
        var ja = PI / 6 + j * 2 * PI / 3;
        cyl(680, 700, 22, 45 * Math.cos(ja), 45 * Math.sin(ja), "part");
      }
      cyl(710, 770, 70);
      sPoly(ring(770, 0, 0, 22, 0, 2 * PI, 24), "part", true);

      cyl(860, 900, 22);
      gear(900, 940, 50, 60, 12, 16);
      cyl(940, 990, 22);

      cyl(1080, 1110, 150);
      sPoly(ring(1110, 0, 0, 30, 0, 2 * PI, 24), "part", true);
      var planets = [PI / 2, PI / 2 + 2 * PI / 3, PI / 2 + 4 * PI / 3].map(function (a) {
        return [100 * Math.cos(a), 100 * Math.sin(a)];
      }).sort(function (p, q) { return (p[0] + p[1]) - (q[0] + q[1]); });
      planets.forEach(function (p) {
        cyl(1110, 1160, 14, p[0], p[1], "part");
      });
      planets.forEach(function (p) {
        sLine([P(1150, p[0], p[1]), P(1250, p[0], p[1])], "center");
        gear(1180, 1215, 40, 48, 11, 14, p[0], p[1]);
      });

      var ringProf = toothProfile(170, 155, 40);
      var inBack = profileAt(1440, 0, 0, ringProf), inFront = profileAt(1500, 0, 0, ringProf);
      cyl(1440, 1500, 210);
      ctx.save();
      sTrace(inFront, true);
      ctx.clip();
      ctx.fillStyle = PAPER;
      ctx.fill();
      sLine(inBack.concat([inBack[0]]), "thin");
      ctx.restore();
      sPoly(inFront, "outline");
      faceHoles(1500, 190, 9, 8, PI / 8);

      cyl(1700, 1740, 110);
      ctx.save();
      var bore = ring(1740, 0, 0, 55, 0, 2 * PI, 32);
      sTrace(bore, true);
      ctx.clip();
      ctx.fillStyle = PAPER;
      ctx.fill();
      sLine(ring(1700, 0, 0, 55, VIS1, VIS1 + PI, 24), "thin");
      ctx.restore();
      sPoly(bore, "outline");
      sLine(ring(1740, 0, 0, 96, 0, 2 * PI, 48), "thin");
      sLine(ring(1740, 0, 0, 68, 0, 2 * PI, 48), "thin");
      for (var b = 0; b < 12; b++) {
        var ba = b * PI / 6;
        var bp = P(1740, 82 * Math.cos(ba), 82 * Math.sin(ba));
        ctx.beginPath();
        ctx.arc(bp[0], bp[1], 3.6, 0, 2 * PI);
        ctx.fillStyle = PAPER;
        ctx.fill();
        pen("part");
        ctx.stroke();
      }

      cyl(1900, 1930, 140);
      faceHoles(1930, 115, 9, 6, 0);
      cyl(1930, 2130, 50);
      box(1960, 2100, -9, 9, 46, 58);
      cyl(2130, 2250, 95);
      bands(2150, 2230, 40, 95);
      for (var k = 0; k < 3; k++) {
        var ka = PI / 2 + k * 2 * PI / 3;
        var ux = Math.cos(ka), uy = Math.sin(ka), nx = -uy, ny = ux;
        sPoly([
          P(2250, 26 * ux + 10 * nx, 26 * uy + 10 * ny),
          P(2250, 85 * ux + 10 * nx, 85 * uy + 10 * ny),
          P(2250, 85 * ux - 10 * nx, 85 * uy - 10 * ny),
          P(2250, 26 * ux - 10 * nx, 26 * uy - 10 * ny)
        ], "part", true);
      }
      sPoly(ring(2250, 0, 0, 20, 0, 2 * PI, 24), "part", true);

      cyl(2370, 2970, 36);
      bands(2380, 2440, 12, 36);
      bands(2900, 2960, 12, 36);
      sLine([P(2470, 0, 36), P(2870, 0, 36)], "thin");

      cyl(3100, 3160, 40);
      bands(3110, 3150, 10, 40);
      cyl(3160, 3260, 110);
      for (var t = 0; t < 14; t++) {
        var ta = t * 2 * PI / 14;
        var w = 0.16;
        sPoly([
          P(3260, 104 * Math.cos(ta - w), 104 * Math.sin(ta - w)),
          P(3260, 132 * Math.cos(ta), 132 * Math.sin(ta)),
          P(3260, 104 * Math.cos(ta + w), 104 * Math.sin(ta + w))
        ], "part", true);
      }
      cone(3260, 3420, 110);

      leader(down(300, 170), [1932, 845], 1, "MOTOR", -1);
      leader(up(690, 70), [1600, 690], 2, "COUPLING", -1);
      leader(down(920, 60), [1690, 960], 3, "SUN GEAR", 1);
      leader(up(1095, 150), [1440, 750], 4, "PLANET CARRIER", -1);
      leader(down(1470, 210), [1620, 1070], 5, "RING GEAR", 1);
      leader(up(1720, 110), [1250, 860], 6, "BEARING", -1);
      leader(down(2050, 50), [1450, 1160], 7, "SPINDLE AND CHUCK", 1);
      leader(up(2700, 36), [1000, 1020], 8, "DRILL ROD", -1);
      leader(down(3210, 110), [1080, 1310], 9, "CUTTING HEAD", 1);

      var q = [0.5, C30];
      var a = P(2370, 36 * 0.71, -36 * 0.71), bb = P(2970, 36 * 0.71, -36 * 0.71);
      dimScreen(a, bb, [a[0] + q[0] * 42, a[1] + q[1] * 42], [bb[0] + q[0] * 42, bb[1] + q[1] * 42], "600");
    }

    /* Cone on the near face of x0, apex at x1, with carbide inserts. */
    function cone(x0, x1, r) {
      var A = P(x1, 0, 0);
      var base = ring(x0, 0, 0, r, 0, 2 * PI, 96);
      var lo = 0, hi = 0, angs = base.map(function (p) { return Math.atan2(p[1] - A[1], p[0] - A[0]); });
      for (var i = 1; i < angs.length; i++) {
        if (angs[i] < angs[lo]) lo = i;
        if (angs[i] > angs[hi]) hi = i;
      }
      function arc(from, to) {
        var out = [], i = from;
        while (true) {
          out.push(base[i]);
          if (i === to) break;
          i = (i + 1) % (base.length - 1);
        }
        return out;
      }
      var a1 = arc(lo, hi), a2 = arc(hi, lo);
      function far(pts) {
        var s = 0;
        pts.forEach(function (p) { s += Math.hypot(p[0] - A[0], p[1] - A[1]); });
        return s / pts.length;
      }
      var outer = far(a1) > far(a2) ? a1 : a2.slice().reverse();
      sPoly([A].concat(outer), "outline", true);
      for (var g = -30; g <= 120; g += 30) {
        var ga = g * PI / 180;
        var bp = P(x0, r * Math.cos(ga), r * Math.sin(ga));
        sLine([A, bp], "thin");
        [0.4, 0.7].forEach(function (f) {
          var px = A[0] + (bp[0] - A[0]) * f, py = A[1] + (bp[1] - A[1]) * f;
          ctx.beginPath();
          ctx.arc(px, py, 2.4 + f, 0, 2 * PI);
          ctx.fillStyle = PAPER;
          ctx.fill();
          pen("part");
          ctx.stroke();
        });
      }
    }

    /* ---------- page ---------- */

    function draw() {
      ctx.save();
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, W, H);
      for (var i = 0; i < CELLS.length; i++) drawCell(CELLS[i], i);
      drawFrame();
      ctx.restore();
    }

    return { w: W, h: H, draw: draw };
  })();

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
    ctx.lineWidth = 1.15;
    ctx.lineCap = "butt";
    strokeLine(close.x + 4, close.y + 4, close.x + close.w - 4, close.y + close.h - 4);
    strokeLine(close.x + close.w - 4, close.y + 4, close.x + 4, close.y + close.h - 4);
    ctx.strokeStyle = MID;
    ctx.lineWidth = 0.8;
    strokeLine(box.x, box.y + 36, box.x + box.w, box.y + 36);

    var inner = { x: box.x + 8, y: box.y + 44, w: box.w - 16, h: box.h - 52 };
    var k = Math.min(inner.w / machineSheet.w, inner.h / machineSheet.h);
    ctx.beginPath();
    ctx.rect(inner.x, inner.y, inner.w, inner.h);
    ctx.clip();
    ctx.translate(inner.x + (inner.w - machineSheet.w * k) / 2, inner.y + (inner.h - machineSheet.h * k) / 2);
    ctx.scale(k, k);
    machineSheet.draw();
    ctx.restore();
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
    digFollow(v);
    var t0 = performance.now();
    digPaint.recolor();
    digPaintMs = performance.now() - t0;

    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, cssW, cssH);

    hatchZoom = zoomScale(v);
    ctx.save();
    clipSheet(v.box);
    drawCutGlobe(v, faceView(v), tb);
    timeDig("paint", digPaintMs);
    if (showSimArea) drawSimArea(v);
    drawDigHover(v);
    ctx.restore();

    drawFrame(v, tb);
    drawScrollStrip(v);
    drawFps();
    drawDebug(v);
    if (modalOpen) drawMachinesModal();
  }

  function zoomBy(dy) {
    var y = pointerY == null ? cssH / 3 : pointerY;
    zoomAt(dy, y, pointerX);
  }

  function currentWorldW() {
    var aspect = sheetBox().w / Math.max(1, sheetBox().h);
    var forced = widthForLock(aspect);
    if (forced !== null) return forced;
    return clamp(Math.pow(10, logW), closeWidth(), farWidth(aspect));
  }

  /* Wheel zoom is about the point under the pointer. The horizon stays
     one third down when the pointer is on the surface. The deep stop is
     the centre in the middle of the screen. */
  function zoomAt(dy, screenY, screenX) {
    var before = viewOf(currentWorldW());
    var across = screenX == null ? null : before.left + (screenX - before.box.x) / before.px;
    var ay = cutAnchor(before.box);
    screenY = ay + (screenY - ay) / COS_E;
    var depth = before.top + (screenY - before.box.y) / before.px;
    lock = null;
    logW += dy * 0.00115;
    var aspect = before.box.w / Math.max(1, before.box.h);
    var worldW = clamp(Math.pow(10, logW), closeWidth(), farWidth(aspect));
    logW = Math.log10(worldW);
    var worldH = worldW / aspect;
    var top0 = shallowTop(worldH, before.box);
    var top1 = scrollRange(worldH, before.box).top1;
    var top;
    if (!(depth > 0)) {
      top = top0;
    } else {
      top = depth - (screenY - before.box.y) * worldH / before.box.h;
      if (top > top1) top = top1;
    }
    scrollT = scrollForTop(worldW, top);
    if (across !== null) {
      panX = clamp(across - (screenX - before.box.x) * worldW / before.box.w + worldW / 2, -R, R);
    }
  }

  function scrollForTop(worldW, top) {
    var box = sheetBox();
    var aspect = box.w / Math.max(1, box.h);
    var range = scrollRange(worldW / aspect, box);
    var span = range.top1 - range.top0;
    if (!(span > 1e-6)) return 0;
    return clamp((top - range.top0) / span, 0, 1);
  }

  /* Puts a depth in the middle of the screen, as far as the range allows. */
  function scrollToDepth(depth) {
    var worldW = currentWorldW();
    var v = viewOf(worldW);
    scrollT = scrollForTop(worldW, depth - v.worldH / 2);
  }

  function applyPreset(name) {
    if (name === "near" || name === "1") lock = "near";
    else if (name === "middle" || name === "crust" || name === "2") lock = "middle";
    else if (name === "globe" || name === "3") lock = "globe";
    else return false;
    scrollT = 0;
    panX = 0;
    return true;
  }

  function readLocation() {
    var q = new URLSearchParams(location.search);
    var zoom = (q.get("zoom") || "").toLowerCase();
    var hash = (location.hash || "").replace("#", "").toLowerCase();
    var dig = digByName(q.get("dig"));
    if (dig >= 0) digUnit = dig;
    var face = Number(q.get("face"));
    if (face > 0) FACE_HALF = faceGoal = clamp(face, FACE_MIN, FACE_MAX) / 2;
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
    stepDig(now);
    draw();
    requestAnimationFrame(onFrame);
  }

  window.addEventListener("resize", function () { resize(); });
  window.addEventListener("wheel", function (event) {
    event.preventDefault();
    if (modalOpen) return;
    var dy = event.deltaY;
    if (event.shiftKey && !dy) dy = event.deltaX;
    if (event.deltaMode === 1) dy *= 16;
    else if (event.deltaMode === 2) dy *= 400;
    dy *= event.shiftKey ? 1 : wheelSpeed;
    pointerY = event.clientY;
    pointerX = event.clientX;
    if (event.altKey) scrollByWheel(dy);
    else zoomBy(dy);
  }, { passive: false });

  function pointerXY(event) {
    return { x: event.clientX, y: event.clientY };
  }

  window.addEventListener("mousemove", function (event) {
    var p = pointerXY(event);
    pointerY = p.y;
    pointerX = p.x;
    digHover = null;
    if (pan) {
      movePan(p);
      return;
    }
    if (modalOpen) {
      canvas.style.cursor = hitRect(modalClose, p.x, p.y) ? "pointer" : "default";
      return;
    }
    if (sliderDrag) {
      slideTo(sliderDrag, p.x);
      return;
    }
    if (stripDrag) {
      stripPointer = p.y;
      scrollToDepth(stripDepthAt(stripGeom, p.y));
      return;
    }
    if (sliderAt(p.x, p.y)) {
      canvas.style.cursor = "ew-resize";
      return;
    }
    if (pointerOnDebug(p.x, p.y) || hitRect(machinesHit, p.x, p.y) || hitRect(toolModeHit, p.x, p.y) || hitRect(digFarHit, p.x, p.y) ||
      hitRect(simAreaHit, p.x, p.y) || pointerOnTheme(p.x, p.y) ||
      hitRect(digUpHit, p.x, p.y) || hitRect(digDownHit, p.x, p.y)) {
      canvas.style.cursor = "pointer";
      return;
    }
    if (pointerOnStrip(p.x, p.y)) {
      stripPointer = p.y;
      canvas.style.cursor = "ns-resize";
    } else {
      stripPointer = null;
      digHover = p;
      canvas.style.cursor = "crosshair";
    }
  });

  window.addEventListener("mousedown", function (event) {
    if (event.target.tagName === "INPUT") return;
    var p = pointerXY(event);
    if ((event.button === 1 || event.button === 2) && !modalOpen) {
      pan = { x: p.x, y: p.y, panX: panX, top: viewOf(currentWorldW()).top };
      canvas.style.cursor = "grabbing";
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;
    if (modalOpen) {
      if (!hitRect(modalBox, p.x, p.y) || hitRect(modalClose, p.x, p.y)) modalOpen = false;
      event.preventDefault();
      return;
    }
    if (hitRect(toolModeHit, p.x, p.y)) {
      var names = DIG.TOOL_NAMES, at = names.indexOf(toolName);
      var by = hitRect(toolPrevHit, p.x, p.y) ? -1 : 1;
      toolName = names[(at + by + names.length) % names.length];
      digReach.key = "";
      event.preventDefault();
      return;
    }
    if (hitRect(digFarHit, p.x, p.y)) {
      digFar = !digFar;
      event.preventDefault();
      return;
    }
    if (hitRect(simAreaHit, p.x, p.y)) {
      showSimArea = !showSimArea;
      event.preventDefault();
      return;
    }
    if (hitRect(machinesHit, p.x, p.y)) {
      modalOpen = true;
      event.preventDefault();
      return;
    }
    var hit = debugOpen ? sliderAt(p.x, p.y) : null;
    if (hit) {
      sliderDrag = hit;
      slideTo(hit, p.x);
      event.preventDefault();
      return;
    }
    if (hitRect(digUpHit, p.x, p.y) || hitRect(digDownHit, p.x, p.y)) {
      var step = hitRect(digUpHit, p.x, p.y) ? -1 : 1;
      digUnit = clamp(digUnit + step, 0, COLUMN.length - 1);
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
    if (debugOpen && hitRect(debugBox, p.x, p.y)) return;
    if (!pointerOnStrip(p.x, p.y)) {
      if (digAt(p.x, p.y)) event.preventDefault();
      return;
    }
    stripDrag = true;
    stripPointer = p.y;
    scrollToDepth(stripDepthAt(stripGeom, p.y));
    event.preventDefault();
  });

  window.addEventListener("mouseup", function () {
    stripDrag = false;
    sliderDrag = null;
    if (pan) canvas.style.cursor = "crosshair";
    pan = null;
  });
  window.addEventListener("contextmenu", function (event) { event.preventDefault(); });
  document.addEventListener("mouseleave", function () {
    if (!stripDrag) stripPointer = null;
    digHover = null;
  });

  window.addEventListener("keydown", function (event) {
    if (event.target.tagName === "INPUT") return;
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
    scrollTo: function (depth) {
      scrollToDepth(depth);
    },
    dig: function (name) {
      var i = typeof name === "number" ? name : digByName(name);
      if (i >= 0 && i < COLUMN.length) digUnit = i;
      return COLUMN[digUnit].name;
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
        strip: stripGeom,
        dug: COLUMN[digUnit].name
      };
    }
  };

  applyTheme(readTheme());
  digPaint = makeDigPaint(DIG, digColors());
  resize();
  readLocation();
  window.addEventListener("load", readLocation);
  requestAnimationFrame(onFrame);
})();
