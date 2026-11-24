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
  var CAM = [0, 1.41, 1.13];
  var TARGET = [0, 0.9, -0.1];
  var FOCAL = 2.2;
  var POLE_Y = 0.5;

  /* Section rings by angle from the pole, in degrees. */
  var RINGS = [
    { a: 4, s: "grey" },
    { a: 6, s: "ink" },
    { a: 7.5, s: "faint" },
    { a: 9, s: "ink" },
    { a: 10.5, s: "grey" },
    { a: 12, s: "ink" },
    { a: 13.5, s: "faint" },
    { a: 15, s: "ink" },
    { a: 17, s: "grey" },
    { a: 19, s: "ink" },
    { a: 21.5, s: "grey" },
    { a: 24, s: "faint" },
    { a: 27, s: "dash" },
    { a: 31, s: "grey" },
    { a: 35, s: "dash" },
    { a: 40, s: "faint" },
    { a: 46, s: "dash" }
  ];

  var MERIDIANS = [-48, -24, 24, 48];

  var POSTS = [
    { a: 15, lon: -128, h: 0.07 },
    { a: 19, lon: -112, h: 0.05 },
    { a: 24, lon: -96, h: 0.09 },
    { a: 12, lon: 136, h: 0.08 },
    { a: 17, lon: 118, h: 0.11 },
    { a: 27, lon: 98, h: 0.06 },
    { a: 35, lon: -84, h: 0.07 },
    { a: 40, lon: 84, h: 0.05 }
  ];

  var canvas = document.getElementById("sheet");
  var ctx = canvas.getContext("2d");
  var basis = cameraBasis();
  var view = { k: 1, x: 0, y: 0 };
  var fit = { s: 1, ox: 0, oy: 0 };
  var poleOffset = 0;

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) {
    var l = Math.hypot(a[0], a[1], a[2]);
    return [a[0] / l, a[1] / l, a[2] / l];
  }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }

  function cameraBasis() {
    var f = norm(sub(TARGET, CAM));
    var r = norm(cross(f, [0, 1, 0]));
    var u = cross(r, f);
    return { f: f, r: r, u: u };
  }

  /* Camera space to sheet units, before the window fit and zoom. */
  function projectRaw(p) {
    var d = sub(p, CAM);
    var z = dot(d, basis.f);
    if (z < 0.05) return null;
    return {
      x: W / 2 + (dot(d, basis.r) / z) * FOCAL * W / 2,
      y: -(dot(d, basis.u) / z) * FOCAL * W / 2
    };
  }

  function project(p) {
    var q = projectRaw(p);
    if (!q) return null;
    return { x: q.x, y: q.y + poleOffset };
  }

  function visible(p) {
    return dot(p, CAM) > 1;
  }

  function onSphere(a, lon) {
    var t = a * Math.PI / 180;
    var l = lon * Math.PI / 180;
    return [Math.sin(t) * Math.sin(l), Math.cos(t), Math.sin(t) * Math.cos(l)];
  }

  /* Sheet units to device pixels. */
  function sx(x) { return fit.ox + (x * view.k + view.x) * fit.s; }
  function sy(y) { return fit.oy + (y * view.k + view.y) * fit.s; }

  function pen(color, width, dash) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width * dpr();
    ctx.setLineDash(dash ? dash.map(function (d) { return d * dpr(); }) : []);
  }

  function dpr() { return window.devicePixelRatio || 1; }

  function line(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(sx(x1), sy(y1));
    ctx.lineTo(sx(x2), sy(y2));
    ctx.stroke();
  }

  /* Draws only the parts of a curve on the near side of the horizon. */
  function curve(pointAt, steps) {
    var open = false;
    ctx.beginPath();
    for (var i = 0; i <= steps; i++) {
      var p = pointAt(i / steps);
      var q = visible(p) ? project(p) : null;
      if (!q) { open = false; continue; }
      if (open) ctx.lineTo(sx(q.x), sy(q.y));
      else ctx.moveTo(sx(q.x), sy(q.y));
      open = true;
    }
    ctx.stroke();
  }

  function ringStyle(s) {
    if (s === "ink") pen(INK, 1.15);
    else if (s === "grey") pen(GREY, 0.75);
    else if (s === "dash") pen(GREY, 0.75, [7, 5]);
    else pen(FAINT, 0.6);
  }

  function drawGrid() {
    pen(HAIR, 0.6);
    [0.18, 0.27, 0.34].forEach(function (f) { line(W * 0.07, H * f, W * 0.93, H * f); });
    [0.14, 0.28, 0.72, 0.86].forEach(function (f) { line(W * f, H * 0.065, W * f, H * 0.42); });
    pen(HAIR, 0.6, [2, 6]);
    [0.14, 0.28, 0.72, 0.86].forEach(function (f) { line(W * f, H * 0.42, W * f, H * 0.935); });
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
    dimension(H * 0.935, W * 0.055, W * 0.945, 10);
    pen(GREY, 0.6);
    line(W * 0.055, H * 0.55, W * 0.055, H * 0.95);
    line(W * 0.945, H * 0.55, W * 0.945, H * 0.95);
    line(W / 2, H * 0.92, W / 2, H * 0.95);
  }

  function drawAxis() {
    var pole = project([0, 1, 0]);
    pen(FAINT, 0.6, [12, 4, 2, 4]);
    line(W / 2, H * 0.03, W / 2, pole.y);
    pen(GREY, 0.75);
    curve(function (t) { return onSphere(t * 90, 0); }, 180);
    pen(GREY, 0.7);
    RINGS.forEach(function (r) {
      var p = onSphere(r.a, 0);
      if (!visible(p)) return;
      var q = project(p);
      var len = r.s === "ink" ? 6 : 4;
      line(q.x - len, q.y, q.x + len, q.y);
    });
  }

  function drawMeridians() {
    pen(FAINT, 0.55, [3, 5]);
    MERIDIANS.forEach(function (lon) {
      curve(function (t) { return onSphere(4 + t * 86, lon); }, 160);
    });
  }

  function drawRings() {
    RINGS.forEach(function (r) {
      ringStyle(r.s);
      curve(function (t) { return onSphere(r.a, t * 360 - 180); }, 720);
    });
  }

  function drawLimb() {
    var c = norm(CAM);
    var d = Math.hypot(CAM[0], CAM[1], CAM[2]);
    var center = [c[0] / d, c[1] / d, c[2] / d];
    var rad = Math.sqrt(1 - 1 / (d * d));
    var e1 = norm(cross(c, [1, 0, 0]));
    var e2 = cross(c, e1);
    var pts = [];
    for (var i = 0; i <= 720; i++) {
      var t = (i / 720) * Math.PI * 2;
      var p = [
        center[0] + rad * (Math.cos(t) * e1[0] + Math.sin(t) * e2[0]),
        center[1] + rad * (Math.cos(t) * e1[1] + Math.sin(t) * e2[1]),
        center[2] + rad * (Math.cos(t) * e1[2] + Math.sin(t) * e2[2])
      ];
      pts.push(project(p));
    }
    pen(INK, 0.9);
    ctx.beginPath();
    var open = false;
    pts.forEach(function (q) {
      if (!q) { open = false; return; }
      if (open) ctx.lineTo(sx(q.x), sy(q.y));
      else ctx.moveTo(sx(q.x), sy(q.y));
      open = true;
    });
    ctx.stroke();
  }

  function drawPosts() {
    POSTS.forEach(function (p) {
      var base = onSphere(p.a, p.lon);
      if (!visible(base)) return;
      var b = project(base);
      if (!b) return;
      var t = { x: b.x, y: b.y - p.h * H };
      pen(GREY, 0.75);
      line(b.x, b.y, t.x, t.y);
      line(t.x - 5, t.y, t.x + 5, t.y);
      pen(FAINT, 0.6);
      line(b.x - 3, b.y, b.x + 3, b.y);
    });
  }

  function drawLabels() {
    ctx.fillStyle = GREY;
    ctx.font = "italic " + (11 * fit.s * view.k) + "px Georgia, serif";
    ctx.textAlign = "right";
    ctx.fillText("R 6 371 km", sx(W * 0.94), sy(H * 0.655));
    ctx.textAlign = "center";
    ctx.fillText("12 742 km", sx(W / 2), sy(H * 0.935 - 7));
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
    drawAxis();
    drawPosts();
    drawLabels();
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

  /* Zoom about the cursor; at the fitted scale the sheet sits centered. */
  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    var r = dpr();
    var mx = ((e.clientX * r - fit.ox) / fit.s - view.x) / view.k;
    var my = ((e.clientY * r - fit.oy) / fit.s - view.y) / view.k;
    var k = Math.min(16, Math.max(1, view.k * Math.exp(-e.deltaY * 0.0015)));
    view.x += mx * (view.k - k);
    view.y += my * (view.k - k);
    view.k = k;
    if (k === 1) { view.x = 0; view.y = 0; }
    draw();
  }, { passive: false });

  poleOffset = H * POLE_Y - projectRaw([0, 1, 0]).y;
  window.addEventListener("resize", resize);
  resize();
})();
