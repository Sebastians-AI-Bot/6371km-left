/* Sphere sheet for "6.371 km left".
   Open index.html in a browser (no server). The wheel zooms the sheet. */

(function () {
  "use strict";

  var PAPER = "#f3f0e8";
  var INK = "#3a4654";
  var MID = "#5c6c7c";
  var FAINT = "#8e9bab";
  var HAIR = "#b7c0c8";
  var HATCH = "#667688";
  var FRAME = "#c9c3b6";

  /* Above and in front of the surface, far enough that the rings
     stay ellipses and the block keeps a little depth. */
  var CAM = [0.62, 1.78, 3.25];
  var TARGET = [0, 0.55, 0];
  var FOCAL = 2.9;

  var BLOCK_YAW = 0.62;
  var S = 0.132;
  var H = 0.46;
  var SOIL = 0.072;
  var SHAFT_W = 0.030;
  var SHAFT_BACK = -0.015;
  var SHAFT_FLOOR = 0.08;
  /* Shared height of the block base and the section rings. */
  var BASE = 1;

  var canvas = document.getElementById("sheet");
  var ctx = canvas.getContext("2d");
  var view = { x: 0, y: 0, k: 1 };
  var basis = cameraBasis();

  function cameraBasis() {
    var fx = TARGET[0] - CAM[0];
    var fy = TARGET[1] - CAM[1];
    var fz = TARGET[2] - CAM[2];
    var fl = Math.hypot(fx, fy, fz);
    fx /= fl;
    fy /= fl;
    fz /= fl;
    /* right = forward × world up, so the sheet stays upright. */
    var rx = -fz;
    var ry = 0;
    var rz = fx;
    var rl = Math.hypot(rx, ry, rz);
    rx /= rl;
    ry /= rl;
    rz /= rl;
    var ux = ry * fz - rz * fy;
    var uy = rz * fx - rx * fz;
    var uz = rx * fy - ry * fx;
    return { r: [rx, ry, rz], u: [ux, uy, uz], f: [fx, fy, fz] };
  }

  function project(x, y, z) {
    var dx = x - CAM[0];
    var dy = y - CAM[1];
    var dz = z - CAM[2];
    var cx = dx * basis.r[0] + dy * basis.r[1] + dz * basis.r[2];
    var cy = dx * basis.u[0] + dy * basis.u[1] + dz * basis.u[2];
    var cz = dx * basis.f[0] + dy * basis.f[1] + dz * basis.f[2];
    if (cz < 0.08) return null;
    var s = FOCAL / cz;
    return { x: cx * s, y: -cy * s, z: cz };
  }

  function blockLocal(lx, ly, lz) {
    var c = Math.cos(BLOCK_YAW);
    var s = Math.sin(BLOCK_YAW);
    return [lx * c + lz * s, BASE + ly, -lx * s + lz * c];
  }

  function facing(poly) {
    var a = poly[0];
    var b = poly[1];
    var c = poly[2];
    var ux = b[0] - a[0];
    var uy = b[1] - a[1];
    var uz = b[2] - a[2];
    var vx = c[0] - a[0];
    var vy = c[1] - a[1];
    var vz = c[2] - a[2];
    var nx = uy * vz - uz * vy;
    var ny = uz * vx - ux * vz;
    var nz = ux * vy - uy * vx;
    var cx = CAM[0] - (a[0] + b[0] + c[0]) / 3;
    var cy = CAM[1] - (a[1] + b[1] + c[1]) / 3;
    var cz = CAM[2] - (a[2] + b[2] + c[2]) / 3;
    return nx * cx + ny * cy + nz * cz > 0;
  }

  function depthOf(poly) {
    var z = 0;
    var n = 0;
    for (var i = 0; i < poly.length; i++) {
      var p = project(poly[i][0], poly[i][1], poly[i][2]);
      if (!p) continue;
      z += p.z;
      n++;
    }
    return n ? z / n : 0;
  }

  function toScreen(p, map) {
    return {
      x: map.ox + p.x * map.unit,
      y: map.oy + p.y * map.unit,
      z: p.z
    };
  }

  function screenPoly(poly, map) {
    var out = [];
    for (var i = 0; i < poly.length; i++) {
      var p = project(poly[i][0], poly[i][1], poly[i][2]);
      if (!p) return null;
      out.push(toScreen(p, map));
    }
    return out;
  }

  function layout(w, h) {
    var foot = blockLocal(0, 0, 0);
    var pole = project(foot[0], foot[1], foot[2]);
    var limb = project(0, 0, 1);
    var dist = Math.hypot(limb.x - pole.x, limb.y - pole.y) || 0.001;
    var unit = Math.min(w, h) * 0.84 / dist;
    return {
      unit: unit,
      ox: w * 0.5 - pole.x * unit,
      oy: h * 0.37 - pole.y * unit
    };
  }

  function frameOf(w, h) {
    var pad = Math.max(28, Math.min(w, h) * 0.045);
    return { x: pad, y: pad, w: w - pad * 2, h: h - pad * 2 };
  }

  function path(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  }

  function bounds(pts) {
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    for (var i = 0; i < pts.length; i++) {
      minX = Math.min(minX, pts[i].x);
      minY = Math.min(minY, pts[i].y);
      maxX = Math.max(maxX, pts[i].x);
      maxY = Math.max(maxY, pts[i].y);
    }
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  function hatch(pts, gap, angle) {
    var b = bounds(pts);
    ctx.save();
    path(pts);
    ctx.clip();
    ctx.beginPath();
    ctx.strokeStyle = HATCH;
    ctx.lineWidth = 0.7;
    var ca = Math.cos(angle);
    var sa = Math.sin(angle);
    var diag = Math.hypot(b.maxX - b.minX, b.maxY - b.minY) + gap * 2;
    var cx = (b.minX + b.maxX) / 2;
    var cy = (b.minY + b.maxY) / 2;
    var steps = Math.ceil(diag / gap);
    var px = -sa;
    var py = ca;
    for (var s = -steps; s <= steps; s++) {
      var ox = cx + ca * s * gap;
      var oy = cy + sa * s * gap;
      ctx.moveTo(ox - px * diag, oy - py * diag);
      ctx.lineTo(ox + px * diag, oy + py * diag);
    }
    ctx.stroke();
    ctx.restore();
  }

  function stipple(pts, gap, radius) {
    var b = bounds(pts);
    ctx.save();
    path(pts);
    ctx.clip();
    ctx.fillStyle = HATCH;
    var row = 0;
    for (var y = b.minY; y <= b.maxY; y += gap) {
      var shift = (row % 2) * gap * 0.5;
      row++;
      for (var x = b.minX - gap; x <= b.maxX; x += gap) {
        ctx.beginPath();
        ctx.arc(x + shift, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawGrid(fr) {
    ctx.save();
    ctx.strokeStyle = HAIR;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    var step = Math.max(64, Math.min(fr.w, fr.h) / 11);
    var x0 = fr.x + ((fr.w / 2) % step);
    var y0 = fr.y + ((fr.h / 2) % step);
    for (var x = x0; x < fr.x + fr.w; x += step) {
      ctx.moveTo(x, fr.y);
      ctx.lineTo(x, fr.y + fr.h);
    }
    for (var y = y0; y < fr.y + fr.h; y += step) {
      ctx.moveTo(fr.x, y);
      ctx.lineTo(fr.x + fr.w, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function arrowHead(x, y, dx, dy) {
    var len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    var s = 8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - dx * s - dy * s * 0.38, y - dy * s + dx * s * 0.38);
    ctx.moveTo(x, y);
    ctx.lineTo(x - dx * s + dy * s * 0.38, y - dy * s - dx * s * 0.38);
    ctx.stroke();
  }

  function drawAxes(fr, map) {
    var foot = blockLocal(0, 0, 0);
    var pole = project(foot[0], foot[1], foot[2]);
    if (!pole) return;
    var a = toScreen(pole, map);
    ctx.save();
    ctx.strokeStyle = HAIR;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(a.x, fr.y);
    ctx.lineTo(a.x, fr.y + fr.h);
    ctx.moveTo(fr.x, a.y);
    ctx.lineTo(fr.x + fr.w, a.y);
    ctx.stroke();
    ctx.strokeStyle = MID;
    ctx.lineWidth = 1;
    arrowHead(fr.x + fr.w, a.y, 1, 0);
    arrowHead(fr.x, a.y, -1, 0);
    arrowHead(a.x, fr.y, 0, -1);
    arrowHead(a.x, fr.y + fr.h, 0, 1);
    ctx.restore();
  }

  /* Concentric section rings on the plane the block stands on.
     Perspective flattens them toward the horizon behind the block. */
  function drawRings(map, fr) {
    var count = 14;
    var r0 = 0.095;
    var r1 = 1.62;
    var steps = 240;
    var box = blockScreenBounds(map);
    for (var i = 0; i < count; i++) {
      var r = r0 + (r1 - r0) * (i / (count - 1));
      var y = BASE;
      var major = i % 3 === 0;
      ctx.beginPath();
      var open = false;
      for (var s = 0; s <= steps; s++) {
        var t = (s / steps) * Math.PI * 2;
        var p = project(r * Math.cos(t), y, r * Math.sin(t));
        if (!p) {
          open = false;
          continue;
        }
        var q = toScreen(p, map);
        if (!open) {
          ctx.moveTo(q.x, q.y);
          open = true;
        } else {
          ctx.lineTo(q.x, q.y);
        }
      }
      ctx.strokeStyle = major ? INK : MID;
      ctx.lineWidth = major ? 1.15 : 0.72;
      ctx.setLineDash(major ? [] : [6, 5]);
      ctx.stroke();
      if (major) drawTicks(map, r, y, fr, box);
    }
    ctx.setLineDash([]);
  }

  function blockScreenBounds(map) {
    var corners = [
      [-S, 0, -S], [-S, 0, S], [S, 0, S], [S, 0, -S],
      [-S, H, -S], [-S, H, S], [S, H, S], [S, H, -S]
    ];
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    for (var i = 0; i < corners.length; i++) {
      var w = blockLocal(corners[i][0], corners[i][1], corners[i][2]);
      var p = project(w[0], w[1], w[2]);
      if (!p) continue;
      var s = toScreen(p, map);
      minX = Math.min(minX, s.x);
      minY = Math.min(minY, s.y);
      maxX = Math.max(maxX, s.x);
      maxY = Math.max(maxY, s.y);
    }
    return { minX: minX - 8, minY: minY - 8, maxX: maxX + 8, maxY: maxY + 8 };
  }

  function drawTicks(map, r, y, fr, box) {
    var len = 0.02 + r * 0.008;
    ctx.strokeStyle = MID;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (var k = 0; k < 24; k++) {
      var t = (k / 24) * Math.PI * 2;
      var c = Math.cos(t);
      var sn = Math.sin(t);
      var p0 = project((r - len) * c, y, (r - len) * sn);
      var p1 = project((r + len) * c, y, (r + len) * sn);
      if (!p0 || !p1) continue;
      var a = toScreen(p0, map);
      var b = toScreen(p1, map);
      var mx = (a.x + b.x) / 2;
      var my = (a.y + b.y) / 2;
      if (mx < fr.x || mx > fr.x + fr.w || my < fr.y || my > fr.y + fr.h) continue;
      if (mx > box.minX && mx < box.maxX && my > box.minY && my < box.maxY) continue;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }

  function quad(x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3) {
    return [
      blockLocal(x0, y0, z0),
      blockLocal(x1, y1, z1),
      blockLocal(x2, y2, z2),
      blockLocal(x3, y3, z3)
    ];
  }

  function blockFaces() {
    var soilY = H - SOIL;
    var x0 = -SHAFT_W;
    var x1 = SHAFT_W;
    var zb = SHAFT_BACK;
    var faces = [];

    function add(poly, kind) {
      faces.push({ poly: poly, kind: kind });
    }

    function splitWall(xA, zA, xB, zB, kindStone, kindSoil) {
      add(quad(xA, 0, zA, xB, 0, zB, xB, soilY, zB, xA, soilY, zA), kindStone);
      add(quad(xA, soilY, zA, xB, soilY, zB, xB, H, zB, xA, H, zA), kindSoil);
    }

    /* Shaft interior. Open through the front face. */
    add(quad(x0, SHAFT_FLOOR, zb, x1, SHAFT_FLOOR, zb, x1, H, zb, x0, H, zb), "void");
    add(quad(x0, SHAFT_FLOOR, zb, x1, SHAFT_FLOOR, zb, x1, SHAFT_FLOOR, S, x0, SHAFT_FLOOR, S), "void");
    add(quad(x0, SHAFT_FLOOR, zb, x0, SHAFT_FLOOR, S, x0, H, S, x0, H, zb), "void");
    add(quad(x1, SHAFT_FLOOR, S, x1, SHAFT_FLOOR, zb, x1, H, zb, x1, H, S), "void");

    splitWall(-S, S, x0, S, "stone", "soil");
    splitWall(x1, S, S, S, "stone", "soil");
    add(quad(x0, 0, S, x1, 0, S, x1, SHAFT_FLOOR, S, x0, SHAFT_FLOOR, S), "stone");

    splitWall(S, S, S, -S, "stone-side", "soil-side");
    splitWall(-S, -S, -S, S, "stone-side", "soil-side");
    splitWall(-S, -S, S, -S, "stone", "soil");

    add(quad(-S, H, -S, S, H, -S, S, H, zb, -S, H, zb), "top");
    add(quad(-S, H, zb, x0, H, zb, x0, H, S, -S, H, S), "top");
    add(quad(x1, H, zb, S, H, zb, S, H, S, x1, H, S), "top");

    return faces;
  }

  function paintFace(face, pts) {
    ctx.fillStyle = PAPER;
    path(pts);
    ctx.fill();
    if (face.kind === "stone" || face.kind === "stone-side") {
      var angle = face.kind === "stone-side" ? -Math.PI / 4 : Math.PI / 4;
      hatch(pts, 7, angle);
    } else if (face.kind === "soil" || face.kind === "soil-side") {
      stipple(pts, 4.5, 0.65);
    } else if (face.kind === "top") {
      stipple(pts, 6.5, 0.55);
    }
  }

  function strokeFace(pts, width) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = width;
    ctx.setLineDash([]);
    path(pts);
    ctx.stroke();
  }

  function drawBlock(map) {
    var faces = blockFaces().filter(function (face) {
      return facing(face.poly);
    });
    faces.sort(function (a, b) {
      return depthOf(b.poly) - depthOf(a.poly);
    });
    var painted = [];
    for (var i = 0; i < faces.length; i++) {
      var pts = screenPoly(faces[i].poly, map);
      if (!pts) continue;
      paintFace(faces[i], pts);
      painted.push(pts);
    }
    for (var j = 0; j < painted.length; j++) strokeFace(painted[j], 1.05);
    drawSoilLine(map);
  }

  function drawSoilLine(map) {
    var y = H - SOIL;
    var segs = [
      [[-S, y, S], [-SHAFT_W, y, S]],
      [[SHAFT_W, y, S], [S, y, S]],
      [[S, y, S], [S, y, -S]],
      [[S, y, -S], [-S, y, -S]],
      [[-S, y, -S], [-S, y, S]],
      [[-SHAFT_W, y, S], [-SHAFT_W, y, SHAFT_BACK]],
      [[SHAFT_W, y, S], [SHAFT_W, y, SHAFT_BACK]],
      [[-SHAFT_W, y, SHAFT_BACK], [SHAFT_W, y, SHAFT_BACK]]
    ];
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.9;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (var i = 0; i < segs.length; i++) {
      var a = blockLocal.apply(null, segs[i][0]);
      var b = blockLocal.apply(null, segs[i][1]);
      var pa = project(a[0], a[1], a[2]);
      var pb = project(b[0], b[1], b[2]);
      if (!pa || !pb) continue;
      var sa = toScreen(pa, map);
      var sb = toScreen(pb, map);
      ctx.moveTo(sa.x, sa.y);
      ctx.lineTo(sb.x, sb.y);
    }
    ctx.stroke();
  }

  function drawLabels(map, fr) {
    var box = blockScreenBounds(map);
    sideLabel(map, H - SOIL * 0.5, "topsoil", box);
    sideLabel(map, (H - SOIL) * 0.46, "stone", box);
    labelAt(map, 0, (H + SHAFT_FLOOR) * 0.52, (S + SHAFT_BACK) * 0.5, "shaft");
    drawRadiusNote(fr);
  }

  function sideLabel(map, ly, text, box) {
    var w = blockLocal(-S, ly, 0);
    var p = project(w[0], w[1], w[2]);
    if (!p) return;
    var s = toScreen(p, map);
    var x0 = Math.min(s.x, box.minX + 8);
    var x1 = x0 - 22;
    ctx.save();
    ctx.strokeStyle = MID;
    ctx.lineWidth = 0.75;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x0, s.y);
    ctx.lineTo(x1, s.y);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = "500 13px ui-sans-serif, 'Helvetica Neue', Helvetica, Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x1 - 6, s.y);
    ctx.restore();
  }

  function labelAt(map, lx, ly, lz, text) {
    var w = blockLocal(lx, ly, lz);
    var p = project(w[0], w[1], w[2]);
    if (!p) return;
    var s = toScreen(p, map);
    ctx.save();
    ctx.fillStyle = INK;
    ctx.font = "500 13px ui-sans-serif, 'Helvetica Neue', Helvetica, Arial, sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(text, s.x, s.y);
    ctx.restore();
  }

  function drawRadiusNote(fr) {
    var x = fr.x + fr.w - 18;
    var y = fr.y + fr.h - 22;
    ctx.save();
    ctx.fillStyle = INK;
    ctx.font = "500 13px ui-sans-serif, 'Helvetica Neue', Helvetica, Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("6 371 km", x, y);
    ctx.fillStyle = FAINT;
    ctx.font = "400 11px ui-sans-serif, 'Helvetica Neue', Helvetica, Arial, sans-serif";
    ctx.fillText("radius", x, y - 16);
    ctx.restore();
  }

  function drawFrame(fr) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.strokeStyle = FRAME;
    ctx.lineWidth = 1.25;
    ctx.strokeRect(fr.x - 7, fr.y - 7, fr.w + 14, fr.h + 14);
    ctx.lineWidth = 0.7;
    ctx.strokeRect(fr.x, fr.y, fr.w, fr.h);
    ctx.restore();
  }

  function draw() {
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    var dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, w, h);
    ctx.translate(view.x, view.y);
    ctx.scale(view.k, view.k);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    var fr = frameOf(w, h);
    var map = layout(w, h);

    ctx.save();
    ctx.beginPath();
    ctx.rect(fr.x, fr.y, fr.w, fr.h);
    ctx.clip();
    drawGrid(fr);
    drawAxes(fr, map);
    drawRings(map, fr);
    drawBlock(map);
    drawLabels(map, fr);
    ctx.restore();
    drawFrame(fr);
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    var factor = Math.exp(-e.deltaY * 0.0011);
    var next = clamp(view.k * factor, 0.72, 2.4);
    view.x = mx - (mx - view.x) * (next / view.k);
    view.y = my - (my - view.y) * (next / view.k);
    view.k = next;
    draw();
  }, { passive: false });

  window.addEventListener("resize", function () {
    view.x = 0;
    view.y = 0;
    view.k = 1;
    draw();
  });

  draw();
})();
