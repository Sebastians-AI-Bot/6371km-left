/* Dig simulation on a grid of 1 cm cells.

   Loose grains and fluids move cell by cell. Pebbles, clods and stone
   pieces are clumps that fall and slide as one block and never rotate.
   Cohesive ground stays put until an overhang reaches further than the
   material can carry, then it lets go. Digging is only possible where
   the tool touches open air that reaches the sky.

   The grid is a window onto a world that `world.cell` describes cell by
   cell. Untouched ground is never stored: a chunk the window leaves is
   kept only if something in it changed, and the window slides so any
   ground can be reached. With `world.ring` set, the outermost ring of
   chunks is frozen, as its neighbours outside the window do not move. */
function makeDig(world) {
  "use strict";

  var AIR = 0, SAND = 1, TOPSOIL = 2, CLAY = 3, GRAVEL = 4, STONE = 5, WATER = 6, OIL = 7;
  var NAMES = ["air", "sand", "topsoil", "clay", "gravel", "stone", "water", "oil"];
  /* Hits a cell in place takes before it gives. Loose cells take one. */
  var HITS = [0, 1, 1, 3, 1, 6, 1, 1];
  /* How far, in cells, cohesive ground can reach out from its support. */
  var REACH = [0, 0, 4, 14, 0, 200, 0, 0];

  var LOOSE = 1, WET = 2, CRACK = 4;

  var W = world.W;
  var H = world.H;
  var N = W * H;
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

  /* Clumps by id. Ids from the generator are negative and stable, so a
     pebble keeps its id when its chunk is regenerated; split and broken
     pieces get positive ids. */
  var bodies = new Map();
  var nextId = 1;
  var awake = [];

  var CS = 32;
  var CW = Math.ceil(W / CS);
  var CH = Math.ceil(H / CS);
  var RING = world.ring ? CS : 0;
  var active = new Uint8Array(CW * CH);
  var next = new Uint8Array(CW * CH);
  var dirty = new Uint8Array(CW * CH);
  var edited = new Uint8Array(CW * CH);
  var st = 1;
  var ticks = 0;
  var collapse = null;
  var taken = new Array(NAMES.length).fill(0);
  var lastActive = 0;

  /* World cell of the window's top left corner, in whole chunks. */
  var ox = 0, oy = 0;
  var store = new Map();
  var onShift = null;
  var gen = { mat: 0, flag: 0, shade: 0, clump: 0 };

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
    edited[c] = 1;
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
    var b = bodies.get(id);
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
    if (oy + y < world.table) return;
    if (flag[i] & WET) seep(i, x, y);
    else if (sand && world.saturated(ox + x, oy + y) && soaked(i, x, y)) {
      flag[i] |= WET;
      mark(x, y);
    }
  }

  /* Dry sand that comes to rest in saturated ground soaks up water from
     a wet or flooded neighbour. */
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
      if (oy + jy < world.table) continue;
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
          if (RING && (c === 0 || c === CW - 1 || cy === 0 || cy === CH - 1)) continue;
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
    var id = nextId++;
    var b = { id: id, mat: m, cells: cells, awake: !!isAwake, vy: 0, carry: 0, flat: 0 };
    bodies.set(id, b);
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
      if (nx < RING || nx >= W - RING || ny < RING || ny >= H - RING) return false;
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
    if (xo < RING || xo >= W - RING || y1 + 1 >= H - RING) return false;
    if (!freeFor(mat[(y1 + 1) * W + xo])) return false;
    var open = 0;
    for (y = y0; y <= y1; y++) if (freeFor(mat[y * W + xo])) open++;
    if (open < (y1 - y0 + 1) * 0.6) return false;
    return tryMove(b, d, 0);
  }

  /* Tips move a clump sideways without lowering it, so two of them can
     undo each other forever. A clump may tip only this often between two
     moves that take it down; after that it sleeps unless it can fall.
     Waking does not reset the count, so neighbours cannot keep each
     other going either. */
  var FLAT_LIMIT = 4;
  var calmed = 0;

  function stepBodies() {
    var list = awake;
    awake = [];
    list.sort(function (a, b) {
      var ba = bodies.get(a), bb = bodies.get(b);
      return (bb ? bb.cells[bb.cells.length - 1] : 0) - (ba ? ba.cells[ba.cells.length - 1] : 0);
    });
    for (var k = 0; k < list.length; k++) {
      var b = bodies.get(list[k]);
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
      if (moved) b.flat = 0;
      else {
        if (b.cells.length <= 900) {
          var d = Math.random() < 0.5 ? 1 : -1;
          moved = tryMove(b, d, 1) || tryMove(b, -d, 1);
          if (moved) b.flat = 0;
          else if (b.flat < FLAT_LIMIT) {
            moved = tip(b, d) || tip(b, -d);
            if (moved) b.flat++;
          } else if (b.flat === FLAT_LIMIT) {
            b.flat++;
            calmed++;
          }
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
    x0 = Math.max(RING, x0); y0 = Math.max(RING, y0);
    x1 = Math.min(W - 1 - RING, x1); y1 = Math.min(H - 1 - RING, y1);
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
    /* Air on the window's edge is taken to reach the sky: it was dug from
       above, or it is the sky. */
    function seed(i) {
      if (!sky[i] && mat[i] === AIR) { sky[i] = 1; skyQueue[tail++] = i; }
    }
    for (x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
    for (var ey = 1; ey < H - 1; ey++) { seed(ey * W); seed(ey * W + W - 1); }
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
    var x0 = Math.max(RING, f.x0), y0 = Math.max(RING, f.y0);
    var x1 = Math.min(W - 1 - RING, f.x1), y1 = Math.min(H - 1 - RING, f.y1);
    if (x1 < x0 || y1 < y0) return { ok: false };
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
      var b = bodies.get(Number(key));
      if (!b) continue;
      var inside = touched[key];
      if (b.cells.length <= area) {
        if (inside * 2 >= b.cells.length) {
          for (var k = 0; k < b.cells.length; k++) take(b.cells[k]);
          bodies.delete(b.id);
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

  function chunkKey(cx, cy) {
    return (ox / CS + cx) + "," + (oy / CS + cy);
  }

  function saveChunk(cx, cy) {
    var x0 = cx * CS, y0 = cy * CS, w = Math.min(CS, W - x0), h = Math.min(CS, H - y0);
    var n = CS * CS;
    var s = { mat: new Uint8Array(n), flag: new Uint8Array(n), dmg: new Uint8Array(n), shade: new Uint8Array(n), body: new Int32Array(n) };
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = (y0 + y) * W + x0 + x, k = y * CS + x;
        s.mat[k] = mat[i]; s.flag[k] = flag[i]; s.dmg[k] = dmg[i]; s.shade[k] = shade[i]; s.body[k] = body[i];
      }
    }
    store.set(chunkKey(cx, cy), s);
  }

  function loadChunk(cx, cy) {
    var x0 = cx * CS, y0 = cy * CS, w = Math.min(CS, W - x0), h = Math.min(CS, H - y0);
    var c = cy * CW + cx, key = chunkKey(cx, cy), s = store.get(key);
    var x, y, i, k;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = (y0 + y) * W + x0 + x;
        if (s) {
          k = y * CS + x;
          mat[i] = s.mat[k]; flag[i] = s.flag[k]; dmg[i] = s.dmg[k]; shade[i] = s.shade[k]; body[i] = s.body[k];
        } else {
          world.cell(ox + x0 + x, oy + y0 + y, gen);
          mat[i] = gen.mat; flag[i] = gen.flag; dmg[i] = 0; shade[i] = gen.shade; body[i] = gen.clump;
        }
        stamp[i] = 0;
      }
    }
    if (s) store.delete(key);
    edited[c] = s ? 1 : 0;
    dirty[c] = 1;
    active[c] = 0;
    next[c] = s ? 1 : 0;
  }

  var addSeq = 0;

  function addBodyCells(i0, i1, x0, x1) {
    var touched = [];
    addSeq++;
    for (var i = i0; i < i1; i += W) {
      for (var x = x0; x < x1; x++) {
        var j = i + x, id = body[j];
        if (!id) continue;
        var b = bodies.get(id);
        if (!b) {
          b = { id: id, mat: mat[j], cells: [], awake: false, vy: 0, carry: 0, flat: 0 };
          bodies.set(id, b);
        }
        if (b.seen !== addSeq) { b.seen = addSeq; touched.push(b); }
        b.cells.push(j);
      }
    }
    for (var k = 0; k < touched.length; k++) {
      touched[k].cells.sort(function (p, q) { return p - q; });
    }
  }

  /* new(x, y) = old(x + sx, y + sy), rows and columns that fall off are
     dropped; the uncovered ones are filled by the caller. */
  function shiftArray(a, w, h, sx, sy) {
    var len = w - Math.abs(sx);
    if (len <= 0 || Math.abs(sy) >= h) return;
    var d0 = Math.max(0, -sx), s0 = Math.max(0, sx), y;
    if (sy >= 0) {
      for (y = 0; y < h - sy; y++) a.copyWithin(y * w + d0, (y + sy) * w + s0, (y + sy) * w + s0 + len);
    } else {
      for (y = h - 1; y >= -sy; y--) a.copyWithin(y * w + d0, (y + sy) * w + s0, (y + sy) * w + s0 + len);
    }
  }

  function onRing(cx, cy) {
    return cx === 0 || cy === 0 || cx === CW - 1 || cy === CH - 1;
  }

  /* Slides the window by whole chunks. Changed chunks that leave are kept;
     chunks that come in are loaded from the store or generated. */
  function slide(scx, scy) {
    if (!scx && !scy) return;
    if (onShift) onShift(scx, scy);
    var full = Math.abs(scx) >= CW || Math.abs(scy) >= CH;
    var cx, cy;
    for (cy = 0; cy < CH; cy++) {
      for (cx = 0; cx < CW; cx++) {
        var nx = cx - scx, ny = cy - scy;
        if ((nx < 0 || ny < 0 || nx >= CW || ny >= CH) && edited[cy * CW + cx]) saveChunk(cx, cy);
      }
    }
    var sx = scx * CS, sy = scy * CS;
    if (full) bodies.clear();
    else {
      shiftArray(mat, W, H, sx, sy); shiftArray(flag, W, H, sx, sy); shiftArray(dmg, W, H, sx, sy);
      shiftArray(shade, W, H, sx, sy); shiftArray(body, W, H, sx, sy);
      shiftArray(active, CW, CH, scx, scy); shiftArray(next, CW, CH, scx, scy);
      shiftArray(dirty, CW, CH, scx, scy); shiftArray(edited, CW, CH, scx, scy);
      bodies.forEach(function (b, id) {
        var keep = [];
        for (var k = 0; k < b.cells.length; k++) {
          var i = b.cells[k], y = (i / W) | 0, x = i - y * W;
          x -= sx; y -= sy;
          if (x >= 0 && y >= 0 && x < W && y < H) keep.push(y * W + x);
        }
        if (keep.length) b.cells = keep;
        else bodies.delete(id);
      });
    }
    ox += sx;
    oy += sy;
    stamp.fill(0);
    for (cy = 0; cy < CH; cy++) {
      for (cx = 0; cx < CW; cx++) {
        var px = cx + scx, py = cy + scy;
        if (full || px < 0 || py < 0 || px >= CW || py >= CH) {
          loadChunk(cx, cy);
          addBodyCells(cy * CS * W, Math.min(H, cy * CS + CS) * W, cx * CS, Math.min(W, cx * CS + CS));
        } else if (onRing(px, py) && !onRing(cx, cy)) {
          next[cy * CW + cx] = 1;
          for (var y = cy * CS; y < cy * CS + CS; y++) {
            for (var x = cx * CS; x < cx * CS + CS; x++) if (body[y * W + x]) wakeBody(body[y * W + x]);
          }
        }
      }
    }
    var still = [];
    for (var k = 0; k < awake.length; k++) if (bodies.has(awake[k])) still.push(awake[k]);
    awake = still;
    collapse = null;
    skyDirty = true;
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

  function build() {
    store.clear();
    bodies.clear();
    nextId = 1;
    awake = [];
    calmed = 0;
    active.fill(0); next.fill(0); dirty.fill(1); edited.fill(0);
    collapse = null;
    taken.fill(0);
    skyDirty = true;
    ox = world.x0 || 0;
    oy = world.y0 || 0;
    for (var cy = 0; cy < CH; cy++) {
      for (var cx = 0; cx < CW; cx++) loadChunk(cx, cy);
    }
    addBodyCells(0, N, 0, W);
  }

  function stats() {
    var awakeCount = 0;
    for (var k = 0; k < awake.length; k++) if (bodies.has(awake[k])) awakeCount++;
    var live = bodies.size;
    return { active: lastActive, chunks: CW * CH, awake: awakeCount, clumps: live, stored: store.size, calmed: calmed, taken: taken.slice(), ticks: ticks };
  }

  function at(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    var i = y * W + x, m = mat[i];
    var loose = !!(flag[i] & LOOSE) || body[i] !== 0 || isFluid(m);
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
    W: W, H: H, CS: CS, CW: CW, CH: CH, RING: RING,
    world: world,
    mat: mat, flag: flag, body: body, shade: shade, dmg: dmg, dirty: dirty, edited: edited,
    origin: function () { return { x: ox, y: oy }; },
    follow: follow,
    slide: slide,
    onShift: function (fn) { onShift = fn; },
    step: step,
    dig: dig,
    footprint: footprint,
    canReach: canReach,
    at: at,
    stats: stats,
    reset: build
  };
}

/* Integer hash of a cell to [0, 1), the same every time it is asked. */
makeDig.hash = function (x, y, salt) {
  var h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/* Pebble packing: Voronoi cells about `spacing` across with seeds from
   the hash. Returns 0 on a seam (the matrix between pebbles) or the
   pebble's clump id, negative and the same for every cell of it. */
makeDig.pebble = function (wx, wy, spacing) {
  var gx = Math.floor(wx / spacing), gy = Math.floor(wy / spacing);
  var best = 1e9, second = 1e9, bx = 0, by = 0;
  for (var oy = -1; oy <= 1; oy++) {
    for (var ox = -1; ox <= 1; ox++) {
      var qx = gx + ox, qy = gy + oy;
      var dx = (qx + makeDig.hash(qx, qy, 1)) * spacing - wx - 0.5;
      var dy = (qy + makeDig.hash(qx, qy, 2)) * spacing - wy - 0.5;
      var d2 = dx * dx + dy * dy;
      if (d2 < best) { second = best; best = d2; bx = qx; by = qy; }
      else if (d2 < second) second = d2;
    }
  }
  if (Math.sqrt(second) - Math.sqrt(best) < 0.6) return 0;
  return -1 - (((by & 0x3fff) << 16) | (bx & 0xffff));
};

makeDig.AIR = 0; makeDig.SAND = 1; makeDig.TOPSOIL = 2; makeDig.CLAY = 3;
makeDig.GRAVEL = 4; makeDig.STONE = 5; makeDig.WATER = 6; makeDig.OIL = 7;
makeDig.LOOSE = 1; makeDig.WET = 2;
