/* Line sphere test sheet for "6.371 km left".
   Open index.html in a browser (no server). The wheel zooms the sheet. */

(function () {
  "use strict";

  var PAPER = "#f2efe7";
  var INK = "#2c3a5a";
  var GREY = "#6f7884";
  var FAINT = "#9aa2ac";
  var HAIR = "#c4c6c4";

  /* The sheet is drawn in fixed units and fitted to the window. */
  var W = 1600;
  var H = 900;

  /* Unit sphere at the origin, pole on +y, camera above and in front. */
  var CAM = [0, 1.75, 3.2];
  var TARGET = [0, 0.1, 0];
  var FOCAL = 1.5;
  var CENTER_Y = 0.55;

  /* The cut removes the upper front quarter: |longitude| < WEDGE and y > 0. */
  var WEDGE = 45;
  var EARTH_KM = 6371;

  /* Layers from the surface down, true scale. Hatch spacing in sphere units. */
  var LAYERS = [
    { name: "crust", top: 0, bottom: 35 },
    { name: "upper mantle", top: 35, bottom: 660, hatch: [{ ang: 45, gap: 0.018 }] },
    { name: "lower mantle", top: 660, bottom: 2890, hatch: [{ ang: 45, gap: 0.04 }] },
    { name: "outer core", top: 2890, bottom: 5150, hatch: [{ ang: -45, gap: 0.026 }] },
    { name: "inner core", top: 5150, bottom: 6371, hatch: [{ ang: 45, gap: 0.02 }, { ang: -45, gap: 0.02 }] }
  ];

  /* Boundaries labelled on the axis once the sheet is zoomed in. */
  var MAIN_MARKS = [
    { km: 35, name: "Moho" },
    { km: 660, name: "upper / lower mantle" },
    { km: 2890, name: "core–mantle boundary" },
    { km: 5150, name: "inner core boundary" },
    { km: 6371, name: "centre" }
  ];

  /* Finer boundaries that fade in with zoom (PREM and the 410/520/660 seismic set). */
  var DETAIL = [
    { km: 410, name: "olivine → wadsleyite", zoom: 3 },
    { km: 520, name: "wadsleyite → ringwoodite", zoom: 4 },
    { km: 2741, name: "top of D″", zoom: 4 },
    { km: 220, name: "base of low-velocity zone", zoom: 6 },
    { km: 80, name: "base of lithosphere (PREM lid)", zoom: 8 },
    { km: 15, name: "upper / lower crust", zoom: 24 }
  ];

  /* Real depths along the shaft, for scale; they need the deepest zoom. */
  var SHAFT_MARKS = [
    { km: 3.74, label: "3.7 km  Mponeng, deepest mine", zoom: 300 },
    { km: 9.101, label: "9.1 km  KTB borehole", zoom: 150 },
    { km: 12.262, label: "12.3 km  Kola SG-3, deepest borehole", zoom: 150 },
    { km: 15, label: "15 km  real physics ends here", zoom: 40 }
  ];

  /* Section rings by angle from the pole, in degrees. */
  var RINGS = [
    { a: 4, s: "grey" },
    { a: 7, s: "ink" },
    { a: 10, s: "grey" },
    { a: 13, s: "ink" },
    { a: 16, s: "faint" },
    { a: 19, s: "ink" },
    { a: 23, s: "grey" },
    { a: 27, s: "ink" },
    { a: 32, s: "faint" },
    { a: 37, s: "grey" },
    { a: 43, s: "dash" },
    { a: 50, s: "grey" },
    { a: 58, s: "dash" },
    { a: 67, s: "faint" },
    { a: 78, s: "dash" },
    { a: 90, s: "ink" },
    { a: 104, s: "dash" },
    { a: 120, s: "faint" }
  ];

  var MERIDIANS = [-120, -80, 80, 120];

  var POSTS = [
    { a: 13, lon: -150, h: 0.05 },
    { a: 19, lon: -125, h: 0.04 },
    { a: 27, lon: -100, h: 0.065 },
    { a: 10, lon: 155, h: 0.06 },
    { a: 23, lon: 120, h: 0.075 },
    { a: 37, lon: 96, h: 0.045 }
  ];

  var canvas = document.getElementById("sheet");
  var ctx = canvas.getContext("2d");
  var basis = cameraBasis();
  var view = { k: 1, x: 0, y: 0 };
  var fit = { s: 1, ox: 0, oy: 0 };
  var offsetY = 0;
  var limbBox = null;

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) {
    var l = Math.hypot(a[0], a[1], a[2]);
    return [a[0] / l, a[1] / l, a[2] / l];
  }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function rad(d) { return d * Math.PI / 180; }

  function cameraBasis() {
    var f = norm(sub(TARGET, CAM));
    var r = norm(cross(f, [0, 1, 0]));
    var u = cross(r, f);
    return { f: f, r: r, u: u };
  }

  function project(p) {
    var d = sub(p, CAM);
    var z = dot(d, basis.f);
    if (z < 0.05) return null;
    return {
      x: W / 2 + (dot(d, basis.r) / z) * FOCAL * W / 2,
      y: offsetY - (dot(d, basis.u) / z) * FOCAL * W / 2
    };
  }

  function removed(p) {
    return p[1] > 1e-9 && Math.abs(Math.atan2(p[0], p[2])) < rad(WEDGE);
  }

  function visible(p) {
    return dot(p, CAM) > 1 && !removed(p);
  }

  function onSphere(a, lon) {
    var t = rad(a);
    var l = rad(lon);
    return [Math.sin(t) * Math.sin(l), Math.cos(t), Math.sin(t) * Math.cos(l)];
  }

  function radiusAt(km) { return 1 - km / EARTH_KM; }

  /* Sheet units to device pixels. */
  function sx(x) { return fit.ox + (x * view.k + view.x) * fit.s; }
  function sy(y) { return fit.oy + (y * view.k + view.y) * fit.s; }

  function dpr() { return window.devicePixelRatio || 1; }

  function pen(color, width, dash) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width * dpr();
    ctx.setLineDash(dash ? dash.map(function (d) { return d * dpr(); }) : []);
  }

  function line(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(sx(x1), sy(y1));
    ctx.lineTo(sx(x2), sy(y2));
    ctx.stroke();
  }

  /* Strokes a sampled 3D curve, breaking it wherever keep() fails. */
  function curve(pointAt, steps, keep) {
    var open = false;
    ctx.beginPath();
    for (var i = 0; i <= steps; i++) {
      var p = pointAt(i / steps);
      var q = !keep || keep(p) ? project(p) : null;
      if (!q) { open = false; continue; }
      if (open) ctx.lineTo(sx(q.x), sy(q.y));
      else ctx.moveTo(sx(q.x), sy(q.y));
      open = true;
    }
    ctx.stroke();
  }

  function ringStyle(s) {
    if (s === "ink") pen(INK, 1.1);
    else if (s === "grey") pen(GREY, 0.75);
    else if (s === "dash") pen(GREY, 0.75, [7, 5]);
    else pen(FAINT, 0.6);
  }

  /* Cut faces as 2D planes: a runs away from the axis, b up it (or forward on the floor).
     cons are half-planes ca * a + cb * b >= 0 that bound the face. */
  function sideFace(lon) {
    var s = Math.sin(rad(lon));
    var c = Math.cos(rad(lon));
    return {
      at: function (a, b) { return [a * s, b, a * c]; },
      cons: [[1, 0], [0, 1]]
    };
  }

  var FLOOR = {
    at: function (a, b) { return [a, 0, b]; },
    cons: [[-1, 1], [1, 1]]
  };

  var FACES = [sideFace(-WEDGE), sideFace(WEDGE), FLOOR];

  /* Hatch lines are clipped exactly, so they stay clean at deep zoom. */
  function drawHatch(face, rIn, rOut, ang, gap) {
    var dx = Math.cos(rad(ang));
    var dy = Math.sin(rad(ang));
    ctx.beginPath();
    for (var c = -rOut + gap / 2; c < rOut; c += gap) {
      var lo = -Infinity;
      var hi = Infinity;
      face.cons.forEach(function (k) {
        var p = c * (k[1] * dx - k[0] * dy);
        var q = k[0] * dx + k[1] * dy;
        if (Math.abs(q) < 1e-12) { if (p < 0) hi = -Infinity; }
        else if (q > 0) lo = Math.max(lo, -p / q);
        else hi = Math.min(hi, -p / q);
      });
      var so = Math.sqrt(rOut * rOut - c * c);
      var spans = [[-so, so]];
      if (Math.abs(c) < rIn) {
        var si = Math.sqrt(rIn * rIn - c * c);
        spans = [[-so, -si], [si, so]];
      }
      spans.forEach(function (sp) {
        var s0 = Math.max(sp[0], lo);
        var s1 = Math.min(sp[1], hi);
        if (s1 <= s0) return;
        var p0 = project(face.at(-c * dy + s0 * dx, c * dx + s0 * dy));
        var p1 = project(face.at(-c * dy + s1 * dx, c * dx + s1 * dy));
        ctx.moveTo(sx(p0.x), sy(p0.y));
        ctx.lineTo(sx(p1.x), sy(p1.y));
      });
    }
    ctx.stroke();
  }

  function boundary(r) {
    [-WEDGE, WEDGE].forEach(function (lon) {
      var f = sideFace(lon);
      curve(function (t) { var u = t * Math.PI / 2; return f.at(r * Math.sin(u), r * Math.cos(u)); }, 1440);
    });
    curve(function (t) { var l = rad(-WEDGE + t * 2 * WEDGE); return [r * Math.sin(l), 0, r * Math.cos(l)]; }, 1440);
  }

  /* 0 below half the threshold zoom, 1 from the threshold up. */
  function reveal(k0) {
    return Math.min(1, Math.max(0, Math.log2(view.k / k0) + 1));
  }

  function drawCut() {
    pen(FAINT, 0.45);
    LAYERS.forEach(function (layer) {
      if (!layer.hatch) return;
      var rOut = radiusAt(layer.top);
      var rIn = radiusAt(layer.bottom);
      FACES.forEach(function (face) {
        layer.hatch.forEach(function (h) { drawHatch(face, rIn, rOut, h.ang, h.gap); });
      });
    });

    DETAIL.forEach(function (d) {
      var a = reveal(d.zoom);
      if (!a) return;
      ctx.globalAlpha = a;
      pen(GREY, 0.7, [6, 3]);
      boundary(radiusAt(d.km));
      ctx.globalAlpha = 1;
    });

    pen(INK, 0.85);
    LAYERS.forEach(function (layer) {
      if (layer.top > 0) boundary(radiusAt(layer.top));
    });

    pen(INK, 1.2);
    [-WEDGE, WEDGE].forEach(function (lon) {
      var f = sideFace(lon);
      curve(function (t) { var u = t * Math.PI / 2; return f.at(Math.sin(u), Math.cos(u)); }, 1440);
      curve(function (t) { return f.at(t, 0); }, 1);
    });
    curve(function (t) { return [0, t, 0]; }, 1);
  }

  /* The shaft runs down the axis from the pole to the centre. A real shaft of a few
     metres would vanish at any zoom here, so it keeps a fixed width on screen. */
  function drawShaft() {
    var top = project([0, 1, 0]);
    var bottom = project([0, 0, 0]);
    var x = sx(top.x);
    var y0 = sy(top.y);
    var y1 = sy(bottom.y);
    var w = 2.4 * dpr();
    ctx.fillStyle = PAPER;
    ctx.fillRect(x - w, y0, 2 * w, y1 - y0);
    pen(INK, 0.9);
    ctx.beginPath();
    ctx.moveTo(x - w, y0);
    ctx.lineTo(x - w, y1);
    ctx.lineTo(x + w, y1);
    ctx.lineTo(x + w, y0);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x, y0, w * 1.9, w * 0.7, 0, 0, Math.PI * 2);
    ctx.stroke();
    pen(FAINT, 0.6, [12, 4, 2, 4]);
    line(W / 2, H * 0.03, W / 2, top.y);
  }

  function depthY(km) { return sy(project([0, radiusAt(km), 0]).y); }

  /* Text in device pixels beside the axis, on a paper ground so hatching stays behind it. */
  function axisLabel(y, text, side, color) {
    var x = sx(W / 2) + side * 14 * dpr();
    var m = ctx.measureText(text);
    var h = 13 * fit.s;
    ctx.fillStyle = PAPER;
    ctx.fillRect(side > 0 ? x - 3 : x - m.width - 3, y - h / 2, m.width + 6, h);
    ctx.fillStyle = color;
    ctx.textAlign = side > 0 ? "left" : "right";
    ctx.fillText(text, x, y);
  }

  function axisTick(y, len) {
    var x = sx(W / 2);
    ctx.beginPath();
    ctx.moveTo(x - len * dpr(), y);
    ctx.lineTo(x + len * dpr(), y);
    ctx.stroke();
  }

  function drawAxisTicks() {
    pen(INK, 0.8);
    LAYERS.forEach(function (layer) { axisTick(depthY(layer.top), 7); });
    axisTick(depthY(EARTH_KM), 7);

    ctx.font = "italic " + (11 * fit.s) + "px Georgia, serif";
    ctx.textBaseline = "middle";

    var a = reveal(3);
    if (a) {
      ctx.globalAlpha = a;
      MAIN_MARKS.forEach(function (m) { axisLabel(depthY(m.km), fmt(m.km) + " km  " + m.name, -1, INK); });
      DETAIL.forEach(function (d) {
        var b = Math.min(a, reveal(d.zoom));
        if (!b) return;
        ctx.globalAlpha = b;
        pen(GREY, 0.7);
        axisTick(depthY(d.km), 5);
        axisLabel(depthY(d.km), fmt(d.km) + " km  " + d.name, 1, GREY);
      });
    }

    SHAFT_MARKS.forEach(function (m) {
      var b = reveal(m.zoom);
      if (!b) return;
      ctx.globalAlpha = b;
      pen(GREY, 0.7);
      axisTick(depthY(m.km), 9);
      axisLabel(depthY(m.km), m.label, -1, GREY);
    });

    ctx.globalAlpha = 1;
    ctx.textBaseline = "alphabetic";
  }

  /* Leaders from the right cut face out to a column of labels. */
  function drawCallouts() {
    var face = sideFace(WEDGE);
    var spots = [
      { r: radiusAt(17), u: 12 },
      { r: radiusAt(350), u: 22 },
      { r: radiusAt(1800), u: 30 },
      { r: radiusAt(4000), u: 38 },
      { r: radiusAt(5800), u: 48 }
    ];
    var x0 = limbBox.maxX + 24;
    var rowTop = H * 0.2;
    var rowGap = H * 0.075;
    ctx.font = "italic " + (12 * fit.s) + "px Georgia, serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = GREY;
    LAYERS.forEach(function (layer, i) {
      var sp = spots[i];
      var u = rad(sp.u);
      var p = project(face.at(sp.r * Math.sin(u), sp.r * Math.cos(u)));
      var y = rowTop + i * rowGap;
      pen(GREY, 0.6);
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), 1.6 * dpr(), 0, Math.PI * 2);
      ctx.fillStyle = GREY;
      ctx.fill();
      line(p.x, p.y, x0, y);
      line(x0, y, x0 + 18, y);
      var km = fmt(layer.top) + "–" + fmt(layer.bottom) + " km";
      ctx.fillText(layer.name + "   " + km, sx(x0 + 24), sy(y));
    });
    ctx.textBaseline = "alphabetic";
  }

  function fmt(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
  }

  function drawGrid() {
    pen(HAIR, 0.6);
    [0.16, 0.24].forEach(function (f) { line(W * 0.07, H * f, W * 0.93, H * f); });
    [0.14, 0.28, 0.72, 0.86].forEach(function (f) { line(W * f, H * 0.065, W * f, H * 0.3); });
    pen(HAIR, 0.6, [2, 6]);
    [0.14, 0.28, 0.72, 0.86].forEach(function (f) { line(W * f, H * 0.3, W * f, H * 0.935); });
  }

  function arrow(x, y, dir) {
    var a = 9;
    var b = 2.6;
    ctx.beginPath();
    ctx.moveTo(sx(x), sy(y));
    ctx.lineTo(sx(x - dir * a), sy(y - b));
    ctx.lineTo(sx(x - dir * a), sy(y + b));
    ctx.closePath();
    ctx.fillStyle = GREY;
    ctx.fill();
  }

  function dimension(y, x1, x2, ext) {
    pen(GREY, 0.75);
    line(x1, y, x2, y);
    arrow(x1, y, -1);
    arrow(x2, y, 1);
    line(x1, y - ext, x1, y + ext);
    line(x2, y - ext, x2, y + ext);
  }

  function drawDimensions() {
    dimension(H * 0.065, W * 0.07, W * 0.93, 10);
    var y = H * 0.955;
    dimension(y, limbBox.minX, limbBox.maxX, 8);
    pen(FAINT, 0.6, [4, 4]);
    line(limbBox.minX, limbBox.midY, limbBox.minX, y - 8);
    line(limbBox.maxX, limbBox.midY, limbBox.maxX, y - 8);
    ctx.fillStyle = GREY;
    ctx.font = "italic " + (11 * fit.s) + "px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("12\u202f742 km", sx(W / 2), sy(y - 7));
  }

  function drawMeridians() {
    pen(FAINT, 0.55, [3, 5]);
    MERIDIANS.forEach(function (lon) {
      curve(function (t) { return onSphere(4 + t * 130, lon); }, 200, visible);
    });
  }

  function drawRings() {
    RINGS.forEach(function (r) {
      ringStyle(r.s);
      curve(function (t) { return onSphere(r.a, t * 360 - 180); }, 900, visible);
    });
  }

  function limbPoints() {
    var c = norm(CAM);
    var d = Math.hypot(CAM[0], CAM[1], CAM[2]);
    var center = [c[0] / d, c[1] / d, c[2] / d];
    var rr = Math.sqrt(1 - 1 / (d * d));
    var e1 = norm(cross(c, [1, 0, 0]));
    var e2 = cross(c, e1);
    var pts = [];
    for (var i = 0; i <= 900; i++) {
      var t = (i / 900) * Math.PI * 2;
      pts.push([
        center[0] + rr * (Math.cos(t) * e1[0] + Math.sin(t) * e2[0]),
        center[1] + rr * (Math.cos(t) * e1[1] + Math.sin(t) * e2[1]),
        center[2] + rr * (Math.cos(t) * e1[2] + Math.sin(t) * e2[2])
      ]);
    }
    return pts;
  }

  function drawLimb() {
    var pts = limbPoints();
    pen(INK, 1);
    curve(function (t) { return pts[Math.round(t * (pts.length - 1))]; }, pts.length - 1,
      function (p) { return !removed(p); });
  }

  function drawPosts() {
    POSTS.forEach(function (p) {
      var base = onSphere(p.a, p.lon);
      if (!visible(base)) return;
      var b = project(base);
      var top = b.y - p.h * H;
      pen(GREY, 0.75);
      line(b.x, b.y, b.x, top);
      line(b.x - 5, top, b.x + 5, top);
      pen(FAINT, 0.6);
      line(b.x - 3, b.y, b.x + 3, b.y);
    });
  }

  function frameSphere() {
    offsetY = 0;
    var box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    limbPoints().forEach(function (p) {
      var q = project(p);
      box.minX = Math.min(box.minX, q.x);
      box.maxX = Math.max(box.maxX, q.x);
      box.minY = Math.min(box.minY, q.y);
      box.maxY = Math.max(box.maxY, q.y);
    });
    offsetY = H * CENTER_Y - (box.minY + box.maxY) / 2;
    box.midY = H * CENTER_Y;
    limbBox = box;
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    drawGrid();
    drawDimensions();
    drawMeridians();
    drawRings();
    drawLimb();
    drawCut();
    drawShaft();
    drawAxisTicks();
    drawPosts();
    drawCallouts();
  }

  function resize() {
    var r = dpr();
    canvas.width = Math.round(window.innerWidth * r);
    canvas.height = Math.round(window.innerHeight * r);
    fit.s = Math.min(canvas.width / W, canvas.height / H);
    fit.ox = (canvas.width - W * fit.s) / 2;
    fit.oy = (canvas.height - H * fit.s) / 2;
    draw();
  }

  /* Zoom about the cursor; at the fitted scale the sheet sits centered.
     Everything is true scale, so the crust and the shaft marks need deep zoom. */
  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    var r = dpr();
    var mx = ((e.clientX * r - fit.ox) / fit.s - view.x) / view.k;
    var my = ((e.clientY * r - fit.oy) / fit.s - view.y) / view.k;
    var k = Math.min(400, Math.max(1, view.k * Math.exp(-e.deltaY * 0.0015)));
    view.x += mx * (view.k - k);
    view.y += my * (view.k - k);
    view.k = k;
    if (k === 1) { view.x = 0; view.y = 0; }
    draw();
  }, { passive: false });

  frameSphere();
  window.addEventListener("resize", resize);
  resize();
})();
