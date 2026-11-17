/* Line section for "6.371 km left".
   Open index.html in a browser (no server). The wheel zooms from the
   10 m² patch to a section of the Earth. Keys 1, 2 and 3 jump. */

(function () {
  "use strict";

  var R_KM = 6371;
  var R = R_KM * 1000;
  var PATCH = Math.sqrt(10);
  var PIT_W = 1.2;
  var PIT_D = 0.22;
  var TOPSOIL = 0.3;
  var SUBSOIL = 1.5;

  var PAPER = "#f3f0e8";
  var INK = "#3a4654";
  var MID = "#5c6c7c";
  var FAINT = "#8e9bab";
  var HAIR = "#b7c0c8";

  var LAYERS = [
    { depth: TOPSOIL, name: "topsoil", rank: "local" },
    { depth: SUBSOIL, name: "subsoil", rank: "local" },
    { depth: 12, name: "rockhead", rank: "local" },
    { depth: 24400, name: "Moho", rank: "shell" },
    { depth: 80000, name: "lithosphere", rank: "shell", dash: true },
    { depth: 410000, name: "410 km", rank: "shell", dash: true },
    { depth: 660000, name: "660 km", rank: "shell", dash: true },
    { depth: 2891000, name: "core–mantle", rank: "shell" },
    { depth: 5150000, name: "inner core", rank: "shell" }
  ];

  var canvas = document.getElementById("sheet");
  var ctx = canvas.getContext("2d");
  var cssW = 1;
  var cssH = 1;
  var dpr = 1;

  var logW = Math.log10(nearWidth());
  var lock = "near";

  function nearWidth() {
    return PATCH / 0.4;
  }

  function farWidth(aspect) {
    return 2.75 * R * Math.max(aspect, 1);
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

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = Math.max(1, window.innerWidth);
    cssH = Math.max(1, window.innerHeight);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function sheetBox() {
    var m = cssW < 720 ? 14 : 22;
    return { x: m, y: m, w: cssW - m * 2, h: cssH - m * 2 };
  }

  function titleBlock(box) {
    var w = Math.min(268, box.w - 24);
    var h = 168;
    return {
      x: box.x + box.w - w - 10,
      y: box.y + box.h - h - 10,
      w: w,
      h: h
    };
  }

  function viewOf(worldW) {
    var box = sheetBox();
    var aspect = box.w / Math.max(1, box.h);
    var worldH = worldW / aspect;
    var sNear = 0.2;
    var topNear = -sNear * worldH;
    var topFar = R - worldH / 2;
    var logH = Math.log10(Math.max(worldH, 1));
    var u = smoothstep(
      (logH - Math.log10(0.35 * R)) / (Math.log10(2.6 * R) - Math.log10(0.35 * R))
    );
    var top = lerp(topNear, topFar, u);
    if (u < 0.999) top = clamp(top, -0.42 * worldH, -0.05 * worldH);
    return {
      box: box,
      worldW: worldW,
      worldH: worldH,
      left: -worldW / 2,
      top: top,
      px: box.w / worldW
    };
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

  function drawHatch(v) {
    var half = PATCH / 2;
    var pit = PIT_W / 2;
    var band = TOPSOIL * v.px;
    if (band > 5 && PATCH * v.px > 24) {
      var yL = surfaceY(-half);
      var yR = surfaceY(half);
      hatch(screenPoly(v, [
        [-half, yL],
        [half, yR],
        [half, yR + TOPSOIL],
        [-half, yL + TOPSOIL]
      ]), 8, Math.PI / 4);
    }
    if (PIT_D * v.px > 6 && PIT_W * v.px > 14) {
      var sL = surfaceY(-pit);
      var sR = surfaceY(pit);
      hatch(screenPoly(v, [
        [-pit, sL],
        [pit, sR],
        [pit, sR + PIT_D],
        [-pit, sL + PIT_D]
      ]), 5, -Math.PI / 4);
    }
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

    var d;
    for (d = 0; d <= bottomWorld + step * 0.5; d += step) {
      var y = worldToScreen(v, 0, d).y;
      if (y < v.box.y || y > v.box.y + v.box.h) continue;
      var isMajor = Math.abs(d / major - Math.round(d / major)) < 1e-6;
      ctx.strokeStyle = isMajor ? MID : HAIR;
      ctx.lineWidth = isMajor ? 0.9 : 0.6;
      var len = isMajor ? 8 : 4;
      strokeLine(x - len, y, x, y);
      if (isMajor) pushLabel(d, d === 0 ? "0" : formatLength(d), false);
    }

    for (var i = 0; i < LAYERS.length; i++) {
      var layer = LAYERS[i];
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
    ctx.strokeStyle = "#c9c3b6";
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
      ["depth", depth.text]
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
    ctx.restore();
  }

  function widthForLock(aspect) {
    if (lock === "near") return nearWidth();
    if (lock === "middle") return 250000 * aspect;
    if (lock === "globe") return farWidth(aspect);
    return null;
  }

  function draw() {
    resize();
    var aspect = sheetBox().w / Math.max(1, sheetBox().h);
    var forced = widthForLock(aspect);
    var worldW = forced === null
      ? clamp(Math.pow(10, logW), nearWidth(), farWidth(aspect))
      : forced;
    logW = Math.log10(worldW);
    var v = viewOf(worldW);
    var tb = titleBlock(v.box);

    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, cssW, cssH);

    ctx.save();
    clipSheet(v.box);
    drawHatch(v);
    drawLayers(v);
    drawPitAndSurfaceCut(v);
    drawCenterlines(v);
    drawPatchDims(v, tb);
    drawDepthScale(v, tb);
    drawRadiusDim(v, tb);
    drawLocator(v, tb);
    ctx.restore();

    drawFrame(v, tb);
  }

  function zoomBy(dy) {
    lock = null;
    logW += dy * 0.00115;
    draw();
  }

  function applyPreset(name) {
    if (name === "near" || name === "1") lock = "near";
    else if (name === "middle" || name === "2") lock = "middle";
    else if (name === "globe" || name === "3") lock = "globe";
    else return false;
    draw();
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
      draw();
      return;
    }
    if (!applyPreset(zoom || hash)) draw();
  }

  window.addEventListener("resize", draw);
  window.addEventListener("wheel", function (event) {
    event.preventDefault();
    var dy = event.deltaY;
    if (event.deltaMode === 1) dy *= 16;
    else if (event.deltaMode === 2) dy *= 400;
    zoomBy(dy);
  }, { passive: false });

  window.addEventListener("keydown", function (event) {
    var key = event.key;
    if (key === "1" || key === "2" || key === "3") {
      applyPreset(key);
      return;
    }
    if (key === "+" || key === "=" || key === "ArrowUp") zoomBy(-80);
    else if (key === "-" || key === "_" || key === "ArrowDown") zoomBy(80);
  });

  window.ZOOM = {
    setWorldWidth: function (meters) {
      logW = Math.log10(meters);
      draw();
    },
    preset: function (name) {
      applyPreset(name);
    },
    state: function () {
      var aspect = sheetBox().w / Math.max(1, sheetBox().h);
      var worldW = clamp(Math.pow(10, logW), nearWidth(), farWidth(aspect));
      var v = viewOf(worldW);
      return {
        worldW: v.worldW,
        worldH: v.worldH,
        depth: shownDepth(v).text,
        top: v.top
      };
    }
  };

  resize();
  readLocation();
  window.addEventListener("load", readLocation);
})();
