// Side camera. Cells are painted into an ImageData the size of the visible
// grid, then scaled onto the viewport. Never one DOM node per cell.

import {
  MAT,
  MAT_RGB,
  SKY_RGB,
  UNDER_RGB,
  BALANCE,
  temperatureC,
  abstractLine,
  depthCm,
  excavatedVolume,
} from "./sim.js";

export function createView(canvas) {
  const ctx = canvas.getContext("2d", { alpha: false });
  const off = document.createElement("canvas");
  const offCtx = off.getContext("2d", { alpha: false });
  return {
    canvas,
    ctx,
    off,
    offCtx,
    camX: 0,
    camY: 0,
    cssW: 1,
    cssH: 1,
    dpr: 1,
    viewW: 1,
    viewH: 1,
  };
}

export function resize(view) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = Math.max(1, view.canvas.clientWidth);
  const cssH = Math.max(1, view.canvas.clientHeight);
  view.canvas.width = Math.floor(cssW * dpr);
  view.canvas.height = Math.floor(cssH * dpr);
  view.cssW = cssW;
  view.cssH = cssH;
  view.dpr = dpr;
}

export function updateCamera(view, sim, dt) {
  const zoom = sim.zoom;
  const pw = view.cssW / zoom;
  const ph = view.cssH / zoom;
  if (!sim.follow) {
    const speed = (180 / sim.cellCm) * dt;
    if (sim.camKeys.j) view.camX -= speed;
    if (sim.camKeys.l) view.camX += speed;
    if (sim.camKeys.i) view.camY -= speed;
    if (sim.camKeys.k) view.camY += speed;
  } else {
    view.camX = sim.player.x + sim.player.w / 2 - pw / 2;
    view.camY = sim.player.y + sim.player.h / 2 - ph / 2;
  }
  view.camX = clamp(view.camX, 0, Math.max(0, sim.w - pw));
  view.camY = clamp(view.camY, 0, Math.max(0, sim.h - ph));
  view.viewW = pw;
  view.viewH = ph;
}

export function screenToCell(view, sim, cssX, cssY) {
  return {
    x: Math.floor(view.camX + cssX / sim.zoom),
    y: Math.floor(view.camY + cssY / sim.zoom),
  };
}

function clamp(v, a, b) {
  if (v < a) return a;
  if (v > b) return b;
  return v;
}

function shade(rgb, x, y, sim, mat, coolers) {
  let r = rgb[0];
  let g = rgb[1];
  let b = rgb[2];
  if (mat === MAT.BELT) {
    const stripe = ((x + Math.floor(sim.time * 6)) & 3) === 0;
    if (stripe) {
      r += 28;
      g += 28;
      b += 28;
    }
  }
  if (sim.heatMode !== "off" && mat !== MAT.AIR && mat !== MAT.WATER && mat !== MAT.PROP) {
    let t = BALANCE.surfaceC + Math.max(0, (y - sim.surfaceCell) * sim.cellCm) / 100 * sim.gradient;
    for (let i = 0; i < coolers.length; i++) {
      const dx = (coolers[i].x - x) * sim.cellCm;
      const dy = (coolers[i].y - y) * sim.cellCm;
      if (dx * dx + dy * dy < 80 * 80) {
        t = temperatureC(sim, x, y);
        break;
      }
    }
    const k = Math.max(0, Math.min(1, (t - 16) / 70));
    r = Math.min(255, r + k * 110);
    g = Math.max(0, g * (1 - k * 0.45));
    b = Math.max(0, b * (1 - k * 0.55));
  }
  if (x === sim.digX && y === sim.digY) {
    const f = 50 + sim.digP * 120;
    r = Math.min(255, r + f);
    g = Math.min(255, g + f);
    b = Math.min(255, b + f * 0.7);
  }
  return [r & 255, g & 255, b & 255];
}

export function render(view, sim) {
  const ctx = view.ctx;
  const dpr = view.dpr;
  const z = sim.zoom * dpr;
  ctx.fillStyle = "#8eb4cc";
  ctx.fillRect(0, 0, view.canvas.width, view.canvas.height);

  const x0 = Math.max(0, Math.floor(view.camX));
  const y0 = Math.max(0, Math.floor(view.camY));
  const x1 = Math.min(sim.w, Math.ceil(view.camX + view.viewW));
  const y1 = Math.min(sim.h, Math.ceil(view.camY + view.viewH));
  const cw = Math.max(1, x1 - x0);
  const ch = Math.max(1, y1 - y0);
  if (view.off.width !== cw || view.off.height !== ch) {
    view.off.width = cw;
    view.off.height = ch;
  }
  const img = view.offCtx.createImageData(cw, ch);
  const data = img.data;
  const grid = sim.grid;
  const w = sim.w;
  const openTo = new Int16Array(sim.w);
  for (let x = x0; x < x1; x++) {
    let y = 0;
    while (y < sim.h && grid[y * w + x] === MAT.AIR) y++;
    openTo[x] = y;
  }
  const heat = sim.heatMode !== "off";
  const coolers = [];
  if (heat) {
    for (let i = 0; i < sim.machines.length; i++) {
      if (sim.machines[i].mat === MAT.COOLER) coolers.push(sim.machines[i]);
    }
  }
  let p = 0;
  for (let y = y0; y < y1; y++) {
    const row = y * w;
    for (let x = x0; x < x1; x++) {
      const mat = grid[row + x];
      const open = mat === MAT.AIR && y < openTo[x];
      let rgb = mat === MAT.AIR ? (open ? SKY_RGB : UNDER_RGB) : MAT_RGB[mat];
      if (heat || mat === MAT.BELT || (x === sim.digX && y === sim.digY)) {
        rgb = shade(rgb, x, y, sim, mat, coolers);
      }
      data[p++] = rgb[0];
      data[p++] = rgb[1];
      data[p++] = rgb[2];
      data[p++] = 255;
    }
  }
  view.offCtx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = sim.zoom < 2;
  const dx = (x0 - view.camX) * z;
  const dy = (y0 - view.camY) * z;
  ctx.drawImage(view.off, dx, dy, cw * z, ch * z);

  drawAbstractLine(ctx, view, sim, z);
  drawCart(ctx, view, sim, z);
  drawPackages(ctx, view, sim, z);
  drawPlayer(ctx, view, sim, z);
  drawDepth(ctx, view, sim);
}

function drawAbstractLine(ctx, view, sim, z) {
  const y = abstractLine(sim);
  if (y < 0) return;
  const py = (y - view.camY) * z;
  ctx.save();
  ctx.strokeStyle = "rgba(220, 200, 120, 0.55)";
  ctx.setLineDash([6 * view.dpr, 5 * view.dpr]);
  ctx.lineWidth = view.dpr;
  ctx.beginPath();
  ctx.moveTo(0, py);
  ctx.lineTo(view.canvas.width, py);
  ctx.stroke();
  ctx.restore();
}

function drawCart(ctx, view, sim, z) {
  const c = sim.cart;
  if (!c) return;
  const x = (c.x - view.camX) * z;
  const y = (c.y - view.camY) * z;
  ctx.fillStyle = "#6e4a2c";
  ctx.fillRect(x, y, c.w * z, c.h * z);
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(x, y + c.h * z * 0.72, c.w * z, c.h * z * 0.28);
}

function drawPackages(ctx, view, sim, z) {
  for (let i = 0; i < sim.packages.length; i++) {
    const p = sim.packages[i];
    const rgb = MAT_RGB[p.mat] || [200, 200, 200];
    const cells = Math.max(2, Math.min(10, Math.ceil(Math.sqrt(p.count))));
    const w = cells * z * 0.85;
    const h = w * 0.7;
    const x = (p.x - view.camX) * z - w / 2;
    const y = (p.y - view.camY) * z - h / 2;
    ctx.fillStyle = "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.strokeRect(x, y, w, h);
  }
}

function drawPlayer(ctx, view, sim, z) {
  const p = sim.player;
  const x = (p.x - view.camX) * z;
  const y = (p.y - view.camY) * z;
  const w = p.w * z;
  const h = p.h * z;
  ctx.fillStyle = "#e4c89a";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(50, 36, 22, 0.85)";
  ctx.lineWidth = Math.max(1, view.dpr);
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = p.tool === "drill" ? "#d7dde6" : "#d08a45";
  const tw = Math.max(z * 0.8, w * 0.28);
  const th = Math.max(z * 0.45, h * 0.12);
  let tx = x + w * 0.7;
  let ty = y + h * 0.55;
  if (p.facing === "left") tx = x - tw;
  else if (p.facing === "up") {
    tx = x + w * 0.35;
    ty = y - th;
  } else if (p.facing === "down") {
    tx = x + w * 0.35;
    ty = y + h;
  }
  ctx.fillRect(tx, ty, tw, th);
}

function drawDepth(ctx, view, sim) {
  const d = Math.round(depthCm(sim));
  const lines = [d + " cm"];
  if (sim.depthStyle === "earth") {
    const pct = (d / BALANCE.earthCm) * 100;
    lines.push("of 6,371 km");
    lines.push(pct.toFixed(8) + "%");
  }
  if (sim.volume) {
    const vol = excavatedVolume(sim);
    if (vol.m3 >= 1) lines.push(vol.m3.toFixed(2) + " m3");
    else lines.push(vol.litres.toFixed(vol.litres >= 10 ? 0 : 1) + " L");
  }
  const pad = 10 * view.dpr;
  ctx.font = Math.round(13 * view.dpr) + "px ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  const lineH = 16 * view.dpr;
  let y = view.canvas.height - pad;
  for (let i = lines.length - 1; i >= 0; i--) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    const w = ctx.measureText(lines[i]).width;
    ctx.fillRect(pad - 4, y - lineH + 3, w + 8, lineH);
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.fillText(lines[i], pad, y);
    y -= lineH;
  }
}
