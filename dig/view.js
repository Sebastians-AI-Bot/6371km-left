/* The dig page: camera, frame and panel around the painter, and clicks
   turned into hits. */
(function () {
  "use strict";

  var S = DIG;
  var W = S.world.W, H = S.world.H, AIR = S.AIR;

  var PAPER = "#f3f0e8", INK = "#3a4654", MID = "#5c6c7c", FAINT = "#8e9bab", WATER_INK = "#46698f", WET_FILL = "#d5e1ea";

  var paint = makeDigPaint(S, {
    paper: PAPER, ink: INK, mid: MID, faint: FAINT,
    waterInk: WATER_INK, wet: WET_FILL, oil: "#28241f", water: "#7498b8"
  });

  var canvas = document.getElementById("sheet");
  var ctx = canvas.getContext("2d");
  var cssW = 1, cssH = 1, dpr = 1;

  var toolCm = 10;
  var paused = false;
  var cam = { s: 1, ox: 0, oy: 0 };
  var hover = null;
  var pan = null;
  var VECTOR_AT = 4;

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

  function drawLook() {
    ctx.save();
    ctx.setTransform(dpr * cam.s, 0, 0, dpr * cam.s, -cam.ox * cam.s * dpr, -cam.oy * cam.s * dpr);
    paint.draw(ctx, VECTOR_AT);
    ctx.restore();
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
    ctx.moveTo(a.x, toScreen(0, S.world.SKY).y);
    ctx.lineTo(a.x, b.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(b.x, toScreen(0, S.world.SKY).y);
    ctx.stroke();
    for (var k = 0; k < S.world.BAYS.length; k++) {
      var bay = S.world.BAYS[k];
      var left = toScreen(k * S.world.BAY, S.world.SKY);
      var mid = toScreen((k + 0.5) * S.world.BAY, S.world.SKY);
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
    var t0 = toScreen(5 * S.world.BAY, S.world.TABLE), t1 = toScreen(6 * S.world.BAY, S.world.TABLE);
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
  var fps = 0, frames = 0, fpsAt = 0;
  /* Per-frame costs summed since the panel last showed them, and the worst
     frame among them. */
  var sum = {}, worst = {};

  function noteCost(c) {
    for (var k in c) {
      sum[k] = (sum[k] || 0) + c[k];
      if (!(worst[k] >= c[k])) worst[k] = c[k];
    }
  }

  function costRows(n) {
    function ms(k) { return (sum[k] / n).toFixed(1) + " / " + worst[k].toFixed(1) + " ms"; }
    function count(k) { var v = sum[k] / n; return v >= 10000 ? Math.round(v / 1000) + "k" : v >= 1000 ? (v / 1000).toFixed(1) + "k" : String(Math.round(v)); }
    return [
      ["per frame", "average / worst"],
      ["frame", ms("frame")],
      ["js", ms("work")],
      ["sim", ms("sim")],
      ["\u00b7 cells", ms("cells")],
      ["\u00b7 clumps", ms("clumps")],
      ["\u00b7 settle", ms("settle")],
      ["drawing", ms("draw")],
      ["digging", ms("tools")],
      ["sim steps", (sum.steps / n).toFixed(1)],
      ["cells scanned", count("scanned")],
      ["grains checked", count("grains")],
      ["grains moved", count("grainsMoved")],
      ["liquids checked", count("liquids")],
      ["liquids moved", count("liquidsMoved")],
      ["pressure walk", count("pressure") + " cells"],
      ["seeps", (sum.seeps / n).toFixed(1)]
    ];
  }

  function showStats(now) {
    frames++;
    if (now - fpsAt < 500) return;
    fps = frames * 1000 / (now - fpsAt);
    fpsAt = now;
    var s = S.stats();
    var rows = [
      ["fps", Math.round(fps)],
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
    if (sum.frame !== undefined) rows = rows.concat(costRows(frames));
    frames = 0;
    sum = {};
    worst = {};
    var html = "";
    for (var r = 0; r < rows.length; r++) html += "<dt>" + rows[r][0] + "</dt><dd>" + rows[r][1] + "</dd>";
    statsEl.innerHTML = html;
  }

  var last = 0, acc = 0;
  function frame(now) {
    var gap = last ? now - last : 0;
    var dt = Math.min(0.1, gap / 1000);
    last = now;
    var t0 = performance.now();
    if (!paused) {
      acc += dt;
      var n = 0;
      while (acc >= 1 / 60 && n < 3) {
        S.step();
        acc -= 1 / 60;
        n++;
      }
      if (n === 3) acc = 0;
    }
    var t1 = performance.now();
    paint.recolor();
    render();
    var c = S.takeCost(), t2 = performance.now();
    c.frame = gap; c.work = t2 - t0; c.sim = t1 - t0; c.draw = t2 - t1;
    noteCost(c);
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
    cam.oy = (Number(q.get("y")) || S.world.SKY) - cssH / 2 / cam.s;
  }
  requestAnimationFrame(frame);

  window.DIGVIEW = {
    cam: cam,
    recolor: paint.recolor,
    render: render,
    setTool: setTool,
    toWorld: toWorld,
    toScreen: toScreen
  };
})();
