/* Paints a dig world (see makeDig) as line-art with water filled in and
   oil as one smooth shape. draw() and drawOverlay() take the context's
   current transform as the map from window cells to device pixels, so
   the same painter serves the dig page and the cut on the globe.

   The painter keeps its own copy of the cells in a window of the world,
   `view` {W, H, x0, y0} (the world's own by default), and follow() slides
   it. The overlay holds only what digging changed against the untouched
   ground: holes in paper, water and oil in their colours, moved ground
   faint. It is for views too far out for the cells themselves. Changed
   chunks outside the window are drawn on it from sheets, canvases of
   8 × 8 chunks each. */
function makeDigPaint(S, colors, view) {
  "use strict";

  view = view || S.world;
  var CS = S.CS, W = view.W, H = view.H;
  var CW = Math.ceil(W / CS), CH = Math.ceil(H / CS), CB = CS * CS;
  var ox = Math.floor((view.x0 || 0) / CS) * CS, oy = Math.floor((view.y0 || 0) / CS) * CS;
  var mat = new Uint8Array(W * H), flag = new Uint8Array(W * H), shade = new Uint8Array(W * H);
  var base = new Uint8Array(W * H), body = new Int32Array(W * H);
  var dirty = new Uint8Array(CW * CH), edited = new Uint8Array(CW * CH);
  var AIR = S.AIR, SAND = S.SAND, TOPSOIL = S.TOPSOIL, CLAY = S.CLAY, GRAVEL = S.GRAVEL;
  var STONE = S.STONE, WATER = S.WATER, OIL = S.OIL;
  var LOOSE = S.LOOSE, WET = S.WET, CRACK = S.CRACK;

  var C, P_INK, P_MID, P_FAINT, P_WATER, P_WET, P_PAPER, P_OIL, WATER_RGB;

  function pack(r, g, b, a) {
    return ((a << 24) | (Math.min(255, b) << 16) | (Math.min(255, g) << 8) | Math.min(255, r)) >>> 0;
  }
  function rgb(hex) {
    var v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function packHex(hex, a) {
    var c = rgb(hex);
    return pack(c[0], c[1], c[2], a == null ? 255 : a);
  }

  function setColors(c) {
    C = c;
    P_INK = packHex(c.ink); P_MID = packHex(c.mid); P_FAINT = packHex(c.faint);
    P_WATER = packHex(c.waterInk); P_WET = packHex(c.wet);
    P_PAPER = packHex(c.paper); P_OIL = packHex(c.oil);
    WATER_RGB = rgb(c.water);
    catchUp();
    dirty.fill(1);
    sheets.forEach(function (sh) {
      for (var k = 0; k < SHEET * SHEET; k++) if (sh.has[k]) stale(sh.sx * SHEET + k % SHEET, sh.sy * SHEET + ((k / SHEET) | 0));
    });
  }

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
  var overlay = layer();
  var SHEET = 8, SP = SHEET * CS, SHEET_BIAS = 1 << 22;
  var sheets = new Map(), queue = [];
  /* Chunks redrawn on the sheets per frame, oldest change first; the rest
     wait for later frames. */
  var TILES_PER_FRAME = 192;
  /* Far out only the overlay shows: window chunks that change go on the
     sheets like the rest and are copied in once the cells show again. */
  var far = false, behind = new Uint8Array(CW * CH);
  setColors(colors);

  function differs(i, j) {
    if (mat[i] !== mat[j]) return true;
    return body[i] !== body[j];
  }

  function open(m) {
    return m === AIR || m === WATER || m === OIL;
  }

  function isFluid(m) {
    return m === WATER || m === OIL;
  }

  function exposed(i, x, y) {
    return (x > 0 && open(mat[i - 1])) || (x < W - 1 && open(mat[i + 1])) ||
      (y > 0 && open(mat[i - W])) || (y < H - 1 && open(mat[i + W]));
  }

  function waterColor(i) {
    return waterTint(shade[i]);
  }

  function waterTint(sh) {
    var f = 1 + (sh - 128) / 128 * 0.03;
    return pack(WATER_RGB[0] * f | 0, WATER_RGB[1] * f | 0, WATER_RGB[2] * f | 0, 215);
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

  function changed(i, x, y) {
    if (!edited[((y / CS) | 0) * CW + ((x / CS) | 0)]) return 0;
    var m = mat[i];
    if (m === base[i]) return 0;
    if (m === AIR) return P_PAPER;
    if (m === WATER) return waterColor(i);
    if (m === OIL) return P_OIL;
    return P_FAINT;
  }

  function paintRect(x0, y0, x1, y1) {
    var lp = lines.px, fp = fills.px, op = overlay.px;
    for (var y = y0; y <= y1; y++) {
      var row = y * W;
      for (var x = x0; x <= x1; x++) {
        var i = row + x;
        lp[i] = lineColor(i, x, y);
        fp[i] = mat[i] === WATER ? lp[i] : (flag[i] & WET) ? P_WET : 0;
        op[i] = changed(i, x, y);
        var s = mat[i] === OIL ? 1 : 0;
        if (s !== oilSeen[i]) { oilSeen[i] = s; oilDirty = true; }
      }
    }
    var w = x1 - x0 + 1, h = y1 - y0 + 1;
    lines.ctx.putImageData(lines.img, 0, 0, x0, y0, w, h);
    fills.ctx.putImageData(fills.img, 0, 0, x0, y0, w, h);
    overlay.ctx.putImageData(overlay.img, 0, 0, x0, y0, w, h);
  }

  /* Copies window chunk (lx, ly) from the world. */
  function pull(lx, ly) {
    var c = ly * CW + lx, sl = S.ensure(ox / CS + lx, oy / CS + ly);
    var w = Math.min(CS, W - lx * CS), h = Math.min(CS, H - ly * CS);
    var j = ly * CS * W + lx * CS;
    dirty[c] = 1;
    behind[c] = 0;
    if (sl < 0) {
      for (var r = 0; r < h; r++, j += W) {
        mat.fill(STONE, j, j + w); base.fill(STONE, j, j + w);
        flag.fill(0, j, j + w); shade.fill(0, j, j + w); body.fill(0, j, j + w);
      }
      edited[c] = 0;
      return;
    }
    var sm = S.mat, sf = S.flag, ss = S.shade, sb = S.base, sy = S.body;
    for (var y = 0, i = sl << 10; y < h; y++, i += CS, j += W) {
      mat.set(sm.subarray(i, i + w), j); flag.set(sf.subarray(i, i + w), j);
      shade.set(ss.subarray(i, i + w), j); base.set(sb.subarray(i, i + w), j);
      body.set(sy.subarray(i, i + w), j);
    }
    edited[c] = S.isEdited(sl) ? 1 : 0;
  }

  function pullAll() {
    for (var ly = 0; ly < CH; ly++) for (var lx = 0; lx < CW; lx++) pull(lx, ly);
    S.pin(ox / CS, oy / CS, ox / CS + CW - 1, oy / CS + CH - 1);
  }

  /* Window chunk (lx, ly) moves to its sheet: its overlay pixels are
     cleared and it is drawn there now, so it does not blink. */
  function hide(lx, ly) {
    var c = ly * CW + lx, cx = ox / CS + lx, cy = oy / CS + ly;
    if (behind[c]) { stale(cx, cy); return; }
    behind[c] = 1;
    var w = Math.min(CS, W - lx * CS), h = Math.min(CS, H - ly * CS), j = ly * CS * W + lx * CS;
    for (var r = 0; r < h; r++, j += W) overlay.px.fill(0, j, j + w);
    overlay.ctx.putImageData(overlay.img, 0, 0, lx * CS, ly * CS, w, h);
    tile(cx, cy, false);
  }

  function catchUp() {
    for (var c = 0; c < CW * CH; c++) {
      if (!behind[c]) continue;
      var lx = c % CW, ly = (c / CW) | 0;
      pull(lx, ly);
      tile(ox / CS + lx, oy / CS + ly, true);
    }
  }

  /* `isFar`: only the overlay is drawn (see drawOverlay). */
  function recolor(isFar) {
    isFar = !!isFar;
    if (far && !isFar) catchUp();
    far = isFar;
    var list = S.takeDirty(), k;
    for (k = 0; k < list.length; k++) {
      var sl = list[k];
      if (!S.isLive(sl)) continue;
      var c = S.chunkOf(sl), lx = c.cx - ox / CS, ly = c.cy - oy / CS;
      if (lx >= 0 && ly >= 0 && lx < CW && ly < CH) {
        if (!far) pull(lx, ly);
        else if (S.isEdited(sl)) hide(lx, ly);
      } else if (S.isEdited(sl)) stale(c.cx, c.cy);
    }
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

  /* Oil is drawn as one smooth shape: the cells are blurred into a field
     and its 0.5 contour traced with marching squares. Walls count as half
     oil so the shape meets them flush, and the fill is clipped to open
     cells so it never covers the ground. */
  var WALL = 0.45, LEVEL = 0.5;
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

  function drawOil(ctx) {
    if (oilDirty) buildOil();
    if (!oilPath) return;
    ctx.save();
    ctx.clip(oilClip);
    ctx.fillStyle = C.oil;
    ctx.fill(oilPath);
    ctx.restore();
  }

  /* Cells under the canvas, and device pixels per cell across and down. */
  function viewOf(ctx) {
    var t = ctx.getTransform(), inv = t.inverse();
    var cw = ctx.canvas.width, ch = ctx.canvas.height;
    var xs = [0, cw, 0, cw], ys = [0, 0, ch, ch];
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var k = 0; k < 4; k++) {
      var p = inv.transformPoint({ x: xs[k], y: ys[k] });
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    return {
      x0: Math.max(0, Math.floor(x0)), y0: Math.max(0, Math.floor(y0)),
      x1: Math.min(W, Math.ceil(x1)), y1: Math.min(H, Math.ceil(y1)),
      sx: Math.hypot(t.a, t.b), sy: Math.hypot(t.c, t.d)
    };
  }

  function blit(ctx, l, v) {
    if (v.x1 <= v.x0 || v.y1 <= v.y0) return;
    ctx.imageSmoothingEnabled = Math.min(v.sx, v.sy) < 1;
    var w = v.x1 - v.x0, h = v.y1 - v.y0;
    ctx.drawImage(l.cv, v.x0, v.y0, w, h, v.x0, v.y0, w, h);
  }

  /* Edges between air and fluids stay unlined, as the fill shows them. */
  function edge(i, j) {
    if (!differs(i, j)) return false;
    var a = mat[i], b = mat[j];
    return !((a === AIR || isFluid(a)) && (b === AIR || isFluid(b)));
  }

  /* Close up the lines are stroked per cell, so they stay one pixel thin
     however far in the view goes. */
  function strokeLines(ctx, v, dpr) {
    var ink = new Path2D(), mid = new Path2D();
    var dMid = new Path2D(), dFaint = new Path2D(), dWater = new Path2D();
    for (var y = v.y0; y < v.y1; y++) {
      for (var x = v.x0; x < v.x1; x++) {
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
    var unit = dpr / ((v.sx + v.sy) / 2);
    ctx.save();
    ctx.lineCap = "butt";
    ctx.lineWidth = unit;
    ctx.strokeStyle = C.mid; ctx.stroke(mid);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2 * unit; ctx.stroke(ink);
    ctx.fillStyle = C.mid; ctx.fill(dMid);
    ctx.fillStyle = C.faint; ctx.fill(dFaint);
    ctx.fillStyle = C.waterInk; ctx.fill(dWater);
    ctx.restore();
  }

  /* Pixel layers until a cell is `vectorAt` CSS pixels, then strokes. */
  function draw(ctx, vectorAt) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var v = viewOf(ctx);
    blit(ctx, fills, v);
    drawOil(ctx);
    if (Math.min(v.sx, v.sy) >= (vectorAt || 4) * dpr) strokeLines(ctx, v, dpr);
    else blit(ctx, lines, v);
  }

  function sheetOf(cx, cy, make) {
    var sx = Math.floor(cx / SHEET), sy = Math.floor(cy / SHEET);
    var key = (sx + SHEET_BIAS) * SHEET_BIAS * 4 + sy + SHEET_BIAS, sh = sheets.get(key);
    if (!sh && make) {
      sh = { sx: sx, sy: sy, cv: null, img: null, px: null, has: new Uint8Array(SHEET * SHEET),
        wait: new Uint8Array(SHEET * SHEET), shown: 0, x0: SP, y0: SP, x1: -1, y1: -1 };
      sheets.set(key, sh);
    }
    return sh;
  }

  /* A changed chunk outside the window, queued to be drawn again on its
     sheet from the world. */
  function stale(cx, cy) {
    var sh = sheetOf(cx, cy, true), k = (cy - sh.sy * SHEET) * SHEET + cx - sh.sx * SHEET;
    if (sh.wait[k]) return;
    sh.wait[k] = 1;
    queue.push(cx, cy);
  }

  /* Chunk (cx, cy) drawn on its sheet from the world, or cleared when the
     window shows it or the world no longer holds it. */
  function tile(cx, cy, clear) {
    var sh = sheetOf(cx, cy, !clear);
    if (!sh) return;
    var lx = cx - sh.sx * SHEET, ly = cy - sh.sy * SHEET, k = ly * SHEET + lx;
    sh.wait[k] = 0;
    var sl = clear ? -1 : S.slotAt(cx, cy);
    if (sl < 0 && !sh.has[k]) return;
    if (!sh.img) {
      sh.img = new ImageData(SP, SP);
      sh.px = new Uint32Array(sh.img.data.buffer);
    }
    var px = sh.px, sm = S.mat, sb = S.base, ss = S.shade, any = false;
    var j0 = ly * CS * SP + lx * CS;
    if (sl < 0) {
      for (var r = 0; r < CS; r++) px.fill(0, j0 + r * SP, j0 + r * SP + CS);
    } else {
      for (var y = 0, i = sl << 10; y < CS; y++) {
        for (var x = 0, j = j0 + y * SP; x < CS; x++, i++, j++) {
          var m = sm[i], v = 0;
          if (m !== sb[i]) { v = m === AIR ? P_PAPER : m === WATER ? waterTint(ss[i]) : m === OIL ? P_OIL : P_FAINT; any = true; }
          px[j] = v;
        }
      }
    }
    if (any !== !!sh.has[k]) { sh.has[k] = any ? 1 : 0; sh.shown += any ? 1 : -1; }
    var x0 = lx * CS, y0 = ly * CS;
    if (x0 < sh.x0) sh.x0 = x0;
    if (y0 < sh.y0) sh.y0 = y0;
    if (x0 + CS > sh.x1) sh.x1 = x0 + CS;
    if (y0 + CS > sh.y1) sh.y1 = y0 + CS;
  }

  function flushSheets() {
    var n = Math.min(queue.length, TILES_PER_FRAME * 2), k;
    for (k = 0; k < n; k += 2) {
      var lx = queue[k] - ox / CS, ly = queue[k + 1] - oy / CS;
      tile(queue[k], queue[k + 1], !far && lx >= 0 && ly >= 0 && lx < CW && ly < CH);
    }
    queue.splice(0, n);
    sheets.forEach(function (sh, key) {
      if (sh.x1 < 0) return;
      if (!sh.shown) {
        sheets.delete(key);
        return;
      }
      if (!sh.cv) {
        sh.cv = document.createElement("canvas");
        sh.cv.width = SP;
        sh.cv.height = SP;
      }
      sh.cv.getContext("2d").putImageData(sh.img, 0, 0, sh.x0, sh.y0, sh.x1 - sh.x0, sh.y1 - sh.y0);
      sh.x0 = sh.y0 = SP;
      sh.x1 = sh.y1 = -1;
    });
  }

  function drawOverlay(ctx) {
    var v = viewOf(ctx);
    blit(ctx, overlay, v);
    flushSheets();
    var inv = ctx.getTransform().inverse(), cw = ctx.canvas.width, ch = ctx.canvas.height;
    var a = inv.transformPoint({ x: 0, y: 0 }), b = inv.transformPoint({ x: cw, y: ch });
    var vx0 = Math.min(a.x, b.x) + ox, vx1 = Math.max(a.x, b.x) + ox;
    var vy0 = Math.min(a.y, b.y) + oy, vy1 = Math.max(a.y, b.y) + oy;
    sheets.forEach(function (sh) {
      if (!sh.cv || !sh.shown) return;
      var x = sh.sx * SP, y = sh.sy * SP;
      if (x > vx1 || y > vy1 || x + SP < vx0 || y + SP < vy0) return;
      ctx.drawImage(sh.cv, x - ox, y - oy);
    });
  }

  function shiftPx(a, w, h, sx, sy) {
    var len = w - Math.abs(sx);
    if (len <= 0 || Math.abs(sy) >= h) { a.fill(0); return; }
    var d0 = Math.max(0, -sx), s0 = Math.max(0, sx), y;
    if (sy >= 0) {
      for (y = 0; y < h - sy; y++) a.copyWithin(y * w + d0, (y + sy) * w + s0, (y + sy) * w + s0 + len);
    } else {
      for (y = h - 1; y >= -sy; y--) a.copyWithin(y * w + d0, (y + sy) * w + s0, (y + sy) * w + s0 + len);
    }
  }

  /* Slides the window by whole chunks. */
  function slide(scx, scy) {
    var cx, cy, ccx = ox / CS, ccy = oy / CS;
    for (cy = 0; cy < CH; cy++) {
      for (cx = 0; cx < CW; cx++) {
        var nx = cx - scx, ny = cy - scy;
        if ((nx < 0 || ny < 0 || nx >= CW || ny >= CH) && edited[cy * CW + cx]) stale(ccx + cx, ccy + cy);
      }
    }
    ox += scx * CS;
    oy += scy * CS;
    ccx += scx;
    ccy += scy;
    for (cy = 0; cy < CH; cy++) {
      for (cx = 0; cx < CW; cx++) {
        var ox0 = cx + scx, oy0 = cy + scy;
        if (ox0 < 0 || oy0 < 0 || ox0 >= CW || oy0 >= CH) tile(ccx + cx, ccy + cy, true);
      }
    }
    var sx = scx * CS, sy = scy * CS;
    [mat, flag, shade, base, body, oilSeen].forEach(function (a) { shiftPx(a, W, H, sx, sy); });
    shiftPx(edited, CW, CH, scx, scy);
    shiftPx(dirty, CW, CH, scx, scy);
    shiftPx(behind, CW, CH, scx, scy);
    [lines, fills, overlay].forEach(function (l) {
      shiftPx(l.px, W, H, sx, sy);
      l.ctx.putImageData(l.img, 0, 0);
    });
    for (cy = 0; cy < CH; cy++) {
      for (cx = 0; cx < CW; cx++) {
        var px = cx + scx, py = cy + scy;
        if (px < 0 || py < 0 || px >= CW || py >= CH) pull(cx, cy);
      }
    }
    oilDirty = true;
    S.pin(ccx, ccy, ccx + CW - 1, ccy + CH - 1);
  }

  /* Keeps world cell (wx, wy) near the middle of the window. */
  function follow(wx, wy) {
    var scx = Math.round((wx - ox - W / 2) / CS);
    var scy = Math.round((wy - oy - H / 2) / CS);
    if (Math.abs(scx) < 2) scx = 0;
    if (Math.abs(scy) < 2) scy = 0;
    if (!scx && !scy) return false;
    slide(scx, scy);
    return true;
  }

  S.onReset(function () {
    sheets.clear();
    queue = [];
    pullAll();
  });
  pullAll();

  return {
    W: W, H: H, CS: CS,
    /* World cell at the window's top left corner. */
    origin: function () { return { x: ox, y: oy }; },
    follow: follow,
    recolor: recolor,
    draw: draw,
    drawOverlay: drawOverlay,
    setColors: setColors
  };
}
