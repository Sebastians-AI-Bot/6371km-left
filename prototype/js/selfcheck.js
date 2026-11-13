// Conservation checks. No dependencies.
//   node --experimental-detect-module prototype/js/selfcheck.js

import assert from "node:assert/strict";
import {
  MAT,
  BALANCE,
  createSim,
  totalMass,
  tickFall,
  tickWater,
  getCell,
  setCell,
  canDigAt,
  temperatureC,
  digSeconds,
  blockedBox,
  invCount,
} from "./sim.js";
import {
  excavate,
  dump,
  use,
  moveCells,
  tickBelts,
  tickPackages,
  placeSeal,
} from "./haul.js";
import { PRESETS } from "./debug.js";

let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log("ok  " + name);
  } catch (err) {
    failed++;
    console.error("FAIL " + name);
    console.error(err);
  }
}

function shrink(sim, x, y) {
  sim.player.x = x;
  sim.player.y = y;
  sim.player.w = 1;
  sim.player.h = 1;
  sim.player.vx = 0;
  sim.player.vy = 0;
}

test("excavate moves a cell into the hands", () => {
  const sim = createSim({ tiny: true });
  shrink(sim, 1, 1);
  const before = totalMass(sim);
  assert.equal(getCell(sim, 2, 9), MAT.SOIL);
  assert.equal(excavate(sim, 2, 9), true);
  assert.equal(getCell(sim, 2, 9), MAT.AIR);
  assert.equal(sim.player.inv[MAT.SOIL], 1);
  assert.equal(sim.stats.excavated, 1);
  assert.equal(totalMass(sim), before);
});

test("dump builds a heap and empties the hands", () => {
  const sim = createSim({ tiny: true });
  shrink(sim, 26, 1);
  sim.player.facing = "down";
  const before = totalMass(sim);
  assert.equal(excavate(sim, 4, 10), true);
  const n = dump(sim);
  assert.ok(n >= 1);
  assert.equal(sim.player.inv[MAT.SAND], 0);
  assert.equal(totalMass(sim), before);
  let piled = 0;
  for (let y = 0; y < sim.h; y++) if (getCell(sim, 26, y) === MAT.SAND) piled++;
  assert.ok(piled >= 1);
});

test("loose sand falls onto the floor", () => {
  const sim = createSim({ tiny: true });
  const before = totalMass(sim);
  for (let i = 0; i < 12; i++) tickFall(sim, 1);
  assert.equal(getCell(sim, 4, 14), MAT.SAND);
  assert.equal(getCell(sim, 4, 15), MAT.SAND);
  assert.equal(getCell(sim, 4, 10), MAT.AIR);
  assert.equal(totalMass(sim), before);
});

test("water flows down into a hole", () => {
  const sim = createSim({ tiny: true });
  for (let y = 9; y <= 15; y++) setCell(sim, 30, y, MAT.AIR, 0);
  setCell(sim, 30, 16, MAT.SOIL, 0);
  setCell(sim, 30, 10, MAT.WATER, 0);
  const before = totalMass(sim);
  sim.waterMode = "aggressive";
  for (let i = 0; i < 12; i++) tickWater(sim, 1);
  assert.equal(getCell(sim, 30, 15), MAT.WATER);
  assert.equal(getCell(sim, 30, 10), MAT.AIR);
  assert.equal(totalMass(sim), before);
});

test("full hands spill the next cell instead of deleting it", () => {
  const sim = createSim({ tiny: true });
  shrink(sim, 1, 1);
  let n = 0;
  for (let x = 0; x < 20 && n < BALANCE.handCap; x++) {
    if (getCell(sim, x, 20) === MAT.SOIL && excavate(sim, x, 20)) n++;
  }
  assert.equal(n, BALANCE.handCap);
  assert.equal(invCount(sim.player.inv), BALANCE.handCap);
  const before = totalMass(sim);
  assert.equal(getCell(sim, 4, 11), MAT.SAND);
  assert.equal(excavate(sim, 4, 11), true);
  assert.equal(getCell(sim, 4, 11), MAT.AIR);
  assert.equal(invCount(sim.player.inv), BALANCE.handCap);
  assert.equal(totalMass(sim), before);
});

test("ore beside the station becomes ingot and slag", () => {
  const sim = createSim({ tiny: true });
  shrink(sim, 16, 17);
  sim.craft = true;
  sim.craftAt = "station";
  const before = totalMass(sim);
  assert.equal(use(sim), true);
  const a = getCell(sim, 15, 18);
  const b = getCell(sim, 16, 17);
  assert.ok((a === MAT.INGOT && b === MAT.SLAG) || (a === MAT.SLAG && b === MAT.INGOT));
  assert.equal(use(sim), true);
  assert.equal(sim.player.tool, "drill");
  assert.equal(sim.player.toolInv[MAT.INGOT], 1);
  assert.equal(totalMass(sim), before);
});

test("belt moves one loose cell", () => {
  const sim = createSim({ tiny: true });
  setCell(sim, 23, 17, MAT.AIR, 0);
  const before = totalMass(sim);
  tickBelts(sim, 1);
  assert.equal(getCell(sim, 23, 17), MAT.SAND);
  assert.equal(getCell(sim, 22, 17), MAT.AIR);
  assert.equal(totalMass(sim), before);
  assert.ok(sim.stats.hauled >= 1);
});

test("seal is soil that changed shape", () => {
  const sim = createSim({ tiny: true });
  shrink(sim, 1, 1);
  sim.player.facing = "right";
  assert.equal(excavate(sim, 2, 9), true);
  const before = totalMass(sim);
  assert.equal(placeSeal(sim), true);
  assert.equal(getCell(sim, 2, 1), MAT.SEAL);
  assert.equal(sim.player.inv[MAT.SOIL], 0);
  assert.equal(totalMass(sim), before);
});

test("a package unpacks onto the ground", () => {
  const sim = createSim({ tiny: true });
  shrink(sim, 1, 1);
  const before = totalMass(sim);
  const moved = moveCells(
    sim,
    { kind: "cell", x: 4, y: 10 },
    { kind: "package", x: 4, y: 20 },
    MAT.SAND,
    1,
  );
  assert.equal(moved, 1);
  assert.equal(getCell(sim, 4, 10), MAT.AIR);
  assert.equal(totalMass(sim), before);
  tickPackages(sim, 1);
  assert.equal(sim.packages.length, 0);
  assert.equal(totalMass(sim), before);
});

test("one shaft refuses the second pit", () => {
  const sim = createSim({ haul: "hand", cellCm: 2 });
  const sandY = sim.surfaceCell + Math.floor(BALANCE.pitCm / sim.cellCm) + 1;
  assert.equal(getCell(sim, sim.shaft0 + 2, sandY), MAT.SAND);
  assert.equal(canDigAt(sim, sim.shaft0 + 2, sandY), true);
  assert.equal(getCell(sim, sim.shaft2a + 2, sim.surfaceCell + 1), MAT.SAND);
  assert.equal(canDigAt(sim, sim.shaft2a + 2, sim.surfaceCell + 1), false);
  sim.shafts = 2;
  assert.equal(canDigAt(sim, sim.shaft2a + 2, sim.surfaceCell + 1), true);
});

test("heat rises with depth and the drill is separate from time scale", () => {
  const sim = createSim({ tiny: true, heat: "slow", gradient: 40 });
  const shallow = temperatureC(sim, 3, sim.surfaceCell + 1);
  const deepY = sim.surfaceCell + 14;
  const deep = temperatureC(sim, 3, deepY);
  assert.ok(deep > shallow + 5, deep + " vs " + shallow);
  setCell(sim, 3, deepY, MAT.SOFT, 0);
  sim.player.tool = "shovel";
  const shovel = digSeconds(sim, 3, deepY);
  sim.player.tool = "drill";
  const drill = digSeconds(sim, 3, deepY);
  assert.ok(drill < shovel * 0.5, drill + " vs " + shovel);
  sim.timeScale = 8;
  assert.equal(digSeconds(sim, 3, deepY), drill);
});

test("every preset spawns a free body and keeps its mass", () => {
  for (let i = 0; i < PRESETS.length; i++) {
    const preset = PRESETS[i];
    const sim = createSim({ ...preset, preset: preset.id });
    assert.equal(blockedBox(sim, sim.player.x, sim.player.y, sim.player.w, sim.player.h), false, preset.id + " player");
    assert.equal(blockedBox(sim, sim.cart.x, sim.cart.y, sim.cart.w, sim.cart.h), false, preset.id + " cart");
    const before = totalMass(sim);
    for (let n = 0; n < 4; n++) tickFall(sim, 0.25);
    assert.equal(totalMass(sim), before, preset.id + " mass");
    assert.equal(sim.baseMass, before);
  }
});

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("all passed");
