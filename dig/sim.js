/* Dig prototype: one grid of 1 cm cells holding seven test bays, each
   3 m wide and 3 m deep, under 40 cm of sky.

   Loose grains and fluids move cell by cell. Pebbles, clods and stone
   pieces are clumps that fall and slide as one block and never rotate.
   Cohesive ground stays put until an overhang reaches further than the
   material can carry, then it lets go. Digging is only possible where
   the tool touches open air that reaches the sky. */
var DIG = (function () {
  "use strict";

  var AIR = 0, SAND = 1, TOPSOIL = 2, CLAY = 3, GRAVEL = 4, STONE = 5, WATER = 6, OIL = 7;
  var NAMES = ["air", "sand", "topsoil", "clay", "gravel", "stone", "water", "oil"];
  /* Hits a cell in place takes before it gives. Loose cells take one. */
  var HITS = [0, 1, 1, 3, 1, 6, 1, 1];
  /* How far, in cells, cohesive ground can reach out from its support. */
  var REACH = [0, 0, 4, 14, 0, 200, 0, 0];

  var LOOSE = 1, WET = 2, CRACK = 4;

  var BAY = 300, SKY = 40, DEPTH = 300;
  var BAYS = [
    { name: "sand" },
    { name: "topsoil" },
    { name: "clay" },
    { name: "gravel" },
    { name: "stone" },
    { name: "water", note: "sand under a water table" },
    { name: "oil", note: "clay over stone, oil pocket in the stone" }
  ];
  var W = BAY * BAYS.length;
  var H = SKY + DEPTH;
  var N = W * H;
  var TABLE = SKY + 40;
  var OIL_LENS = { x: 5 * BAY + BAY + 190, y: SKY + 190, rx: 75, ry: 30 };
  var SETTLE_PAD = 48;

  var mat = new Uint8Array(N);
  var flag = new Uint8Array(N);
  var dmg = new Uint8Array(N);
  var shade = new Uint8Array(N);
  var stamp = new Uint8Array(N);
  var body = new Int32Array(N);
  var sky = new Uint8Array(N);
  var skyDirty = true;
  var skyQueue = new Int32Array(N);

  var bodies = [null];
  var awake = [];

  var CS = 32;
  var CW = Math.ceil(W / CS);
  var CH = Math.ceil(H / CS);
  var active = new Uint8Array(CW * CH);
  var next = new Uint8Array(CW * CH);
  var dirty = new Uint8Array(CW * CH);
  var st = 1;
  var ticks = 0;
  var collapse = null;
  var taken = new Array(NAMES.length).fill(0);
  var lastActive = 0;

  var seed = 7;
  function rand() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function isFluid(m) {
    return m === WATER || m === OIL;
  }

  function cohesive(i) {
    return REACH[mat[i]] > 0 && !(flag[i] & LOOSE) && body[i] === 0;
  }

  function mark(x, y) {
    var cx = (x / CS) | 0;
    var cy = (y / CS) | 0;
    var c = cy * CW + cx;
    next[c] = 1;
    dirty[c] = 1;
    skyDirty = true;
    var lx = x - cx * CS;
    var ly = y - cy * CS;
    if (lx === 0 && cx > 0) next[c - 1] = 1;
    else if (lx === CS - 1 && cx < CW - 1) next[c + 1] = 1;
    if (ly === 0 && cy > 0) next[c - CW] = 1;
    else if (ly === CS - 1 && cy < CH - 1) next[c + CW] = 1;
  }

  function markRect(x0, y0, x1, y1) {
    for (var y = Math.max(0, y0); y <= Math.min(H - 1, y1); y += CS / 2) {
      for (var x = Math.max(0, x0); x <= Math.min(W - 1, x1); x += CS / 2) mark(x, y);
    }
    mark(Math.min(W - 1, Math.max(0, x1)), Math.min(H - 1, Math.max(0, y1)));
  }

  function growCollapse(x, y) {
    if (!collapse) collapse = { x0: x, y0: y, x1: x, y1: y };
    else {
      if (x < collapse.x0) collapse.x0 = x;
      if (x > collapse.x1) collapse.x1 = x;
      if (y < collapse.y0) collapse.y0 = y;
      if (y > collapse.y1) collapse.y1 = y;
    }
  }

  function wakeBody(id) {
    var b = bodies[id];
    if (b && !b.awake) {
      b.awake = true;
      b.vy = 0;
      awake.push(id);
    }
  }

  /* A cell just emptied: whatever rested on it or leaned on it may move. */
  function vacated(x, y) {
    mark(x, y);
    var i = y * W + x;
    if (y > 0) {
      for (var dx = -1; dx <= 1; dx++) {
        var ax = x + dx;
        if (ax < 0 || ax >= W) continue;
        var a = i - W + dx;
        if (body[a]) wakeBody(body[a]);
        else if (dx === 0 && cohesive(a)) growCollapse(x, y - 1);
      }
    }
    if (x > 0 && body[i - 1]) wakeBody(body[i - 1]);
    if (x < W - 1 && body[i + 1]) wakeBody(body[i + 1]);
  }

  function moveCell(i, j) {
    mat[j] = mat[i];
    flag[j] = flag[i];
    shade[j] = shade[i];
    dmg[j] = 0;
    stamp[j] = st;
    mat[i] = AIR;
    flag[i] = 0;
    dmg[i] = 0;
  }

  function swapCell(i, j) {
    var m = mat[j], f = flag[j], s = shade[j];
    mat[j] = mat[i];
    flag[j] = flag[i];
    shade[j] = shade[i];
    mat[i] = m;
    flag[i] = f;
    shade[i] = s;
    stamp[i] = st;
    stamp[j] = st;
  }

  function freeFor(m) {
    return m === AIR || m === WATER || m === OIL;
  }

  /* Free fall clears up to FALL cells a substep, so a pouring face is not
     held back by its own stream. */
  var FALL = 4;
  function fallTo(j, y) {
    var n = 1;
    while (n < FALL && y + n + 1 < H && mat[j + W] === AIR) {
      j += W;
      n++;
    }
    return j;
  }

  /* Sand moves at most one cell, and only this share of the substeps in
     which it could, so a pour is slow enough to follow by eye. A waiting
     grain keeps its chunk awake; a settled one does not. */
  var SAND_PACE = 0.25;
  /* Everything else that falls moves at this share of its full speed. */
  var REST_PACE = 0.5;
  var TOPSOIL_PACE = 0.35;

  function grain(i, x, y) {
    var sand = mat[i] === SAND;
    var wait = Math.random() > (sand ? SAND_PACE : mat[i] === TOPSOIL ? TOPSOIL_PACE : REST_PACE);
    if (y + 1 < H) {
      var j = i + W;
      var t = mat[j];
      if ((t === AIR || isFluid(t)) && wait) { mark(x, y); return; }
      if (t === AIR) {
        var to = sand ? j : fallTo(j, y);
        /* A falling grain drifts a cell sideways now and then, so a stream
           off a face spreads into a curtain instead of a one-cell chute. */
        var ty = (to / W) | 0;
        var dx = Math.random() < 0.5 ? 1 : -1;
        var tx = x + dx;
        if (Math.random() < 0.35 && tx >= 0 && tx < W && mat[to + dx] === AIR && mat[i + dx] === AIR) to += dx;
        else tx = x;
        moveCell(i, to);
        mark(tx, ty);
        vacated(x, y);
        return;
      }
      if (isFluid(t)) {
        swapCell(i, j);
        mark(x, y + 1);
        vacated(x, y);
        return;
      }
      var d = Math.random() < 0.5 ? 1 : -1;
      for (var k = 0; k < 2; k++, d = -d) {
        var nx = x + d;
        if (nx < 0 || nx >= W) continue;
        var side = i + d;
        var slips = freeFor(mat[side]) || ((flag[side] & LOOSE) && !body[side]);
        if (slips && freeFor(mat[j + d])) {
          if (wait) { mark(x, y); return; }
          if (mat[j + d] === AIR) moveCell(i, j + d);
          else swapCell(i, j + d);
          mark(nx, y + 1);
          vacated(x, y);
          return;
        }
      }
    }
    if (y < TABLE) return;
    if (flag[i] & WET) seep(i, x, y);
    else if (sand && soaked(i, x, y)) {
      flag[i] |= WET;
      mark(x, y);
    }
  }

  /* Dry sand that comes to rest under the table soaks up water from a wet
     or flooded neighbour. */
  function soaked(i, x, y) {
    var n = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y < H - 1 ? i + W : -1, i - W];
    for (var k = 0; k < 4; k++) {
      var j = n[k];
      if (j >= 0 && (mat[j] === WATER || (mat[j] === SAND && (flag[j] & WET)))) return true;
    }
    return false;
  }

  /* Wet sand under the table lets water into open cells that are below
     the table too, so a hole fills up to the table and no further. */
  function seep(i, x, y) {
    var open = false;
    var n = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y < H - 1 ? i + W : -1, i - W];
    for (var k = 0; k < 4; k++) {
      var j = n[k];
      if (j < 0) continue;
      /* Pressure: under standing water the seep surfaces at the top of
         the pool, so the pool rises instead of stalling at one film. */
      while (j >= W && mat[j] === WATER) j -= W;
      if (mat[j] !== AIR) continue;
      var jy = (j / W) | 0;
      if (jy < TABLE) continue;
      open = true;
      if (Math.random() < 0.04) {
        mat[j] = WATER;
        flag[j] = 0;
        shade[j] = (Math.random() * 256) | 0;
        stamp[j] = st;
        mark(j - jy * W, jy);
      }
    }
    if (open) mark(x, y);
  }

  var PRESS = 60;

  function fluid(i, x, y, m) {
    var slow = m === OIL;
    var wait = Math.random() > (slow ? 0.4 : 1) * REST_PACE;
    if (y + 1 < H) {
      var j = i + W;
      var t = mat[j];
      if (t === AIR || (m === WATER && t === OIL)) {
        if (wait) { mark(x, y); return; }
        var to = j;
        if (t === AIR) moveCell(i, to = fallTo(j, y));
        else swapCell(i, j);
        mark(x, (to / W) | 0);
        vacated(x, y);
        return;
      }
      var d = Math.random() < 0.5 ? 1 : -1;
      for (var k = 0; k < 2; k++, d = -d) {
        var nx = x + d;
        if (nx < 0 || nx >= W) continue;
        if (mat[i + d] === AIR && mat[j + d] === AIR) {
          if (wait) { mark(x, y); return; }
          moveCell(i, j + d);
          mark(nx, y + 1);
          vacated(x, y);
          return;
        }
      }
    }
    /* Sideways only toward a drop, or when fluid above presses down. A cell
       beside fluid at the same level has no head to drive it, so a partial
       top layer rests instead of sliding to and fro. */
    var reach = slow ? 1 : 4;
    var pushed = y > 0 && isFluid(mat[i - W]);
    var dir = ((y + st) & 1) ? 1 : -1;
    for (var s = 0; s < 2; s++, dir = -dir) {
      var target = -1, tx = 0, drop = false;
      for (var r = 1; r <= reach; r++) {
        var cx = x + dir * r;
        if (cx < 0 || cx >= W) break;
        var c = i + dir * r;
        if (mat[c] !== AIR) break;
        target = c;
        tx = cx;
        if (y + 1 < H && mat[c + W] === AIR) { drop = true; break; }
      }
      /* Under a head the cell passes through its own fluid to the nearest
         open cell on its row, so a pool levels out across its width. */
      if (target < 0 && pushed) {
        for (r = 1; r <= PRESS; r++) {
          cx = x + dir * r;
          if (cx < 0 || cx >= W) break;
          c = i + dir * r;
          if (mat[c] === m) continue;
          if (mat[c] === AIR) { target = c; tx = cx; }
          break;
        }
      }
      if (target >= 0 && (drop || pushed)) {
        if (wait) { mark(x, y); return; }
        moveCell(i, target);
        mark(tx, y);
        vacated(x, y);
        return;
      }
    }
  }

  function cell(x, y) {
    var i = y * W + x;
    if (stamp[i] === st) return;
    var m = mat[i];
    if (m === AIR || body[i]) return;
    if (m === WATER || m === OIL) fluid(i, x, y, m);
    else if (flag[i] & LOOSE) grain(i, x, y);
  }

  function stepCells() {
    var t = active;
    active = next;
    next = t;
    next.fill(0);
    st = st === 255 ? 1 : st + 1;
    var count = 0;
    for (var cy = CH - 1; cy >= 0; cy--) {
      var any = false;
      for (var cx = 0; cx < CW; cx++) {
        if (active[cy * CW + cx]) { any = true; count++; }
      }
      if (!any) continue;
      var yTop = cy * CS;
      var yBot = Math.min(H, yTop + CS) - 1;
      for (var y = yBot; y >= yTop; y--) {
        var rev = ((y + st) & 1) === 1;
        for (var k = 0; k < CW; k++) {
          var c = rev ? CW - 1 - k : k;
          if (!active[cy * CW + c]) continue;
          var xa = c * CS;
          var xb = Math.min(W, xa + CS) - 1;
          var x;
          if (rev) for (x = xb; x >= xa; x--) cell(x, y);
          else for (x = xa; x <= xb; x++) cell(x, y);
        }
      }
    }
    lastActive = count;
  }

  function newBody(m, cells, isAwake) {
    var id = bodies.length;
    var b = { id: id, mat: m, cells: cells, awake: !!isAwake, vy: 0, carry: 0 };
    bodies.push(b);
    for (var k = 0; k < cells.length; k++) {
      var i = cells[k];
      body[i] = id;
      flag[i] &= ~LOOSE;
      dmg[i] = 0;
    }
    if (isAwake) awake.push(id);
    return b;
  }

  var tmpF = new Uint8Array(1024), tmpS = new Uint8Array(1024), tmpD = new Uint8Array(1024);

  function tryMove(b, dx, dy) {
    var c = b.cells, n = c.length, id = b.id, k, i, x, y, j;
    var off = dy * W + dx;
    for (k = 0; k < n; k++) {
      i = c[k];
      y = (i / W) | 0;
      x = i - y * W;
      var nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) return false;
      j = i + off;
      if (body[j] === id) continue;
      if (!freeFor(mat[j])) return false;
    }
    if (tmpF.length < n) {
      tmpF = new Uint8Array(n * 2);
      tmpS = new Uint8Array(n * 2);
      tmpD = new Uint8Array(n * 2);
    }
    var fluids = [];
    for (k = 0; k < n; k++) {
      i = c[k];
      tmpF[k] = flag[i];
      tmpS[k] = shade[i];
      tmpD[k] = dmg[i];
      j = i + off;
      if (body[j] !== id && isFluid(mat[j])) fluids.push(mat[j]);
    }
    for (k = 0; k < n; k++) {
      i = c[k];
      mat[i] = AIR;
      flag[i] = 0;
      dmg[i] = 0;
      body[i] = 0;
    }
    var moved = new Array(n);
    for (k = 0; k < n; k++) {
      j = c[k] + off;
      mat[j] = b.mat;
      flag[j] = tmpF[k];
      shade[j] = tmpS[k];
      dmg[j] = tmpD[k];
      body[j] = id;
      moved[k] = j;
      y = (j / W) | 0;
      mark(j - y * W, y);
    }
    for (k = 0; k < n; k++) {
      i = c[k];
      if (body[i] === id) continue;
      if (fluids.length) {
        mat[i] = fluids.pop();
        flag[i] = 0;
        shade[i] = (Math.random() * 256) | 0;
      }
      y = (i / W) | 0;
      vacated(i - y * W, y);
    }
    b.cells = moved;
    return true;
  }

  /* A clump that cannot rotate still has to leave a face steeper than
     it can rest on: open beside it for most of its height and open below
     its outer corner, it shifts a cell outward and falls from there. */
  function tip(b, d) {
    var c = b.cells, n = c.length, k, i, x, y;
    var x0 = W, x1 = -1, y0 = H, y1 = -1;
    for (k = 0; k < n; k++) {
      i = c[k];
      y = (i / W) | 0;
      x = i - y * W;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    var xo = d < 0 ? x0 - 1 : x1 + 1;
    if (xo < 0 || xo >= W || y1 + 1 >= H) return false;
    if (!freeFor(mat[(y1 + 1) * W + xo])) return false;
    var open = 0;
    for (y = y0; y <= y1; y++) if (freeFor(mat[y * W + xo])) open++;
    if (open < (y1 - y0 + 1) * 0.6) return false;
    return tryMove(b, d, 0);
  }

  function stepBodies() {
    var list = awake;
    awake = [];
    list.sort(function (a, b) {
      var ba = bodies[a], bb = bodies[b];
      return (bb ? bb.cells[bb.cells.length - 1] : 0) - (ba ? ba.cells[ba.cells.length - 1] : 0);
    });
    for (var k = 0; k < list.length; k++) {
      var b = bodies[list[k]];
      if (!b || !b.awake || !b.cells.length) continue;
      b.vy = Math.min(b.vy + 0.15, 3);
      b.carry += b.vy;
      var steps = b.carry | 0;
      if (!steps) { awake.push(b.id); continue; }
      b.carry -= steps;
      var moved = false;
      for (var s = 0; s < steps; s++) {
        if (tryMove(b, 0, 1)) moved = true;
        else break;
      }
      if (!moved) {
        if (b.cells.length <= 900) {
          var d = Math.random() < 0.5 ? 1 : -1;
          moved = tryMove(b, d, 1) || tryMove(b, -d, 1) || tip(b, d) || tip(b, -d);
        }
        b.vy = moved ? 0.5 : 0;
      }
      if (moved) awake.push(b.id);
      else b.awake = false;
    }
  }

  /* Splits cells into Voronoi pieces about `spacing` across. Cells close to
     a seam become loose grit with chance `grit`; the rest become clumps. */
  function fragment(cells, m, spacing, grit) {
    if (!cells.length) return;
    var x0 = W, y0 = H, x1 = 0, y1 = 0, k, i, x, y;
    for (k = 0; k < cells.length; k++) {
      i = cells[k];
      y = (i / W) | 0;
      x = i - y * W;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    var gw = Math.ceil((x1 - x0 + 1) / spacing) + 1;
    var gh = Math.ceil((y1 - y0 + 1) / spacing) + 1;
    var sx = new Float32Array(gw * gh), sy = new Float32Array(gw * gh);
    for (var g = 0; g < gw * gh; g++) {
      sx[g] = x0 + ((g % gw) + Math.random()) * spacing;
      sy[g] = y0 + (((g / gw) | 0) + Math.random()) * spacing;
    }
    var groups = {};
    for (k = 0; k < cells.length; k++) {
      i = cells[k];
      y = (i / W) | 0;
      x = i - y * W;
      var gx = Math.floor((x - x0) / spacing), gy = Math.floor((y - y0) / spacing);
      var best = 1e9, second = 1e9, bi = -1;
      for (var oy = -1; oy <= 1; oy++) {
        for (var ox = -1; ox <= 1; ox++) {
          var qx = gx + ox, qy = gy + oy;
          if (qx < 0 || qy < 0 || qx >= gw || qy >= gh) continue;
          var q = qy * gw + qx;
          var ddx = sx[q] - x - 0.5, ddy = sy[q] - y - 0.5;
          var d2 = ddx * ddx + ddy * ddy;
          if (d2 < best) { second = best; best = d2; bi = q; }
          else if (d2 < second) second = d2;
        }
      }
      if (grit > 0 && Math.sqrt(second) - Math.sqrt(best) < 0.9 && Math.random() < grit) {
        flag[i] |= LOOSE;
        body[i] = 0;
        mark(x, y);
        continue;
      }
      (groups[bi] || (groups[bi] = [])).push(i);
    }
    for (var key in groups) {
      var part = groups[key];
      newBody(m, part, true);
      for (k = 0; k < part.length; k++) {
        y = (part[k] / W) | 0;
        mark(part[k] - y * W, y);
      }
    }
  }

  /* Cohesive ground in the box: a 0-1 search from what holds it up.
     Going up a column is free and going sideways or hanging below costs a
     cell. A cell whose cost passes its material's reach lets go. */
  function settle(x0, y0, x1, y1) {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0);
    x1 = Math.min(W - 1, x1); y1 = Math.min(H - 1, y1);
    if (x1 < x0 || y1 < y0) return;
    var rw = x1 - x0 + 1, rh = y1 - y0 + 1, n = rw * rh;
    var cost = new Int32Array(n).fill(0x3fffffff);
    var cap = n * 4 + 8;
    var dq = new Int32Array(cap);
    var head = 0, tail = 0;
    var x, y, i, r;
    for (y = y0; y <= y1; y++) {
      for (x = x0; x <= x1; x++) {
        i = y * W + x;
        if (!cohesive(i)) continue;
        var border = x === x0 || x === x1 || y === y0 || y === y1;
        var held = y + 1 >= H;
        if (!held) {
          var b = i + W, mb = mat[b];
          held = mb !== AIR && !isFluid(mb) && !cohesive(b);
        }
        if (border || held) {
          r = (y - y0) * rw + (x - x0);
          cost[r] = 0;
          dq[tail] = r;
          tail = (tail + 1) % cap;
        }
      }
    }
    while (head !== tail) {
      r = dq[head];
      head = (head + 1) % cap;
      var c = cost[r];
      var ly = (r / rw) | 0, lx = r - ly * rw;
      x = x0 + lx; y = y0 + ly; i = y * W + x;
      var m = mat[i];
      for (var e = 0; e < 4; e++) {
        var nx = x, ny = y;
        if (e === 0) ny = y - 1;
        else if (e === 1) nx = x - 1;
        else if (e === 2) nx = x + 1;
        else ny = y + 1;
        if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
        var j = ny * W + nx;
        if (!cohesive(j)) continue;
        var nc = e === 0 ? (mat[j] !== m ? 0 : c) : c + 1;
        var q = (ny - y0) * rw + (nx - x0);
        if (nc >= cost[q]) continue;
        cost[q] = nc;
        if (e === 0) {
          head = (head - 1 + cap) % cap;
          dq[head] = q;
        } else {
          dq[tail] = q;
          tail = (tail + 1) % cap;
        }
      }
    }
    var loose = { 2: [], 3: [], 5: [] };
    for (y = y0; y <= y1; y++) {
      for (x = x0; x <= x1; x++) {
        i = y * W + x;
        if (!cohesive(i)) continue;
        r = (y - y0) * rw + (x - x0);
        if (cost[r] > REACH[mat[i]]) loose[mat[i]].push(i);
      }
    }
    var k;
    for (k = 0; k < loose[TOPSOIL].length; k++) {
      i = loose[TOPSOIL][k];
      flag[i] |= LOOSE;
      y = (i / W) | 0;
      mark(i - y * W, y);
    }
    fragment(loose[CLAY], CLAY, 6, 0.15);
    fragment(loose[STONE], STONE, 15, 0.2);
  }

  function ensureSky() {
    if (!skyDirty) return;
    skyDirty = false;
    sky.fill(0);
    var head = 0, tail = 0, x, i;
    for (x = 0; x < W; x++) {
      if (freeFor(mat[x])) { sky[x] = 1; skyQueue[tail++] = x; }
    }
    while (head < tail) {
      i = skyQueue[head++];
      var y = (i / W) | 0;
      x = i - y * W;
      if (x > 0 && !sky[i - 1] && freeFor(mat[i - 1])) { sky[i - 1] = 1; skyQueue[tail++] = i - 1; }
      if (x < W - 1 && !sky[i + 1] && freeFor(mat[i + 1])) { sky[i + 1] = 1; skyQueue[tail++] = i + 1; }
      if (y > 0 && !sky[i - W] && freeFor(mat[i - W])) { sky[i - W] = 1; skyQueue[tail++] = i - W; }
      if (y < H - 1 && !sky[i + W] && freeFor(mat[i + W])) { sky[i + W] = 1; skyQueue[tail++] = i + W; }
    }
  }

  function footprint(cx, cy, tool) {
    var x0 = Math.round(cx - tool / 2), y0 = Math.round(cy - tool / 2);
    return { x0: x0, y0: y0, x1: x0 + tool - 1, y1: y0 + tool - 1 };
  }

  function canReach(f) {
    ensureSky();
    var x0 = Math.max(0, f.x0 - 1), y0 = Math.max(0, f.y0 - 1);
    var x1 = Math.min(W - 1, f.x1 + 1), y1 = Math.min(H - 1, f.y1 + 1);
    if (x1 < x0 || y1 < y0) return false;
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) if (sky[y * W + x]) return true;
    }
    return false;
  }

  function take(i) {
    var y = (i / W) | 0;
    taken[mat[i]]++;
    mat[i] = AIR;
    flag[i] = 0;
    dmg[i] = 0;
    body[i] = 0;
    vacated(i - y * W, y);
  }

  function crack(f, tool) {
    var lines = 2 + (Math.random() * 2 | 0);
    for (var l = 0; l < lines; l++) {
      var x = f.x0 + Math.random() * tool, y = f.y0 + Math.random() * tool;
      var a = Math.random() * Math.PI * 2;
      var len = Math.max(2, tool * 0.7);
      for (var s = 0; s < len; s++) {
        a += (Math.random() - 0.5) * 0.9;
        x += Math.cos(a);
        y += Math.sin(a);
        var ix = Math.floor(x), iy = Math.floor(y);
        if (ix < f.x0 || ix > f.x1 || iy < f.y0 || iy > f.y1) break;
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) break;
        var i = iy * W + ix;
        if (cohesive(i) && dmg[i] > 0) {
          flag[i] |= CRACK;
          mark(ix, iy);
        }
      }
    }
  }

  /* One hit of a square tool `tool` cells across, centred on (cx, cy). */
  function dig(cx, cy, tool) {
    tool = Math.max(1, Math.round(tool));
    var f = footprint(cx, cy, tool);
    if (!canReach(f)) return { ok: false };
    var x0 = Math.max(0, f.x0), y0 = Math.max(0, f.y0);
    var x1 = Math.min(W - 1, f.x1), y1 = Math.min(H - 1, f.y1);
    var touched = {}, cut = [], broken = [], hurt = false, x, y, i, m;
    for (y = y0; y <= y1; y++) {
      for (x = x0; x <= x1; x++) {
        i = y * W + x;
        m = mat[i];
        if (m === AIR) continue;
        if (body[i]) { touched[body[i]] = (touched[body[i]] || 0) + 1; continue; }
        if (isFluid(m) || (flag[i] & LOOSE)) { take(i); continue; }
        dmg[i] = Math.min(255, dmg[i] + 1);
        mark(x, y);
        if (dmg[i] >= HITS[m]) {
          if (m === STONE) broken.push(i);
          else cut.push(i);
        } else hurt = true;
      }
    }
    var area = tool * tool;
    for (var key in touched) {
      var b = bodies[key];
      if (!b) continue;
      var inside = touched[key];
      if (b.cells.length <= area) {
        if (inside * 2 >= b.cells.length) {
          for (var k = 0; k < b.cells.length; k++) take(b.cells[k]);
          bodies[key] = null;
        } else wakeBody(b.id);
      } else {
        var keep = [];
        for (k = 0; k < b.cells.length; k++) {
          i = b.cells[k];
          y = (i / W) | 0;
          x = i - y * W;
          if (x >= x0 && x <= x1 && y >= y0 && y <= y1) take(i);
          else keep.push(i);
        }
        b.cells = keep;
        wakeBody(b.id);
      }
    }
    var rimCells = [];
    for (k = 0; k < cut.length; k++) {
      i = cut[k];
      rimCells.push(i);
      take(i);
    }
    for (k = 0; k < rimCells.length; k++) {
      i = rimCells[k];
      y = (i / W) | 0;
      x = i - y * W;
      var around = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
      for (var a = 0; a < 4; a++) {
        var j = around[a];
        if (j < 0 || !cohesive(j)) continue;
        var p = mat[j] === TOPSOIL ? 0.45 : mat[j] === CLAY ? 0.12 : 0;
        if (Math.random() < p) {
          flag[j] |= LOOSE;
          var jy = (j / W) | 0;
          mark(j - jy * W, jy);
        }
      }
    }
    if (broken.length) fragment(broken, STONE, Math.max(3, Math.round(tool / 3)), 0.35);
    if (hurt) crack(f, tool);
    settle(x0 - SETTLE_PAD, y0 - SETTLE_PAD, x1 + SETTLE_PAD, y1 + SETTLE_PAD);
    markRect(x0 - 2, y0 - 2, x1 + 2, y1 + 2);
    return { ok: true };
  }

  function step() {
    ticks++;
    stepBodies();
    stepCells();
    stepCells();
    if (collapse && ticks % 12 === 0) {
      var c = collapse;
      collapse = null;
      settle(c.x0 - SETTLE_PAD, c.y0 - SETTLE_PAD, c.x1 + SETTLE_PAD, c.y1 + SETTLE_PAD);
    }
  }

  function pebbles(bx0, bx1, by0, by1) {
    var cells = [];
    for (var y = by0; y < by1; y++) {
      for (var x = bx0; x < bx1; x++) cells.push(y * W + x);
    }
    var spacing = 5;
    var x0 = bx0, y0 = by0;
    var gw = Math.ceil((bx1 - bx0) / spacing) + 1, gh = Math.ceil((by1 - by0) / spacing) + 1;
    var sx = new Float32Array(gw * gh), sy = new Float32Array(gw * gh);
    for (var g = 0; g < gw * gh; g++) {
      sx[g] = x0 + ((g % gw) + rand()) * spacing;
      sy[g] = y0 + (((g / gw) | 0) + rand()) * spacing;
    }
    var groups = {};
    for (var k = 0; k < cells.length; k++) {
      var i = cells[k];
      var cy = (i / W) | 0, cx = i - cy * W;
      var gx = Math.floor((cx - x0) / spacing), gy = Math.floor((cy - y0) / spacing);
      var best = 1e9, second = 1e9, bi = -1;
      for (var oy = -1; oy <= 1; oy++) {
        for (var ox = -1; ox <= 1; ox++) {
          var qx = gx + ox, qy = gy + oy;
          if (qx < 0 || qy < 0 || qx >= gw || qy >= gh) continue;
          var q = qy * gw + qx;
          var dx = sx[q] - cx - 0.5, dy = sy[q] - cy - 0.5;
          var d2 = dx * dx + dy * dy;
          if (d2 < best) { second = best; best = d2; bi = q; }
          else if (d2 < second) second = d2;
        }
      }
      if (Math.sqrt(second) - Math.sqrt(best) < 0.6) {
        mat[i] = SAND;
        flag[i] = LOOSE;
      } else {
        mat[i] = GRAVEL;
        (groups[bi] || (groups[bi] = [])).push(i);
      }
    }
    for (var key in groups) newBody(GRAVEL, groups[key], false);
  }

  function build() {
    seed = 7;
    mat.fill(0); flag.fill(0); dmg.fill(0); body.fill(0); stamp.fill(0);
    bodies = [null];
    awake = [];
    active.fill(0); next.fill(0); dirty.fill(1);
    collapse = null;
    taken.fill(0);
    skyDirty = true;
    for (var i = 0; i < N; i++) shade[i] = (rand() * 256) | 0;
    for (var b = 0; b < BAYS.length; b++) {
      var bx0 = b * BAY, bx1 = bx0 + BAY;
      var name = BAYS[b].name;
      if (name === "gravel") { pebbles(bx0, bx1, SKY, H); continue; }
      for (var y = SKY; y < H; y++) {
        for (var x = bx0; x < bx1; x++) {
          var j = y * W + x;
          if (name === "sand") { mat[j] = SAND; flag[j] = LOOSE; }
          else if (name === "topsoil") mat[j] = TOPSOIL;
          else if (name === "clay") mat[j] = CLAY;
          else if (name === "stone") mat[j] = STONE;
          else if (name === "water") { mat[j] = SAND; flag[j] = LOOSE | (y >= TABLE ? WET : 0); }
          else if (name === "oil") {
            var ex = (x + 0.5 - OIL_LENS.x) / OIL_LENS.rx, ey = (y + 0.5 - OIL_LENS.y) / OIL_LENS.ry;
            if (ex * ex + ey * ey < 1) mat[j] = OIL;
            else mat[j] = y < SKY + 120 ? CLAY : STONE;
          }
        }
      }
    }
  }

  function stats() {
    var awakeCount = 0;
    for (var k = 0; k < awake.length; k++) if (bodies[awake[k]]) awakeCount++;
    var live = 0;
    for (k = 1; k < bodies.length; k++) if (bodies[k]) live++;
    return { active: lastActive, chunks: CW * CH, awake: awakeCount, clumps: live, taken: taken.slice(), ticks: ticks };
  }

  function at(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    var i = y * W + x, m = mat[i];
    var loose = !!(flag[i] & LOOSE) || body[i] > 0 || isFluid(m);
    return {
      mat: m,
      name: NAMES[m] + (flag[i] & WET ? " (wet)" : ""),
      loose: loose,
      hitsLeft: m === AIR ? 0 : loose ? 1 : Math.max(1, HITS[m] - dmg[i])
    };
  }

  build();

  return {
    AIR: AIR, SAND: SAND, TOPSOIL: TOPSOIL, CLAY: CLAY, GRAVEL: GRAVEL, STONE: STONE, WATER: WATER, OIL: OIL,
    LOOSE: LOOSE, WET: WET, CRACK: CRACK,
    NAMES: NAMES, HITS: HITS,
    W: W, H: H, BAY: BAY, SKY: SKY, TABLE: TABLE, BAYS: BAYS, CS: CS, CW: CW, CH: CH,
    mat: mat, flag: flag, body: body, shade: shade, dmg: dmg, dirty: dirty,
    step: step,
    dig: dig,
    footprint: footprint,
    canReach: canReach,
    at: at,
    stats: stats,
    reset: build
  };
})();
