// Cell grid, materials, digging rules, conservation, water, and heat.
// Mass (every excavated material cell) is never deleted: it lives in the
// grid, a carried stack, the cart, the tool slot, or an abstract package.
//
// Slice volume assumes a 1 m thickness, so one 1 cm cell is 0.1 L.
// The heat gradient is exaggerated on purpose: a garden-deep hole has to
// be able to show a slowdown. Real crust is nearer 25°C per kilometre.

var MAT = {
  AIR: 0,
  SAND: 1,
  SOIL: 2,
  SOFT: 3,
  HARD: 4,
  ORE: 5,
  FOSSIL: 6,
  INGOT: 7,
  SLAG: 8,
  WATER: 9,
  SEAL: 10,
  GRASS: 11,
  PUMP: 12,
  COOLER: 13,
  BENCH: 14,
  STATION: 15,
  BELT: 16,
  PROP: 17,
};

var MAT_COUNT = 18;
var MASS_MAX = MAT.GRASS;

var MAT_NAME = [
  "air", "sand", "soil", "soft", "hard", "ore", "fossil", "ingot",
  "slag", "water", "seal", "grass", "pump", "cooler", "bench", "station",
  "belt", "prop",
];

// Placeholder colours only. RGB triplets, indexed by MAT.
var MAT_RGB = [
  [0, 0, 0],
  [230, 196, 106],
  [112, 78, 48],
  [142, 146, 136],
  [86, 90, 98],
  [196, 107, 58],
  [224, 216, 186],
  [198, 202, 210],
  [96, 82, 74],
  [52, 122, 198],
  [70, 122, 74],
  [86, 138, 54],
  [36, 112, 108],
  [120, 198, 210],
  [156, 104, 58],
  [116, 70, 40],
  [64, 68, 78],
  [92, 96, 100],
];

var SKY_RGB = [186, 214, 232];
var UNDER_RGB = [32, 34, 40];

var BALANCE = {
  widthCm: 960,
  heightCm: 480,
  surfaceCm: 96,
  sandboxX: 300,
  sandboxW: 140,
  pitCm: 22,
  sandCm: 28,
  soilCm: 96,
  chamberGapCm: 6,
  chamberW: 64,
  chamberH: 40,
  chamberTopCm: 64,
  secondX: 700,
  secondW: 80,
  handCap: 8,
  bucketCap: 32,
  cartCap: 120,
  pocketCap: 3,
  sledCap: 48,
  sledW: 14,
  sledH: 8,
  sledCm: 56,
  walkCm: 80,
  bucketWalkCm: 48,
  gravity: 2200,
  jumpSpeed: 520,
  stepCm: 12,
  playerW: 10,
  playerH: 18,
  cartW: 22,
  cartH: 12,
  drillMul: 0.35,
  heatOnC: 30,
  heatPer: 22,
  surfaceC: 18,
  coolerDrop: 40,
  coolerRadiusCm: 80,
  windowCm: 80,
  beltPerSec: 10,
  pumpPerSec: 12,
  fallPerSec: 14,
  waterSlow: 0.18,
  waterFast: 0.05,
  sliceCm: 100,
  earthCm: 6371 * 1000 * 100,
  dig: {
    1: 0.08,
    2: 0.22,
    3: 0.55,
    4: 1.3,
    5: 0.9,
    6: 0.45,
    7: 0.16,
    8: 0.16,
    10: 0.3,
    11: 0.18,
  },
};

function isMass(m) {
  return m >= MAT.SAND && m <= MASS_MAX;
}

function isSolid(m) {
  return m !== MAT.AIR && m !== MAT.WATER;
}

function isDiggableMass(m) {
  return isMass(m) && m !== MAT.WATER;
}

function isMachine(m) {
  return m === MAT.PUMP || m === MAT.COOLER || m === MAT.BELT;
}

function invCount(inv) {
  let n = 0;
  for (let i = 0; i < inv.length; i++) n += inv[i];
  return n;
}

function carryCap(sim) {
  return sim.haul === "bucket" ? BALANCE.bucketCap : BALANCE.handCap;
}

function totalMass(sim) {
  let n = 0;
  const g = sim.grid;
  for (let i = 0; i < g.length; i++) if (isMass(g[i])) n++;
  n += invCount(sim.player.inv);
  n += invCount(sim.player.toolInv);
  if (sim.player.pocket) n += invCount(sim.player.pocket);
  if (sim.cart) n += invCount(sim.cart.inv);
  if (sim.sled) n += invCount(sim.sled.inv);
  for (let i = 0; i < sim.packages.length; i++) n += sim.packages[i].count;
  return n;
}

function countCells(sim) {
  let solid = 0;
  let water = 0;
  const g = sim.grid;
  for (let i = 0; i < g.length; i++) {
    const m = g[i];
    if (m === MAT.WATER) water++;
    else if (m !== MAT.AIR) solid++;
  }
  return { solid, water, grid: g.length };
}

function emptyInv() {
  return new Uint16Array(MAT_COUNT);
}

function idx(sim, x, y) {
  return y * sim.w + x;
}

function inBounds(sim, x, y) {
  return x >= 0 && y >= 0 && x < sim.w && y < sim.h;
}

function getCell(sim, x, y) {
  if (!inBounds(sim, x, y)) return MAT.AIR;
  return sim.grid[idx(sim, x, y)];
}

function setCell(sim, x, y, mat, loose) {
  if (!inBounds(sim, x, y)) return;
  const i = idx(sim, x, y);
  const prev = sim.grid[i];
  sim.grid[i] = mat;
  sim.loose[i] = loose ? 1 : 0;
  if (prev === MAT.BELT || prev === MAT.PUMP || prev === MAT.COOLER) {
    unregisterMachine(sim, x, y);
  }
  if (mat === MAT.BELT || mat === MAT.PUMP || mat === MAT.COOLER) {
    registerMachine(sim, x, y, mat);
  }
}

function unregisterMachine(sim, x, y) {
  sim.machines = sim.machines.filter((m) => m.x !== x || m.y !== y);
}

function registerMachine(sim, x, y, mat) {
  if (sim.machines.some((m) => m.x === x && m.y === y)) return;
  let dir = 0;
  if (mat === MAT.BELT) dir = sim.beltDir[idx(sim, x, y)] || 0;
  sim.machines.push({ x, y, mat, dir });
}

function blockedBox(sim, x, y, w, h) {
  if (x < 0 || y < 0 || x + w > sim.w || y + h > sim.h) return true;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.floor(x + w - 1e-4);
  const y1 = Math.floor(y + h - 1e-4);
  for (let cy = y0; cy <= y1; cy++) {
    const row = cy * sim.w;
    for (let cx = x0; cx <= x1; cx++) {
      if (isSolid(sim.grid[row + cx])) return true;
    }
  }
  return false;
}

function canDigAt(sim, x, y) {
  if (!inBounds(sim, x, y)) return false;
  const m = sim.grid[idx(sim, x, y)];
  if (!isDiggableMass(m)) return false;
  if (sim.open) return true;
  if (y < sim.surfaceCell) return false;
  if (x >= sim.shaft0 && x < sim.shaft1) return true;
  if (x >= sim.shaft1 && x < sim.chamberRight + sim.chamberExtra) {
    const digBot = sim.chamberBot + Math.max(6, sim.chamberExtra);
    const digTop = sim.chamberTop - sim.chamberExtra;
    if (y >= digTop && y < digBot) return true;
  }
  if (sim.shafts >= 2 && x >= sim.shaft2a && x < sim.shaft2b) return true;
  return false;
}

function temperatureC(sim, x, y) {
  if (sim.heatMode === "off") return BALANCE.surfaceC;
  const depthM = Math.max(0, (y - sim.surfaceCell) * sim.cellCm) / 100;
  let t = BALANCE.surfaceC + depthM * sim.gradient;
  const rad = BALANCE.coolerRadiusCm;
  for (let i = 0; i < sim.machines.length; i++) {
    const m = sim.machines[i];
    if (m.mat !== MAT.COOLER) continue;
    const dx = (m.x - x) * sim.cellCm;
    const dy = (m.y - y) * sim.cellCm;
    const d = Math.hypot(dx, dy);
    if (d < rad) t -= BALANCE.coolerDrop * (1 - d / rad);
  }
  return t;
}

// Tool and heat only. Time scale is applied by the caller via dt.
function digTimeMul(sim, x, y) {
  let mul = 1;
  if (sim.player.tool === "drill") mul *= BALANCE.drillMul;
  if (sim.heatMode === "slow") {
    const t = temperatureC(sim, x, y);
    if (t > BALANCE.heatOnC) mul *= 1 + (t - BALANCE.heatOnC) / BALANCE.heatPer;
  }
  return mul;
}

function digSeconds(sim, x, y) {
  const m = getCell(sim, x, y);
  const base = BALANCE.dig[m] ?? 0.4;
  return base * digTimeMul(sim, x, y);
}

function cellOf(sim, cm) {
  return Math.floor(cm / sim.cellCm);
}

function fillCells(sim, x0, y0, x1, y1, mat, loose) {
  const xa = Math.max(0, x0);
  const ya = Math.max(0, y0);
  const xb = Math.min(sim.w, x1);
  const yb = Math.min(sim.h, y1);
  for (let y = ya; y < yb; y++) {
    const row = y * sim.w;
    for (let x = xa; x < xb; x++) {
      sim.grid[row + x] = mat;
      sim.loose[row + x] = loose ? 1 : 0;
    }
  }
}

function replaceRect(sim, x0, y0, x1, y1, mat, loose) {
  fillCells(sim, x0, y0, x1, y1, mat, loose);
}

// Place up to n loose cells, stacking on the first solid, spreading sideways.
// Returns how many were placed. Does not take them from anywhere.
function spillCells(sim, mat, n, x, y, limits) {
  if (n <= 0 || !isMass(mat)) return 0;
  const minX = limits && limits.minX != null ? limits.minX : 1;
  const maxX = limits && limits.maxX != null ? limits.maxX : sim.w - 2;
  let placed = 0;
  const maxR = Math.max(8, maxX - minX);
  for (let r = 0; r <= maxR && placed < n; r++) {
    const cols = r === 0 ? [x] : [x - r, x + r];
    for (let c = 0; c < cols.length && placed < n; c++) {
      const cx = cols[c];
      if (cx < minX || cx > maxX) continue;
      let cy = Math.max(0, Math.min(sim.h - 1, y));
      let guard = 0;
      while (cy < sim.h - 1 && !isSolid(getCell(sim, cx, cy)) && guard < sim.h) {
        cy++;
        guard++;
      }
      if (!isSolid(getCell(sim, cx, cy))) continue;
      cy--;
      guard = 0;
      while (cy >= 0 && placed < n && guard < sim.h) {
        if (getCell(sim, cx, cy) === MAT.AIR && !overlapsPlayer(sim, cx, cy)) {
          setCell(sim, cx, cy, mat, 1);
          placed++;
          cy--;
        } else break;
        guard++;
      }
    }
  }
  return placed;
}

function overlapsPlayer(sim, x, y) {
  const p = sim.player;
  if (!p) return false;
  return x + 1 > p.x && x < p.x + p.w && y + 1 > p.y && y < p.y + p.h;
}

function writeRaw(sim, x, y, mat, loose) {
  const i = idx(sim, x, y);
  sim.grid[i] = mat;
  sim.loose[i] = loose ? 1 : 0;
}

function become(sim, x0, y0, x1, y1, mat, loose) {
  const xa = Math.max(0, x0);
  const ya = Math.max(0, y0);
  const xb = Math.min(sim.w, x1);
  const yb = Math.min(sim.h, y1);
  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) {
      if (!isMass(getCell(sim, x, y))) continue;
      writeRaw(sim, x, y, mat, loose);
    }
  }
}

function paintIntoAir(sim, x0, y0, x1, y1, mat) {
  const xa = Math.max(0, x0);
  const ya = Math.max(0, y0);
  const xb = Math.min(sim.w, x1);
  const yb = Math.min(sim.h, y1);
  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) {
      if (getCell(sim, x, y) === MAT.AIR) writeRaw(sim, x, y, mat, 0);
    }
  }
}

function paintMachine(sim) {
  const s = sim.surfaceCell;
  const x = cellOf(sim, 820);
  const c = (cm) => cellOf(sim, cm);
  // Cab, arm, and tracks sit in the sky. They never replace ground mass.
  paintIntoAir(sim, x, s - c(28), x + c(36), s - c(10), MAT.PROP);
  paintIntoAir(sim, x - c(30), s - c(20), x + c(4), s - c(14), MAT.PROP);
  paintIntoAir(sim, x - c(4), s - c(8), x + c(44), s - 1, MAT.PROP);
}

function paintBelts(sim) {
  const depth = Math.max(2, cellOf(sim, 8));
  const y = sim.surfaceCell + depth - 1;
  const x0 = cellOf(sim, 36);
  const x1 = cellOf(sim, 210);
  fillCells(sim, x0, sim.surfaceCell, x1 + 1, y + 1, MAT.AIR, 0);
  for (let x = x0; x <= x1; x++) {
    if (getCell(sim, x, y) !== MAT.AIR) continue;
    sim.beltDir[idx(sim, x, y)] = 0;
    setCell(sim, x, y, MAT.BELT, 0);
  }
  // A few loose sand cells ride the belt. Taken from the sandbox bed.
  let moved = 0;
  const sandTop = sim.surfaceCell + Math.max(1, cellOf(sim, BALANCE.pitCm));
  for (let x = sim.shaft0; x < sim.shaft1 && moved < 14; x++) {
    if (getCell(sim, x, sandTop) !== MAT.SAND) continue;
    const destX = x0 + 2 + moved;
    const destY = y - 1;
    if (!inBounds(sim, destX, destY) || getCell(sim, destX, destY) !== MAT.AIR) break;
    writeRaw(sim, x, sandTop, MAT.AIR, 0);
    writeRaw(sim, destX, destY, MAT.SAND, 1);
    moved++;
  }
}

function buildGarden(sim, o) {
  const surf = cellOf(sim, BALANCE.surfaceCm);
  sim.surfaceCell = surf;
  sim.shaft0 = cellOf(sim, BALANCE.sandboxX);
  sim.shaft1 = cellOf(sim, BALANCE.sandboxX + BALANCE.sandboxW);
  sim.heapCell = Math.max(2, sim.shaft0 - 36);
  sim.chamberTop = surf + cellOf(sim, BALANCE.chamberTopCm);
  sim.chamberBot = sim.chamberTop + cellOf(sim, BALANCE.chamberH);
  sim.chamberRight = sim.shaft1 + cellOf(sim, BALANCE.chamberGapCm + BALANCE.chamberW);
  sim.packMin = surf + cellOf(sim, BALANCE.pitCm + BALANCE.sandCm);
  sim.shaft2a = cellOf(sim, BALANCE.secondX);
  sim.shaft2b = cellOf(sim, BALANCE.secondX + BALANCE.secondW);
  sim.chamberExtra = o.chamber === "limited" ? 0 : cellOf(sim, 80);

  fillCells(sim, 0, 0, sim.w, sim.h, MAT.AIR, 0);
  fillCells(sim, 0, surf, sim.w, sim.h, MAT.SOIL, 0);
  const softY = surf + cellOf(sim, BALANCE.soilCm);
  fillCells(sim, 0, softY, sim.w, sim.h, MAT.SOFT, 0);
  const hardY = surf + cellOf(sim, 210);
  fillCells(sim, 0, hardY, sim.w, hardY + cellOf(sim, 24), MAT.HARD, 0);
  fillCells(sim, 0, surf, sim.w, surf + Math.max(1, cellOf(sim, 5)), MAT.GRASS, 0);

  // Sandbox: empty lip, then a loose sand bed sitting on soil.
  const pit = Math.max(2, cellOf(sim, BALANCE.pitCm));
  const sandD = Math.max(6, cellOf(sim, BALANCE.sandCm));
  fillCells(sim, sim.shaft0, surf, sim.shaft1, surf + pit, MAT.AIR, 0);
  become(sim, sim.shaft0, surf + pit, sim.shaft1, surf + pit + sandD, MAT.SAND, 1);

  // Second sand patch, flush with the lawn. Digging it opens shaft two.
  const sand2 = Math.max(4, cellOf(sim, 22));
  become(sim, sim.shaft2a, surf, sim.shaft2b, surf + sand2, MAT.SAND, 1);

  // One fossil, anchored in the soil just under the sand bed.
  const fx = sim.shaft0 + cellOf(sim, 28);
  const fy = surf + pit + sandD + Math.max(2, cellOf(sim, 6));
  if (isMass(getCell(sim, fx, fy))) {
    writeRaw(sim, fx, fy, MAT.FOSSIL, 0);
    writeRaw(sim, fx + 1, fy, MAT.FOSSIL, 0);
    writeRaw(sim, fx + 2, fy, MAT.FOSSIL, 0);
    writeRaw(sim, fx + 1, fy + 1, MAT.FOSSIL, 0);
  }

  // Side chamber. Spoil from the cavity goes onto the berm.
  const gap = cellOf(sim, BALANCE.chamberGapCm);
  fillCells(sim, sim.shaft1 + gap, sim.chamberTop, sim.chamberRight, sim.chamberBot, MAT.AIR, 0);

  // Bench and station stand in the room. Ore replaces the floor directly
  // under them, so the count does not change and the recipe can see it.
  const bx = sim.shaft1 + gap + 8;
  for (let i = 0; i < 8; i++) {
    if (isMass(getCell(sim, bx + i, sim.chamberBot))) {
      writeRaw(sim, bx + i, sim.chamberBot, MAT.ORE, 0);
    }
    if (isMass(getCell(sim, bx + i, sim.chamberBot + 1))) {
      writeRaw(sim, bx + i, sim.chamberBot + 1, MAT.ORE, 0);
    }
  }
  writeRaw(sim, bx, sim.chamberBot - 1, MAT.BENCH, 0);
  writeRaw(sim, bx + 2, sim.chamberBot - 1, MAT.STATION, 0);
  writeRaw(sim, bx + 3, sim.chamberBot - 1, MAT.STATION, 0);
  writeRaw(sim, bx + 2, sim.chamberBot - 2, MAT.STATION, 0);
  writeRaw(sim, bx + 3, sim.chamberBot - 2, MAT.STATION, 0);

  // Lake to the right of a future shaft, with a thin rock wall.
  const mid = Math.floor((sim.shaft0 + sim.shaft1) / 2);
  const lakeX0 = mid + cellOf(sim, 14);
  const lakeX1 = lakeX0 + cellOf(sim, 70);
  const lakeY0 = surf + cellOf(sim, 150);
  const lakeY1 = lakeY0 + cellOf(sim, 28);
  fillCells(sim, lakeX0, lakeY0, lakeX1, lakeY1, MAT.WATER, 0);
  sim.lakeX0 = lakeX0;
  sim.lakeY0 = lakeY0;

  if (o.predig) {
    const half = Math.max(2, cellOf(sim, 6));
    const px0 = mid - half;
    const px1 = mid + half;
    const py1 = o.predigDeep ? surf + cellOf(sim, 146) : sim.chamberBot;
    fillCells(sim, px0, surf, px1, py1, MAT.AIR, 0);
    fillCells(
      sim,
      px1,
      sim.chamberTop + 2,
      sim.shaft1 + gap,
      sim.chamberBot - 2,
      MAT.AIR,
      0,
    );
    sim.predigX0 = px0;
    sim.predigX1 = px1;
  }

  if (o.belts) paintBelts(sim);
  paintMachine(sim);

  if (o.seedPackages) seedPackages(sim);
}

function seedPackages(sim) {
  // Lift loose sand out of the bed into counted lumps. The cells leave the
  // grid and the count stays on the package.
  let got = 0;
  const want = 24;
  const y = sim.surfaceCell + Math.max(2, cellOf(sim, BALANCE.pitCm));
  for (let x = sim.shaft0; x < sim.shaft1 && got < want; x++) {
    if (getCell(sim, x, y) !== MAT.SAND) continue;
    writeRaw(sim, x, y, MAT.AIR, 0);
    got++;
  }
  if (!got) return;
  const col = Math.floor(((sim.predigX0 || sim.shaft0) + (sim.predigX1 || sim.shaft1)) / 2);
  sim.packages.push({
    mat: MAT.SAND,
    count: got,
    x: col,
    y: sim.surfaceCell + cellOf(sim, 40),
  });
}

function buildTiny(sim) {
  sim.surfaceCell = 8;
  sim.shaft0 = 0;
  sim.shaft1 = sim.w;
  sim.heapCell = 2;
  sim.chamberTop = 14;
  sim.chamberBot = 20;
  sim.chamberRight = sim.w;
  sim.packMin = 12;
  sim.shaft2a = 30;
  sim.shaft2b = 36;
  sim.chamberExtra = 0;
  sim.open = true;
  fillCells(sim, 0, 0, sim.w, sim.h, MAT.AIR, 0);
  fillCells(sim, 0, 8, sim.w, sim.h, MAT.SOIL, 0);
  fillCells(sim, 0, 8, sim.w, 9, MAT.GRASS, 0);
  // Loose sand suspended over air, for the fall test: column x=4, soil at y=16.
  fillCells(sim, 4, 16, 5, sim.h, MAT.SOIL, 0);
  setCell(sim, 4, 10, MAT.SAND, 1);
  setCell(sim, 4, 11, MAT.SAND, 1);
  setCell(sim, 4, 12, MAT.AIR, 0);
  setCell(sim, 4, 13, MAT.AIR, 0);
  setCell(sim, 4, 14, MAT.AIR, 0);
  setCell(sim, 4, 15, MAT.AIR, 0);
  // Water perched on soil.
  setCell(sim, 8, 12, MAT.SOIL, 0);
  setCell(sim, 8, 11, MAT.WATER, 0);
  setCell(sim, 8, 10, MAT.WATER, 0);
  // A station with two ore cells beside it and air to stand in.
  for (let y = 14; y <= 18; y++) {
    for (let x = 14; x <= 20; x++) setCell(sim, x, y, MAT.AIR, 0);
  }
  setCell(sim, 16, 18, MAT.STATION, 0);
  setCell(sim, 17, 18, MAT.BENCH, 0);
  setCell(sim, 15, 18, MAT.ORE, 0);
  setCell(sim, 16, 17, MAT.ORE, 0);
  // Belt and a sand cell sitting on it.
  sim.beltDir[idx(sim, 22, 18)] = 0;
  setCell(sim, 22, 18, MAT.BELT, 0);
  sim.beltDir[idx(sim, 23, 18)] = 0;
  setCell(sim, 23, 18, MAT.BELT, 0);
  setCell(sim, 22, 17, MAT.SAND, 1);
  setCell(sim, 24, 18, MAT.SOIL, 0);
}

function freshPlayer(sim) {
  const w = BALANCE.playerW / sim.cellCm;
  const h = BALANCE.playerH / sim.cellCm;
  return {
    x: 0,
    y: 0,
    w,
    h,
    vx: 0,
    vy: 0,
    facing: "right",
    onGround: false,
    inv: emptyInv(),
    pocket: emptyInv(),
    toolInv: emptyInv(),
    tool: "shovel",
    digT: 0,
    trail: 1,
  };
}

function placePlayer(sim, o) {
  const p = sim.player;
  let cx;
  if (o.predig && sim.predigX0 != null) {
    cx = Math.floor((sim.predigX0 + sim.predigX1) / 2);
  } else {
    cx = Math.floor((sim.shaft0 + sim.shaft1) / 2);
  }
  p.x = cx - p.w / 2;
  // Walk down to the first solid under the body.
  let feet = sim.surfaceCell;
  if (getCell(sim, cx, sim.surfaceCell) === MAT.AIR) {
    let y = sim.surfaceCell;
    while (y < sim.h - 1 && !isSolid(getCell(sim, cx, y))) y++;
    feet = y;
  } else {
    feet = sim.surfaceCell;
  }
  p.y = feet - p.h;
  if (p.y < 1) p.y = 1;
}

function placeSled(sim) {
  const w = BALANCE.sledW / sim.cellCm;
  const h = BALANCE.sledH / sim.cellCm;
  const p = sim.player;
  const sled = {
    x: p.x - w - 2,
    y: p.y + p.h - h,
    w: w,
    h: h,
    inv: emptyInv(),
  };
  if (blockedBox(sim, sled.x, sled.y, w, h)) sled.y = p.y;
  sim.sled = sled;
}

function placeCart(sim) {
  const w = BALANCE.cartW / sim.cellCm;
  const h = BALANCE.cartH / sim.cellCm;
  const x = cellOf(sim, 230);
  sim.cart = {
    x,
    y: sim.surfaceCell - h,
    w,
    h,
    inv: emptyInv(),
  };
}

function createSim(opts = {}) {
  const tiny = !!opts.tiny;
  const cellCm = opts.cellCm === 2 ? 2 : 1;
  const sim = {
    cellCm,
    w: tiny ? 40 : Math.floor(BALANCE.widthCm / cellCm),
    h: tiny ? 28 : Math.floor(BALANCE.heightCm / cellCm),
    haul: opts.haul || "hand",
    digFeel: opts.digFeel === "jab" ? "jab" : "hold",
    jabArmed: true,
    waterMode: opts.water || "off",
    heatMode: opts.heat || "off",
    gradient: opts.gradient != null ? opts.gradient : 22,
    craft: !!opts.craft,
    craftAt: opts.craftAt === "bench" ? "bench" : "station",
    worldMode: opts.worldMode === "abstract" ? "abstract" : "full",
    shafts: opts.shafts === 2 ? 2 : 1,
    chamber: opts.chamber === "limited" ? "limited" : "free",
    timeScale: opts.timeScale || 1,
    zoom: opts.zoom || 7,
    follow: opts.follow !== false,
    depthStyle: opts.depthStyle === "earth" ? "earth" : "cm",
    volume: !!opts.volume,
    open: !!opts.open || tiny,
    windowCm: BALANCE.windowCm,
    preset: opts.preset || "hand",
    kit: {
      pump: opts.kitPump || 0,
      cooler: opts.kitCooler || 0,
      belt: opts.kitBelt || 0,
    },
    machines: [],
    packages: [],
    player: null,
    cart: null,
    sled: null,
    status: "",
    digX: -1,
    digY: -1,
    digP: 0,
    time: 0,
    fallAcc: 0,
    waterAcc: 0,
    beltAcc: 0,
    pumpAcc: 0,
    waterFlip: 0,
    stats: { dug: 0, hauled: 0, excavated: 0 },
    baseMass: 0,
  };
  sim.grid = new Uint8Array(sim.w * sim.h);
  sim.loose = new Uint8Array(sim.w * sim.h);
  sim.beltDir = new Uint8Array(sim.w * sim.h);
  sim.player = freshPlayer(sim);
  if (tiny) {
    buildTiny(sim);
    sim.cart = { x: 2, y: 6, w: 4, h: 2, inv: emptyInv() };
    sim.player.x = 6;
    sim.player.y = 6;
  } else {
    buildGarden(sim, {
      predig: !!opts.predig,
      predigDeep: !!opts.predigDeep,
      belts: !!opts.belts,
      seedPackages: !!opts.seedPackages,
      chamber: sim.chamber,
    });
    placeCart(sim);
    placePlayer(sim, opts);
    if (sim.haul === "sled") placeSled(sim);
  }
  sim.baseMass = totalMass(sim);
  return sim;
}

function massDelta(sim) {
  return totalMass(sim) - sim.baseMass;
}

function windowTop(sim) {
  const foot = Math.floor(sim.player.y + sim.player.h - 0.01);
  const win = Math.max(6, Math.round(sim.windowCm / sim.cellCm));
  return foot - win;
}

function abstractLine(sim) {
  if (sim.worldMode !== "abstract") return -1;
  return windowTop(sim);
}

// Loose spoil in the open shaft, above the face window and below the garden
// bed, becomes a counted package. Embedded beds (no, they are above packMin
// or anchored) stay cells.
function tickAbstract(sim) {
  if (sim.worldMode !== "abstract") return 0;
  const top = windowTop(sim);
  if (top <= sim.packMin) return 0;
  const y1 = Math.min(top, sim.h - 1);
  let n = 0;
  for (let y = sim.packMin; y < y1; y++) {
    const row = y * sim.w;
    for (let x = sim.shaft0; x < sim.shaft1; x++) {
      const i = row + x;
      if (!sim.loose[i]) continue;
      const m = sim.grid[i];
      if (!isMass(m) || m === MAT.WATER) continue;
      sim.grid[i] = MAT.AIR;
      sim.loose[i] = 0;
      addPackage(sim, m, 1, x, y);
      sim.stats.hauled++;
      n++;
    }
  }
  return n;
}

function addPackage(sim, mat, count, x, y) {
  const cap = 24;
  for (let i = 0; i < sim.packages.length; i++) {
    const p = sim.packages[i];
    if (p.mat === mat && p.count < cap) {
      const room = cap - p.count;
      const take = Math.min(room, count);
      p.count += take;
      count -= take;
      if (count <= 0) return;
    }
  }
  while (count > 0) {
    const take = Math.min(cap, count);
    sim.packages.push({ mat, count: take, x, y });
    count -= take;
  }
}

function tickFall(sim, dt) {
  sim.fallAcc += dt * BALANCE.fallPerSec;
  let steps = Math.floor(sim.fallAcc);
  if (steps <= 0) return;
  if (steps > 3) steps = 3;
  sim.fallAcc -= steps;
  const skipAbove = sim.worldMode === "abstract" ? windowTop(sim) : -1;
  for (let s = 0; s < steps; s++) fallOnce(sim, skipAbove);
}

function fallOnce(sim, skipAbove) {
  const w = sim.w;
  const h = sim.h;
  const grid = sim.grid;
  const loose = sim.loose;
  const packMin = sim.packMin || 0;
  const shaft0 = sim.shaft0 || 0;
  const shaft1 = sim.shaft1 || 0;
  for (let y = h - 2; y >= 0; y--) {
    const row = y * w;
    const below = row + w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      if (!loose[i]) continue;
      if (skipAbove >= 0 && y < skipAbove && y >= packMin && x >= shaft0 && x < shaft1) {
        continue;
      }
      const m = grid[i];
      if (!isMass(m) || m === MAT.WATER) continue;
      const bi = below + x;
      const under = grid[bi];
      if (under === MAT.AIR && !hitsBody(sim, x, y + 1)) {
        grid[bi] = m;
        loose[bi] = 1;
        grid[i] = MAT.AIR;
        loose[i] = 0;
        continue;
      }
      if (under === MAT.WATER) {
        grid[bi] = m;
        loose[bi] = 1;
        grid[i] = MAT.WATER;
        loose[i] = 0;
        continue;
      }
      const dir = ((x + y + sim.waterFlip) & 1) ? 1 : -1;
      if (tryDiag(sim, x, y, dir, m)) continue;
      tryDiag(sim, x, y, -dir, m);
    }
  }
}

function hitsBody(sim, x, y) {
  const p = sim.player;
  if (p && x + 1 > p.x && x < p.x + p.w && y + 1 > p.y && y < p.y + p.h) return true;
  const c = sim.cart;
  if (c && x + 1 > c.x && x < c.x + c.w && y + 1 > c.y && y < c.y + c.h) return true;
  const d = sim.sled;
  if (d && x + 1 > d.x && x < d.x + d.w && y + 1 > d.y && y < d.y + d.h) return true;
  return false;
}

function tryDiag(sim, x, y, dir, m) {
  const nx = x + dir;
  if (nx < 0 || nx >= sim.w) return false;
  if (getCell(sim, nx, y) !== MAT.AIR || getCell(sim, nx, y + 1) !== MAT.AIR) return false;
  if (hitsBody(sim, nx, y + 1)) return false;
  writeRaw(sim, nx, y + 1, m, 1);
  writeRaw(sim, x, y, MAT.AIR, 0);
  return true;
}

function entityCount(sim) {
  return 1 + (sim.cart ? 1 : 0) + (sim.sled ? 1 : 0) + sim.packages.length + sim.machines.length;
}

function tickWater(sim, dt) {
  if (sim.waterMode === "off") return;
  const interval = sim.waterMode === "aggressive" ? BALANCE.waterFast : BALANCE.waterSlow;
  sim.waterAcc += dt;
  if (sim.waterAcc < interval) return;
  sim.waterAcc = 0;
  sim.waterFlip++;
  const passes = sim.waterMode === "aggressive" ? 2 : 1;
  for (let p = 0; p < passes; p++) waterOnce(sim);
}

function waterOnce(sim) {
  const w = sim.w;
  const h = sim.h;
  const grid = sim.grid;
  const flip = sim.waterFlip & 1;
  for (let y = h - 2; y >= 0; y--) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      if (grid[i] !== MAT.WATER) continue;
      const bi = i + w;
      if (grid[bi] === MAT.AIR) {
        grid[bi] = MAT.WATER;
        grid[i] = MAT.AIR;
        continue;
      }
      const dir = flip ? 1 : -1;
      if (flowSide(grid, w, x, y, dir)) continue;
      if (flowSide(grid, w, x, y, -dir)) continue;
      // Diagonal down into a hole.
      if (flowDiag(grid, w, x, y, dir)) continue;
      flowDiag(grid, w, x, y, -dir);
    }
  }
}

function flowSide(grid, w, x, y, dir) {
  const nx = x + dir;
  if (nx < 0 || nx >= w) return false;
  const ni = y * w + nx;
  if (grid[ni] !== MAT.AIR) return false;
  grid[ni] = MAT.WATER;
  grid[y * w + x] = MAT.AIR;
  return true;
}

function flowDiag(grid, w, x, y, dir) {
  const nx = x + dir;
  if (nx < 0 || nx >= w) return false;
  const side = y * w + nx;
  const down = (y + 1) * w + nx;
  if (grid[side] !== MAT.AIR || grid[down] !== MAT.AIR) return false;
  grid[down] = MAT.WATER;
  grid[y * w + x] = MAT.AIR;
  return true;
}

function excavatedVolume(sim) {
  const cm3 = sim.stats.excavated * sim.cellCm * sim.cellCm * BALANCE.sliceCm;
  return {
    cm3,
    litres: cm3 / 1000,
    m3: cm3 / 1e6,
  };
}

function depthCm(sim) {
  const feet = sim.player.y + sim.player.h;
  return Math.max(0, (feet - sim.surfaceCell) * sim.cellCm);
}
