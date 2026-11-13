// Hand, bucket, cart, and belt all move material through moveCells().
// A transfer that does not fit is put back. Nothing is dropped on the floor
// of the function.

const NEI = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
];

function facingCell(sim) {
  const p = sim.player;
  const left = Math.floor(p.x);
  const right = Math.floor(p.x + p.w - 1e-4);
  const top = Math.floor(p.y);
  const bot = Math.floor(p.y + p.h - 1e-4);
  const midX = Math.floor(p.x + p.w / 2);
  if (p.facing === "left") return { x: left - 1, y: bot };
  if (p.facing === "right") return { x: right + 1, y: bot };
  if (p.facing === "up") return { x: midX, y: top - 1 };
  // Down digs across the footprint, so a 10 cm body can drop through the hole.
  const under = bot + 1;
  for (let x = left; x <= right; x++) {
    const m = getCell(sim, x, under);
    if (isMass(m) && m !== MAT.WATER) return { x, y: under };
  }
  return { x: midX, y: under };
}

// A cell the cursor can dig: the ring just outside the body.
function adjacentCell(sim, x, y) {
  if (!inBounds(sim, x, y)) return null;
  const p = sim.player;
  const left = Math.floor(p.x);
  const right = Math.floor(p.x + p.w - 1e-4);
  const top = Math.floor(p.y);
  const bot = Math.floor(p.y + p.h - 1e-4);
  const inside = x >= left && x <= right && y >= top && y <= bot;
  if (inside) return null;
  if (x < left - 1 || x > right + 1 || y < top - 1 || y > bot + 1) return null;
  return { x, y };
}

function containerInv(sim, kind) {
  if (kind === "inv") return sim.player.inv;
  if (kind === "tool") return sim.player.toolInv;
  if (kind === "cart") return sim.cart ? sim.cart.inv : null;
  return null;
}

function take(sim, from, mat, n) {
  if (n <= 0) return 0;
  if (from.kind === "cell") {
    if (!inBounds(sim, from.x, from.y)) return 0;
    if (getCell(sim, from.x, from.y) !== mat) return 0;
    from.loose = !!sim.loose[from.y * sim.w + from.x];
    setCell(sim, from.x, from.y, MAT.AIR, 0);
    return 1;
  }
  if (from.kind === "package") {
    const p = sim.packages[from.index];
    if (!p || p.mat !== mat) return 0;
    const k = Math.min(p.count, n);
    p.count -= k;
    return k;
  }
  const inv = containerInv(sim, from.kind);
  if (!inv) return 0;
  const k = Math.min(inv[mat], n);
  inv[mat] -= k;
  if (from.kind === "tool" && invCount(sim.player.toolInv) === 0) sim.player.tool = "shovel";
  return k;
}

function give(sim, to, mat, n) {
  if (n <= 0) return 0;
  if (to.kind === "cell") {
    if (getCell(sim, to.x, to.y) !== MAT.AIR) return 0;
    const loose = to.loose !== false && mat !== MAT.WATER && mat !== MAT.SEAL;
    setCell(sim, to.x, to.y, mat, loose);
    return 1;
  }
  if (to.kind === "spill") {
    return spillCells(sim, mat, n, to.x, to.y, to.limits || null);
  }
  if (to.kind === "package") {
    addPackage(sim, mat, n, to.x, to.y);
    return n;
  }
  if (to.kind === "inv") {
    const room = carryCap(sim) - invCount(sim.player.inv);
    const k = Math.min(Math.max(0, room), n);
    if (k > 0) sim.player.inv[mat] += k;
    return k;
  }
  if (to.kind === "cart") {
    if (!sim.cart) return 0;
    const room = BALANCE.cartCap - invCount(sim.cart.inv);
    const k = Math.min(Math.max(0, room), n);
    if (k > 0) sim.cart.inv[mat] += k;
    return k;
  }
  if (to.kind === "tool") {
    sim.player.toolInv[mat] += n;
    if (mat === MAT.INGOT) sim.player.tool = "drill";
    return n;
  }
  return 0;
}

// Move up to n cells of one material. Returns how many moved.
function moveCells(sim, from, to, mat, n) {
  if (!isMass(mat) || n <= 0) return 0;
  const taken = take(sim, from, mat, n);
  if (!taken) return 0;
  const given = give(sim, to, mat, taken);
  const back = taken - given;
  if (back > 0) give(sim, from, mat, back);
  return given;
}

function say(sim, text) {
  sim.status = text;
  sim.statusT = 2.2;
}

function excavate(sim, x, y) {
  if (!inBounds(sim, x, y)) return false;
  const mat = getCell(sim, x, y);
  if (!isMass(mat) || mat === MAT.WATER) return false;
  if (!canDigAt(sim, x, y)) {
    say(sim, sim.shafts < 2 ? "one shaft" : "can't dig there");
    return false;
  }
  const intoHand = moveCells(sim, { kind: "cell", x, y }, { kind: "inv" }, mat, 1);
  if (intoHand) {
    sim.stats.dug++;
    sim.stats.excavated++;
    return true;
  }
  // Hands are full. The spare cell goes to the surface heap, away from the
  // hole, so it stays in the world and does not fall back under the feet.
  const spilled = moveCells(
    sim,
    { kind: "cell", x, y },
    { kind: "spill", x: sim.heapCell, y: sim.surfaceCell - 1 },
    mat,
    1,
  );
  if (spilled) {
    sim.stats.dug++;
    sim.stats.excavated++;
    sim.stats.hauled++;
    say(sim, "hands full, spilled to the heap");
    return true;
  }
  say(sim, "no room");
  return false;
}

function dumpInv(sim, kind, x, y) {
  const inv = containerInv(sim, kind);
  if (!inv) return 0;
  let moved = 0;
  for (let mat = 1; mat <= MASS_MAX; mat++) {
    if (!inv[mat]) continue;
    moved += moveCells(sim, { kind }, { kind: "spill", x, y }, mat, inv[mat]);
  }
  sim.stats.hauled += moved;
  return moved;
}

function dump(sim) {
  const face = facingCell(sim);
  if (sim.haul === "cart" && sim.cart && bodiesNear(sim.player, sim.cart) && invCount(sim.cart.inv) > 0) {
    const x = Math.floor(sim.cart.x + sim.cart.w / 2);
    const y = Math.floor(sim.cart.y + sim.cart.h);
    const n = dumpInv(sim, "cart", x, y - 1);
    say(sim, n ? "cart dumped " + n : "cart dump blocked");
    return n;
  }
  let n = dumpInv(sim, "inv", face.x, face.y);
  if (!n && invCount(sim.player.inv) > 0) {
    // Facing into the floor you're standing on has no air for a pile.
    // The cells still leave the hands, onto the surface heap.
    n = dumpInv(sim, "inv", sim.heapCell, sim.surfaceCell - 1);
    say(sim, n ? "dumped " + n + " on the heap" : "dump blocked");
    return n;
  }
  say(sim, n ? "dumped " + n : "nothing to dump");
  return n;
}

function bodiesNear(a, b) {
  const pad = 1.2;
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x
    && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

function cellsNearBody(sim, mat, reach) {
  const p = sim.player;
  const x0 = Math.floor(p.x) - reach;
  const y0 = Math.floor(p.y) - reach;
  const x1 = Math.floor(p.x + p.w) + reach;
  const y1 = Math.floor(p.y + p.h) + reach;
  const out = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (getCell(sim, x, y) === mat) out.push({ x, y });
    }
  }
  return out;
}

function smeltPair(sim, a, b) {
  setCell(sim, a.x, a.y, MAT.INGOT, 1);
  setCell(sim, b.x, b.y, MAT.SLAG, 1);
  say(sim, "2 ore → ingot + slag");
}

function use(sim) {
  if (sim.craft) {
    const fixture = sim.craftAt === "bench" ? MAT.BENCH : MAT.STATION;
    const fixtures = cellsNearBody(sim, fixture, 2);
    if (fixtures.length) {
      const ores = [];
      const airs = [];
      const ingots = [];
      const seen = new Set();
      for (let i = 0; i < fixtures.length; i++) {
        const f = fixtures[i];
        for (let n = 0; n < NEI.length; n++) {
          const x = f.x + NEI[n][0];
          const y = f.y + NEI[n][1];
          const key = x + "," + y;
          if (seen.has(key)) continue;
          seen.add(key);
          const m = getCell(sim, x, y);
          if (m === MAT.ORE) ores.push({ x, y });
          else if (m === MAT.INGOT) ingots.push({ x, y });
          else if (m === MAT.AIR) airs.push({ x, y });
        }
      }
      if (ores.length >= 2) {
        smeltPair(sim, ores[0], ores[1]);
        return true;
      }
      if (sim.player.inv[MAT.ORE] >= 2 && airs.length >= 2) {
        const moved = moveCells(sim, { kind: "inv" }, { kind: "cell", x: airs[0].x, y: airs[0].y }, MAT.ORE, 1)
          + moveCells(sim, { kind: "inv" }, { kind: "cell", x: airs[1].x, y: airs[1].y }, MAT.ORE, 1);
        if (moved === 2) {
          smeltPair(sim, airs[0], airs[1]);
          return true;
        }
      }
      if (ingots.length) {
        const n = moveCells(sim, { kind: "cell", x: ingots[0].x, y: ingots[0].y }, { kind: "tool" }, MAT.INGOT, 1);
        if (n) {
          say(sim, "ingot fitted as drill");
          return true;
        }
      }
      if (sim.player.inv[MAT.INGOT] > 0) {
        const n = moveCells(sim, { kind: "inv" }, { kind: "tool" }, MAT.INGOT, 1);
        if (n) {
          say(sim, "ingot fitted as drill");
          return true;
        }
      }
      say(sim, "need 2 ore at the " + sim.craftAt);
      return false;
    }
  }

  if (sim.cart && bodiesNear(sim.player, sim.cart)) {
    const held = invCount(sim.player.inv);
    let moved = 0;
    if (held > 0) {
      for (let mat = 1; mat <= MASS_MAX; mat++) {
        if (!sim.player.inv[mat]) continue;
        moved += moveCells(sim, { kind: "inv" }, { kind: "cart" }, mat, sim.player.inv[mat]);
      }
      sim.stats.hauled += moved;
      say(sim, moved ? "loaded cart " + moved : "cart full");
      return moved > 0;
    }
    if (invCount(sim.cart.inv) > 0) {
      for (let mat = 1; mat <= MASS_MAX; mat++) {
        if (!sim.cart.inv[mat]) continue;
        moved += moveCells(sim, { kind: "cart" }, { kind: "inv" }, mat, sim.cart.inv[mat]);
      }
      sim.stats.hauled += moved;
      say(sim, moved ? "unloaded " + moved : "hands full");
      return moved > 0;
    }
  }

  const face = facingCell(sim);
  const fm = getCell(sim, face.x, face.y);
  if (fm === MAT.INGOT || fm === MAT.SLAG || fm === MAT.FOSSIL) {
    const n = moveCells(sim, { kind: "cell", x: face.x, y: face.y }, { kind: "inv" }, fm, 1);
    if (n) {
      sim.stats.hauled++;
      say(sim, "picked up " + (fm === MAT.INGOT ? "ingot" : fm === MAT.SLAG ? "slag" : "fossil"));
      return true;
    }
    say(sim, "hands full");
    return false;
  }
  if (fm === MAT.PUMP || fm === MAT.COOLER || fm === MAT.BELT) {
    setCell(sim, face.x, face.y, MAT.AIR, 0);
    if (fm === MAT.PUMP) sim.kit.pump++;
    else if (fm === MAT.COOLER) sim.kit.cooler++;
    else sim.kit.belt++;
    say(sim, "picked up");
    return true;
  }
  say(sim, "nothing to use");
  return false;
}

function placeSeal(sim) {
  const face = facingCell(sim);
  if (getCell(sim, face.x, face.y) !== MAT.AIR) {
    say(sim, "seal needs air");
    return false;
  }
  const mat = sim.player.inv[MAT.SOIL] > 0 ? MAT.SOIL : (sim.player.inv[MAT.SAND] > 0 ? MAT.SAND : 0);
  if (!mat) {
    say(sim, "need soil or sand");
    return false;
  }
  // Soil becomes a plug. The cell count stays one.
  sim.player.inv[mat]--;
  setCell(sim, face.x, face.y, MAT.SEAL, 0);
  say(sim, "sealed");
  return true;
}

function placeKit(sim, kind) {
  const face = facingCell(sim);
  if (!inBounds(sim, face.x, face.y) || getCell(sim, face.x, face.y) !== MAT.AIR) {
    say(sim, "needs an open cell");
    return false;
  }
  if (kind === "pump") {
    if (sim.kit.pump <= 0) return false;
    setCell(sim, face.x, face.y, MAT.PUMP, 0);
    sim.kit.pump--;
    say(sim, "pump placed");
    return true;
  }
  if (kind === "cooler") {
    if (sim.kit.cooler <= 0) return false;
    setCell(sim, face.x, face.y, MAT.COOLER, 0);
    sim.kit.cooler--;
    say(sim, "cooler placed");
    return true;
  }
  if (kind === "belt") {
    if (sim.kit.belt <= 0) return false;
    const dir = sim.player.facing === "left" ? 1
      : sim.player.facing === "up" ? 2
        : sim.player.facing === "down" ? 3
          : 0;
    sim.beltDir[face.y * sim.w + face.x] = dir;
    setCell(sim, face.x, face.y, MAT.BELT, 0);
    sim.kit.belt--;
    say(sim, "belt placed");
    return true;
  }
  return false;
}

function dropTool(sim) {
  const n = sim.player.toolInv[MAT.INGOT];
  if (!n) {
    sim.player.tool = "shovel";
    say(sim, "shovel");
    return 0;
  }
  const face = facingCell(sim);
  const moved = moveCells(sim, { kind: "tool" }, { kind: "spill", x: face.x, y: face.y }, MAT.INGOT, n);
  if (!moved) {
    // Keep the ingots in the tool slot rather than deleting them.
    sim.player.toolInv[MAT.INGOT] += 0;
    say(sim, "nowhere to drop the drill");
    return 0;
  }
  sim.stats.hauled += moved;
  say(sim, "drill set down");
  return moved;
}

function destOf(sim, belt) {
  const dir = belt.dir || sim.beltDir[belt.y * sim.w + belt.x] || 0;
  if (dir === 1) return { x: belt.x - 1, y: belt.y - 1, sx: belt.x, sy: belt.y - 1 };
  if (dir === 2) return { x: belt.x, y: belt.y - 2, sx: belt.x, sy: belt.y - 1 };
  if (dir === 3) return { x: belt.x, y: belt.y + 1, sx: belt.x, sy: belt.y - 1 };
  return { x: belt.x + 1, y: belt.y - 1, sx: belt.x, sy: belt.y - 1 };
}

function tickBelts(sim, dt) {
  sim.beltAcc += dt * BALANCE.beltPerSec;
  let steps = Math.floor(sim.beltAcc);
  if (steps <= 0) return;
  if (steps > 3) steps = 3;
  sim.beltAcc -= steps;
  const belts = [];
  for (let i = 0; i < sim.machines.length; i++) {
    if (sim.machines[i].mat === MAT.BELT) belts.push(sim.machines[i]);
  }
  if (!belts.length) return;
  belts.sort((a, b) => b.x - a.x || a.y - b.y);
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < belts.length; i++) {
      const belt = belts[i];
      const d = destOf(sim, belt);
      if (!inBounds(sim, d.sx, d.sy) || !inBounds(sim, d.x, d.y)) continue;
      const mat = getCell(sim, d.sx, d.sy);
      if (!isMass(mat)) continue;
      const loose = sim.loose[d.sy * sim.w + d.sx];
      if (!loose && mat !== MAT.WATER) continue;
      if (getCell(sim, d.x, d.y) !== MAT.AIR) continue;
      const n = moveCells(
        sim,
        { kind: "cell", x: d.sx, y: d.sy },
        { kind: "cell", x: d.x, y: d.y, loose: mat !== MAT.WATER },
        mat,
        1,
      );
      if (n) sim.stats.hauled += n;
    }
  }
}

function tickPumps(sim, dt) {
  if (sim.waterMode === "off") return;
  sim.pumpAcc += dt * BALANCE.pumpPerSec;
  let budget = Math.floor(sim.pumpAcc);
  if (budget <= 0) return;
  if (budget > 6) budget = 6;
  sim.pumpAcc -= budget;
  for (let i = 0; i < sim.machines.length && budget > 0; i++) {
    const m = sim.machines[i];
    if (m.mat !== MAT.PUMP) continue;
    for (let n = 0; n < 4 && budget > 0; n++) {
      const x = m.x + NEI[n][0];
      const y = m.y + NEI[n][1];
      if (getCell(sim, x, y) !== MAT.WATER) continue;
      const moved = moveCells(
        sim,
        { kind: "cell", x, y },
        { kind: "spill", x: sim.heapCell, y: sim.surfaceCell - 1 },
        MAT.WATER,
        1,
      );
      if (moved) {
        sim.stats.hauled += moved;
        budget--;
      }
    }
  }
}

function tickPackages(sim, dt) {
  if (!sim.packages.length) return;
  const step = (48 / sim.cellCm) * dt;
  for (let i = 0; i < sim.packages.length; i++) {
    const p = sim.packages[i];
    p.y -= step;
    if (p.y > sim.surfaceCell + 1) continue;
    const moved = moveCells(
      sim,
      { kind: "package", index: i },
      { kind: "spill", x: sim.heapCell, y: sim.surfaceCell - 1 },
      p.mat,
      p.count,
    );
    if (moved) sim.stats.hauled += moved;
  }
  sim.packages = sim.packages.filter((p) => p.count > 0);
}

function carryLine(sim) {
  const cap = carryCap(sim);
  const n = invCount(sim.player.inv);
  const parts = [];
  for (let mat = 1; mat <= MASS_MAX; mat++) {
    if (sim.player.inv[mat]) parts.push(sim.player.inv[mat]);
  }
  const cartN = sim.cart ? invCount(sim.cart.inv) : 0;
  const toolN = sim.player.toolInv[MAT.INGOT] || 0;
  return { n, cap, cartN, toolN, haul: sim.haul };
}
