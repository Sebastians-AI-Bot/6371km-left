/* Dig simulation on a grid of 1 cm cells.

   Loose grains and fluids move cell by cell. Pebbles, clods and stone
   pieces are clumps that fall and slide as one block and never rotate.
   Cohesive ground stays put until an overhang reaches further than the
   material can carry, then it lets go. Digging is only possible where
   the tool touches open air that reaches the sky.

   The ground has no edge: it is kept in chunks of 32 × 32 cells, made
   from `world.cell` the first time anything needs them, and every chunk
   with something moving in it is simulated, wherever it is. A chunk
   nothing changed is dropped again when there are many, as the world can
   make it anew. `world.sky` tells untouched air open to the sky from
   untouched air in a `world.buried` rect, a sealed pocket until a way
   from the sky reaches into it. With `world.bounds` the world ends in a
   wall there. */
function makeDig(world) {
  "use strict";

  var AIR = 0, SAND = 1, TOPSOIL = 2, CLAY = 3, GRAVEL = 4, STONE = 5, WATER = 6, OIL = 7;
  var NAMES = ["air", "sand", "topsoil", "clay", "gravel", "stone", "water", "oil"];
  /* Hits a cell in place takes before it gives. Loose cells take one. */
  var HITS = [0, 1, 1, 3, 1, 6, 1, 1];
  /* How far, in cells, cohesive ground can reach out from its support. */
  var REACH = [0, 0, 4, 14, 0, 200, 0, 0];

  /* FIXED is the wall past world.bounds: it never moves or gives. */
  var LOOSE = 1, WET = 2, CRACK = 4, FIXED = 8;

  var CS = 32, CB = CS * CS;
  var SETTLE_PAD = 48;
  /* Chunks kept before the untouched ones nobody uses are dropped. */
  var MAX_CHUNKS = 4096;
  var bounds = world.bounds || null;

  /* Cells, chunk by chunk: cell i is in slot i >> 10, at column i & 31
     and row (i >> 5) & 31 of its chunk. */
  var cap = 0, used = 0, live = 0, freeSlots = [];
  var mat, flag, dmg, shade, stamp, base, seen, body;
  /* Per slot: its chunk, its neighbours east, west, up and down (-1 when
     not made), and flags. `halo` says all eight neighbours are made, which
     a chunk needs before anything in it moves. */
  var chunkX, chunkY, nb, isLive, edited, dirty, halo, active, next, activeBox, nextBox;
  var slots = new Map();
  var activeList = [], nextList = [], dirtyList = [];
  var DX = [1, -1, 0, 0], DY = [0, 0, -1, 1], OPP = [1, 0, 3, 2];
  var cacheKey = NaN, cacheSlot = -1;
  var pinned = null;
  var resetHooks = [];

  var bodies = new Map();
  var nextId = 1;
  var awake = [];

  var st = 1;
  var ticks = 0;
  var collapse = null;
  var taken = new Array(NAMES.length).fill(0);
  var lastActive = 0;
  var editedCount = 0;
  var gen = { mat: 0, flag: 0, shade: 0, clump: 0 };
  var seenMark = 0;
  var reachStack = new Int32Array(4096);

  /* Buried air (gas pockets) as world rects. Once a way from the sky
     passes into one it is open for good. */
  var buried = (world.buried || []).map(function (r) {
    return { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, open: false };
  });

  function more(a, Type, n, fill) {
    var b = new Type(n);
    if (fill) b.fill(fill);
    if (a) b.set(a);
    return b;
  }

  function grow() {
    var n = cap ? cap * 2 : 512;
    mat = more(mat, Uint8Array, n * CB); flag = more(flag, Uint8Array, n * CB);
    dmg = more(dmg, Uint8Array, n * CB); shade = more(shade, Uint8Array, n * CB);
    stamp = more(stamp, Uint8Array, n * CB); base = more(base, Uint8Array, n * CB);
    seen = more(seen, Uint16Array, n * CB); body = more(body, Int32Array, n * CB);
    chunkX = more(chunkX, Int32Array, n); chunkY = more(chunkY, Int32Array, n);
    nb = more(nb, Int32Array, n * 4, -1);
    isLive = more(isLive, Uint8Array, n); edited = more(edited, Uint8Array, n);
    dirty = more(dirty, Uint8Array, n); halo = more(halo, Uint8Array, n);
    active = more(active, Uint8Array, n); next = more(next, Uint8Array, n);
    activeBox = more(activeBox, Int8Array, n * 4); nextBox = more(nextBox, Int8Array, n * 4);
    cap = n;
  }

  function chunkKey(cx, cy) {
    return (cx + 33554432) * 67108864 + (cy + 33554432);
  }

  function slotAt(cx, cy) {
    var k = chunkKey(cx, cy);
    if (k === cacheKey) return cacheSlot;
    var s = slots.get(k);
    if (s === undefined) return -1;
    cacheKey = k;
    cacheSlot = s;
    return s;
  }

  function outside(x, y) {
    return !!bounds && (x < bounds.x0 || x >= bounds.x1 || y < bounds.y0 || y >= bounds.y1);
  }

  /* The slot of chunk (cx, cy), made from the world if it was not there. */
  function ensure(cx, cy) {
    var s = slotAt(cx, cy);
    if (s >= 0) return s;
    if (bounds && (cx * CS >= bounds.x1 || cx * CS + CS <= bounds.x0 ||
      cy * CS >= bounds.y1 || cy * CS + CS <= bounds.y0)) return -1;
    s = freeSlots.length ? freeSlots.pop() : used++;
    if (s >= cap) grow();
    live++;
    slots.set(chunkKey(cx, cy), s);
    chunkX[s] = cx; chunkY[s] = cy;
    isLive[s] = 1; edited[s] = 0; halo[s] = 0; active[s] = 0; next[s] = 0; dirty[s] = 0;
    var g = s << 10, x0 = cx * CS, y0 = cy * CS;
    for (var ly = 0; ly < CS; ly++) {
      for (var lx = 0; lx < CS; lx++, g++) {
        var wx = x0 + lx, wy = y0 + ly;
        if (outside(wx, wy)) {
          mat[g] = base[g] = STONE; flag[g] = FIXED; shade[g] = 0; body[g] = 0;
        } else {
          world.cell(wx, wy, gen);
          mat[g] = base[g] = gen.mat; flag[g] = gen.flag; shade[g] = gen.shade; body[g] = gen.clump;
        }
        dmg[g] = 0; stamp[g] = 0; seen[g] = 0;
      }
    }
    for (var d = 0; d < 4; d++) {
      var n = slotAt(cx + DX[d], cy + DY[d]);
      nb[s * 4 + d] = n;
      if (n >= 0) nb[n * 4 + OPP[d]] = s;
    }
    setDirty(s);
    addBodyCells(s);
    return s;
  }

  function ensureHalo(s) {
    halo[s] = 1;
    var cx = chunkX[s], cy = chunkY[s];
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) if (dx || dy) ensure(cx + dx, cy + dy);
    }
  }

  function ensureBox(x0, y0, x1, y1) {
    for (var cy = y0 >> 5; cy <= y1 >> 5; cy++) {
      for (var cx = x0 >> 5; cx <= x1 >> 5; cx++) ensure(cx, cy);
    }
  }

  /* Cell (x, y) of the world, or -1 when its chunk is not made (with
     `make`, it is made). */
  function cellIndex(x, y, make) {
    var s = make ? ensure(x >> 5, y >> 5) : slotAt(x >> 5, y >> 5);
    return s < 0 ? -1 : (s << 10) | ((y & 31) << 5) | (x & 31);
  }

  function xOf(i) { return chunkX[i >> 10] * CS + (i & 31); }
  function yOf(i) { return chunkY[i >> 10] * CS + ((i >> 5) & 31); }

  function east(i) {
    if ((i & 31) < 31) return i + 1;
    var n = nb[(i >> 10) * 4];
    return n < 0 ? -1 : (n << 10) | (i & 992);
  }
  function west(i) {
    if (i & 31) return i - 1;
    var n = nb[(i >> 10) * 4 + 1];
    return n < 0 ? -1 : (n << 10) | (i & 992) | 31;
  }
  function north(i) {
    if (i & 992) return i - 32;
    var n = nb[(i >> 10) * 4 + 2];
    return n < 0 ? -1 : (n << 10) | 992 | (i & 31);
  }
  function south(i) {
    if ((i & 992) !== 992) return i + 32;
    var n = nb[(i >> 10) * 4 + 3];
    return n < 0 ? -1 : (n << 10) | (i & 31);
  }
  function side(i, d) { return d > 0 ? east(i) : west(i); }
  function toward(i, d) { return d === 0 ? east(i) : d === 1 ? west(i) : d === 2 ? north(i) : south(i); }

  function isFluid(m) {
    return m === WATER || m === OIL;
  }

  function cohesive(i) {
    return REACH[mat[i]] > 0 && !(flag[i] & (LOOSE | FIXED)) && body[i] === 0;
  }

  function setDirty(s) {
    if (!dirty[s]) {
      dirty[s] = 1;
      dirtyList.push(s);
    }
  }

  /* Wakes cells x0..x1, y0..y1 of chunk s (chunk-local) for the next
     substep. Each awake chunk scans only the box of cells woken in it. */
  function touch(s, x0, y0, x1, y1) {
    var k = s * 4;
    if (!next[s]) {
      next[s] = 1;
      nextList.push(s);
      nextBox[k] = x0; nextBox[k + 1] = y0; nextBox[k + 2] = x1; nextBox[k + 3] = y1;
      return;
    }
    if (x0 < nextBox[k]) nextBox[k] = x0;
    if (y0 < nextBox[k + 1]) nextBox[k + 1] = y0;
    if (x1 > nextBox[k + 2]) nextBox[k + 2] = x1;
    if (y1 > nextBox[k + 3]) nextBox[k + 3] = y1;
  }

  /* A cell changed: it and its eight neighbours get another look. */
  function mark(i) {
    var s = i >> 10;
    setDirty(s);
    if (!edited[s]) { edited[s] = 1; editedCount++; }
    if (!halo[s]) ensureHalo(s);
    var lx = i & 31, ly = (i >> 5) & 31;
    var x0 = lx ? lx - 1 : 0, x1 = lx < 31 ? lx + 1 : 31;
    var y0 = ly ? ly - 1 : 0, y1 = ly < 31 ? ly + 1 : 31;
    touch(s, x0, y0, x1, y1);
    if (lx && lx < 31 && ly && ly < 31) return;
    var k = s * 4, e = nb[k], w = nb[k + 1], n = nb[k + 2], d = nb[k + 3];
    if (lx === 0 && w >= 0) touch(w, 31, y0, 31, y1);
    if (lx === 31 && e >= 0) touch(e, 0, y0, 0, y1);
    if (ly === 0 && n >= 0) {
      touch(n, x0, 31, x1, 31);
      if (lx === 0 && nb[n * 4 + 1] >= 0) touch(nb[n * 4 + 1], 31, 31, 31, 31);
      if (lx === 31 && nb[n * 4] >= 0) touch(nb[n * 4], 0, 31, 0, 31);
    }
    if (ly === 31 && d >= 0) {
      touch(d, x0, 0, x1, 0);
      if (lx === 0 && nb[d * 4 + 1] >= 0) touch(nb[d * 4 + 1], 31, 0, 31, 0);
      if (lx === 31 && nb[d * 4] >= 0) touch(nb[d * 4], 0, 0, 0, 0);
    }
  }

  /* Marks every cell of the world box x0..x1, y0..y1. */
  function markRect(x0, y0, x1, y1) {
    if (x1 < x0 || y1 < y0) return;
    for (var cy = y0 >> 5; cy <= y1 >> 5; cy++) {
      for (var cx = x0 >> 5; cx <= x1 >> 5; cx++) {
        var s = ensure(cx, cy);
        if (s < 0) continue;
        setDirty(s);
        if (!edited[s]) { edited[s] = 1; editedCount++; }
        if (!halo[s]) ensureHalo(s);
        var bx = cx * CS, by = cy * CS;
        touch(s, Math.max(x0, bx) - bx, Math.max(y0, by) - by, Math.min(x1, bx + 31) - bx, Math.min(y1, by + 31) - by);
      }
    }
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
    if (!b || b.awake) return;
    b.awake = true;
    b.vy = 0;
    awake.push(id);
    for (var k = 0; k < b.cells.length; k++) {
      var s = b.cells[k] >> 10;
      if (!halo[s]) ensureHalo(s);
    }
  }

  /* A cell just emptied: whatever rested on it or leaned on it may move. */
  function vacated(i) {
    mark(i);
    var a = north(i);
    if (a >= 0) {
      for (var dx = -1; dx <= 1; dx++) {
        var c = dx ? side(a, dx) : a;
        if (c < 0) continue;
        if (body[c]) wakeBody(body[c]);
        else if (dx === 0 && cohesive(c)) growCollapse(xOf(c), yOf(c));
      }
    }
    var w = west(i), e = east(i);
    if (w >= 0 && body[w]) wakeBody(body[w]);
    if (e >= 0 && body[e]) wakeBody(body[e]);
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
  function fallTo(j) {
    for (var n = 1; n < FALL; n++) {
      var k = south(j);
      if (k < 0 || mat[k] !== AIR) break;
      j = k;
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

  function waits(m) {
    return Math.random() > (m === SAND ? SAND_PACE : m === TOPSOIL ? TOPSOIL_PACE : REST_PACE);
  }

  /* The cell below and to side d that a grain on i can slip into, or -1. */
  function slipsTo(i, j, d) {
    var s = side(i, d);
    if (s < 0 || !(freeFor(mat[s]) || ((flag[s] & LOOSE) && !body[s]))) return -1;
    var t = side(j, d);
    return t >= 0 && freeFor(mat[t]) ? t : -1;
  }

  function grain(i) {
    var m = mat[i], sand = m === SAND;
    var j = south(i);
    if (j >= 0) {
      var t = mat[j];
      if ((t === AIR || isFluid(t)) && waits(m)) { mark(i); return; }
      if (t === AIR) {
        var to = sand ? j : fallTo(j);
        /* A falling grain drifts a cell sideways now and then, so a stream
           off a face spreads into a curtain instead of a one-cell chute. */
        if (Math.random() < 0.35) {
          var dx = Math.random() < 0.5 ? 1 : -1;
          var there = side(to, dx), here = side(i, dx);
          if (there >= 0 && here >= 0 && mat[there] === AIR && mat[here] === AIR) to = there;
        }
        moveCell(i, to);
        mark(to);
        vacated(i);
        return;
      }
      if (isFluid(t)) {
        swapCell(i, j);
        mark(j);
        vacated(i);
        return;
      }
      var left = slipsTo(i, j, -1), right = slipsTo(i, j, 1);
      if (left >= 0 || right >= 0) {
        if (waits(m)) { mark(i); return; }
        var k = left >= 0 && right >= 0 ? (Math.random() < 0.5 ? right : left) : left >= 0 ? left : right;
        if (mat[k] === AIR) moveCell(i, k);
        else swapCell(i, k);
        mark(k);
        vacated(i);
        return;
      }
    }
    var y = yOf(i);
    if (y < world.table) return;
    if (flag[i] & WET) seep(i);
    else if (sand && world.saturated(xOf(i), y) && soaked(i)) {
      flag[i] |= WET;
      mark(i);
    }
  }

  /* Dry sand that comes to rest in saturated ground soaks up water from
     a wet or flooded neighbour. */
  function soaked(i) {
    for (var d = 0; d < 4; d++) {
      var j = toward(i, d);
      if (j >= 0 && (mat[j] === WATER || (mat[j] === SAND && (flag[j] & WET)))) return true;
    }
    return false;
  }

  /* Wet sand under the table lets water into open cells that are below
     the table too, so a hole fills up to the table and no further. */
  function seep(i) {
    var open = false;
    for (var d = 0; d < 4; d++) {
      var j = toward(i, d);
      if (j < 0) continue;
      /* Pressure: under standing water the seep surfaces at the top of
         the pool, so the pool rises instead of stalling at one film. */
      while (mat[j] === WATER) {
        var u = north(j);
        if (u < 0) break;
        j = u;
      }
      if (mat[j] !== AIR) continue;
      if (yOf(j) < world.table) continue;
      open = true;
      if (Math.random() < 0.04) {
        mat[j] = WATER;
        flag[j] = 0;
        shade[j] = (Math.random() * 256) | 0;
        stamp[j] = st;
        mark(j);
      }
    }
    if (open) mark(i);
  }

  var PRESS = 60;

  function fluid(i, m) {
    var slow = m === OIL;
    var wait = Math.random() > (slow ? 0.4 : 1) * REST_PACE;
    var j = south(i), d, k, c;
    if (j >= 0) {
      var t = mat[j];
      if (t === AIR || (m === WATER && t === OIL)) {
        if (wait) { mark(i); return; }
        var to = j;
        if (t === AIR) moveCell(i, to = fallTo(j));
        else swapCell(i, j);
        mark(to);
        vacated(i);
        return;
      }
      d = Math.random() < 0.5 ? 1 : -1;
      for (k = 0; k < 2; k++, d = -d) {
        c = side(i, d);
        if (c < 0 || mat[c] !== AIR) continue;
        var below = side(j, d);
        if (below >= 0 && mat[below] === AIR) {
          if (wait) { mark(i); return; }
          moveCell(i, below);
          mark(below);
          vacated(i);
          return;
        }
      }
    }
    /* Sideways only toward a drop, or when fluid above presses down. A cell
       beside fluid at the same level has no head to drive it, so a partial
       top layer rests instead of sliding to and fro. */
    var reach = slow ? 1 : 4;
    var up = north(i);
    var pushed = up >= 0 && isFluid(mat[up]);
    var dir = ((yOf(i) + st) & 1) ? 1 : -1;
    for (var s = 0; s < 2; s++, dir = -dir) {
      var target = -1, drop = false, r;
      c = i;
      for (r = 1; r <= reach; r++) {
        c = side(c, dir);
        if (c < 0 || mat[c] !== AIR) break;
        target = c;
        var b = south(c);
        if (b >= 0 && mat[b] === AIR) { drop = true; break; }
      }
      /* Under a head the cell passes through its own fluid to the nearest
         open cell on its row, so a pool levels out across its width. */
      if (target < 0 && pushed) {
        c = i;
        for (r = 1; r <= PRESS; r++) {
          c = side(c, dir);
          if (c < 0) break;
          if (mat[c] === m) continue;
          if (mat[c] === AIR) target = c;
          break;
        }
      }
      if (target >= 0 && (drop || pushed)) {
        if (wait) { mark(i); return; }
        moveCell(i, target);
        mark(target);
        vacated(i);
        return;
      }
    }
  }

  function cell(i) {
    if (stamp[i] === st) return;
    var m = mat[i];
    if (m === AIR || body[i]) return;
    if (m === WATER || m === OIL) fluid(i, m);
    else if (flag[i] & LOOSE) grain(i);
  }

  /* Bottom up, a row at a time across the awake chunks of a chunk row,
     every other row from the right, so piles spread to both sides. */
  function stepCells() {
    var k, s;
    for (k = 0; k < activeList.length; k++) active[activeList[k]] = 0;
    var t = activeList;
    activeList = nextList;
    nextList = t;
    nextList.length = 0;
    var tb = activeBox;
    activeBox = nextBox;
    nextBox = tb;
    for (k = 0; k < activeList.length; k++) {
      s = activeList[k];
      active[s] = 1;
      next[s] = 0;
      if (!halo[s]) ensureHalo(s);
    }
    st = st === 255 ? 1 : st + 1;
    activeList.sort(function (a, b) { return chunkY[b] - chunkY[a] || chunkX[a] - chunkX[b]; });
    var g0 = 0;
    while (g0 < activeList.length) {
      var cy = chunkY[activeList[g0]], g1 = g0, top = 31, bot = 0;
      while (g1 < activeList.length && chunkY[activeList[g1]] === cy) {
        s = activeList[g1];
        if (activeBox[s * 4 + 1] < top) top = activeBox[s * 4 + 1];
        if (activeBox[s * 4 + 3] > bot) bot = activeBox[s * 4 + 3];
        g1++;
      }
      for (var ly = bot; ly >= top; ly--) {
        var rev = ((cy * CS + ly + st) & 1) === 1;
        for (var q = 0; q < g1 - g0; q++) {
          s = activeList[rev ? g1 - 1 - q : g0 + q];
          var bb = s * 4;
          if (ly < activeBox[bb + 1] || ly > activeBox[bb + 3]) continue;
          var row = (s << 10) | (ly << 5), xa = activeBox[bb], xb = activeBox[bb + 2], x;
          if (rev) for (x = xb; x >= xa; x--) cell(row | x);
          else for (x = xa; x <= xb; x++) cell(row | x);
        }
      }
      g0 = g1;
    }
    lastActive = activeList.length;
  }

  function newBody(m, cells, isAwake) {
    var id = nextId++;
    var b = { id: id, mat: m, cells: cells, awake: false, vy: 0, carry: 0, flat: 0 };
    bodies.set(id, b);
    for (var k = 0; k < cells.length; k++) {
      var i = cells[k];
      body[i] = id;
      flag[i] &= ~LOOSE;
      dmg[i] = 0;
    }
    if (isAwake) wakeBody(id);
    return b;
  }

  var tmpF = new Uint8Array(1024), tmpS = new Uint8Array(1024), tmpD = new Uint8Array(1024);
  var tmpTo = new Int32Array(1024);

  function tryMove(b, dx, dy) {
    var c = b.cells, n = c.length, id = b.id, k, i, j;
    if (tmpTo.length < n) {
      tmpTo = new Int32Array(n * 2);
      tmpF = new Uint8Array(n * 2);
      tmpS = new Uint8Array(n * 2);
      tmpD = new Uint8Array(n * 2);
    }
    for (k = 0; k < n; k++) {
      i = c[k];
      j = dy ? south(i) : i;
      if (j >= 0 && dx) j = side(j, dx);
      if (j < 0) return false;
      tmpTo[k] = j;
      if (body[j] === id) continue;
      if (!freeFor(mat[j])) return false;
    }
    var fluids = [];
    for (k = 0; k < n; k++) {
      i = c[k];
      tmpF[k] = flag[i];
      tmpS[k] = shade[i];
      tmpD[k] = dmg[i];
      j = tmpTo[k];
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
      j = tmpTo[k];
      mat[j] = b.mat;
      flag[j] = tmpF[k];
      shade[j] = tmpS[k];
      dmg[j] = tmpD[k];
      body[j] = id;
      moved[k] = j;
    }
    for (k = 0; k < n; k++) mark(moved[k]);
    for (k = 0; k < n; k++) {
      i = c[k];
      if (body[i] === id) continue;
      if (fluids.length) {
        mat[i] = fluids.pop();
        flag[i] = 0;
        shade[i] = (Math.random() * 256) | 0;
      }
      vacated(i);
    }
    b.cells = moved;
    return true;
  }

  /* A clump that cannot rotate still has to leave a face steeper than
     it can rest on: open beside it for most of its height and open below
     its outer corner, it shifts a cell outward and falls from there. */
  function tip(b, d) {
    var c = b.cells, n = c.length, k, x, y;
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (k = 0; k < n; k++) {
      x = xOf(c[k]);
      y = yOf(c[k]);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    var xo = d < 0 ? x0 - 1 : x1 + 1;
    var corner = cellIndex(xo, y1 + 1);
    if (corner < 0 || !freeFor(mat[corner])) return false;
    var open = 0;
    for (y = y0; y <= y1; y++) {
      var i = cellIndex(xo, y);
      if (i >= 0 && freeFor(mat[i])) open++;
    }
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

  function lowest(b) {
    var low = -Infinity;
    for (var k = 0; k < b.cells.length; k++) {
      var y = yOf(b.cells[k]);
      if (y > low) low = y;
    }
    return low;
  }

  function stepBodies() {
    var list = [];
    for (var k = 0; k < awake.length; k++) {
      var a = bodies.get(awake[k]);
      if (a && a.awake && a.cells.length) {
        a.low = lowest(a);
        list.push(a);
      }
    }
    awake = [];
    list.sort(function (p, q) { return q.low - p.low; });
    for (k = 0; k < list.length; k++) {
      var b = list[k];
      if (!bodies.has(b.id) || !b.awake || !b.cells.length) continue;
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
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, k, i, x, y;
    for (k = 0; k < cells.length; k++) {
      x = xOf(cells[k]);
      y = yOf(cells[k]);
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
      x = xOf(i);
      y = yOf(i);
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
        mark(i);
        continue;
      }
      (groups[bi] || (groups[bi] = [])).push(i);
    }
    for (var key in groups) {
      var part = groups[key];
      newBody(m, part, true);
      for (k = 0; k < part.length; k++) mark(part[k]);
    }
  }

  var settleCost = new Int32Array(0), settleQueue = new Int32Array(0), settleIdx = new Int32Array(0);
  var MAX_REACH = Math.max.apply(null, REACH);

  function reachIn(x0, y0, x1, y1) {
    var best = 0;
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var i = cellIndex(x, y);
        if (i < 0) { x |= 31; continue; }
        if (REACH[mat[i]] > best && cohesive(i)) {
          best = REACH[mat[i]];
          if (best === MAX_REACH) return best;
        }
      }
    }
    return best;
  }

  /* Settles the ground around a change. Sideways the box goes past the
     longest overhang the ground in it can carry, so no overhang is held
     by the box edge; up and down the pad is enough, as a ceiling hangs
     from the ground above it. */
  function settleAround(x0, y0, x1, y1, extra) {
    var pad = SETTLE_PAD + (extra || 0);
    ensureBox(x0 - pad, y0 - pad, x1 + pad, y1 + pad);
    var padX = Math.max(pad, reachIn(x0 - pad, y0 - pad, x1 + pad, y1 + pad) + 8);
    settle(x0 - padX, y0 - pad, x1 + padX, y1 + pad);
  }

  /* Cohesive ground in the box: a 0-1 search from what holds it up.
     Going up a column is free and going sideways or hanging below costs a
     cell. A cell whose cost passes its material's reach lets go. Ground
     the box edge cuts through counts as held. */
  function settle(x0, y0, x1, y1) {
    if (bounds) {
      x0 = Math.max(bounds.x0, x0); y0 = Math.max(bounds.y0, y0);
      x1 = Math.min(bounds.x1 - 1, x1); y1 = Math.min(bounds.y1 - 1, y1);
    }
    if (x1 < x0 || y1 < y0) return;
    ensureBox(x0, y0, x1, y1);
    var rw = x1 - x0 + 1, rh = y1 - y0 + 1, n = rw * rh;
    var cap4 = n * 4 + 8;
    if (settleCost.length < n) { settleCost = new Int32Array(n); settleIdx = new Int32Array(n); }
    if (settleQueue.length < cap4) settleQueue = new Int32Array(cap4);
    var cost = settleCost, dq = settleQueue, idx = settleIdx;
    var x, y, i, r = 0;
    for (y = y0; y <= y1; y++) {
      for (x = x0; x <= x1; x++) idx[r++] = cellIndex(x, y);
    }
    cost.fill(0x3fffffff, 0, n);
    var head = 0, tail = 0, lx, ly;
    for (r = 0; r < n; r++) {
      i = idx[r];
      if (i < 0 || !cohesive(i)) continue;
      ly = (r / rw) | 0;
      lx = r - ly * rw;
      var held = lx === 0 || lx === rw - 1 || ly === 0 || ly === rh - 1;
      if (!held) {
        var b = south(i);
        held = b < 0 || (mat[b] !== AIR && !isFluid(mat[b]) && !cohesive(b));
      }
      if (held) {
        cost[r] = 0;
        dq[tail] = r;
        tail = (tail + 1) % cap4;
      }
    }
    while (head !== tail) {
      r = dq[head];
      head = (head + 1) % cap4;
      var c = cost[r];
      ly = (r / rw) | 0;
      lx = r - ly * rw;
      var m = mat[idx[r]];
      for (var e = 0; e < 4; e++) {
        var q;
        if (e === 0) { if (ly === 0) continue; q = r - rw; }
        else if (e === 1) { if (lx === 0) continue; q = r - 1; }
        else if (e === 2) { if (lx === rw - 1) continue; q = r + 1; }
        else { if (ly === rh - 1) continue; q = r + rw; }
        var j = idx[q];
        if (j < 0 || !cohesive(j)) continue;
        var nc = e === 0 ? (mat[j] !== m ? 0 : c) : c + 1;
        if (nc >= cost[q]) continue;
        cost[q] = nc;
        if (e === 0) {
          head = (head - 1 + cap4) % cap4;
          dq[head] = q;
        } else {
          dq[tail] = q;
          tail = (tail + 1) % cap4;
        }
      }
    }
    var loose = { 2: [], 3: [], 5: [] };
    for (r = 0; r < n; r++) {
      i = idx[r];
      if (i < 0 || !cohesive(i)) continue;
      if (cost[r] > REACH[mat[i]]) loose[mat[i]].push(i);
    }
    for (var k = 0; k < loose[TOPSOIL].length; k++) {
      i = loose[TOPSOIL][k];
      flag[i] |= LOOSE;
      mark(i);
    }
    fragment(loose[CLAY], CLAY, 6, 0.15);
    fragment(loose[STONE], STONE, 15, 0.2);
  }

  function pocketAt(wx, wy) {
    for (var p = 0; p < buried.length; p++) {
      var b = buried[p];
      if (wx >= b.x0 && wx < b.x1 && wy >= b.y0 && wy < b.y1) return b;
    }
    return null;
  }

  function skyAt(x, y) {
    return !!world.sky && !outside(x, y) && world.sky(x, y);
  }

  /* Searches the open cells connected to the box x0..x1, y0..y1 for air
     that is sky or in an open pocket, climbing first. Closed pockets passed
     on a way that gets there are opened. */
  function search(x0, y0, x1, y1) {
    if (++seenMark === 65536) { seen.fill(0); seenMark = 1; }
    var top = 0, x, y, i, j, d, found = false, passed = [];
    function push(c) {
      seen[c] = seenMark;
      if (top === reachStack.length) reachStack = more(reachStack, Int32Array, top * 2);
      reachStack[top++] = c;
    }
    /* Air at (px, py) is open when it is sky or in an open pocket. */
    function open(px, py) {
      if (skyAt(px, py)) return true;
      var p = pocketAt(px, py);
      if (p && !p.open && passed.indexOf(p) < 0) passed.push(p);
      return !!p && p.open;
    }
    for (y = y0; y <= y1; y++) {
      for (x = x0; x <= x1; x++) {
        i = cellIndex(x, y, true);
        if (i >= 0 && seen[i] !== seenMark && freeFor(mat[i])) push(i);
      }
    }
    search: while (top > 0) {
      i = reachStack[--top];
      x = xOf(i);
      y = yOf(i);
      if (mat[i] === AIR && open(x, y)) { found = true; break; }
      for (var k = 0; k < 4; k++) {
        d = k === 0 ? 3 : k === 1 ? 1 : k === 2 ? 0 : 2;
        j = toward(i, d);
        if (j >= 0) {
          if (seen[j] !== seenMark && freeFor(mat[j])) push(j);
          continue;
        }
        var nx = x + DX[d], ny = y + DY[d];
        if (outside(nx, ny)) continue;
        world.cell(nx, ny, gen);
        if (gen.mat === AIR && open(nx, ny)) { found = true; break search; }
      }
    }
    if (found) for (var p = 0; p < passed.length; p++) passed[p].open = true;
    return found;
  }

  /* A dig that broke into a closed pocket opens it if the way is free. */
  function openPockets(f) {
    for (var p = 0; p < buried.length; p++) {
      var b = buried[p];
      if (b.open) continue;
      var x0 = Math.max(f.x0 - 1, b.x0), y0 = Math.max(f.y0 - 1, b.y0);
      var x1 = Math.min(f.x1 + 1, b.x1 - 1), y1 = Math.min(f.y1 + 1, b.y1 - 1);
      if (x1 >= x0 && y1 >= y0 && search(x0, y0, x1, y1)) b.open = true;
    }
  }

  /* A tool `tw` cells wide and `th` tall (square when th is left out),
     centred on world cell (cx, cy). */
  function footprint(cx, cy, tw, th) {
    tw = Math.max(1, Math.round(tw));
    th = Math.max(1, Math.round(th || tw));
    var x0 = Math.round(cx - tw / 2), y0 = Math.round(cy - th / 2);
    return { x0: x0, y0: y0, x1: x0 + tw - 1, y1: y0 + th - 1 };
  }

  function canReach(f) {
    return search(f.x0 - 1, f.y0 - 1, f.x1 + 1, f.y1 + 1);
  }

  function take(i) {
    taken[mat[i]]++;
    mat[i] = AIR;
    flag[i] = 0;
    dmg[i] = 0;
    body[i] = 0;
    vacated(i);
  }

  /* Crack lines through hurt ground, `lines` of them `len` cells long,
     from random points in box f or, with `from`, out from that point.
     They run up to `pad` cells past the box. */
  function crack(f, lines, len, from, pad) {
    var tw = f.x1 - f.x0 + 1, th = f.y1 - f.y0 + 1;
    pad = pad || 0;
    for (var l = 0; l < lines; l++) {
      var x = from ? from.x : f.x0 + Math.random() * tw, y = from ? from.y : f.y0 + Math.random() * th;
      var a = Math.random() * Math.PI * 2;
      for (var s = 0; s < len; s++) {
        a += (Math.random() - 0.5) * 0.9;
        x += Math.cos(a);
        y += Math.sin(a);
        var ix = Math.floor(x), iy = Math.floor(y);
        if (ix < f.x0 - pad || ix > f.x1 + pad || iy < f.y0 - pad || iy > f.y1 + pad) break;
        var i = cellIndex(ix, iy);
        if (i < 0) break;
        if (cohesive(i) && dmg[i] > 0) {
          flag[i] |= CRACK;
          mark(i);
        }
      }
    }
  }

  /* How each tool works the ground.
     power   hits it deals a cell per use; Infinity takes anything at once
     soft    works only loose ground, topsoil and fluids
     rim     how much the ground around a cut crumbles
     cracks  ground it hurt but did not take cracks
     chips   stone it takes breaks into pieces instead of going
     lift    a clump no bigger than the footprint and mostly under it goes
             whole; otherwise a hard tool cuts clumps at its edge and a
             soft one only stirs them
     round   works the ellipse inside the footprint
     blast   shatters the ground in place instead of taking it, out to
             this share of the footprint beyond its edge */
  var TOOLS = {
    pickaxe: { power: 1, rim: 1, cracks: true, chips: true, lift: true },
    shovel: { power: 1, soft: true, rim: 0.4, lift: true },
    cutter: { power: 3 },
    drill: { power: 3, round: true },
    explosive: { blast: 0.6, round: true },
    destroy: { power: Infinity }
  };

  function toolOf(tool) {
    if (tool === true) return TOOLS.destroy;
    if (typeof tool === "string") return TOOLS[tool] || TOOLS.pickaxe;
    return tool || TOOLS.pickaxe;
  }

  function shapeOf(f, round) {
    var mx = (f.x0 + f.x1 + 1) / 2, my = (f.y0 + f.y1 + 1) / 2;
    var rx = (f.x1 - f.x0 + 1) / 2, ry = (f.y1 - f.y0 + 1) / 2;
    return {
      mx: mx, my: my, rx: rx, ry: ry,
      /* Distance from the middle with the footprint's edge at 1. */
      d: function (x, y) {
        var dx = (x + 0.5 - mx) / rx, dy = (y + 0.5 - my) / ry;
        return round ? Math.sqrt(dx * dx + dy * dy) : Math.max(Math.abs(dx), Math.abs(dy));
      }
    };
  }

  /* Chance that cohesive ground beside a cut crumbles loose, by material. */
  var RIM = [0, 0, 0.45, 0.12, 0, 0.1, 0, 0];

  function crumble(cells, share) {
    for (var k = 0; k < cells.length; k++) {
      for (var d = 0; d < 4; d++) {
        var j = toward(cells[k], d);
        if (j < 0 || !cohesive(j) || Math.random() >= RIM[mat[j]] * share) continue;
        flag[j] |= LOOSE;
        mark(j);
      }
    }
  }

  /* A swung tool also hurts the ground just past its footprint, less the
     further out, so cracks can run into the wall it leaves. */
  var BRUISE = 3;

  function bruise(x0, y0, x1, y1) {
    for (var y = y0 - BRUISE; y <= y1 + BRUISE; y++) {
      var edgeRow = y < y0 || y > y1;
      for (var x = x0 - BRUISE; x <= x1 + BRUISE; x++) {
        if (!edgeRow && x === x0) x = x1 + 1;
        var out = Math.max(x0 - x, x - x1, y0 - y, y - y1);
        var i = cellIndex(x, y);
        if (i >= 0 && cohesive(i) && Math.random() < 0.6 / out) dmg[i] = Math.min(255, dmg[i] + 1);
      }
    }
  }

  /* One use of the tool (see footprint and TOOLS). */
  function dig(cx, cy, tw, th, tool) {
    var t = toolOf(tool);
    var f = footprint(cx, cy, tw, th);
    var size = Math.min(f.x1 - f.x0, f.y1 - f.y0) + 1;
    if (!canReach(f)) return { ok: false };
    if (t.blast) {
      blast(f, t);
      openPockets(f);
      return { ok: true };
    }
    ensureBox(f.x0 - BRUISE - 1, f.y0 - BRUISE - 1, f.x1 + BRUISE + 1, f.y1 + BRUISE + 1);
    var shape = shapeOf(f, t.round);
    var touched = {}, cut = [], broken = [], hurt = false, x, y, i, m;
    for (y = f.y0; y <= f.y1; y++) {
      for (x = f.x0; x <= f.x1; x++) {
        if (t.round && shape.d(x, y) > 1) continue;
        i = cellIndex(x, y);
        if (i < 0) continue;
        m = mat[i];
        if (m === AIR || (flag[i] & FIXED)) continue;
        if (body[i]) { touched[body[i]] = (touched[body[i]] || 0) + 1; continue; }
        if (isFluid(m) || (flag[i] & LOOSE)) { take(i); continue; }
        if (t.soft && m !== TOPSOIL) continue;
        dmg[i] = Math.min(255, dmg[i] + t.power);
        mark(i);
        if (dmg[i] >= HITS[m]) {
          if (m === STONE && t.chips) broken.push(i);
          else cut.push(i);
        } else hurt = true;
      }
    }
    var area = (f.x1 - f.x0 + 1) * (f.y1 - f.y0 + 1);
    for (var key in touched) {
      var b = bodies.get(Number(key));
      if (!b) continue;
      var inside = touched[key];
      if (t.lift && b.cells.length <= area) {
        if (inside * 2 >= b.cells.length) {
          for (var k = 0; k < b.cells.length; k++) take(b.cells[k]);
          bodies.delete(b.id);
        } else wakeBody(b.id);
      } else if (t.soft) wakeBody(b.id);
      else {
        var keep = [];
        for (k = 0; k < b.cells.length; k++) {
          i = b.cells[k];
          x = xOf(i);
          y = yOf(i);
          if (x >= f.x0 && x <= f.x1 && y >= f.y0 && y <= f.y1 && (!t.round || shape.d(x, y) <= 1)) take(i);
          else keep.push(i);
        }
        if (!keep.length) { bodies.delete(b.id); continue; }
        b.cells = keep;
        wakeBody(b.id);
      }
    }
    for (k = 0; k < cut.length; k++) take(cut[k]);
    if (broken.length) fragment(broken, STONE, Math.max(3, Math.round(size / 3)), 0.35);
    if (t.rim) crumble(cut.concat(broken), t.rim);
    if (t.cracks) {
      bruise(f.x0, f.y0, f.x1, f.y1);
      if (hurt || broken.length) crack(f, 2 + (Math.random() * 2 | 0), Math.max(2, size * 0.7), null, BRUISE);
    }
    settleAround(f.x0, f.y0, f.x1, f.y1);
    markRect(f.x0 - 2, f.y0 - 2, f.x1 + 2, f.y1 + 2);
    openPockets(f);
    return { ok: true };
  }

  /* A charge: the ground under the footprint shatters into rubble where
     it is, and beyond its edge the ground breaks less the further out it
     is. Nothing is taken; the rubble falls where it has room. */
  function blast(f, t) {
    var s = shapeOf(f, true), k = 1 + t.blast;
    var bx0 = Math.floor(s.mx - s.rx * k), by0 = Math.floor(s.my - s.ry * k);
    var bx1 = Math.ceil(s.mx + s.rx * k), by1 = Math.ceil(s.my + s.ry * k);
    ensureBox(bx0 - 1, by0 - 1, bx1 + 1, by1 + 1);
    var rubble = [], x, y, i;
    rubble[CLAY] = [];
    rubble[STONE] = [];
    for (y = by0; y <= by1; y++) {
      for (x = bx0; x <= bx1; x++) {
        var d = s.d(x, y);
        if (d > k) continue;
        i = cellIndex(x, y);
        if (i < 0) continue;
        if (body[i]) { wakeBody(body[i]); continue; }
        if (!cohesive(i)) continue;
        var near = d <= 1 ? 1 : (k - d) / (k - 1);
        if (d <= 1 || Math.random() < near * near * 0.6) {
          if (mat[i] === TOPSOIL) flag[i] |= LOOSE;
          else rubble[mat[i]].push(i);
        } else if (Math.random() < near) dmg[i] = Math.min(255, dmg[i] + 1 + ((near * 3) | 0));
        else continue;
        mark(i);
      }
    }
    fragment(rubble[CLAY], CLAY, 4, 0.4);
    fragment(rubble[STONE], STONE, 5, 0.4);
    crack({ x0: bx0, y0: by0, x1: bx1, y1: by1 }, 6 + (Math.random() * 4 | 0), Math.max(s.rx, s.ry) * k, { x: s.mx, y: s.my });
    settleAround(f.x0, f.y0, f.x1, f.y1, Math.ceil(Math.max(s.rx, s.ry) * t.blast));
    markRect(bx0 - 2, by0 - 2, bx1 + 2, by1 + 2);
  }

  function step() {
    ticks++;
    stepBodies();
    stepCells();
    stepCells();
    if (collapse && ticks % 12 === 0) {
      var c = collapse;
      collapse = null;
      settleAround(c.x0, c.y0, c.x1, c.y1);
    }
    if (ticks % 240 === 0 && live > MAX_CHUNKS) trim();
  }

  function addBodyCells(s) {
    var g = s << 10;
    for (var k = 0; k < CB; k++) {
      var id = body[g + k];
      if (!id) continue;
      var b = bodies.get(id);
      if (!b) {
        b = { id: id, mat: mat[g + k], cells: [], awake: false, vy: 0, carry: 0, flat: 0 };
        bodies.set(id, b);
      }
      b.cells.push(g + k);
    }
  }

  /* Keeps chunks cx0..cx1, cy0..cy1 (a painter's window) from being dropped. */
  function pin(cx0, cy0, cx1, cy1) {
    pinned = { cx0: cx0, cy0: cy0, cx1: cx1, cy1: cy1 };
  }

  function busy(s) {
    return edited[s] || active[s] || next[s];
  }

  /* Drops chunks nothing changed, nobody looks at and nothing next to
     them changed. */
  function trim() {
    var drop = [];
    slots.forEach(function (s) {
      if (busy(s)) return;
      var cx = chunkX[s], cy = chunkY[s];
      if (pinned && cx >= pinned.cx0 && cx <= pinned.cx1 && cy >= pinned.cy0 && cy <= pinned.cy1) return;
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          var n = slotAt(cx + dx, cy + dy);
          if (n >= 0 && busy(n)) return;
        }
      }
      drop.push(s);
    });
    for (var k = 0; k < drop.length; k++) evict(drop[k]);
  }

  function evict(s) {
    var g = s << 10, ids = new Set(), k;
    for (k = 0; k < CB; k++) if (body[g + k]) ids.add(body[g + k]);
    ids.forEach(function (id) {
      var b = bodies.get(id);
      if (!b) return;
      b.cells = b.cells.filter(function (c) { return c >> 10 !== s; });
      if (!b.cells.length) bodies.delete(id);
    });
    var cx = chunkX[s], cy = chunkY[s];
    for (var d = 0; d < 4; d++) {
      var n = nb[s * 4 + d];
      if (n >= 0) nb[n * 4 + OPP[d]] = -1;
      nb[s * 4 + d] = -1;
    }
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        var m = slotAt(cx + dx, cy + dy);
        if (m >= 0) halo[m] = 0;
      }
    }
    slots.delete(chunkKey(cx, cy));
    cacheKey = NaN;
    isLive[s] = 0;
    dirty[s] = 0;
    live--;
    freeSlots.push(s);
  }

  function build() {
    slots.clear();
    cacheKey = NaN;
    used = 0;
    live = 0;
    freeSlots = [];
    if (cap) {
      isLive.fill(0); edited.fill(0); dirty.fill(0); halo.fill(0);
      active.fill(0); next.fill(0); nb.fill(-1);
    }
    activeList = [];
    nextList = [];
    dirtyList = [];
    bodies.clear();
    nextId = 1;
    awake = [];
    calmed = 0;
    collapse = null;
    taken.fill(0);
    editedCount = 0;
    for (var p = 0; p < buried.length; p++) buried[p].open = false;
    for (var k = 0; k < resetHooks.length; k++) resetHooks[k]();
  }

  function stats() {
    var awakeCount = 0;
    for (var k = 0; k < awake.length; k++) if (bodies.has(awake[k])) awakeCount++;
    return {
      active: lastActive, chunks: live, edited: editedCount, awake: awakeCount, clumps: bodies.size,
      calmed: calmed, taken: taken.slice(), ticks: ticks
    };
  }

  /* The cell at world (x, y) and how many uses of `tool` it still takes. */
  function at(x, y, tool) {
    x = Math.floor(x); y = Math.floor(y);
    if (outside(x, y)) return null;
    var t = toolOf(tool);
    var i = cellIndex(x, y), m, f, bd, dm;
    if (i >= 0) { m = mat[i]; f = flag[i]; bd = body[i]; dm = dmg[i]; }
    else { world.cell(x, y, gen); m = gen.mat; f = gen.flag; bd = gen.clump; dm = 0; }
    var loose = !!(f & LOOSE) || bd !== 0 || isFluid(m);
    var tooHard = !loose && !!t.soft && m !== TOPSOIL && m !== AIR;
    return {
      mat: m,
      name: NAMES[m] + (f & WET ? " (wet)" : ""),
      loose: loose,
      tooHard: tooHard,
      hitsLeft: m === AIR || tooHard ? 0 : loose || t.blast ? 1 : Math.max(1, Math.ceil((HITS[m] - dm) / t.power))
    };
  }

  grow();

  return {
    AIR: AIR, SAND: SAND, TOPSOIL: TOPSOIL, CLAY: CLAY, GRAVEL: GRAVEL, STONE: STONE, WATER: WATER, OIL: OIL,
    LOOSE: LOOSE, WET: WET, CRACK: CRACK, FIXED: FIXED,
    NAMES: NAMES, HITS: HITS, CS: CS,
    TOOLS: TOOLS, TOOL_NAMES: Object.keys(TOOLS),
    world: world,
    pockets: buried,
    /* Cell arrays by slot (see cellIndex); they are replaced as they grow. */
    get mat() { return mat; },
    get flag() { return flag; },
    get body() { return body; },
    get shade() { return shade; },
    get dmg() { return dmg; },
    get base() { return base; },
    slotAt: slotAt,
    ensure: ensure,
    /* Index of world cell (x, y) in the cell arrays, or -1 when its chunk
       is not made. */
    index: function (x, y) { return cellIndex(Math.floor(x), Math.floor(y)); },
    chunkOf: function (s) { return { cx: chunkX[s], cy: chunkY[s] }; },
    isLive: function (s) { return isLive[s] === 1; },
    isEdited: function (s) { return edited[s] === 1; },
    /* Slots changed since the last call. */
    takeDirty: function () {
      var list = dirtyList;
      dirtyList = [];
      for (var k = 0; k < list.length; k++) dirty[list[k]] = 0;
      return list;
    },
    /* Chunks scanned in the last substep, as [cx, cy]. */
    awakeChunks: function () {
      return activeList.map(function (s) { return [chunkX[s], chunkY[s]]; });
    },
    pin: pin,
    onReset: function (fn) { resetHooks.push(fn); },
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
