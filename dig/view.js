/* Draws the dig grid as line-art with water filled in and oil as one
   smooth shape, and turns clicks into hits. */
(function () {
  "use strict";

  var S = DIG;
  var W = S.W, H = S.H, CS = S.CS, CW = S.CW, CH = S.CH;
  var mat = S.mat, flag = S.flag, body = S.body, shade = S.shade, dirty = S.dirty;
  var AIR = S.AIR, SAND = S.SAND, TOPSOIL = S.TOPSOIL, CLAY = S.CLAY, GRAVEL = S.GRAVEL;
  var STONE = S.STONE, WATER = S.WATER, OIL = S.OIL;
  var LOOSE = S.LOOSE, WET = S.WET, CRACK = S.CRACK;

  var PAPER = "#f3f0e8", INK = "#3a4654", MID = "#5c6c7c", FAINT = "#8e9bab", WATER_INK = "#46698f", WET_FILL = "#d5e1ea";

  function pack(r, g, b, a) {
    return ((a << 24) | (Math.min(255, b) << 16) | (Math.min(255, g) << 8) | Math.min(255, r)) >>> 0;
  }
  function packHex(hex) {
    var v = parseInt(hex.slice(1), 16);
    return pack((v >> 16) & 255, (v >> 8) & 255, v & 255, 255);
  }
  var P_INK = packHex(INK), P_MID = packHex(MID), P_FAINT = packHex(FAINT), P_WATER = packHex(WATER_INK);
  var P_WET = packHex(WET_FILL);

  var canvas = document.getElementById("sheet");
  var ctx = canvas.getContext("2d");
  var cssW = 1, cssH = 1, dpr = 1;

  function layer() {
    var cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    var c = cv.getContext("2d");
    var img = c.createImageData(W, H);
    return { cv: cv, ctx: c, img: img, px: new Uint32Array(img.data.buffer) };
  }
  var lines = layer();
  var fills = layer();

  var toolCm = 10;
  var paused = false;
  var cam = { s: 1, ox: 0, oy: 0 };
  var hover = null;
  var pan = null;
  var VECTOR_AT = 4;

  function differs(i, j) {
    if (mat[i] !== mat[j]) return true;
    return body[i] !== body[j];
  }

  function open(m) {
    return m === AIR || m === WATER || m === OIL;
  }

  function exposed(i, x, y) {
    return (x > 0 && open(mat[i - 1])) || (x < W - 1 && open(mat[i + 1])) ||
      (y > 0 && open(mat[i - W])) || (y < H - 1 && open(mat[i + W]));
  }

  function isFluid(m) {
    return m === WATER || m === OIL;
  }

  function waterColor(i) {
    var f = 1 + (shade[i] - 128) / 128 * 0.03;
    return pack(116 * f | 0, 152 * f | 0, 184 * f | 0, 215);
  }

  function hatch(m, i, x, y) {
    var f = flag[i];
    if (f & CRACK) return P_INK;
    if ((f & LOOSE) && m !== SAND) return shade[i] < 90 ? P_MID : 0;
    if (m === SAND) {
      if (f & WET) return shade[i] < 24 ? P_WATER : P_WET;
      return shade[i] < 14 ? P_FAINT : 0;
    }
    if (m === TOPSOIL) return shade[i] < 22 ? P_MID : 0;
    if (m === CLAY) return y % 4 === 0 ? P_MID : 0;
    if (m === GRAVEL) return shade[i] < 12 ? P_FAINT : 0;
    if (m === STONE) return (x + y) % 7 === 0 ? P_MID : 0;
    return 0;
  }

  function lineColor(i, x, y) {
    var m = mat[i];
    if (m === AIR || m === OIL) return 0;
    if (m === WATER) return waterColor(i);
    if (exposed(i, x, y)) return P_INK;
    if ((x > 0 && differs(i, i - 1)) || (y > 0 && differs(i, i - W))) return P_INK;
    return hatch(m, i, x, y);
  }

  function paintRect(x0, y0, x1, y1) {
    var lp = lines.px, fp = fills.px;
    for (var y = y0; y <= y1; y++) {
      var row = y * W;
      for (var x = x0; x <= x1; x++) {
        var i = row + x;
        lp[i] = lineColor(i, x, y);
        fp[i] = mat[i] === WATER ? lp[i] : (flag[i] & WET) ? P_WET : 0;
        var o = mat[i] === OIL ? 1 : 0;
        if (o !== oilSeen[i]) { oilSeen[i] = o; oilDirty = true; }
      }
    }
    var w = x1 - x0 + 1, h = y1 - y0 + 1;
    lines.ctx.putImageData(lines.img, 0, 0, x0, y0, w, h);
    fills.ctx.putImageData(fills.img, 0, 0, x0, y0, w, h);
  }

  /* Oil is drawn as one smooth shape: the cells are blurred into a field
     and its 0.5 contour traced with marching squares. Walls count as half
     oil so the shape meets them flush, and the fill is clipped to open
     cells so it never covers the ground. */
  var OIL_FILL = "#28241f", WALL = 0.45, LEVEL = 0.5;
  var oilSeen = new Uint8Array(W * H);
  var oilDirty = true, oilPath = null, oilClip = null;
  var SQ_X = [0, 1, 1, 0], SQ_Y = [0, 0, 1, 1];

  function blur3(a, b, w, h) {
    var x, y, k;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        k = y * w + x;
        b[k] = (a[x > 0 ? k - 1 : k] + a[k] + a[x < w - 1 ? k + 1 : k]) / 3;
      }
    }
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        k = y * w + x;
        a[k] = (b[y > 0 ? k - w : k] + b[k] + b[y < h - 1 ? k + w : k]) / 3;
      }
    }
  }

  function buildOil() {
    oilDirty = false;
    oilPath = null;
    var x0 = W, y0 = H, x1 = -1, y1 = -1, x, y, k;
    for (y = 0; y < H; y++) {
      var row = oilSeen.subarray(y * W, y * W + W);
      var a = row.indexOf(1);
      if (a < 0) continue;
      x0 = Math.min(x0, a);
      x1 = Math.max(x1, row.lastIndexOf(1));
      if (y0 === H) y0 = y;
      y1 = y;
    }
    if (x1 < 0) return;
    x0 = Math.max(0, x0 - 3); y0 = Math.max(0, y0 - 3);
    x1 = Math.min(W - 1, x1 + 3); y1 = Math.min(H - 1, y1 + 3);
    var w = x1 - x0 + 1, h = y1 - y0 + 1;
    var f = new Float32Array(w * h), tmp = new Float32Array(w * h);
    oilClip = new Path2D();
    for (y = 0; y < h; y++) {
      var run = -1;
      for (x = 0; x <= w; x++) {
        var m = x < w ? mat[(y0 + y) * W + x0 + x] : STONE;
        var openCell = open(m);
        if (x < w) f[y * w + x] = m === OIL ? 1 : openCell ? 0 : WALL;
        if (openCell && run < 0) run = x;
        else if (!openCell && run >= 0) { oilClip.rect(x0 + run, y0 + y, x - run, 1); run = -1; }
      }
    }
    blur3(f, tmp, w, h);
    blur3(f, tmp, w, h);
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        if (oilSeen[(y0 + y) * W + x0 + x]) f[y * w + x] = Math.max(f[y * w + x], 0.6);
      }
    }
    var p = new Path2D(), v = [0, 0, 0, 0];
    for (y = 0; y < h - 1; y++) {
      var full = -1;
      for (x = 0; x < w - 1; x++) {
        var n = 0;
        for (k = 0; k < 4; k++) {
          v[k] = f[(y + SQ_Y[k]) * w + x + SQ_X[k]];
          if (v[k] >= LEVEL) n++;
        }
        if (n === 4) { if (full < 0) full = x; continue; }
        if (full >= 0) { p.rect(x0 + full + 0.5, y0 + y + 0.5, x - full, 1); full = -1; }
        if (!n) continue;
        var first = true;
        for (k = 0; k < 4; k++) {
          var b = (k + 1) & 3, inA = v[k] >= LEVEL;
          var px = x0 + x + 0.5 + SQ_X[k], py = y0 + y + 0.5 + SQ_Y[k];
          if (inA) {
            if (first) { p.moveTo(px, py); first = false; } else p.lineTo(px, py);
          }
          if (inA !== (v[b] >= LEVEL)) {
            var t = (LEVEL - v[k]) / (v[b] - v[k]);
            var qx = px + t * (SQ_X[b] - SQ_X[k]), qy = py + t * (SQ_Y[b] - SQ_Y[k]);
            if (first) { p.moveTo(qx, qy); first = false; } else p.lineTo(qx, qy);
          }
        }
        p.closePath();
      }
      if (full >= 0) p.rect(x0 + full + 0.5, y0 + y + 0.5, w - 1 - full, 1);
    }
    oilPath = p;
  }

  function drawOil() {
    if (oilDirty) buildOil();
    if (!oilPath) return;
    ctx.save();
    ctx.translate(-cam.ox * cam.s, -cam.oy * cam.s);
    ctx.scale(cam.s, cam.s);
    ctx.clip(oilClip);
    ctx.fillStyle = OIL_FILL;
    ctx.fill(oilPath);
    ctx.restore();
  }

  function recolor() {
    for (var cy = 0; cy < CH; cy++) {
      var cx = 0;
      while (cx < CW) {
        if (!dirty[cy * CW + cx]) { cx++; continue; }
        var start = cx;
        while (cx < CW && dirty[cy * CW + cx]) { dirty[cy * CW + cx] = 0; cx++; }
        paintRect(Math.max(0, start * CS - 1), Math.max(0, cy * CS - 1),
          Math.min(W - 1, cx * CS), Math.min(H - 1, cy * CS + CS));
      }
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = Math.max(1, window.innerWidth);
    cssH = Math.max(1, window.innerHeight);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }

  function fitScale() {
    return (cssW - 40) / W;
  }

  function fit() {
    cam.s = fitScale();
    cam.ox = -20 / cam.s;
    cam.oy = H / 2 - cssH / 2 / cam.s;
  }

  function toWorld(px, py) {
    return { x: px / cam.s + cam.ox, y: py / cam.s + cam.oy };
  }

  function toScreen(x, y) {
    return { x: (x - cam.ox) * cam.s, y: (y - cam.oy) * cam.s };
  }

  function visible() {
    return {
      x0: Math.max(0, Math.floor(cam.ox)),
      y0: Math.max(0, Math.floor(cam.oy)),
      x1: Math.min(W, Math.ceil(cam.ox + cssW / cam.s)),
      y1: Math.min(H, Math.ceil(cam.oy + cssH / cam.s))
    };
  }

  function blit(l) {
    var v = visible();
    if (v.x1 <= v.x0 || v.y1 <= v.y0) return;
    ctx.imageSmoothingEnabled = cam.s < 1;
    ctx.drawImage(l.cv, v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0,
      (v.x0 - cam.ox) * cam.s, (v.y0 - cam.oy) * cam.s, (v.x1 - v.x0) * cam.s, (v.y1 - v.y0) * cam.s);
  }

  /* Edges between air and fluids stay unlined, as the fill shows them. */
  function edge(i, j) {
    if (!differs(i, j)) return false;
    var a = mat[i], b = mat[j];
    return !((a === AIR || isFluid(a)) && (b === AIR || isFluid(b)));
  }

  /* Close up the line look is stroked per cell, so lines stay one pixel
     thin however far in the view goes. Water, wet ground and oil are
     filled underneath. */
  function strokeLines() {
    blit(fills);
    drawOil();
    var v = visible();
    var vx0 = v.x0, vx1 = v.x1;
    var ink = new Path2D(), mid = new Path2D();
    var dMid = new Path2D(), dFaint = new Path2D(), dWater = new Path2D();
    for (var y = v.y0; y < v.y1; y++) {
      for (var x = vx0; x < vx1; x++) {
        var i = y * W + x, m = mat[i];
        if (x < W - 1 && edge(i, i + 1)) {
          ink.moveTo(x + 1, y);
          ink.lineTo(x + 1, y + 1);
        }
        if (y < H - 1 && edge(i, i + W)) {
          ink.moveTo(x, y + 1);
          ink.lineTo(x + 1, y + 1);
        }
        if (m === AIR || isFluid(m)) continue;
        var f = flag[i], sh = shade[i];
        if (f & CRACK) {
          if (sh & 1) { ink.moveTo(x, y); ink.lineTo(x + 1, y + 1); }
          else { ink.moveTo(x, y + 1); ink.lineTo(x + 1, y); }
          continue;
        }
        if ((f & LOOSE) && m !== SAND) {
          if (sh < 90) dMid.rect(x + 0.35, y + 0.35, 0.3, 0.3);
          continue;
        }
        if (m === SAND) {
          if (f & WET) { if (sh < 24) dWater.rect(x + 0.38, y + 0.38, 0.24, 0.24); }
          else if (sh < 14) dFaint.rect(x + 0.38, y + 0.38, 0.24, 0.24);
        } else if (m === TOPSOIL) {
          if (sh < 22) { mid.moveTo(x + 0.1, y + 0.5); mid.lineTo(x + 1.3, y + 0.5); }
        } else if (m === CLAY) {
          if (y % 4 === 0) { mid.moveTo(x, y); mid.lineTo(x + 1, y); }
        } else if (m === GRAVEL) {
          if (sh < 12) dFaint.rect(x + 0.38, y + 0.38, 0.24, 0.24);
        } else if (m === STONE) {
          if ((x + y) % 7 === 0) { mid.moveTo(x, y + 1); mid.lineTo(x + 1, y); }
        }
      }
    }
    ctx.save();
    ctx.translate(-cam.ox * cam.s, -cam.oy * cam.s);
    ctx.scale(cam.s, cam.s);
    ctx.lineWidth = 1 / cam.s;
    ctx.lineCap = "butt";
    ctx.strokeStyle = MID; ctx.stroke(mid);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.2 / cam.s; ctx.stroke(ink);
    ctx.fillStyle = MID; ctx.fill(dMid);
    ctx.fillStyle = FAINT; ctx.fill(dFaint);
    ctx.fillStyle = WATER_INK; ctx.fill(dWater);
    ctx.restore();
  }

  function drawLook() {
    if (cam.s >= VECTOR_AT) strokeLines();
    else { blit(lines); drawOil(); }
  }

  function text(s, x, y, color, align, px, weight) {
    ctx.font = (weight || 400) + " " + (px || 12) + "px ui-sans-serif, 'Helvetica Neue', Helvetica, Arial, sans-serif";
    ctx.fillStyle = color;
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(s, x, y);
  }

  function drawFrame() {
    var a = toScreen(0, 0), b = toScreen(W, H);
    ctx.strokeStyle = MID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x, toScreen(0, S.SKY).y);
    ctx.lineTo(a.x, b.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(b.x, toScreen(0, S.SKY).y);
    ctx.stroke();
    for (var k = 0; k < S.BAYS.length; k++) {
      var bay = S.BAYS[k];
      var left = toScreen(k * S.BAY, S.SKY);
      var mid = toScreen((k + 0.5) * S.BAY, S.SKY);
      if (k > 0) {
        ctx.strokeStyle = FAINT;
        ctx.beginPath();
        ctx.moveTo(left.x + 0.5, left.y - 8);
        ctx.lineTo(left.x + 0.5, left.y - 1);
        ctx.stroke();
      }
      text(bay.name, mid.x, mid.y - (bay.note ? 20 : 8), INK, "center", 12, 500);
      if (bay.note) text(bay.note, mid.x, mid.y - 7, FAINT, "center", 11);
    }
    var t0 = toScreen(5 * S.BAY, S.TABLE), t1 = toScreen(6 * S.BAY, S.TABLE);
    ctx.save();
    ctx.strokeStyle = WATER_INK;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(t0.x, t0.y);
    ctx.lineTo(t1.x, t0.y);
    ctx.stroke();
    ctx.restore();
    if (t1.x - t0.x > 90) text("water table", t1.x - 4, t0.y - 4, WATER_INK, "right", 11);
  }

  var reachCache = { key: "", ok: false, at: 0 };

  function hoverReach(f) {
    var key = f.x0 + "," + f.y0 + "," + f.x1;
    var now = performance.now();
    if (key !== reachCache.key || now - reachCache.at > 150) {
      reachCache = { key: key, ok: S.canReach(f), at: now };
    }
    return reachCache.ok;
  }

  function drawHover() {
    if (!hover || pan) return;
    var w = toWorld(hover.x, hover.y);
    var f = S.footprint(w.x, w.y, toolCm);
    var ok = hoverReach(f);
    var a = toScreen(f.x0, f.y0), b = toScreen(f.x1 + 1, f.y1 + 1);
    ctx.save();
    ctx.strokeStyle = ok ? INK : FAINT;
    ctx.lineWidth = 1;
    if (!ok) ctx.setLineDash([3, 3]);
    ctx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.max(1, Math.round(b.x - a.x)), Math.max(1, Math.round(b.y - a.y)));
    ctx.restore();
    var here = S.at(w.x, w.y);
    var label = !ok ? "out of reach" : !here || here.mat === AIR ? "" :
      here.name + (here.hitsLeft > 1 ? ", " + here.hitsLeft + " hits" : "");
    if (label) {
      ctx.font = "12px ui-sans-serif, 'Helvetica Neue', Helvetica, Arial, sans-serif";
      var tw = ctx.measureText(label).width;
      var lx = Math.max(a.x, b.x) + 8, ly = Math.min(a.y, b.y) - 6;
      ctx.fillStyle = PAPER;
      ctx.fillRect(lx - 3, ly - 12, tw + 6, 16);
      text(label, lx, ly, ok ? INK : FAINT);
    }
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, cssW, cssH);
    drawLook();
    drawFrame();
    drawHover();
  }

  var statsEl = document.getElementById("stats");
  var fps = 0, frames = 0, fpsAt = 0, simMs = 0;

  function showStats(now) {
    frames++;
    if (now - fpsAt < 250) return;
    fps = frames * 1000 / (now - fpsAt);
    frames = 0;
    fpsAt = now;
    var s = S.stats();
    var rows = [
      ["fps", Math.round(fps)],
      ["sim", simMs.toFixed(1) + " ms"],
      ["zoom", (cam.s >= 1 ? cam.s.toFixed(1) : cam.s.toFixed(2)) + " px/cm"],
      ["moving", s.active + " of " + s.chunks + " chunks"],
      ["clumps", s.awake + " moving, " + s.clumps],
      ["calmed", s.calmed + " clumps stopped from jiggling"]
    ];
    var any = false;
    for (var m = 1; m < s.taken.length; m++) {
      if (!s.taken[m]) continue;
      rows.push([any ? "" : "taken", S.NAMES[m] + " " + s.taken[m] + " cm²"]);
      any = true;
    }
    if (!any) rows.push(["taken", "nothing yet"]);
    var html = "";
    for (var r = 0; r < rows.length; r++) html += "<dt>" + rows[r][0] + "</dt><dd>" + rows[r][1] + "</dd>";
    statsEl.innerHTML = html;
  }

  var last = 0, acc = 0;
  function frame(now) {
    var dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    if (!paused) {
      acc += dt;
      var n = 0, t0 = performance.now();
      while (acc >= 1 / 60 && n < 3) {
        S.step();
        acc -= 1 / 60;
        n++;
      }
      if (n === 3) acc = 0;
      if (n) simMs = simMs * 0.8 + (performance.now() - t0) / n * 0.2;
    }
    recolor();
    render();
    showStats(now);
    requestAnimationFrame(frame);
  }

  function zoomAt(dy, px, py) {
    var before = toWorld(px, py);
    var s = cam.s * Math.pow(10, -dy * 0.00115);
    cam.s = Math.max(fitScale() * 0.8, Math.min(48, s));
    cam.ox = before.x - px / cam.s;
    cam.oy = before.y - py / cam.s;
  }

  canvas.addEventListener("wheel", function (event) {
    event.preventDefault();
    var dy = event.deltaY;
    if (event.shiftKey && !dy) dy = event.deltaX;
    if (event.deltaMode === 1) dy *= 16;
    else if (event.deltaMode === 2) dy *= 400;
    dy *= event.shiftKey ? 1 : 0.33;
    zoomAt(dy, event.clientX, event.clientY);
  }, { passive: false });

  canvas.addEventListener("mousedown", function (event) {
    if (event.button === 0) {
      var w = toWorld(event.clientX, event.clientY);
      S.dig(w.x, w.y, toolCm);
      reachCache.key = "";
    } else {
      pan = { x: event.clientX, y: event.clientY, ox: cam.ox, oy: cam.oy };
    }
    event.preventDefault();
  });
  window.addEventListener("mousemove", function (event) {
    hover = { x: event.clientX, y: event.clientY };
    if (pan) {
      cam.ox = pan.ox - (event.clientX - pan.x) / cam.s;
      cam.oy = pan.oy - (event.clientY - pan.y) / cam.s;
    }
    canvas.style.cursor = pan ? "grabbing" : "crosshair";
  });
  window.addEventListener("mouseup", function () { pan = null; });
  canvas.addEventListener("mouseleave", function () { hover = null; });
  canvas.addEventListener("contextmenu", function (event) { event.preventDefault(); });
  window.addEventListener("resize", function () { resize(); });

  var toolEl = document.getElementById("tool");
  var toolOut = document.getElementById("toolOut");
  function setTool(cm) {
    toolCm = Math.max(1, Math.min(100, Math.round(cm)));
    toolEl.value = Math.log10(toolCm) / 2;
    toolOut.textContent = toolCm >= 100 ? "1 m" : toolCm + " cm";
  }
  toolEl.addEventListener("input", function () {
    setTool(Math.pow(10, Number(toolEl.value) * 2));
  });

  var pauseEl = document.getElementById("pause");
  pauseEl.addEventListener("click", function () {
    paused = !paused;
    pauseEl.textContent = paused ? "run" : "pause";
  });
  document.getElementById("reset").addEventListener("click", function () { S.reset(); });

  resize();
  fit();
  var q = new URLSearchParams(location.search);
  setTool(Number(q.get("tool")) || 10);
  if (q.get("s")) {
    cam.s = Number(q.get("s"));
    cam.ox = (Number(q.get("x")) || 0) - cssW / 2 / cam.s;
    cam.oy = (Number(q.get("y")) || S.SKY) - cssH / 2 / cam.s;
  }
  requestAnimationFrame(frame);

  window.DIGVIEW = {
    cam: cam,
    recolor: recolor,
    render: render,
    setTool: setTool,
    toWorld: toWorld,
    toScreen: toScreen
  };
})();
