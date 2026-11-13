// Side-on earth column. Each block is a crop of a real photo.
// Textures are CC0 from Poly Haven (https://polyhaven.com):
//   topsoil, sand — already in the Godot look project, copied here
//   limestone — marble cliff 01
//   granite — seaside rock
//   pocket shoulders — dark rock 02
//   hot band — dark rock
//   ore flecks — rusty metal 02, pale metal removed
//   water pocket — crop of the pool HDRI
// Toys on the surface are drawn from simple shapes.

const COLS = 5;
const CELL = 100;
const GRAVITY = 2500;
const MIN_BREAK = 56;

const STRATA = [
  { name: "topsoil", rows: 2, tex: "topsoil" },
  { name: "sand", rows: 2, tex: "sand" },
  { name: "limestone", rows: 2, tex: "limestone" },
  { name: "granite", rows: 2, tex: "granite", ore: true },
  { name: "pocket", rows: 2, tex: "pocket", water: true },
  { name: "hot", rows: 2, tex: "hot", cracks: true },
];

const canvas = document.getElementById("view");
const hud = document.getElementById("hud");
const ctx = canvas.getContext("2d");

const params = new URLSearchParams(location.search);
const shot = params.get("shot") || "column";

const images = {};
let oreAtlas = null;
let crackCanvas = null;
let grainCanvas = null;
let bodies = [];
let columnLeft = 0;
let columnRight = 0;
let floorY = 0;
let wallL = 0;
let wallR = 0;
let hotOrigin = null;

let cssW = 1;
let cssH = 1;
let dpr = 1;
let zoom = 1;
let view = { x: 0, y: 0 };
let userMoved = false;

let fps = 0;
let fpsFrames = 0;
let fpsAccum = 0;
let lastTime = 0;

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function roundPath(x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

function pickCrop(img, seed, kind) {
  let minF = 0.22;
  let maxF = 0.4;
  if (kind === "limestone" || kind === "granite" || kind === "pocket" || kind === "hot") {
    minF = 0.14;
    maxF = 0.28;
  }
  if (kind === "water") {
    minF = 0.16;
    maxF = 0.3;
  }
  const fw = minF + hash(seed) * (maxF - minF);
  const fh = minF + hash(seed + 1) * (maxF - minF);
  const sw = img.naturalWidth * fw;
  const sh = img.naturalHeight * fh;
  const sx = hash(seed + 2) * (img.naturalWidth - sw);
  const sy = hash(seed + 3) * (img.naturalHeight - sh);
  return { sx, sy, sw, sh };
}

function buildOreAtlas(img) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const image = g.getImageData(0, 0, c.width, c.height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const gr = d[i + 1];
    const b = d[i + 2];
    const warm = r - b;
    // Keep the rust photo's mottling. Drop only the pale metal.
    if (warm > 18 && r > 80 && r < 236 && gr > 35 && r + 12 > gr) {
      d[i] = Math.min(255, r * 0.72 + 70);
      d[i + 1] = Math.min(255, gr * 0.55 + 28);
      d[i + 2] = Math.min(255, b * 0.22 + 8);
      d[i + 3] = clamp((warm - 10) * 3.4, 40, 230);
    } else {
      d[i + 3] = 0;
    }
  }
  g.putImageData(image, 0, 0);

  const spots = [];
  const step = 64;
  for (let y = 0; y <= c.height - step; y += step) {
    for (let x = 0; x <= c.width - step; x += step) {
      const patch = g.getImageData(x, y, step, step).data;
      let score = 0;
      for (let p = 3; p < patch.length; p += 16) score += patch[p];
      if (score > 400) spots.push({ x, y, score });
    }
  }
  spots.sort((a, b) => b.score - a.score);
  return { canvas: c, spots: spots.slice(0, 40) };
}

function makeFlecks(x, y, w, h, seed) {
  if (!oreAtlas || oreAtlas.spots.length === 0) return [];
  const flecks = [];
  const n = 1 + Math.floor(hash(seed) * 2.4);
  for (let i = 0; i < n; i++) {
    const spot = oreAtlas.spots[Math.floor(hash(seed + i * 19) * oreAtlas.spots.length)];
    const rx = 13 + hash(seed + 40 + i) * 14;
    flecks.push({
      x: x + rx + hash(seed + i) * Math.max(4, w - rx * 2),
      y: y + rx + hash(seed + 7 + i) * Math.max(4, h - rx * 2),
      rx,
      ry: rx * (0.7 + hash(seed + 11 + i) * 0.35),
      rot: (hash(seed + 13 + i) - 0.5) * 2.2,
      sx: spot.x,
      sy: spot.y,
      jag: 0.42 + hash(seed + 21 + i) * 0.2,
    });
  }
  return flecks;
}

function fleckPath(f) {
  const pts = 7;
  ctx.beginPath();
  for (let k = 0; k < pts; k++) {
    const a = f.rot + (k / pts) * Math.PI * 2;
    const j = f.jag + hash(f.sx * 0.01 + f.sy + k * 9.1) * 0.62;
    const px = f.x + Math.cos(a) * f.rx * j;
    const py = f.y + Math.sin(a) * f.ry * j;
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function bakeCracks(w, h, points) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const g = c.getContext("2d");
  g.lineCap = "round";
  g.lineJoin = "round";

  function branch(x, y, ang, depth, seed) {
    if (depth > 4) return;
    const len = (58 - depth * 9) * (0.65 + hash(seed) * 0.9);
    g.save();
    g.shadowColor = "rgba(255, 64, 8, 0.95)";
    g.shadowBlur = 14;
    g.strokeStyle = depth === 0 ? "rgba(255, 120, 24, 0.95)" : "rgba(255, 146, 36, 0.88)";
    g.lineWidth = Math.max(0.7, 2.4 - depth * 0.4);
    g.beginPath();
    g.moveTo(x, y);
    let px = x;
    let py = y;
    const steps = 8;
    let a = ang;
    for (let s = 1; s <= steps; s++) {
      a += (hash(seed + s * 3) - 0.5) * 0.95;
      px += Math.cos(a) * (len / steps);
      py += Math.sin(a) * (len / steps);
      g.lineTo(px, py);
    }
    g.stroke();
    g.shadowBlur = 0;
    g.strokeStyle = "rgba(255, 236, 190, 0.95)";
    g.lineWidth = Math.max(0.45, 1.05 - depth * 0.16);
    g.stroke();
    g.restore();
    if (hash(seed + 9) > 0.32) branch(px, py, a + 0.5, depth + 1, seed + 23);
    if (hash(seed + 10) > 0.48) branch(px, py, a - 0.65, depth + 1, seed + 47);
  }

  for (let i = 0; i < 14; i++) {
    branch(hash(i * 9 + 1) * c.width, hash(i * 9 + 2) * c.height, hash(i * 9 + 3) * Math.PI * 2, 0, 100 + i * 17);
  }
  for (const p of points) branch(p.x, p.y, p.ang, 0, p.seed);
  return c;
}

function makeGrain() {
  const c = document.createElement("canvas");
  c.width = 160;
  c.height = 160;
  const g = c.getContext("2d");
  for (let i = 0; i < 420; i++) {
    const light = hash(i * 5) > 0.55;
    g.fillStyle = light ? "rgba(255,248,236,0.35)" : "rgba(90,58,32,0.16)";
    g.fillRect(hash(i * 5 + 1) * 160, hash(i * 5 + 2) * 160, light ? 1.2 : 1.4, light ? 1.2 : 1.4);
  }
  return c;
}

function layout() {
  const xs = [0];
  for (let c = 1; c < COLS; c++) {
    xs.push(c * CELL + (hash(c * 23) - 0.5) * 22);
  }
  xs.push(COLS * CELL);
  columnLeft = xs[0];
  columnRight = xs[COLS];
  wallL = xs[0] + 1;
  wallR = xs[COLS] - 1;

  bodies = [];
  let y = 0;
  let rowIndex = 0;
  let seedBase = 20;
  hotOrigin = null;

  STRATA.forEach((stratum, si) => {
    for (let r = 0; r < stratum.rows; r++) {
      const rowH = CELL + (hash(rowIndex * 13 + 4) - 0.5) * 18;
      for (let c = 0; c < COLS; c++) {
        const inset = 1.6;
        const x = xs[c] + inset;
        const w = Math.max(24, xs[c + 1] - xs[c] - inset * 2);
        const by = y + inset;
        const h = Math.max(24, rowH - inset * 2);
        const edge = c === 0 || c === COLS - 1;
        let kind = stratum.name;
        let texName = stratum.tex;
        if (stratum.water && !edge) {
          kind = "water";
          texName = "water";
        }
        const img = images[texName];
        const seed = seedBase + c * 17 + r * 53 + si * 200;
        const crop = pickCrop(img, seed, kind);
        const block = {
          x,
          y: by,
          w,
          h,
          img,
          sx: crop.sx,
          sy: crop.sy,
          sw: crop.sw,
          sh: crop.sh,
          flip: hash(seed + 8) > 0.5,
          shade: 0.9 + hash(seed + 9) * 0.12,
          kind,
          ore: stratum.ore && kind === "granite",
          cracks: stratum.cracks,
          sheen: kind === "water" && r === 0,
          flecks: [],
          crack: null,
          fixed: true,
          vx: 0,
          vy: 0,
          grounded: true,
          radius: 3 + hash(seed + 4) * 2,
          col: c,
          stratum: stratum.name,
          stratumRow: r,
        };
        if (block.ore) block.flecks = makeFlecks(x, by, w, h, seed + 100);
        bodies.push(block);
        if (stratum.cracks) {
          if (!hotOrigin) hotOrigin = { x: xs[0], y: y, bottom: 0 };
          hotOrigin.bottom = y + rowH;
        }
      }
      y += rowH;
      rowIndex += 1;
    }
    if (si < STRATA.length - 1) y += 5;
  });

  floorY = y;
  if (hotOrigin) {
    const points = [];
    for (const b of bodies) {
      if (!b.cracks) continue;
      points.push({
        x: b.x - hotOrigin.x + b.w * (0.25 + hash(b.x) * 0.5),
        y: b.y - hotOrigin.y + b.h * (0.3 + hash(b.y) * 0.4),
        ang: hash(b.x + b.y) * Math.PI,
        seed: 400 + b.x + b.y,
      });
    }
    crackCanvas = bakeCracks(columnRight - hotOrigin.x, hotOrigin.bottom - hotOrigin.y, points);
    for (const b of bodies) {
      if (!b.cracks) continue;
      b.crack = {
        sx: b.x - hotOrigin.x,
        sy: b.y - hotOrigin.y,
        sw: b.w,
        sh: b.h,
      };
    }
  }
}

function breakBlock(b) {
  if (!b || b.w < MIN_BREAK || b.h < MIN_BREAK) return false;
  const cols = 2;
  const rows = 2;
  const gap = 3;
  const pw = (b.w - gap) / cols;
  const ph = (b.h - gap) / rows;
  if (pw < 16 || ph < 16) return false;
  const pieces = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = b.x + c * (pw + gap);
      const y = b.y + r * (ph + gap);
      const sw = b.sw * (pw / b.w);
      const sh = b.sh * (ph / b.h);
      const t = (x - b.x) / b.w;
      const sx = b.flip ? b.sx + b.sw * (1 - t - pw / b.w) : b.sx + b.sw * t;
      const sy = b.sy + b.sh * ((y - b.y) / b.h);
      const piece = {
        x,
        y,
        w: pw,
        h: ph,
        img: b.img,
        sx,
        sy,
        sw,
        sh,
        flip: b.flip,
        shade: b.shade,
        kind: b.kind,
        ore: b.ore,
        cracks: b.cracks,
        sheen: b.sheen && r === 0,
        flecks: [],
        crack: null,
        fixed: false,
        vx: (c - 0.5) * 18 + (hash(x * 3 + y) - 0.5) * 10,
        vy: 24 + r * 30 + hash(y * 5 + c) * 20,
        grounded: false,
        radius: 3,
        col: b.col,
        stratum: b.stratum,
        stratumRow: b.stratumRow,
      };
      if (b.crack) {
        piece.crack = {
          sx: b.crack.sx + b.crack.sw * ((x - b.x) / b.w),
          sy: b.crack.sy + b.crack.sh * ((y - b.y) / b.h),
          sw: b.crack.sw * (pw / b.w),
          sh: b.crack.sh * (ph / b.h),
        };
      }
      pieces.push(piece);
    }
  }
  for (const f of b.flecks) {
    let best = null;
    let bestD = Infinity;
    for (const p of pieces) {
      const cx = clamp(f.x, p.x, p.x + p.w);
      const cy = clamp(f.y, p.y, p.y + p.h);
      const d = (cx - f.x) * (cx - f.x) + (cy - f.y) * (cy - f.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (best) best.flecks.push(f);
  }
  const index = bodies.indexOf(b);
  if (index < 0) return false;
  bodies.splice(index, 1, ...pieces);
  return true;
}

function findBlock(stratum, stratumRow, col) {
  return bodies.find(
    (b) => b.fixed && b.stratum === stratum && b.stratumRow === stratumRow && b.col === col
  );
}

function solve() {
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    if (a.fixed) continue;
    if (a.y + a.h > floorY) {
      a.y = floorY - a.h;
      a.vy = a.vy > 220 ? -a.vy * 0.08 : 0;
      a.grounded = true;
    }
    if (a.x < wallL) {
      a.x = wallL;
      if (a.vx < 0) a.vx *= -0.12;
    }
    if (a.x + a.w > wallR) {
      a.x = wallR - a.w;
      if (a.vx > 0) a.vx *= -0.12;
    }
    for (let j = 0; j < bodies.length; j++) {
      if (i === j) continue;
      const b = bodies[j];
      if (!b.fixed && j < i) continue;
      if (!overlap(a, b)) continue;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      const aCx = a.x + a.w / 2;
      const aCy = a.y + a.h / 2;
      const bCx = b.x + b.w / 2;
      const bCy = b.y + b.h / 2;
      if (ox < oy) {
        const dir = aCx < bCx ? -1 : 1;
        const push = b.fixed ? ox : ox * 0.5;
        a.x += dir * push;
        if (!b.fixed) b.x -= dir * push;
        if ((dir < 0 && a.vx > 0) || (dir > 0 && a.vx < 0)) a.vx *= 0.2;
      } else if (aCy < bCy) {
        const push = b.fixed ? oy : oy * 0.5;
        a.y -= push;
        if (!b.fixed) b.y += push;
        a.vy = a.vy > 240 ? -a.vy * 0.05 : 0;
        a.grounded = true;
      } else {
        const push = b.fixed ? oy : oy * 0.5;
        a.y += push;
        if (!b.fixed) b.y -= push;
        if (a.vy < 0) a.vy = 0;
        if (!b.fixed && b.vy > 0) {
          b.vy = 0;
          b.grounded = true;
        }
      }
    }
  }
}

function restingOnSomething(a) {
  const y0 = a.y;
  a.y += 1.6;
  let hit = a.y + a.h >= floorY - 0.25;
  if (!hit) {
    for (const b of bodies) {
      if (b !== a && overlap(a, b)) {
        hit = true;
        break;
      }
    }
  }
  a.y = y0;
  return hit;
}

function substep(h) {
  for (const a of bodies) {
    if (a.fixed) continue;
    if (!a.grounded) a.vy = Math.min(1300, a.vy + GRAVITY * h);
    a.x += a.vx * h;
    a.y += a.vy * h;
    a.grounded = false;
  }
  for (let n = 0; n < 7; n++) solve();
  for (const a of bodies) {
    if (a.fixed) continue;
    if (a.vy >= 0 && restingOnSomething(a)) {
      a.grounded = true;
      a.vy = 0;
      a.vx *= 0.7;
      if (Math.abs(a.vx) < 12) a.vx = 0;
    }
  }
}

function step(dt) {
  const h = Math.min(0.034, Math.max(0.001, dt)) / 2;
  substep(h);
  substep(h);
}

function drawPaper() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#ead9c2";
  ctx.fillRect(0, 0, cssW, cssH);
  if (grainCanvas) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    const pattern = ctx.createPattern(grainCanvas, "repeat");
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.restore();
  }
  const vignette = ctx.createRadialGradient(
    cssW * 0.5,
    cssH * 0.45,
    Math.min(cssW, cssH) * 0.2,
    cssW * 0.5,
    cssH * 0.5,
    Math.max(cssW, cssH) * 0.72
  );
  vignette.addColorStop(0, "rgba(255, 244, 226, 0)");
  vignette.addColorStop(1, "rgba(150, 104, 62, 0.18)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, cssW, cssH);
}

function worldTransform() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(cssW / 2, cssH / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-view.x, -view.y);
}

function drawBevel(x, y, w, h) {
  const top = ctx.createLinearGradient(0, y, 0, y + Math.min(12, h * 0.22));
  top.addColorStop(0, "rgba(255, 248, 236, 0.28)");
  top.addColorStop(1, "rgba(255, 248, 236, 0)");
  ctx.fillStyle = top;
  ctx.fillRect(x, y, w, Math.min(12, h * 0.22));

  const bottom = ctx.createLinearGradient(0, y + h - Math.min(14, h * 0.28), 0, y + h);
  bottom.addColorStop(0, "rgba(0, 0, 0, 0)");
  bottom.addColorStop(1, "rgba(0, 0, 0, 0.4)");
  ctx.fillStyle = bottom;
  ctx.fillRect(x, y + h - Math.min(14, h * 0.28), w, Math.min(14, h * 0.28));

  const left = ctx.createLinearGradient(x, 0, x + 7, 0);
  left.addColorStop(0, "rgba(255, 248, 236, 0.14)");
  left.addColorStop(1, "rgba(255, 248, 236, 0)");
  ctx.fillStyle = left;
  ctx.fillRect(x, y, 7, h);

  const right = ctx.createLinearGradient(x + w - 9, 0, x + w, 0);
  right.addColorStop(0, "rgba(0, 0, 0, 0)");
  right.addColorStop(1, "rgba(0, 0, 0, 0.34)");
  ctx.fillStyle = right;
  ctx.fillRect(x + w - 9, y, 9, h);

  ctx.fillStyle = "rgba(255, 246, 230, 0.2)";
  ctx.fillRect(x + 1, y, w - 2, 1.2);
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.fillRect(x + 1, y + h - 1.5, w - 2, 1.5);
}

function drawBlock(b) {
  ctx.save();
  roundPath(b.x, b.y, b.w, b.h, b.radius);
  ctx.clip();

  ctx.save();
  if (b.flip) {
    ctx.translate(b.x + b.w, b.y);
    ctx.scale(-1, 1);
    ctx.drawImage(b.img, b.sx, b.sy, b.sw, b.sh, 0, 0, b.w, b.h);
  } else {
    ctx.drawImage(b.img, b.sx, b.sy, b.sw, b.sh, b.x, b.y, b.w, b.h);
  }
  ctx.restore();

  const shade = Math.round(clamp(b.shade, 0.75, 1) * 255);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "rgb(" + shade + "," + shade + "," + shade + ")";
  ctx.fillRect(b.x, b.y, b.w, b.h);
  if (b.kind === "water") {
    ctx.fillStyle = "rgb(186, 214, 208)";
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }
  ctx.globalCompositeOperation = "source-over";

  drawBevel(b.x, b.y, b.w, b.h);

  if (b.flecks.length && oreAtlas) {
    for (const f of b.flecks) {
      ctx.save();
      fleckPath(f);
      ctx.clip();
      ctx.drawImage(oreAtlas.canvas, f.sx, f.sy, 96, 96, f.x - f.rx, f.y - f.ry, f.rx * 2, f.ry * 2);
      ctx.restore();
    }
  }

  if (b.crack && crackCanvas) {
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(
      crackCanvas,
      b.crack.sx,
      b.crack.sy,
      b.crack.sw,
      b.crack.sh,
      b.x,
      b.y,
      b.w,
      b.h
    );
    ctx.globalCompositeOperation = "source-over";
  }

  if (b.sheen) {
    const sheen = ctx.createLinearGradient(0, b.y, 0, b.y + 14);
    sheen.addColorStop(0, "rgba(226, 255, 252, 0.55)");
    sheen.addColorStop(1, "rgba(226, 255, 252, 0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(b.x, b.y, b.w, 14);
  }

  ctx.restore();
}

function drawGrass(x, ground) {
  ctx.strokeStyle = "#6d7544";
  ctx.lineWidth = 1.3;
  ctx.lineCap = "round";
  const blades = [
    [-3, -11, -1],
    [0, -15, 0.4],
    [3, -10, 1.2],
  ];
  for (const [dx, dy, lean] of blades) {
    ctx.beginPath();
    ctx.moveTo(x + dx, ground);
    ctx.quadraticCurveTo(x + dx + lean, ground + dy * 0.55, x + dx + lean * 1.6, ground + dy);
    ctx.stroke();
  }
}

function drawSandbox(x, ground, w, h) {
  const top = ground - h;
  ctx.fillStyle = "rgba(70, 46, 28, 0.16)";
  ctx.beginPath();
  ctx.ellipse(x + w / 2, ground + 2, w * 0.42, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#a87449";
  roundPath(x, top, w, h, 3);
  ctx.fill();
  ctx.fillStyle = "#c49668";
  ctx.fillRect(x, top, w, 5);
  ctx.fillStyle = "#8a5c38";
  ctx.fillRect(x, top + h - 4, w, 4);

  ctx.fillStyle = "#e6c78a";
  roundPath(x + 6, top + 7, w - 12, h - 12, 2);
  ctx.fill();
  ctx.fillStyle = "#d2b075";
  for (let i = 0; i < 18; i++) {
    const px = x + 12 + hash(i + 3) * (w - 24);
    const py = top + 12 + hash(i * 7) * (h - 20);
    ctx.fillRect(px, py, 1.6, 1.6);
  }
}

function drawFigure(x, ground) {
  ctx.fillStyle = "rgba(70, 46, 28, 0.18)";
  ctx.beginPath();
  ctx.ellipse(x + 16, ground + 1, 13, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2f4158";
  roundPath(x + 7, ground - 28, 7, 24, 2);
  ctx.fill();
  roundPath(x + 17, ground - 28, 7, 24, 2);
  ctx.fill();
  ctx.fillStyle = "#4a3428";
  roundPath(x + 5, ground - 8, 11, 7, 2);
  ctx.fill();
  roundPath(x + 16, ground - 8, 12, 7, 2);
  ctx.fill();

  ctx.fillStyle = "#3d6ea8";
  roundPath(x + 6, ground - 50, 20, 24, 4);
  ctx.fill();
  ctx.strokeStyle = "#e2b48c";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x + 22, ground - 44);
  ctx.lineTo(x + 34, ground - 32);
  ctx.stroke();

  ctx.strokeStyle = "#8b6842";
  ctx.lineWidth = 2.3;
  ctx.beginPath();
  ctx.moveTo(x + 33, ground - 33);
  ctx.lineTo(x + 18, ground - 6);
  ctx.stroke();
  ctx.fillStyle = "#8ea4ae";
  ctx.beginPath();
  ctx.moveTo(x + 12, ground - 8);
  ctx.lineTo(x + 24, ground - 3);
  ctx.lineTo(x + 21, ground + 2);
  ctx.lineTo(x + 10, ground - 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#e6b898";
  ctx.beginPath();
  ctx.arc(x + 16, ground - 60, 8.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5c3b2c";
  ctx.beginPath();
  ctx.arc(x + 16, ground - 62.5, 8.2, Math.PI * 1.05, Math.PI * 1.95);
  ctx.fill();
  ctx.fillStyle = "#2b211c";
  ctx.beginPath();
  ctx.arc(x + 19, ground - 60, 1.05, 0, Math.PI * 2);
  ctx.fill();
}

function drawMachine(x, ground) {
  ctx.fillStyle = "rgba(70, 46, 28, 0.18)";
  ctx.beginPath();
  ctx.ellipse(x + 46, ground + 1, 40, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2a2a2a";
  roundPath(x + 8, ground - 16, 84, 16, 7);
  ctx.fill();
  ctx.fillStyle = "#1a1a1a";
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(x + 20 + i * 20, ground - 8, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5c5c5c";
    ctx.beginPath();
    ctx.arc(x + 20 + i * 20, ground - 8, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1a1a";
  }

  ctx.fillStyle = "#e0a31a";
  roundPath(x + 26, ground - 42, 58, 28, 4);
  ctx.fill();
  ctx.fillStyle = "#c98e12";
  roundPath(x + 52, ground - 58, 30, 22, 3);
  ctx.fill();
  ctx.fillStyle = "#243038";
  roundPath(x + 57, ground - 54, 18, 13, 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(x + 59, ground - 52, 6, 2);

  ctx.strokeStyle = "#d7a01a";
  ctx.lineWidth = 5.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x + 36, ground - 34);
  ctx.lineTo(x + 8, ground - 50);
  ctx.lineTo(x - 4, ground - 22);
  ctx.stroke();
  ctx.strokeStyle = "#b8860b";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(x + 8, ground - 48);
  ctx.lineTo(x + 22, ground - 30);
  ctx.stroke();

  ctx.fillStyle = "#c89210";
  ctx.beginPath();
  ctx.moveTo(x - 12, ground - 24);
  ctx.lineTo(x + 2, ground - 28);
  ctx.lineTo(x + 4, ground - 14);
  ctx.lineTo(x - 8, ground - 8);
  ctx.lineTo(x - 16, ground - 16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#8a6810";
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function drawToys() {
  const span = columnRight - columnLeft;
  const ground = 0;
  drawSandbox(columnLeft + span * 0.05, ground, span * 0.38, 36);
  drawFigure(columnLeft + span * 0.30, ground);
  drawMachine(columnLeft + span * 0.56, ground);
  const tufts = [0.03, 0.48, 0.9, 0.97];
  for (const t of tufts) drawGrass(columnLeft + span * t, ground);
}

function drawColumn() {
  const mid = (columnLeft + columnRight) / 2;
  const width = columnRight - columnLeft;

  const glow = ctx.createRadialGradient(mid, floorY, 8, mid, floorY + 6, width * 0.72);
  glow.addColorStop(0, "rgba(255, 110, 30, 0.16)");
  glow.addColorStop(1, "rgba(255, 110, 30, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(columnLeft - 40, floorY - 30, width + 80, 90);

  ctx.fillStyle = "rgba(86, 58, 36, 0.2)";
  ctx.beginPath();
  ctx.ellipse(mid, floorY + 16, width * 0.46, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#241710";
  roundPath(columnLeft - 7, -6, width + 14, floorY + 14, 10);
  ctx.fill();

  for (const b of bodies) {
    if (b.fixed) drawBlock(b);
  }
  for (const b of bodies) {
    if (!b.fixed) drawBlock(b);
  }
  drawToys();
}

function draw() {
  drawPaper();
  worldTransform();
  drawColumn();
}

function screenToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  return {
    x: view.x + (x - cssW / 2) / zoom,
    y: view.y + (y - cssH / 2) / zoom,
  };
}

function hitBlock(wx, wy) {
  for (let i = bodies.length - 1; i >= 0; i--) {
    const b = bodies[i];
    if (wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.h) return b;
  }
  return null;
}

function fitColumn() {
  const top = -150;
  const bottom = floorY + 46;
  const left = columnLeft - 36;
  const right = columnRight + 36;
  const worldW = right - left;
  const worldH = bottom - top;
  zoom = Math.min((cssW - 48) / worldW, (cssH - 56) / worldH);
  zoom = clamp(zoom, 0.3, 3);
  view.x = (left + right) / 2;
  view.y = (top + bottom) / 2;
}

function frameShot() {
  const span = columnRight - columnLeft;
  const mid = columnLeft + span / 2;
  if (shot === "surface") {
    zoom = fitZoom() * 1.85;
    view.x = mid;
    view.y = -20;
    return;
  }
  if (shot === "blocks") {
    const sample = findBlock("granite", 0, 2) || bodies[0];
    zoom = fitZoom() * 2.35;
    view.x = sample.x + sample.w / 2;
    view.y = sample.y + sample.h * 0.15;
    return;
  }
  if (shot === "hot") {
    const sample = bodies.find((b) => b.kind === "water" && b.col === 2) || findBlock("hot", 0, 2);
    zoom = fitZoom() * 2.05;
    view.x = mid;
    view.y = sample.y + sample.h;
    return;
  }
  fitColumn();
}

function fitZoom() {
  const top = -150;
  const bottom = floorY + 46;
  const left = columnLeft - 36;
  const right = columnRight + 36;
  return Math.min((cssW - 48) / (right - left), (cssH - 56) / (bottom - top));
}

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
}

function updateHud() {
  const text = (fps > 1 ? Math.round(fps) + " fps  ·  " : "") + bodies.length + " blocks";
  hud.textContent = text;
  document.documentElement.dataset.fps = fps.toFixed(1);
  document.documentElement.dataset.blocks = String(bodies.length);
  document.documentElement.dataset.ready = "1";
}

function loop(now) {
  const dt = lastTime ? (now - lastTime) / 1000 : 0.016;
  lastTime = now;
  fpsAccum += dt;
  fpsFrames += 1;
  if (fpsAccum >= 0.4) {
    fps = fpsFrames / fpsAccum;
    fpsFrames = 0;
    fpsAccum = 0;
    updateHud();
  }
  step(dt);
  draw();
  requestAnimationFrame(loop);
}

function bindInput() {
  let dragging = false;
  let moved = 0;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    moved = 0;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.classList.add("dragging");
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    lastX = event.clientX;
    lastY = event.clientY;
    if (moved > 4) {
      userMoved = true;
      view.x -= dx / zoom;
      view.y -= dy / zoom;
    }
  });

  function endPointer(event) {
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove("dragging");
    if (moved <= 5) {
      const world = screenToWorld(event.clientX, event.clientY);
      breakBlock(hitBlock(world.x, world.y));
      updateHud();
    }
  }

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      userMoved = true;
      const world = screenToWorld(event.clientX, event.clientY);
      const factor = Math.exp(-event.deltaY * 0.0011);
      zoom = clamp(zoom * factor, 0.35, 4);
      // Keep the point under the cursor fixed.
      const rect = canvas.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      view.x = world.x - (sx - cssW / 2) / zoom;
      view.y = world.y - (sy - cssH / 2) / zoom;
    },
    { passive: false }
  );
}

function settleBreaks() {
  const targets = [
    findBlock("limestone", 0, 2),
    findBlock("limestone", 1, 2),
    findBlock("granite", 0, 1),
    findBlock("granite", 1, 3),
  ];
  for (const block of targets) breakBlock(block);
  for (let i = 0; i < 220; i++) step(1 / 60);
}

function boot() {
  images.topsoil = document.getElementById("tex-topsoil");
  images.sand = document.getElementById("tex-sand");
  images.limestone = document.getElementById("tex-limestone");
  images.granite = document.getElementById("tex-granite");
  images.pocket = document.getElementById("tex-pocket");
  images.hot = document.getElementById("tex-hot");
  images.water = document.getElementById("tex-water");
  oreAtlas = buildOreAtlas(document.getElementById("tex-ore"));
  grainCanvas = makeGrain();
  resize();
  layout();
  if (shot === "break") settleBreaks();
  frameShot();
  updateHud();
  draw();
  bindInput();
  requestAnimationFrame(loop);
  window.__look = {
    get fps() {
      return fps;
    },
    get blocks() {
      return bodies.length;
    },
    get zoom() {
      return zoom;
    },
  };
}

window.addEventListener("resize", () => {
  resize();
  if (!userMoved && shot === "column") fitColumn();
  draw();
});

if (document.readyState === "complete") boot();
else window.addEventListener("load", boot);
