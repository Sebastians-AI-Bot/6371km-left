/* Sphere sheet for "6.371 km left".
   Open index.html in a browser (no server). The wheel zooms the sheet. */

(function () {
  "use strict";

  var PAPER = "#f3f0e8";
  var INK = "#3a4654";
  var MID = "#5c6c7c";
  var FAINT = "#8e9bab";
  var HAIR = "#b7c0c8";
  var FRAME = "#c9c3b6";

  /* Above and in front of the surface, so the section rings
     are ellipses that open downward and tighten toward the horizon. */
  var CAM = [0.62, 1.78, 3.25];
  var TARGET = [0, 0.55, 0];
  var FOCAL = 2.9;
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

  function toScreen(p, map) {
    return {
      x: map.ox + p.x * map.unit,
      y: map.oy + p.y * map.unit
    };
  }

  function layout(w, h) {
    var pole = project(0, BASE, 0);
    var limb = project(0, 0, 1);
    var dist = Math.hypot(limb.x - pole.x, limb.y - pole.y) || 0.001;
    var unit = Math.min(w, h) * 1.2 / dist;
    return {
      unit: unit,
      ox: w * 0.5 - pole.x * unit,
      oy: h * 0.30 - pole.y * unit
    };
  }

  function frameOf(w, h) {
    var pad = Math.max(28, Math.min(w, h) * 0.045);
    return { x: pad, y: pad, w: w - pad * 2, h: h - pad * 2 };
  }

  function drawGrid(fr) {
    ctx.save();
    ctx.strokeStyle = HAIR;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    var step = Math.max(64, Math.min(fr.w, fr.h) / 11);
    var x0 = fr.x + ((fr.w / 2) % step);
    var y0 = fr.y + ((fr.h / 2) % step);
    var x;
    var y;
    for (x = x0; x < fr.x + fr.w; x += step) {
      ctx.moveTo(x, fr.y);
      ctx.lineTo(x, fr.y + fr.h);
    }
    for (y = y0; y < fr.y + fr.h; y += step) {
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
    var pole = project(0, BASE, 0);
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
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(a.x - 5, a.y);
    ctx.lineTo(a.x + 5, a.y);
    ctx.moveTo(a.x, a.y - 5);
    ctx.lineTo(a.x, a.y + 5);
    ctx.stroke();
    ctx.restore();
  }

  function drawRings(map, fr) {
    var count = 16;
    var r0 = 0.04;
    var r1 = 1.62;
    var steps = 240;
    var i;
    var s;
    for (i = 0; i < count; i++) {
      var r = r0 + (r1 - r0) * (i / (count - 1));
      var major = i % 3 === 0;
      ctx.beginPath();
      var open = false;
      for (s = 0; s <= steps; s++) {
        var t = (s / steps) * Math.PI * 2;
        var p = project(r * Math.cos(t), BASE, r * Math.sin(t));
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
      if (major && r > 0.18) drawTicks(map, r, fr);
    }
    ctx.setLineDash([]);
  }

  function drawTicks(map, r, fr) {
    var len = 0.02 + r * 0.008;
    var k;
    ctx.strokeStyle = MID;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (k = 0; k < 24; k++) {
      var t = (k / 24) * Math.PI * 2;
      var c = Math.cos(t);
      var sn = Math.sin(t);
      var p0 = project((r - len) * c, BASE, (r - len) * sn);
      var p1 = project((r + len) * c, BASE, (r + len) * sn);
      if (!p0 || !p1) continue;
      var a = toScreen(p0, map);
      var b = toScreen(p1, map);
      var mx = (a.x + b.x) / 2;
      var my = (a.y + b.y) / 2;
      if (mx < fr.x || mx > fr.x + fr.w || my < fr.y || my > fr.y + fr.h) continue;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
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
    drawRadiusNote(fr);
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
