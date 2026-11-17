// Placeholder procedural planet maps. They are equirectangular canvases generated
// once per rendered planet seed and cached, so every pocket can have a different
// body without shipping binary textures yet. A future data table can replace this
// with hand-authored WebP maps; the call sites pass the same `planet` record.

import * as THREE from "three";

const cache = new Map();

function hashString(value) {
  let h = 0x811c9dc5;
  const text = String(value);
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const color = hex => `#${Number(hex).toString(16).padStart(6, "0")}`;
const shade = (hex, amount) => {
  const n = Number(hex);
  const scale = amount;
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) * scale));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) * scale));
  const b = Math.max(0, Math.min(255, (n & 255) * scale));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
};

export function planetTexture(planet) {
  const key = `${planet?.classId || "rocky"}:${planet?.seed || 1}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const w = 512, h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  const rng = mulberry32(hashString(key));
  const base = Number(planet?.col ?? 0x8a6d4b);
  const dark = Number(planet?.dark ?? 0x201915);
  const colA = color(base), colB = color(dark);

  if (planet?.classId === "gas") {
    // Horizontal bands with soft turbulence; no hard stripe edges.
    const yBands = 12 + Math.floor(rng() * 6);
    for (let y = 0; y < h; y++) {
      const t = y / h;
      const wave = Math.sin((t * yBands * Math.PI * 2) + Math.sin(t * 19 + rng() * 2) * 1.7);
      const band = (wave + 1) / 2;
      const streak = Math.sin(t * 47 + Math.sin(t * 9 + rng() * 3) * 2.5) * 0.5 + 0.5;
      const mix = band * 0.62 + streak * 0.22;
      ctx.fillStyle = mix > 0.5 ? shadeToHex(base, 0.72 + mix * 0.55) : shadeToHex(dark, 0.75 + mix * 0.8);
      ctx.fillRect(0, y, w, 1);
    }
    // A few storm ovals; deliberately sparse so the star-facing side never reads busy.
    for (let i = 0; i < 16; i++) {
      const x = rng() * w, y = h * (0.18 + rng() * 0.64), rx = 10 + rng() * 42, ry = 3 + rng() * 10;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(rx / ry, 1);
      ctx.fillStyle = `rgba(255,235,190,${0.08 + rng() * 0.13})`;
      ctx.beginPath(); ctx.arc(0, 0, ry, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  } else if (planet?.classId === "ice") {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, shadeToHex(base, 1.15));
    grad.addColorStop(0.45, shadeToHex(base, 0.72));
    grad.addColorStop(1, shadeToHex(dark, 0.75));
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    // Long frozen stress lines and pale continents.
    for (let i = 0; i < 42; i++) {
      ctx.strokeStyle = `rgba(235,250,255,${0.12 + rng() * 0.2})`;
      ctx.lineWidth = 1 + rng() * 5;
      ctx.beginPath();
      const y = rng() * h;
      ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 18) ctx.lineTo(x, y + Math.sin(x * 0.021 + i) * (8 + rng() * 28));
      ctx.stroke();
    }
    drawMottle(ctx, rng, w, h, "rgba(36,68,82,0.20)", 26);
  } else if (planet?.classId === "volcanic") {
    ctx.fillStyle = shadeToHex(base, 0.72); ctx.fillRect(0, 0, w, h);
    drawMottle(ctx, rng, w, h, "rgba(26,18,14,0.72)", 34);
    // Branching lava cracks: bright cores with wide darker halos.
    for (let i = 0; i < 22; i++) {
      let x = rng() * w, y = rng() * h, angle = rng() * Math.PI * 2;
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? "rgba(255,126,38,0.92)" : "rgba(80,18,4,0.95)";
        ctx.lineWidth = pass ? 2.2 : 6.5;
        ctx.beginPath(); ctx.moveTo(x, y);
        let cx = x, cy = y, a = angle;
        for (let step = 0; step < 16; step++) {
          a += (rng() - 0.5) * 1.25;
          cx += Math.cos(a) * (12 + rng() * 26);
          cy += Math.sin(a) * (8 + rng() * 18);
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }
    }
  } else {
    // Rocky worlds: mottled continents, impact basins and highland noise.
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, shadeToHex(base, 1.12));
    grad.addColorStop(0.5, shadeToHex(base, 0.78));
    grad.addColorStop(1, shadeToHex(dark, 0.9));
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    drawMottle(ctx, rng, w, h, "rgba(62,43,27,0.35)", 34);
    for (let i = 0; i < 44; i++) {
      const x = rng() * w, y = rng() * h, r = 2 + rng() * 17;
      ctx.fillStyle = `rgba(28,20,12,${0.16 + rng() * 0.22})`;
      ctx.beginPath(); ctx.ellipse(x, y, r * (0.8 + rng()), r * (0.45 + rng() * 0.8), rng() * Math.PI, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,235,205,0.12)";
      ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r * 0.7, Math.PI * 1.05, Math.PI * 1.85); ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  texture.anisotropy = 2;
  texture.needsUpdate = true;
  cache.set(key, texture);
  return texture;
}

function shadeToHex(hex, scale) {
  const n = Number(hex);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * scale)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * scale)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * scale)));
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, "0")).join("")}`;
}

function drawMottle(ctx, rng, w, h, fillStyle, count) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = fillStyle;
    const x = rng() * w, y = rng() * h, r = 8 + rng() * 42;
    ctx.beginPath(); ctx.ellipse(x, y, r * (0.7 + rng()), r * (0.45 + rng() * 0.8), rng() * Math.PI, 0, Math.PI * 2); ctx.fill();
  }
}
