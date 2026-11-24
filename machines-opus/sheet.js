/* Test sheet of the machines. Every elevation is drawn in millimetres with
   y up from its own ground line; the exploded drill is an isometric view
   with the drill axis along x. The sheet is 2000 x 1400 units, fitted to
   the window. */
(function () {
  "use strict";

  var PAPER = "#f3f0e8";
  var INK = "#3a4654";
  var MID = "#5c6c7c";
  var FAINT = "#8e9bab";
  var HAIR = "#b7c0c8";
  var HATCH = "#667688";
  var FRAME = "#c9c3b6";

  var W = 2000;
  var H = 1400;
  var PI = Math.PI;

  var canvas = document.getElementById("sheet");
  var ctx = canvas.getContext("2d");

  var PENS = {
    outline: [INK, 1.35, []],
    part: [MID, 0.85, []],
    thin: [MID, 0.55, []],
    hidden: [FAINT, 0.8, [5, 3]],
    center: [FAINT, 0.6, [16, 3, 2, 3]],
    hatch: [HATCH, 0.5, []]
  };

  function pen(name) {
    var p = PENS[name];
    ctx.strokeStyle = p[0];
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
    ctx.strokeStyle = HAIR;
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

  function resize() {
    var k = Math.min(window.innerWidth / W, window.innerHeight / H);
    var dpr = window.devicePixelRatio || 1;
    canvas.style.width = W * k + "px";
    canvas.style.height = H * k + "px";
    canvas.width = Math.round(W * k * dpr);
    canvas.height = Math.round(H * k * dpr);
    ctx.setTransform(k * dpr, 0, 0, k * dpr, 0, 0);
    draw();
  }

  window.addEventListener("resize", resize);
  resize();
})();
