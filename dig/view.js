/* Draws the dig grid as tiles or as line-art, or both stacked with one
   camera so the same ground shows twice, and turns clicks into hits. */
(function () {
  "use strict";

  var S = DIG;
  var W = S.W, H = S.H, CS = S.CS, CW = S.CW, CH = S.CH;
  var mat = S.mat, flag = S.flag, body = S.body, shade = S.shade, dmg = S.dmg, dirty = S.dirty;
  var AIR = S.AIR, SAND = S.SAND, TOPSOIL = S.TOPSOIL, CLAY = S.CLAY, GRAVEL = S.GRAVEL;
  var STONE = S.STONE, WATER = S.WATER, OIL = S.OIL;
  var LOOSE = S.LOOSE, WET = S.WET, CRACK = S.CRACK;

  var PAPER = "#f3f0e8", INK = "#3a4654", MID = "#5c6c7c", FAINT = "#8e9bab", WATER_INK = "#46698f";

  var TILE = [
    null,
    [222, 205, 163],
    [112, 98, 82],
    [166, 136, 112],
    [150, 148, 138],
    [125, 135, 148],
    [116, 152, 184],
    [40, 36, 33]
  ];
  var WET_SAND = [178, 166, 138];
  var VARY = [0, 0.07, 0.1, 0.05, 0.08, 0.05, 0.03, 0.05];

  function pack(r, g, b, a) {
    return ((a << 24) | (Math.min(255, b) << 16) | (Math.min(255, g) << 8) | Math.min(255, r)) >>> 0;
  }
  function packHex(hex) {
    var v = parseInt(hex.slice(1), 16);
    return pack((v >> 16) & 255, (v >> 8) & 255, v & 255, 255);
  }
  var P_INK = packHex(INK), P_MID = packHex(MID), P_FAINT = packHex(FAINT), P_WATER = packHex(WATER_INK);

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
  var tiles = layer();
  var lines = layer();

  var look = "split";
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

  function exposed(i, x, y) {
    return (x > 0 && mat[i - 1] === AIR) || (x < W - 1 && mat[i + 1] === AIR) ||
      (y > 0 && mat[i - W] === AIR) || (y < H - 1 && mat[i + W] === AIR);
  }

  function bodyEdge(i, x, y, b) {
    return (x > 0 && body[i - 1] !== b) || (x < W - 1 && body[i + 1] !== b) ||
      (y > 0 && body[i - W] !== b) || (y < H - 1 && body[i + W] !== b);
  }

  function tileColor(i, x, y) {
    var m = mat[i];
    if (m === AIR) return 0;
    var c = m === SAND && (flag[i] & WET) ? WET_SAND : TILE[m];
    var f = 1 + (shade[i] - 128) / 128 * VARY[m];
    var b = body[i];
    if (b) {
      if (bodyEdge(i, x, y, b)) f *= 0.72;
    } else if (m !== WATER && m !== OIL && exposed(i, x, y)) f *= 0.86;
    if (flag[i] & CRACK) f *= 0.5;
    if ((flag[i] & LOOSE) && m !== SAND) f *= 0.9;
    if (dmg[i] && !b) f *= Math.max(0.78, 1 - 0.04 * dmg[i]);
    return pack(c[0] * f | 0, c[1] * f | 0, c[2] * f | 0, m === WATER ? 215 : 255);
  }

  function hatch(m, i, x, y) {
    var f = flag[i];
    if (f & CRACK) return P_INK;
    if ((f & LOOSE) && m !== SAND) return shade[i] < 90 ? P_MID : 0;
    if (m === SAND) {
      if (f & WET) return shade[i] < 24 ? P_WATER : 0;
      return shade[i] < 14 ? P_FAINT : 0;
    }
    if (m === TOPSOIL) return shade[i] < 22 ? P_MID : 0;
    if (m === CLAY) return y % 4 === 0 ? P_MID : 0;
    if (m === GRAVEL) return shade[i] < 12 ? P_FAINT : 0;
    if (m === STONE) return (x + y) % 7 === 0 ? P_MID : 0;
    if (m === WATER) return y % 3 === 0 && (x + y) % 7 < 5 ? P_WATER : 0;
    if (m === OIL) return (x + y) % 3 === 0 || (x - y + 3 * W) % 3 === 0 ? P_INK : 0;
    return 0;
  }

  function lineColor(i, x, y) {
    var m = mat[i];
    if (m === AIR) return 0;
    var airEdge = exposed(i, x, y);
    if (airEdge) return m === WATER ? P_WATER : P_INK;
    if ((x > 0 && differs(i, i - 1)) || (y > 0 && differs(i, i - W))) return m === WATER ? P_WATER : P_INK;
    return hatch(m, i, x, y);
  }

  function paintRect(x0, y0, x1, y1) {
    var tp = tiles.px, lp = lines.px;
    for (var y = y0; y <= y1; y++) {
      var row = y * W;
      for (var x = x0; x <= x1; x++) {
        var i = row + x;
        tp[i] = tileColor(i, x, y);
        lp[i] = lineColor(i, x, y);
      }
    }
    var w = x1 - x0 + 1, h = y1 - y0 + 1;
    tiles.ctx.putImageData(tiles.img, 0, 0, x0, y0, w, h);
    lines.ctx.putImageData(lines.img, 0, 0, x0, y0, w, h);
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

  /* The camera is shared. Its oy is the world row at the top of each
     viewport, so stacked viewports show the same ground. */
  function viewports() {
    if (look !== "split") return [{ y0: 0, h: cssH, kind: look }];
    var half = Math.round(cssH / 2);
    return [{ y0: 0, h: half, kind: "tiles" }, { y0: half, h: cssH - half, kind: "lines" }];
  }

  var vp = { y0: 0, h: 1, kind: "tiles" };

  function fit() {
    var h = viewports()[0].h;
    cam.s = fitScale();
    cam.ox = -20 / cam.s;
    cam.oy = H / 2 - h / 2 / cam.s;
  }

  function viewportAt(py) {
    var list = viewports();
    for (var k = list.length - 1; k >= 0; k--) if (py >= list[k].y0) return list[k];
    return list[0];
  }

  function toWorld(px, py) {
    var v = viewportAt(py);
    return { x: px / cam.s + cam.ox, y: (py - v.y0) / cam.s + cam.oy };
  }

  function toScreen(x, y) {
    return { x: (x - cam.ox) * cam.s, y: vp.y0 + (y - cam.oy) * cam.s };
  }

  function visible() {
    return {
      x0: Math.max(0, Math.floor(cam.ox)),
      y0: Math.max(0, Math.floor(cam.oy)),
      x1: Math.min(W, Math.ceil(cam.ox + cssW / cam.s)),
      y1: Math.min(H, Math.ceil(cam.oy + vp.h / cam.s))
    };
  }

  function blit(l) {
    var v = visible();
    if (v.x1 <= v.x0 || v.y1 <= v.y0) return;
    ctx.imageSmoothingEnabled = cam.s < 1;
    ctx.drawImage(l.cv, v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0,
      (v.x0 - cam.ox) * cam.s, vp.y0 + (v.y0 - cam.oy) * cam.s, (v.x1 - v.x0) * cam.s, (v.y1 - v.y0) * cam.s);
  }

  /* Close up the line look is stroked per cell, so lines stay one pixel
     thin however far in the view goes. */
  function strokeLines() {
    var v = visible();
    var vx0 = v.x0, vx1 = v.x1;
    var ink = new Path2D(), mid = new Path2D(), water = new Path2D();
    var dInk = new Path2D(), dMid = new Path2D(), dFaint = new Path2D(), dWater = new Path2D();
    for (var y = v.y0; y < v.y1; y++) {
      for (var x = vx0; x < vx1; x++) {
        var i = y * W + x, m = mat[i];
        if (x < W - 1 && differs(i, i + 1)) {
          var pv = (m === WATER && mat[i + 1] === AIR) || (m === AIR && mat[i + 1] === WATER) ? water : ink;
          pv.moveTo(x + 1, y);
          pv.lineTo(x + 1, y + 1);
        }
        if (y < H - 1 && differs(i, i + W)) {
          var ph = (m === WATER && mat[i + W] === AIR) || (m === AIR && mat[i + W] === WATER) ? water : ink;
          ph.moveTo(x, y + 1);
          ph.lineTo(x + 1, y + 1);
        }
        if (m === AIR) continue;
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
        } else if (m === WATER) {
          if (y % 3 === 0 && (x + y) % 7 < 5) { water.moveTo(x, y + 0.5); water.lineTo(x + 1, y + 0.5); }
        } else if (m === OIL) {
          if ((x + y) % 3 === 0) { ink.moveTo(x, y + 1); ink.lineTo(x + 1, y); }
          if ((x - y + 3 * W) % 3 === 0) { ink.moveTo(x, y); ink.lineTo(x + 1, y + 1); }
        }
      }
    }
    ctx.save();
    ctx.translate(-cam.ox * cam.s, vp.y0 - cam.oy * cam.s);
    ctx.scale(cam.s, cam.s);
    ctx.lineWidth = 1 / cam.s;
    ctx.lineCap = "butt";
    ctx.strokeStyle = MID; ctx.stroke(mid);
    ctx.strokeStyle = WATER_INK; ctx.stroke(water);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.2 / cam.s; ctx.stroke(ink);
    ctx.fillStyle = INK; ctx.fill(dInk);
    ctx.fillStyle = MID; ctx.fill(dMid);
    ctx.fillStyle = FAINT; ctx.fill(dFaint);
    ctx.fillStyle = WATER_INK; ctx.fill(dWater);
    ctx.restore();
  }

  function drawLook() {
    if (vp.kind === "tiles") blit(tiles);
    else if (cam.s >= VECTOR_AT) strokeLines();
    else blit(lines);
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
    var own = viewportAt(hover.y) === vp || viewportAt(hover.y).kind === vp.kind;
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
    if (label && own) {
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
    var list = viewports();
    for (var k = 0; k < list.length; k++) {
      vp = list[k];
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, vp.y0, cssW, vp.h);
      ctx.clip();
      drawLook();
      drawFrame();
      drawHover();
      if (list.length > 1) text(vp.kind, cssW - 12, vp.y0 + vp.h - 10, FAINT, "right");
      ctx.restore();
      if (k > 0) {
        ctx.strokeStyle = MID;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, vp.y0 + 0.5);
        ctx.lineTo(cssW, vp.y0 + 0.5);
        ctx.stroke();
      }
    }
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
      ["clumps", s.awake + " moving, " + s.clumps]
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
    var top = viewportAt(py).y0;
    var s = cam.s * Math.pow(10, -dy * 0.00115);
    cam.s = Math.max(fitScale() * 0.8, Math.min(48, s));
    cam.ox = before.x - px / cam.s;
    cam.oy = before.y - (py - top) / cam.s;
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

  var lookButtons = document.querySelectorAll("[data-look]");
  function setLook(kind) {
    look = kind;
    for (var k = 0; k < lookButtons.length; k++) {
      lookButtons[k].classList.toggle("on", lookButtons[k].getAttribute("data-look") === kind);
    }
  }
  for (var k = 0; k < lookButtons.length; k++) {
    lookButtons[k].addEventListener("click", function () { setLook(this.getAttribute("data-look")); });
  }
  var pauseEl = document.getElementById("pause");
  pauseEl.addEventListener("click", function () {
    paused = !paused;
    pauseEl.textContent = paused ? "run" : "pause";
  });
  document.getElementById("reset").addEventListener("click", function () { S.reset(); });

  resize();
  fit();
  var q = new URLSearchParams(location.search);
  setLook(["tiles", "lines", "split"].indexOf(q.get("look")) >= 0 ? q.get("look") : "split");
  setTool(Number(q.get("tool")) || 10);
  if (q.get("s")) {
    cam.s = Number(q.get("s"));
    cam.ox = (Number(q.get("x")) || 0) - cssW / 2 / cam.s;
    cam.oy = (Number(q.get("y")) || S.SKY) - viewports()[0].h / 2 / cam.s;
  }
  requestAnimationFrame(frame);

  window.DIGVIEW = {
    cam: cam,
    recolor: recolor,
    render: render,
    setLook: setLook,
    setTool: setTool,
    toWorld: toWorld,
    toScreen: toScreen
  };
})();
