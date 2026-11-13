// DOM debug panel (F1) and the always-on rate overlay.

var PRESETS = [
  {
    id: "hand",
    label: "Hand",
    haul: "hand",
    water: "off",
    heat: "off",
    craft: false,
    craftAt: "station",
    worldMode: "full",
    shafts: 1,
    chamber: "free",
    timeScale: 1,
    cellCm: 1,
    zoom: 8,
    depthStyle: "cm",
    volume: false,
    follow: true,
    predig: false,
    predigDeep: false,
    belts: false,
    seedPackages: false,
    gradient: 22,
    kitPump: 0,
    kitCooler: 0,
    kitBelt: 0,
  },
  {
    id: "bucket",
    label: "Bucket",
    haul: "bucket",
    water: "off",
    heat: "off",
    craft: false,
    craftAt: "station",
    worldMode: "full",
    shafts: 1,
    chamber: "free",
    timeScale: 1,
    cellCm: 1,
    zoom: 8,
    depthStyle: "cm",
    volume: false,
    follow: true,
    predig: false,
    belts: false,
    seedPackages: false,
    gradient: 22,
    kitPump: 0,
    kitCooler: 0,
    kitBelt: 0,
  },
  {
    id: "cart",
    label: "Cart",
    haul: "cart",
    water: "off",
    heat: "off",
    craft: false,
    craftAt: "station",
    worldMode: "full",
    shafts: 1,
    chamber: "free",
    timeScale: 1,
    cellCm: 1,
    zoom: 6,
    depthStyle: "cm",
    volume: false,
    follow: true,
    predig: false,
    belts: false,
    seedPackages: false,
    gradient: 22,
    kitPump: 0,
    kitCooler: 0,
    kitBelt: 0,
  },
  {
    id: "belt",
    label: "Belt",
    haul: "belt",
    water: "off",
    heat: "off",
    craft: false,
    craftAt: "station",
    worldMode: "full",
    shafts: 1,
    chamber: "free",
    timeScale: 1,
    cellCm: 1,
    zoom: 5,
    depthStyle: "cm",
    volume: false,
    follow: true,
    predig: false,
    belts: true,
    seedPackages: false,
    gradient: 22,
    kitPump: 0,
    kitCooler: 0,
    kitBelt: 30,
  },
  {
    id: "water",
    label: "Water",
    haul: "bucket",
    water: "slow",
    heat: "off",
    craft: false,
    craftAt: "station",
    worldMode: "full",
    shafts: 1,
    chamber: "free",
    timeScale: 1,
    cellCm: 1,
    zoom: 4,
    depthStyle: "cm",
    volume: false,
    follow: true,
    predig: true,
    predigDeep: true,
    belts: false,
    seedPackages: false,
    gradient: 22,
    kitPump: 1,
    kitCooler: 0,
    kitBelt: 0,
  },
  {
    id: "heat",
    label: "Heat",
    haul: "hand",
    water: "off",
    heat: "slow",
    craft: false,
    craftAt: "station",
    worldMode: "full",
    shafts: 1,
    chamber: "free",
    timeScale: 1,
    cellCm: 1,
    zoom: 4,
    depthStyle: "cm",
    volume: false,
    follow: true,
    predig: true,
    predigDeep: true,
    belts: false,
    seedPackages: false,
    gradient: 28,
    kitPump: 0,
    kitCooler: 1,
    kitBelt: 0,
  },
  {
    id: "craft",
    label: "Craft",
    haul: "hand",
    water: "off",
    heat: "off",
    craft: true,
    craftAt: "station",
    worldMode: "full",
    shafts: 1,
    chamber: "free",
    timeScale: 1,
    cellCm: 1,
    zoom: 5,
    depthStyle: "cm",
    volume: false,
    follow: true,
    predig: true,
    predigDeep: false,
    belts: false,
    seedPackages: false,
    gradient: 22,
    kitPump: 0,
    kitCooler: 0,
    kitBelt: 0,
  },
  {
    id: "full-sim",
    label: "Full sim",
    haul: "belt",
    water: "slow",
    heat: "meter",
    craft: true,
    craftAt: "station",
    worldMode: "full",
    shafts: 1,
    chamber: "free",
    timeScale: 1,
    cellCm: 1,
    zoom: 1.4,
    depthStyle: "earth",
    volume: false,
    follow: true,
    predig: true,
    predigDeep: true,
    belts: true,
    seedPackages: false,
    gradient: 22,
    kitPump: 1,
    kitCooler: 1,
    kitBelt: 20,
  },
  {
    id: "abstract-shaft",
    label: "Abstract shaft",
    haul: "belt",
    water: "off",
    heat: "off",
    craft: false,
    craftAt: "station",
    worldMode: "abstract",
    shafts: 1,
    chamber: "free",
    timeScale: 1,
    cellCm: 1,
    zoom: 3,
    depthStyle: "cm",
    volume: false,
    follow: true,
    predig: true,
    predigDeep: true,
    belts: true,
    seedPackages: true,
    gradient: 22,
    kitPump: 0,
    kitCooler: 0,
    kitBelt: 20,
  },
  {
    id: "time-scale",
    label: "Time scale",
    haul: "hand",
    water: "off",
    heat: "off",
    craft: false,
    craftAt: "station",
    worldMode: "full",
    shafts: 1,
    chamber: "free",
    timeScale: 4,
    cellCm: 1,
    zoom: 8,
    depthStyle: "cm",
    volume: false,
    follow: true,
    predig: false,
    belts: false,
    seedPackages: false,
    gradient: 22,
    kitPump: 0,
    kitCooler: 0,
    kitBelt: 0,
  },
];

function presetById(id) {
  return PRESETS.find((p) => p.id === id) || PRESETS[0];
}

function createRates() {
  return {
    fps: 0,
    dugS: 0,
    haulS: 0,
    frames: 0,
    acc: 0,
    dug0: 0,
    haul0: 0,
  };
}

function sampleRates(rates, sim, realDt) {
  rates.frames++;
  rates.acc += realDt;
  if (rates.acc < 0.5) return;
  rates.fps = rates.frames / rates.acc;
  rates.dugS = (sim.stats.dug - rates.dug0) / rates.acc;
  rates.haulS = (sim.stats.hauled - rates.haul0) / rates.acc;
  rates.frames = 0;
  rates.acc = 0;
  rates.dug0 = sim.stats.dug;
  rates.haul0 = sim.stats.hauled;
}

function hudText(sim, rates) {
  const cells = countCells(sim);
  const carry = carryLine(sim);
  const lines = [
    "fps " + rates.fps.toFixed(0),
    "cells " + cells.grid + "   solid " + cells.solid + "   water " + cells.water,
    "entities " + entityCount(sim) + "   pkg " + packageCells(sim),
    "px dug/s " + rates.dugS.toFixed(1) + "   spoil/s " + rates.haulS.toFixed(1),
    "carry " + carry.n + "/" + carry.cap + "   cart " + carry.cartN + "/" + BALANCE.cartCap,
    "tool " + sim.player.tool + (carry.toolN ? " (" + carry.toolN + " ingot)" : "")
      + "   time " + sim.timeScale + "×",
    "mass Δ " + massDelta(sim),
  ];
  if (sim.waterMode !== "off") lines.push("water " + sim.waterMode);
  if (sim.heatMode !== "off") {
    const t = temperatureC(sim, Math.floor(sim.player.x + sim.player.w / 2), Math.floor(sim.player.y + sim.player.h));
    lines.push("heat " + sim.heatMode + "   " + t.toFixed(0) + "°C   grad " + sim.gradient + "°C/m");
  }
  if (sim.status) lines.push(sim.status);
  lines.push(sim.preset + " · " + sim.worldMode + " · " + sim.haul + " · " + sim.cellCm + " cm/cell · depth " + Math.round(depthCm(sim)) + " cm");
  return lines.join("\n");
}

function packageCells(sim) {
  let n = 0;
  for (let i = 0; i < sim.packages.length; i++) n += sim.packages[i].count;
  return n;
}

function select(label, value, options, onChange) {
  const wrap = document.createElement("label");
  wrap.className = "row";
  const span = document.createElement("span");
  span.textContent = label;
  const sel = document.createElement("select");
  for (let i = 0; i < options.length; i++) {
    const opt = document.createElement("option");
    opt.value = options[i].value;
    opt.textContent = options[i].label;
    if (String(options[i].value) === String(value)) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => onChange(sel.value));
  wrap.appendChild(span);
  wrap.appendChild(sel);
  return wrap;
}

function check(label, value, onChange) {
  const wrap = document.createElement("label");
  wrap.className = "row";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = !!value;
  input.addEventListener("change", () => onChange(input.checked));
  const span = document.createElement("span");
  span.textContent = label;
  wrap.appendChild(input);
  wrap.appendChild(span);
  return wrap;
}

function mountPanel(panel, sim, hooks) {
  panel.textContent = "";
  const h = document.createElement("h2");
  h.textContent = "Debug";
  panel.appendChild(h);
  const note = document.createElement("p");
  note.className = "note";
  note.textContent = "Presets rebuild the slice. The controls under Live apply immediately. Pixel size rebuilds, because the grid changes.";
  panel.appendChild(note);

  const presets = document.createElement("div");
  presets.className = "presets";
  for (let i = 0; i < PRESETS.length; i++) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = PRESETS[i].label;
    if (PRESETS[i].id === sim.preset) b.className = "on";
    b.addEventListener("click", () => hooks.onPreset(PRESETS[i].id));
    presets.appendChild(b);
  }
  panel.appendChild(presets);

  const live = document.createElement("h3");
  live.textContent = "Live";
  panel.appendChild(live);

  panel.appendChild(select("Haul", sim.haul, [
    { value: "hand", label: "Hand (8)" },
    { value: "bucket", label: "Bucket (32)" },
    { value: "cart", label: "Cart (120) + hands" },
    { value: "belt", label: "Belt + hands (8)" },
  ], (v) => hooks.onLive({ haul: v })));

  panel.appendChild(select("Water", sim.waterMode, [
    { value: "off", label: "Off" },
    { value: "slow", label: "Slow seep" },
    { value: "aggressive", label: "Aggressive fill" },
  ], (v) => hooks.onLive({ waterMode: v })));

  panel.appendChild(select("Heat", sim.heatMode, [
    { value: "off", label: "Off" },
    { value: "meter", label: "Meter only" },
    { value: "slow", label: "Meter + slowdown" },
  ], (v) => hooks.onLive({ heatMode: v })));

  panel.appendChild(select("Gradient", String(sim.gradient), [
    { value: "12", label: "12 °C/m" },
    { value: "22", label: "22 °C/m" },
    { value: "40", label: "40 °C/m" },
  ], (v) => hooks.onLive({ gradient: Number(v) })));

  panel.appendChild(select("Time scale", String(sim.timeScale), [
    { value: "1", label: "1×" },
    { value: "2", label: "2×" },
    { value: "4", label: "4×" },
    { value: "8", label: "8×" },
  ], (v) => hooks.onLive({ timeScale: Number(v) })));

  panel.appendChild(select("Shafts", String(sim.shafts), [
    { value: "1", label: "One shaft" },
    { value: "2", label: "Allow a second" },
  ], (v) => hooks.onLive({ shafts: Number(v) })));

  panel.appendChild(select("Chamber", sim.chamber, [
    { value: "free", label: "Free width" },
    { value: "limited", label: "Limited width" },
  ], (v) => hooks.onLive({ chamber: v })));

  panel.appendChild(select("World", sim.worldMode, [
    { value: "full", label: "Full simulation" },
    { value: "abstract", label: "Window + abstract shaft" },
  ], (v) => hooks.onLive({ worldMode: v })));

  panel.appendChild(select("Craft at", sim.craftAt, [
    { value: "station", label: "Placed station" },
    { value: "bench", label: "Bench" },
  ], (v) => hooks.onLive({ craftAt: v })));

  panel.appendChild(check("Craft recipes", sim.craft, (v) => hooks.onLive({ craft: v })));
  panel.appendChild(check("Camera follows", sim.follow, (v) => hooks.onLive({ follow: v })));
  panel.appendChild(check("Depth: of 6,371 km", sim.depthStyle === "earth", (v) => {
    hooks.onLive({ depthStyle: v ? "earth" : "cm" });
  }));
  panel.appendChild(check("Excavated volume", sim.volume, (v) => hooks.onLive({ volume: v })));

  const rebuild = document.createElement("h3");
  rebuild.textContent = "Rebuilds";
  panel.appendChild(rebuild);
  panel.appendChild(select("Pixel size", String(sim.cellCm), [
    { value: "1", label: "1 cm" },
    { value: "2", label: "2 cm" },
  ], (v) => hooks.onPixel(Number(v))));

  const help = document.createElement("p");
  help.className = "note";
  help.textContent = "A/D move. W jumps, and climbs when you hold it into a wall. S faces down. Hold the mouse or F to dig the facing cell. G dumps in front of you (or the cart, in cart mode, when you are beside it). E uses the bench or station, loads the cart, or picks up an ingot. K seals with soil or sand. P pump, O cooler, L belt, T sets the drill down. [ ] zoom. IJKL moves a free camera. F1 hides this panel.";
  panel.appendChild(help);

  const nums = document.createElement("p");
  nums.className = "note";
  nums.textContent = "Hand 8, bucket 32, cart 120. Dig times (shovel): sand 0.08s, soil 0.22s, soft 0.55s, hard 1.3s, ore 0.9s. Drill ×0.35, separate from time scale. Slice is 1 m thick: a 1 cm cell is 0.1 L. Heat gradient is exaggerated so a few metres can slow the tool.";
  panel.appendChild(nums);
}

function applyLive(sim, patch) {
  if (patch.haul) sim.haul = patch.haul;
  if (patch.waterMode) sim.waterMode = patch.waterMode;
  if (patch.heatMode) sim.heatMode = patch.heatMode;
  if (patch.gradient != null) sim.gradient = patch.gradient;
  if (patch.timeScale) sim.timeScale = patch.timeScale;
  if (patch.shafts) sim.shafts = patch.shafts;
  if (patch.chamber) {
    sim.chamber = patch.chamber;
    sim.chamberExtra = patch.chamber === "limited" ? 0 : Math.floor(80 / sim.cellCm);
  }
  if (patch.worldMode) sim.worldMode = patch.worldMode;
  if (patch.craftAt) sim.craftAt = patch.craftAt;
  if (patch.craft != null) sim.craft = patch.craft;
  if (patch.follow != null) sim.follow = patch.follow;
  if (patch.depthStyle) sim.depthStyle = patch.depthStyle;
  if (patch.volume != null) sim.volume = patch.volume;
}
