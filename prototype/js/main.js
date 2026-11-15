// Loop and input. Time scale multiplies the clock. The drill does not.

const canvas = document.getElementById("view");
const hud = document.getElementById("hud");
const panel = document.getElementById("panel");
const view = createView(canvas);
const rates = createRates();
const keys = Object.create(null);
const mouse = { down: false, x: 0, y: 0, inside: false };

let sim = null;

function camKeys() {
  return {
    i: !!keys.i,
    j: !!keys.j,
    k: !!keys.k,
    l: !!keys.l,
  };
}

function boot(id) {
  const preset = presetById(id);
  sim = createSim({ ...preset, preset: preset.id });
  sim.camKeys = camKeys();
  rates.dug0 = 0;
  rates.haul0 = 0;
  rates.dugS = 0;
  rates.haulS = 0;
  rates.acc = 0;
  rates.frames = 0;
  rates.fps = 0;
  if (location.hash !== "#" + preset.id) location.hash = preset.id;
  const hint = document.getElementById("hint");
  if (hint) hint.textContent = hintText(preset.id);
  mountPanel(panel, sim, hooks);
  globalThis.__km = {
    sim, boot, PRESETS, BALANCE, MAT,
    excavate, dump, use, totalMass, getCell, massDelta, facingCell,
  };
}

const hooks = {
  onPreset: (next) => boot(next),
  onLive: (patch) => {
    applyLive(sim, patch);
    mountPanel(panel, sim, hooks);
  },
  onPixel: (cm) => {
    const structural = presetById(sim.preset);
    sim = createSim({
      ...structural,
      preset: structural.id,
      cellCm: cm,
      haul: sim.haul,
      water: sim.waterMode,
      heat: sim.heatMode,
      gradient: sim.gradient,
      craft: sim.craft,
      craftAt: sim.craftAt,
      worldMode: sim.worldMode,
      shafts: sim.shafts,
      chamber: sim.chamber,
      timeScale: sim.timeScale,
      zoom: sim.zoom,
      follow: sim.follow,
      depthStyle: sim.depthStyle,
      volume: sim.volume,
      digFeel: sim.digFeel,
    });
    sim.camKeys = camKeys();
    mountPanel(panel, sim, hooks);
    globalThis.__km.sim = sim;
  },
};

function hintText(id) {
  if (id === "jab") return "A/D move · W jump · S face down · tap F or the mouse for one cell, then release · G dump · F1 debug";
  if (id === "pocket") return "A/D move · W jump · S face down · hold F, dirt goes into the pocket (3) · G dumps the pocket · F1 debug";
  if (id === "heap") return "A/D move · W jump · S face down · hold F, dirt drops into a pile beside you · F1 debug";
  if (id === "sled") return "A/D move · W jump · S face down · hold F beside the sled · it follows as you walk · G dumps the sled · F1 debug";
  return "A/D move · W jump · W into a wall climbs · S face down · hold mouse or F to dig · G dump · E use · K seal · P pump · O cooler · L belt · T drop drill · [ ] zoom · F1 debug";
}

function typedTarget(event) {
  const tag = event.target && event.target.tagName;
  return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
}

window.addEventListener("keydown", (event) => {
  if (typedTarget(event)) return;
  const k = event.key.toLowerCase();
  keys[k] = true;
  if (k === "f1") {
    event.preventDefault();
    if (!event.repeat) panel.classList.toggle("open");
    return;
  }
  if (event.key === " " || event.key.startsWith("Arrow") || k === "f1") event.preventDefault();
  if (event.repeat || !sim) return;
  if (k === "g") dump(sim);
  else if (k === "e") use(sim);
  else if (k === "k") placeSeal(sim);
  else if (k === "p") placeKit(sim, "pump");
  else if (k === "o") placeKit(sim, "cooler");
  else if (k === "l") placeKit(sim, "belt");
  else if (k === "t") dropTool(sim);
  else if (k === "[" || k === "-") sim.zoom = clampZoom(sim.zoom / 1.15);
  else if (k === "]" || k === "=" || k === "+") sim.zoom = clampZoom(sim.zoom * 1.15);
});

window.addEventListener("keyup", (event) => {
  keys[event.key.toLowerCase()] = false;
});

window.addEventListener("blur", () => {
  for (const key of Object.keys(keys)) keys[key] = false;
  mouse.down = false;
});

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  mouse.down = true;
  pointer(event);
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointerup", () => {
  mouse.down = false;
});
canvas.addEventListener("pointercancel", () => {
  mouse.down = false;
});
canvas.addEventListener("pointermove", (event) => pointer(event));
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const factor = event.deltaY > 0 ? 1 / 1.12 : 1.12;
  sim.zoom = clampZoom(sim.zoom * factor);
}, { passive: false });
window.addEventListener("resize", () => resize(view));

function pointer(event) {
  const rect = canvas.getBoundingClientRect();
  mouse.x = event.clientX - rect.left;
  mouse.y = event.clientY - rect.top;
  mouse.inside = true;
}

function clampZoom(z) {
  if (z < 0.35) return 0.35;
  if (z > 16) return 16;
  return z;
}

function moveBody(body, dt) {
  body.vy += BALANCE.gravity * dt;
  if (body.vy > 900) body.vy = 900;
  const dx = (body.vx * dt) / sim.cellCm;
  slide(body, dx, 0);
  const dy = (body.vy * dt) / sim.cellCm;
  const was = body.vy;
  if (!slide(body, 0, dy)) {
    if (was > 0) body.onGround = true;
    body.vy = 0;
  } else {
    body.onGround = false;
  }
}

function slide(body, dx, dy) {
  const signX = Math.sign(dx);
  const signY = Math.sign(dy);
  let left = Math.abs(dx) + Math.abs(dy);
  let moved = false;
  let guard = 0;
  while (left > 1e-4 && guard < 40) {
    guard++;
    const step = Math.min(0.35, left);
    const nx = body.x + signX * (dx !== 0 ? step : 0);
    const ny = body.y + signY * (dy !== 0 ? step : 0);
    if (!blockedBox(sim, nx, ny, body.w, body.h)) {
      body.x = nx;
      body.y = ny;
      left -= step;
      moved = true;
      continue;
    }
    if (dx !== 0 && body.onGround) {
      const up = BALANCE.stepCm / sim.cellCm;
      if (!blockedBox(sim, nx, body.y - up, body.w, body.h)) {
        body.x = nx;
        body.y -= up;
        left -= step;
        moved = true;
        continue;
      }
    }
    return false;
  }
  return true;
}

function separateCart() {
  const p = sim.player;
  const c = sim.cart;
  if (!c) return;
  const overlapX = p.x < c.x + c.w && p.x + p.w > c.x;
  const overlapY = p.y < c.y + c.h && p.y + p.h > c.y;
  if (!overlapX || !overlapY) return;
  const pushRight = (p.x + p.w / 2) <= (c.x + c.w / 2);
  const dir = pushRight ? 1 : -1;
  const pen = pushRight ? (p.x + p.w - c.x) : (c.x + c.w - p.x);
  const dx = dir * (pen + 0.05);
  if (!blockedBox(sim, c.x + dx, c.y, c.w, c.h)) {
    c.x += dx;
    c.vx = dir * BALANCE.walkCm;
  } else if (!blockedBox(sim, p.x - dx, p.y, p.w, p.h)) {
    p.x -= dx;
  }
}

function controlPlayer() {
  const p = sim.player;
  let ax = 0;
  if (keys.a || keys.arrowleft) {
    ax -= 1;
    p.facing = "left";
  }
  if (keys.d || keys.arrowright) {
    ax += 1;
    p.facing = "right";
  }
  if (ax !== 0) p.trail = ax > 0 ? 1 : -1;
  if (keys.s || keys.arrowdown) p.facing = "down";
  if ((keys.w || keys.arrowup) && !keys.s && !keys.a && !keys.d && !keys.arrowleft && !keys.arrowright) {
    p.facing = "up";
  }
  const speed = sim.haul === "bucket" ? BALANCE.bucketWalkCm : BALANCE.walkCm;
  p.vx = ax * speed;
  if ((keys.w || keys.arrowup) && p.onGround && !keys.s && !keys.arrowdown) {
    p.vy = -BALANCE.jumpSpeed;
    p.onGround = false;
  } else if ((keys.w || keys.arrowup) && !p.onGround && ax !== 0) {
    // Hold W into a wall to climb out of a shaft.
    const into = ax < 0 ? p.x - 0.15 : p.x + 0.15;
    if (blockedBox(sim, into, p.y, p.w, p.h)) p.vy = -140;
  }
}

function strokeDown() {
  return mouse.down || !!keys.f || !!keys[" "];
}

function diggingTarget() {
  if (sim.digFeel === "jab" && !sim.jabArmed) return null;
  if (mouse.down && mouse.inside) {
    const cell = screenToCell(view, sim, mouse.x, mouse.y);
    const adj = adjacentCell(sim, cell.x, cell.y);
    if (adj) {
      const p = sim.player;
      const midX = p.x + p.w / 2;
      const midY = p.y + p.h / 2;
      const dx = adj.x + 0.5 - midX;
      const dy = adj.y + 0.5 - midY;
      if (Math.abs(dx) > Math.abs(dy)) p.facing = dx < 0 ? "left" : "right";
      else p.facing = dy < 0 ? "up" : "down";
      return adj;
    }
  }
  if (mouse.down || keys.f || keys[" "]) return facingCell(sim);
  return null;
}

function step(dt) {
  sim.camKeys = camKeys();
  sim.time += dt;
  if (sim.statusT) {
    sim.statusT -= dt;
    if (sim.statusT <= 0) sim.status = "";
  }
  if (sim.digFeel === "jab" && !strokeDown()) sim.jabArmed = true;
  controlPlayer();
  moveBody(sim.player, dt);
  separateCart();
  if (sim.sled) {
    tickSled(sim, dt);
    separateSled(sim);
  }
  if (sim.cart) {
    sim.cart.vx = 0;
    moveBody(sim.cart, dt);
  }
  const target = diggingTarget();
  if (target && digSeconds(sim, target.x, target.y) > 0 && target.x === sim.digX && target.y === sim.digY) {
    sim.digP += dt / digSeconds(sim, target.x, target.y);
    if (sim.digP >= 1) {
      excavate(sim, target.x, target.y);
      sim.digP = 0;
      if (sim.digFeel === "jab") sim.jabArmed = false;
    }
  } else if (target) {
    sim.digX = target.x;
    sim.digY = target.y;
    sim.digP = dt / Math.max(0.05, digSeconds(sim, target.x, target.y));
  } else {
    sim.digX = -1;
    sim.digY = -1;
    sim.digP = 0;
  }
  tickFall(sim, dt);
  tickWater(sim, dt);
  tickBelts(sim, dt);
  tickPumps(sim, dt);
  tickAbstract(sim);
  tickPackages(sim, dt);
}

let last = performance.now();
function frame(now) {
  const real = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (sim) {
    let left = real * sim.timeScale;
    while (left > 0) {
      const s = Math.min(1 / 40, left);
      step(s);
      left -= s;
    }
    sampleRates(rates, sim, real);
    updateCamera(view, sim, real);
    render(view, sim);
    hud.textContent = hudText(sim, rates);
  }
  requestAnimationFrame(frame);
}

const initial = (location.hash || "#hand").slice(1);
boot(initial);
resize(view);
requestAnimationFrame(frame);
