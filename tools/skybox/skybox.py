#!/usr/bin/env python3
"""
Tallow Reach skybox generator.

Makes dark, photographic-looking equirectangular space panoramas (4096x2048 by default; 8192x4096
on request) that the game wraps around the inside of its sky sphere.

    python3 tools/skybox/skybox.py presets                      # what looks are available
    python3 tools/skybox/skybox.py make my_sky --preset ember   # render to ./skybox-out/ (safe to experiment)
    python3 tools/skybox/skybox.py make my_sky --preset ember --install   # ... and put it in the game
    python3 tools/skybox/skybox.py check path/to/image.webp     # brightness / seam / size report

Needs only numpy and Pillow (with WebP support). Nothing here is part of the game bundle.
Read tools/skybox/README.md first: it is written for the AI assistants that drive this tool.

How the picture is made (so a number here is never a mystery):
  * every layer is a function of the DIRECTION a pixel looks in (a unit vector), never of its x/y,
    so the picture has no seam at the left/right edge and no pinching at the poles;
  * light is built in linear HDR: a faint background, a luminous gas that follows the palette, dark
    dust clouds IN FRONT of it (rim-lit where they are thin), an optional Milky-Way-style band, and
    stars drawn with a realistic brightness/colour spread that the dust also hides;
  * the result is bloomed a little, tone-mapped (filmic), auto-exposed to the requested MOOD so a
    sky can never come out bright by accident, dithered (no banding in the dark) and saved as WebP.
"""
from __future__ import annotations

import argparse
import copy
import json
import math
import re
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent                      # the project folder (has package.json)
PRESET_FILE = HERE / "presets.json"
SPEC_DIR = HERE / "specs"
ASSET_DIR = ROOT / "src" / "assets" / "skyboxes"
DATA_FILE = ROOT / "src" / "data" / "skyboxes.js"
URL_FILE = ROOT / "src" / "render" / "skyboxes.js"
OUT_DIR_DEFAULT = Path("skybox-out")

# Mean display brightness (0..1, sRGB-encoded luma) each mood is exposed to. The owner's own deep-rift
# sky measures 0.039; the brighter rift/wormhole panoramas measure about 0.13.
MOODS = {"black": 0.022, "very_dark": 0.040, "dark": 0.060, "dim": 0.095}
LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)
FILE_BUDGET_KB = 2200        # a skybox is inlined into the one-file game: warn above this
NAME_RE = re.compile(r"^[a-z][a-z0-9_]{1,40}$")

T0 = time.time()


def log(msg: str) -> None:
    print(f"[{time.time() - T0:6.1f}s] {msg}", file=sys.stderr, flush=True)


# --------------------------------------------------------------------------------------- spec / presets
DEFAULTS = {
    "mood": "dark",                       # black | very_dark | dark | dim   (overall brightness, enforced)
    "background": "#03040a",              # the empty-space tint (sRGB hex); keep it near black
    "palette": ["#2ab3c0", "#1f5fa8"],    # the gas's colours, 1-4 hex values, blended across the sky
    "nebula": {
        "amount": 0.8,        # 0..1.5  how much gas light there is
        "coverage": 0.45,     # 0..1    how much of the sky the gas fills (rest is clear space)
        "scale": 1.0,         # 0.5..2  feature size (2 = bigger, softer shapes)
        "wisps": 0.5,         # 0..1    smooth fog (0) .. stringy filaments (1)
        "turbulence": 0.6,    # 0..1.2  how twisted and torn the shapes are
        "cores": 1,           # 0..4    bright knots where the gas glows hardest
    },
    "dust": {
        "amount": 0.75,       # 0..1    how much dark dust sits in front of the gas
        "coverage": 0.5,      # 0..1    how much of the sky the dust fills
        "rim": 0.8,           # 0..1.5  glow on the thin edges of the dust (the backlit look)
    },
    "stars": {
        "density": 1.0,       # 0..3    how many stars
        "brightness": 1.0,    # 0..2    how bright they are
        "color": 0.45,        # 0..1    0 = all white, 1 = vivid blue/orange variety
        "warmth": 0.0,        # -1..1   shift every star cooler (-) or warmer (+)
        "halos": 1.0,         # 0..2    soft glow around the brightest stars
    },
    "band": {
        "strength": 0.0,      # 0..1.5  a Milky-Way-style band of unresolved stars (0 = none)
        "tilt": 28.0,         # degrees the band is tilted from the horizon (0 = level around the sky)
        "rotation": 40.0,     # degrees it is turned round the sky
        "width": 11.0,        # degrees, half-width of the bright core
    },
    "detail": 0.5,            # 0..1    fine texture on the gas (more = grittier, more photographic)
    "saturation": 1.0,        # 0..1.6  colour strength
    "contrast": 1.0,          # 0.7..1.4
    "grain": 1.0,             # 0..2    dither/film grain strength (0 may show banding)
}

# Ranges a value is clamped into, so a lower-level AI cannot make something unusable by typo.
LIMITS = {
    ("nebula", "amount"): (0, 1.5), ("nebula", "coverage"): (0, 1), ("nebula", "scale"): (0.5, 2.0),
    ("nebula", "wisps"): (0, 1), ("nebula", "turbulence"): (0, 1.2), ("nebula", "cores"): (0, 4),
    ("dust", "amount"): (0, 1), ("dust", "coverage"): (0, 1), ("dust", "rim"): (0, 1.5),
    ("stars", "density"): (0, 3), ("stars", "brightness"): (0, 2), ("stars", "color"): (0, 1),
    ("stars", "warmth"): (-1, 1), ("stars", "halos"): (0, 2),
    ("band", "strength"): (0, 1.5), ("band", "tilt"): (0, 90), ("band", "rotation"): (-360, 360),
    ("band", "width"): (3, 30),
    ("detail",): (0, 1), ("saturation",): (0, 1.6), ("contrast",): (0.7, 1.4), ("grain",): (0, 2),
}


def deep_merge(base: dict, over: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def load_presets() -> dict:
    with open(PRESET_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def parse_value(text: str):
    try:
        return json.loads(text)
    except Exception:
        return text


def apply_set(spec: dict, path: str, text: str) -> None:
    keys = path.split(".")
    node = spec
    for k in keys[:-1]:
        if k not in node or not isinstance(node[k], dict):
            sys.exit(f"--set {path}: there is no group called '{k}'. Valid keys: {valid_keys()}")
        node = node[k]
    if keys[-1] not in node:
        sys.exit(f"--set {path}: unknown key. Valid keys: {valid_keys()}")
    node[keys[-1]] = parse_value(text)


def valid_keys() -> str:
    out = []
    for k, v in DEFAULTS.items():
        if isinstance(v, dict):
            out += [f"{k}.{kk}" for kk in v]
        else:
            out.append(k)
    return ", ".join(out)


def resolve_spec(name: str, preset: str | None, spec_file: str | None, sets: list[str],
                 seed: int | None, size: int | None, mood: str | None, palette: str | None) -> dict:
    presets = load_presets()
    spec = copy.deepcopy(DEFAULTS)
    file_spec = {}
    if spec_file:
        with open(spec_file, "r", encoding="utf-8") as f:
            file_spec = json.load(f)
        preset = preset or file_spec.get("preset")
    if preset:
        if preset not in presets:
            sys.exit(f"unknown preset '{preset}'. Choose one of: {', '.join(sorted(presets))}")
        spec = deep_merge(spec, {k: v for k, v in presets[preset].items() if k != "about"})
    spec = deep_merge(spec, {k: v for k, v in file_spec.items() if k not in ("name", "preset", "seed", "size")})
    for s in sets:
        if "=" not in s:
            sys.exit(f"--set needs key=value, got '{s}'")
        p, v = s.split("=", 1)
        apply_set(spec, p.strip(), v.strip())
    if mood:
        spec["mood"] = mood
    if palette:
        spec["palette"] = [c.strip() for c in palette.split(",") if c.strip()]
    spec["name"] = name
    spec["preset"] = preset or "custom"
    spec["seed"] = int(seed if seed is not None else file_spec.get("seed", stable_seed(name)))
    spec["size"] = int(size if size is not None else file_spec.get("size", 4096))
    return validate_spec(spec)


def stable_seed(name: str) -> int:
    h = 2166136261
    for ch in name.encode():
        h = ((h ^ ch) * 16777619) & 0xFFFFFFFF
    return h % 100000


def validate_spec(spec: dict) -> dict:
    if spec["mood"] not in MOODS:
        sys.exit(f"mood must be one of {', '.join(MOODS)}; got '{spec['mood']}'")
    if spec["size"] not in (1024, 2048, 4096, 8192):
        sys.exit("size must be 1024, 2048, 4096 or 8192 (the picture is size x size/2)")
    pal = spec["palette"]
    if not (1 <= len(pal) <= 4):
        sys.exit("palette needs 1 to 4 colours")
    for c in pal + [spec["background"]]:
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", str(c)):
            sys.exit(f"colours must look like #rrggbb, got '{c}'")
    for path, (lo, hi) in LIMITS.items():
        node = spec
        for k in path[:-1]:
            node = node[k]
        v = node[path[-1]]
        if not isinstance(v, (int, float)):
            sys.exit(f"{'.'.join(path)} must be a number, got {v!r}")
        node[path[-1]] = float(min(hi, max(lo, v)))
    return spec


# --------------------------------------------------------------------------------------- colour helpers
def srgb_to_lin(c):
    c = np.asarray(c, np.float32)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4).astype(np.float32)


def lin_to_srgb(c):
    c = np.clip(c, 0, None)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055).astype(np.float32)


def hex_lin(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return srgb_to_lin(np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255.0)


def blackbody_lin(temp_k: np.ndarray) -> np.ndarray:
    """Approximate colour of a star of the given temperature, as linear RGB (Tanner Helland fit)."""
    t = np.clip(temp_k, 1500, 40000) / 100.0
    r = np.where(t <= 66, 255.0, 329.698727446 * np.power(np.maximum(t - 60, 1e-3), -0.1332047592))
    g = np.where(t <= 66, 99.4708025861 * np.log(np.maximum(t, 1e-3)) - 161.1195681661,
                 288.1221695283 * np.power(np.maximum(t - 60, 1e-3), -0.0755148492))
    b = np.where(t >= 66, 255.0, np.where(t <= 19, 0.0, 138.5177312231 * np.log(np.maximum(t - 10, 1e-3)) - 305.0447927307))
    rgb = np.clip(np.stack([r, g, b], -1), 0, 255) / 255.0
    return srgb_to_lin(rgb)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return (t * t * (3.0 - 2.0 * t)).astype(np.float32)


def luma(img):
    return img @ LUMA


# --------------------------------------------------------------------------------------- noise
class Noise3:
    """Seeded 3D gradient noise, evaluated on arrays of points (fast enough for 4K in numpy)."""

    def __init__(self, seed: int):
        rng = np.random.default_rng(seed)
        self.perm = np.concatenate([rng.permutation(256)] * 2).astype(np.int32)
        g = rng.normal(size=(256, 3))
        g /= np.linalg.norm(g, axis=1, keepdims=True)
        self.gx, self.gy, self.gz = (g[:, i].astype(np.float32) for i in range(3))
        self.rots = []
        for _ in range(12):
            q, _r = np.linalg.qr(rng.normal(size=(3, 3)))
            self.rots.append(q.astype(np.float32))
        self.offsets = rng.uniform(-50, 50, size=(64, 3)).astype(np.float32)

    def noise(self, p: np.ndarray) -> np.ndarray:
        """p: (N,3) float32 -> (N,) roughly in [-1, 1]."""
        pf = np.floor(p)
        f = p - pf
        i = pf.astype(np.int32) & 255
        u = f * f * f * (f * (f * 6 - 15) + 10)
        perm, gx, gy, gz = self.perm, self.gx, self.gy, self.gz
        fx, fy, fz = f[:, 0], f[:, 1], f[:, 2]
        ux, uy, uz = u[:, 0], u[:, 1], u[:, 2]
        xi, yi, zi = i[:, 0], i[:, 1], i[:, 2]

        def corner(dx, dy, dz):
            h = perm[perm[perm[xi + dx] + yi + dy] + zi + dz]
            return gx[h] * (fx - dx) + gy[h] * (fy - dy) + gz[h] * (fz - dz)

        x00 = corner(0, 0, 0); x10 = corner(1, 0, 0)
        x01 = corner(0, 1, 0); x11 = corner(1, 1, 0)
        x00 = x00 + ux * (x10 - x00)
        x01 = x01 + ux * (x11 - x01)
        y0 = x00 + uy * (x01 - x00)
        x00 = corner(0, 0, 1); x10 = corner(1, 0, 1)
        x01 = corner(0, 1, 1); x11 = corner(1, 1, 1)
        x00 = x00 + ux * (x10 - x00)
        x01 = x01 + ux * (x11 - x01)
        y1 = x00 + uy * (x01 - x00)
        return (y0 + uz * (y1 - y0)) * 1.6

    def fbm(self, p: np.ndarray, octaves: int, gain: float = 0.5, lac: float = 2.03, slot: int = 0,
            chunk: int = 700_000) -> np.ndarray:
        """Fractal noise of (N,3) points, normalised to roughly [-1, 1]. `slot` picks an independent field."""
        n = p.shape[0]
        out = np.empty(n, np.float32)
        norm = sum(gain ** k for k in range(octaves))
        for s in range(0, n, chunk):
            q0 = p[s:s + chunk]
            acc = np.zeros(q0.shape[0], np.float32)
            amp = 1.0
            freq = 1.0
            for k in range(octaves):
                rot = self.rots[(slot * 3 + k) % len(self.rots)]
                off = self.offsets[(slot * 7 + k) % len(self.offsets)]
                q = (q0 @ rot.T) * freq + off
                acc += amp * self.noise(q.astype(np.float32))
                amp *= gain
                freq *= lac
            out[s:s + chunk] = acc / norm
        return out


# --------------------------------------------------------------------------------------- sphere / image helpers
def make_dirs(w: int, h: int) -> np.ndarray:
    lon = (np.arange(w, dtype=np.float32) + 0.5) / w * (2 * np.pi)
    lat = np.pi / 2 - (np.arange(h, dtype=np.float32) + 0.5) / h * np.pi
    cl = np.cos(lat)[:, None]
    d = np.empty((h, w, 3), np.float32)
    d[..., 0] = cl * np.cos(lon)[None, :]
    d[..., 1] = np.sin(lat)[:, None] * np.ones((1, w), np.float32)
    d[..., 2] = cl * np.sin(lon)[None, :]
    return d


def upscale(a: np.ndarray, w: int, h: int) -> np.ndarray:
    """Resize a float field (h0,w0) or (h0,w0,3) to (h,w), smooth and wrapping around the seam."""
    if a.ndim == 3:
        return np.stack([upscale(a[..., c], w, h) for c in range(a.shape[2])], -1)
    h0, w0 = a.shape
    if (h0, w0) == (h, w):
        return a
    pad = 6
    ext = np.concatenate([a[:, -pad:], a, a[:, :pad]], axis=1).astype(np.float32)
    sx = w / w0
    im = Image.fromarray(ext, "F").resize((int(round((w0 + 2 * pad) * sx)), h), Image.BICUBIC)
    out = np.asarray(im)
    p = int(round(pad * sx))
    return np.ascontiguousarray(out[:, p:p + w])


def gauss_blur(img: np.ndarray, sigma_px: float) -> np.ndarray:
    """Gaussian blur through the FFT. Wraps horizontally, which is exactly what a panorama needs."""
    if sigma_px < 0.3:
        return img
    h, w = img.shape[:2]
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.rfftfreq(w)[None, :]
    k = np.exp(-2 * (np.pi * sigma_px) ** 2 * (fx ** 2 + fy ** 2)).astype(np.float32)
    if img.ndim == 2:
        return np.fft.irfft2(np.fft.rfft2(img) * k, s=(h, w)).astype(np.float32)
    return np.stack([np.fft.irfft2(np.fft.rfft2(img[..., c]) * k, s=(h, w)).astype(np.float32)
                     for c in range(img.shape[2])], -1)


def weighted_quantile(values: np.ndarray, weights: np.ndarray, q: float) -> float:
    v = values.ravel()
    wt = weights.ravel()
    idx = np.argsort(v)
    cw = np.cumsum(wt[idx])
    return float(v[idx][np.searchsorted(cw, q * cw[-1])])


def coverage_mask(field: np.ndarray, area_w: np.ndarray, coverage: float, softness: float = 0.12) -> np.ndarray:
    """1 where `field` is in its top `coverage` share of the sphere's AREA, soft-edged, 0 elsewhere."""
    if coverage <= 0.001:
        return np.zeros_like(field)
    if coverage >= 0.999:
        return np.ones_like(field)
    t = weighted_quantile(field, area_w, 1.0 - coverage)
    spread = float(field.std()) * softness * 2.0 + 1e-4
    return smoothstep(t - spread, t + spread, field)


# --------------------------------------------------------------------------------------- the sky
def build_sky(spec: dict, log_fn=log) -> np.ndarray:
    """Returns the HDR linear-light image, float32 (H, W, 3)."""
    W = spec["size"]
    H = W // 2
    ws, hs = max(W // 2, 1024), max(H // 2, 512)       # work resolution: soft layers are computed here
    seed = spec["seed"]
    noise = Noise3(seed)
    rng = np.random.default_rng(seed + 1)
    neb, dust, stars, band = spec["nebula"], spec["dust"], spec["stars"], spec["band"]

    D = make_dirs(ws, hs)
    P = D.reshape(-1, 3)
    lat = np.pi / 2 - (np.arange(hs, dtype=np.float32) + 0.5) / hs * np.pi
    area = np.cos(lat)[:, None] * np.ones((1, ws), np.float32)          # equal-area weights

    def fb(scale, octaves, slot, gain=0.5, shift=(0, 0, 0)):
        q = P * np.float32(scale) + np.array(shift, np.float32)
        return noise.fbm(q, octaves, gain=gain, slot=slot).reshape(hs, ws)

    sc = float(neb["scale"])
    turb = float(neb["turbulence"])
    wisp = float(neb["wisps"])

    # --- the twist: a rough vector field that tears every layer that follows -------------------------
    # (rough, not silky: a smooth warp makes marbled paint, a fractal one makes torn cloud)
    log_fn("warp field")
    warp = np.stack([fb(0.75 / sc, 5, 1, gain=0.55, shift=(0, 0, 0)), fb(0.75 / sc, 5, 2, gain=0.55, shift=(7, 3, 1)),
                     fb(0.75 / sc, 5, 3, gain=0.55, shift=(2, 9, 5))], -1)
    Q = (P.reshape(hs, ws, 3) * np.float32(1.0 / sc) + warp * np.float32(0.62 * turb)).reshape(-1, 3)

    def fq(freq, octaves, slot, gain=0.5, shift=(0, 0, 0)):
        q = Q * np.float32(freq) + np.array(shift, np.float32)
        return noise.fbm(q, octaves, gain=gain, slot=slot).reshape(hs, ws)

    # --- where gas and dust live: broad regions, so the sky has shape and real empty space ----------
    log_fn("regions")
    region_g = fb(0.9 / sc, 3, 4, shift=(11, 4, 8))
    region_d = fb(0.8 / sc, 3, 5, shift=(3, 17, 6))
    # a couple of large lobes give the composition a centre of interest instead of even mush
    lobe_dirs = rng.normal(size=(3, 3)).astype(np.float32)
    lobe_dirs /= np.linalg.norm(lobe_dirs, axis=1, keepdims=True)
    lobes = np.zeros((hs, ws), np.float32)
    for k, ld in enumerate(lobe_dirs):
        ang = np.arccos(np.clip(D @ ld, -1, 1))
        lobes += (0.9 - 0.2 * k) * np.exp(-(ang / (0.55 + 0.15 * k)) ** 2)
    region_g = region_g * 0.8 + lobes * 0.75
    region_d = region_d * 0.8 + lobes[:, ::-1] * 0.6 + lobes * 0.3
    mask_g = coverage_mask(region_g, area, float(neb["coverage"]), 0.35)
    mask_d = coverage_mask(region_d, area, float(dust["coverage"]), 0.30)

    # --- the gas: luminous, ragged billows with soft scattered glow around them --------------------
    log_fn("gas")
    g1 = fq(0.95, 7, 6, gain=0.58)
    g2 = fq(2.0, 5, 7, gain=0.5, shift=(5, 1, 3))
    billow = np.clip(g1 * 0.5 + 0.5, 0, 1)
    dens_g = smoothstep(0.30, 0.92, billow) ** 2.3
    fil = (1.0 - np.abs(g2)) ** 5.0                                   # thin bright strands, kept soft
    gas = dens_g * (0.55 + 1.1 * wisp * fil)
    gas = gas * (0.02 + 0.98 * mask_g)
    # light scattered into the dark around the gas, near and far: the mist the dust is silhouetted against
    gas = gas + 0.55 * gauss_blur(gas, 0.010 * ws) + 0.45 * gauss_blur(gas, 0.045 * ws)
    # the mist: a broad, smooth glow with real brightness variation, present wherever dust lies, so every
    # dark cloud has something luminous to be silhouetted against (this is what makes dust READ as dust)
    m1 = np.clip(fq(0.8, 6, 21, gain=0.55, shift=(3, 7, 2)) * 0.5 + 0.5, 0, 1)
    mist = smoothstep(0.18, 0.85, m1) ** 1.3 * np.maximum(mask_g, 0.75 * mask_d)
    mist = mist + 0.5 * gauss_blur(mist, 0.03 * ws)
    gas = (gas + 0.60 * mist).astype(np.float32)

    # --- colour: the palette runs across the gas as a slow gradient; hot parts wash toward white ------
    pal = np.stack([hex_lin(c) for c in spec["palette"]]).astype(np.float32)
    ramp = np.clip(fb(0.7 / sc, 3, 8, shift=(1, 2, 3)) * 0.9 + 0.5, 0, 1) * (len(pal) - 1)
    i0 = np.clip(np.floor(ramp).astype(np.int32), 0, len(pal) - 1)
    i1 = np.minimum(i0 + 1, len(pal) - 1)
    fr = (ramp - i0)[..., None]
    gas_col = pal[i0] * (1 - fr) + pal[i1] * fr                         # (hs, ws, 3)

    # --- hot cores: where stars hide inside the gas and light it up ----------------------------------
    cores = np.zeros((hs, ws), np.float32)
    n_cores = int(round(float(neb["cores"])))
    if n_cores > 0:
        cand = np.argwhere(mask_g * gas > np.percentile(mask_g * gas, 88))
        for k in range(n_cores):
            if len(cand) == 0:
                break
            cy, cx = cand[rng.integers(len(cand))]
            cd = D[cy, cx]
            ang = np.arccos(np.clip(D @ cd, -1, 1))
            radius = rng.uniform(0.09, 0.19)                             # radians
            core = np.exp(-(ang / radius) ** 1.25)
            core *= 0.45 + 0.9 * np.clip(fq(4.0, 5, 9 + k, gain=0.55) * 0.5 + 0.5, 0, 1)
            cores += core.astype(np.float32)
    cores = cores.astype(np.float32)
    hot = smoothstep(0.6, 2.2, gas + 1.5 * cores)[..., None]
    gas_col = gas_col * (1 - 0.22 * hot) + (gas_col.mean(-1, keepdims=True) * 0.6 + 0.55) * (0.22 * hot)

    # --- the dust: dark clouds in front of the gas, thick in the middle and thin at the rim --------
    log_fn("dust")
    d1 = np.clip(fq(1.0, 7, 12, gain=0.58, shift=(4, 4, 4)) * 0.5 + 0.5, 0, 1)
    d_rough = fq(4.2, 4, 13, gain=0.62, shift=(9, 2, 7))              # the ragged, cauliflower edge
    dd = d1 + 0.20 * d_rough
    dust_big = smoothstep(0.38, 0.60, dd) * (0.04 + 0.96 * mask_d)
    dust_big = np.clip(dust_big, 0, 1) * float(dust["amount"])
    # a faint, very soft veil over the rest: dust you cannot see, only feel
    veil = smoothstep(0.15, 0.85, d1 + 0.30 * d_rough) * 0.55 * float(dust["amount"])
    amount_d = max(float(dust["amount"]), 1e-3)
    trans = (1.0 - 0.95 * dust_big) * (1.0 - veil)
    # rim: the dust is thin at its edge, so the glow behind it shows there and lights the cloud's surface
    e = dust_big / amount_d
    rim = smoothstep(0.03, 0.20, e) * (1 - smoothstep(0.26, 0.75, e))
    behind = gauss_blur(np.clip(gas + 0.6 * cores, 0, 2.0), 0.02 * ws)
    rim_var = np.clip(fb(1.3, 3, 18, shift=(2, 5, 1)) * 0.9 + 0.55, 0.0, 1.3)
    rim = rim * smoothstep(0.08, 0.9, behind) ** 1.3 * rim_var

    # --- radiance of the nebula, in linear light --------------------------------------------------
    # a slow envelope: some of the sky glows, most of it is quiet. Without this every patch of gas is
    # equally bright and the whole sky reads as one flat pattern.
    env = smoothstep(-0.55, 0.65, fb(0.8 / sc, 3, 19, shift=(5, 9, 3)))
    gas = gas * (0.40 + 0.95 * env)
    amt = float(neb["amount"])
    core_col = np.clip(gas_col * 1.0 + 0.30, 0, None)                    # cores run lighter than the gas
    L = (gas[..., None] * gas_col * (0.060 * amt)
         + cores[..., None] * core_col * (0.085 * amt))
    L = L * trans[..., None] + (rim[..., None] * gas_col * (0.10 * amt * float(dust["rim"])))

    # --- a very faint wash of colour across the whole sky so "empty" is never flat ------------------
    wash_n = fb(0.6, 3, 15, shift=(6, 6, 6))
    wash = np.clip(wash_n * 0.5 + 0.5, 0, 1)
    bg = hex_lin(spec["background"])
    L += (bg[None, None, :] * (0.6 + 0.9 * wash[..., None])) * 1.0
    L += wash[..., None] * pal[0][None, None, :] * 0.0035 * amt

    # --- Milky-Way-style band ----------------------------------------------------------------------
    band_light = np.zeros((hs, ws, 3), np.float32)
    band_B = np.zeros((hs, ws), np.float32)
    bs = float(band["strength"])
    if bs > 0.001:
        log_fn("galactic band")
        tilt, rot = math.radians(float(band["tilt"])), math.radians(float(band["rotation"]))
        n_ax = np.array([math.sin(tilt) * math.cos(rot), math.cos(tilt), math.sin(tilt) * math.sin(rot)], np.float32)
        n_ax /= np.linalg.norm(n_ax)
        b_ang = np.arcsin(np.clip(D @ n_ax, -1, 1))                      # galactic latitude
        sig = math.radians(float(band["width"]))
        core = np.exp(-(b_ang / sig) ** 2)
        halo = np.exp(-(b_ang / (3.2 * sig)) ** 2)
        # galactic longitude: the centre of the galaxy is the brightest, fattest part
        ref = np.cross(n_ax, np.array([0, 1, 0], np.float32))
        if np.linalg.norm(ref) < 1e-3:
            ref = np.array([1, 0, 0], np.float32)
        ref = (ref / np.linalg.norm(ref)).astype(np.float32)
        centre = (ref * math.cos(1.1) + np.cross(n_ax, ref) * math.sin(1.1)).astype(np.float32)
        c_ang = np.arccos(np.clip(D @ centre, -1, 1))
        bulge = np.exp(-(c_ang / 0.65) ** 2)
        clump = np.clip(fb(3.0, 5, 16, shift=(3, 3, 9)) * 0.5 + 0.55, 0, 1.4)
        lane_n = fb(4.5, 5, 17, shift=(8, 1, 4))
        lane = smoothstep(0.02, 0.45, lane_n) * np.exp(-(b_ang / (0.55 * sig)) ** 2)   # dark rift along the band
        lane_t = 1.0 - 0.9 * lane
        band_B = ((0.65 * core + 0.35 * halo) * (0.35 + 0.65 * bulge + 0.2) * (0.45 + 0.75 * clump)).astype(np.float32)
        warm = np.array([1.0, 0.80, 0.58], np.float32)
        cool = np.array([0.62, 0.74, 1.0], np.float32)
        mixc = np.clip(0.25 + 0.75 * bulge + 0.2 * core, 0, 1)[..., None]
        band_light = (warm * mixc + cool * (1 - mixc)) * (band_B * lane_t * 0.030 * bs)[..., None]
        L = L * (1.0 - 0.5 * np.clip(lane, 0, 1))[..., None]
        trans = trans * lane_t
    # --- star density map (fraction of sky star-rich) ------------------------------------------------
    dens = (0.55 + 0.35 * np.clip(gas, 0, 1) + 0.9 * np.clip(cores, 0, 1) + 3.2 * bs * band_B) * (0.25 + 0.75 * trans)
    dens = dens.astype(np.float32)

    # ------------------------------------------------------------------------------------------------
    log_fn("upscaling soft layers")
    L_full = upscale(L, W, H) + upscale(band_light, W, H)
    L_full = np.clip(L_full, 0, None)

    # fine photographic texture on the gas itself, at full resolution
    det = float(spec["detail"])
    if det > 0.01:
        log_fn("fine detail")
        Dfull = make_dirs(W, H).reshape(-1, 3)
        hi = noise.fbm(Dfull * np.float32(32.0 / sc), 3, gain=0.62, lac=2.1, slot=20).reshape(H, W)
        hi2 = noise.fbm(Dfull * np.float32(110.0), 2, gain=0.6, lac=2.0, slot=21).reshape(H, W)
        del Dfull
        tex = 1.0 + det * (0.45 * hi + 0.16 * hi2)
        L_full *= np.clip(tex, 0.15, None)[..., None]
        del hi, hi2, tex
    L_full += make_star_layer(spec, rng, W, H, dens, area_ws=(ws, hs))
    return L_full


def make_star_layer(spec, rng, W, H, dens, area_ws) -> np.ndarray:
    st = spec["stars"]
    log("stars")
    ws, hs = area_ws
    n_cand = int(34000 * float(st["density"]))
    if n_cand <= 0:
        return np.zeros((H, W, 3), np.float32)
    # uniform points on the sphere, thinned by the density map (dust hides stars, the band and cores add them)
    v = rng.normal(size=(n_cand * 2, 3)).astype(np.float32)
    v /= np.linalg.norm(v, axis=1, keepdims=True)
    lat = np.arcsin(np.clip(v[:, 1], -1, 1))
    lon = np.arctan2(v[:, 2], v[:, 0]) % (2 * np.pi)
    px = np.minimum((lon / (2 * np.pi) * ws).astype(int), ws - 1)
    py = np.minimum(((np.pi / 2 - lat) / np.pi * hs).astype(int), hs - 1)
    p_acc = dens[py, px] / max(float(dens.max()), 1e-6)
    keep = rng.random(len(v)) < p_acc
    idx = np.flatnonzero(keep)[:n_cand]
    lat, lon = lat[idx], lon[idx]
    n = len(idx)
    # brightness: a power law. Very many faint stars, very few bright ones (like the real sky)
    u = rng.random(n)
    flux = np.minimum((1.0 - u) ** (-1.0 / 1.32), 1500.0).astype(np.float32)        # 1 .. 1500
    # colour: mostly cool orange/yellow dwarfs, a few hot blue-white giants
    pick = rng.random(n)
    temp = np.where(pick < 0.38, rng.uniform(3300, 5200, n),
                    np.where(pick < 0.80, rng.uniform(5200, 7800, n), rng.uniform(8500, 22000, n)))
    temp = temp * (1.0 - 0.18 * float(st["warmth"]))
    col = blackbody_lin(temp.astype(np.float32))
    col = col / np.maximum(luma(col), 1e-4)[:, None]
    variety = float(st["color"])
    white = np.ones((1, 3), np.float32)
    col = white * (1 - variety) + col * variety
    col = col / np.maximum(luma(col), 1e-4)[:, None]
    # peak brightness in linear HDR units: the faintest are barely there, the brightest bloom hard
    peak = (0.010 * flux ** 0.78) * float(st["brightness"])
    scale = W / 4096.0
    sig = (0.62 + 0.20 * np.log2(flux) ** 0.9 * 0.35) * scale                       # px, bigger when brighter
    cx = lon / (2 * np.pi) * W
    cy = (np.pi / 2 - lat) / np.pi * H
    acc = np.zeros(H * W, np.float64)
    accg = np.zeros(H * W, np.float64)
    accb = np.zeros(H * W, np.float64)
    coslat = np.maximum(np.cos(lat), 0.012)
    splat(acc, accg, accb, W, H, cx, cy, sig / coslat, sig, peak[:, None] * col)
    halos = float(st["halos"])
    if halos > 0.01:
        big = flux > 90
        if big.any():
            h_amp = (peak[big] * 0.022 * halos)[:, None] * col[big]
            splat(acc, accg, accb, W, H, cx[big], cy[big], 4.0 * sig[big] / coslat[big], 4.0 * sig[big], h_amp)
        huge = flux > 450
        if huge.any():
            h_amp = (peak[huge] * 0.004 * halos)[:, None] * col[huge]
            splat(acc, accg, accb, W, H, cx[huge], cy[huge], 14.0 * sig[huge] / coslat[huge], 14.0 * sig[huge], h_amp)
    out = np.stack([acc, accg, accb], -1).reshape(H, W, 3).astype(np.float32)
    log(f"{n} stars placed")
    return out


def splat(ar, ag, ab, W, H, cx, cy, sx, sy, rgb) -> None:
    """Add gaussian stars (centre cx,cy in pixels, width sx,sy, colour*peak rgb) into flat accumulators."""
    sx = np.minimum(sx, 90.0)
    rx = np.ceil(3.0 * sx).astype(int)
    ry = np.ceil(3.0 * sy).astype(int)
    key = rx * 1000 + ry
    for k in np.unique(key):
        sel = np.flatnonzero(key == k)
        rxk, ryk = int(k // 1000), int(k % 1000)
        win = (2 * rxk + 1) * (2 * ryk + 1)
        step = max(1, 3_000_000 // win)
        ox = np.arange(-rxk, rxk + 1)
        oy = np.arange(-ryk, ryk + 1)
        for s in range(0, len(sel), step):
            ids = sel[s:s + step]
            x0 = np.floor(cx[ids]).astype(int)
            y0 = np.floor(cy[ids]).astype(int)
            dx = (x0[:, None] + ox[None, :] + 0.5) - cx[ids][:, None]               # (n, wx)
            dy = (y0[:, None] + oy[None, :] + 0.5) - cy[ids][:, None]               # (n, wy)
            wxs = np.exp(-0.5 * (dx / sx[ids][:, None]) ** 2)
            wys = np.exp(-0.5 * (dy / sy[ids][:, None]) ** 2)
            wgt = wys[:, :, None] * wxs[:, None, :]                                 # (n, wy, wx)
            xx = (x0[:, None] + ox[None, :]) % W                                    # wraps round the seam
            yy = y0[:, None] + oy[None, :]
            ok = (yy >= 0) & (yy < H)
            flat = (np.clip(yy, 0, H - 1)[:, :, None] * W + xx[:, None, :])
            okw = ok[:, :, None] & np.ones_like(wgt, bool)
            fl = flat[okw]
            ww = wgt[okw]
            rr = np.repeat(rgb[ids][:, None, None, :], wgt.shape[1], 1)
            rr = np.repeat(rr, wgt.shape[2], 2)[okw]
            ar += np.bincount(fl, ww * rr[:, 0], minlength=H * W)
            ag += np.bincount(fl, ww * rr[:, 1], minlength=H * W)
            ab += np.bincount(fl, ww * rr[:, 2], minlength=H * W)


# --------------------------------------------------------------------------------------- finishing
def aces(x):
    a, b, c, d, e = 2.51, 0.03, 2.43, 0.59, 0.14
    return np.clip((x * (a * x + b)) / (x * (c * x + d) + e), 0, 1)


def finish(hdr: np.ndarray, spec: dict, seed: int) -> tuple[np.ndarray, float]:
    """Bloom, auto-exposure to the mood, tone map, saturation, dither -> uint8 sRGB image."""
    H, W = hdr.shape[:2]
    s = W / 4096.0
    log("bloom")
    bright = np.clip(hdr - 0.08, 0, None)
    hdr = hdr + gauss_blur(bright, 2.2 * s) * 0.22 + gauss_blur(bright, 9.0 * s) * 0.10 + gauss_blur(bright, 36.0 * s) * 0.05
    log("exposure")
    small = hdr[::4, ::4]
    target = MOODS[spec["mood"]]
    contrast = float(spec["contrast"])

    def mean_at(e):
        y = aces(small * e)
        y = lin_to_srgb(y)
        y = np.clip((y - 0.5) * contrast + 0.5, 0, 1) if contrast != 1 else y
        return float(luma(y).mean())

    lo, hi = math.log(0.02), math.log(60.0)
    for _ in range(26):
        mid = (lo + hi) / 2
        if mean_at(math.exp(mid)) < target:
            lo = mid
        else:
            hi = mid
    exposure = math.exp((lo + hi) / 2)
    log(f"exposure x{exposure:.2f} for mood '{spec['mood']}' (target mean {target})")
    out = np.empty_like(hdr)
    step = 512
    sat = float(spec["saturation"])
    rng = np.random.default_rng(seed + 99)
    grain = float(spec["grain"])
    img8 = np.empty((H, W, 3), np.uint8)
    for r in range(0, H, step):
        blk = aces(hdr[r:r + step] * exposure)
        if sat != 1.0:
            lm = (blk @ LUMA)[..., None]
            blk = np.clip(lm + (blk - lm) * sat, 0, 1)
        blk = lin_to_srgb(blk)
        if contrast != 1:
            blk = np.clip((blk - 0.5) * contrast + 0.5, 0, 1)
        if grain > 0:
            n = (rng.random(blk.shape[:2] + (1,), dtype=np.float32) + rng.random(blk.shape[:2] + (1,), dtype=np.float32) - 1.0)
            blk = blk + n * (grain / 255.0) * 0.85            # triangular dither, under one 8-bit step: breaks up banding
        img8[r:r + step] = np.clip(blk * 255.0 + 0.5, 0, 255).astype(np.uint8)
    return img8, exposure


# --------------------------------------------------------------------------------------- reports / previews
def report(img8: np.ndarray, label: str, file_kb: float | None = None) -> list[str]:
    a = img8.astype(np.float32) / 255.0
    H, W = a.shape[:2]
    l = luma(a)
    warns = []
    seam = float(np.abs(a[:, 0] - a[:, -1]).mean() * 255.0)
    lines = [f"--- {label}",
             f"size            {W}x{H}" + (f"   file {file_kb:.0f} KB" if file_kb is not None else ""),
             f"mean brightness {l.mean():.3f}   median {np.median(l):.3f}   p99 {np.percentile(l, 99):.3f}   p99.9 {np.percentile(l, 99.9):.3f}",
             f"pixels > 0.5    {(l > 0.5).mean() * 100:.3f}%   > 0.8: {(l > 0.8).mean() * 100:.4f}%",
             f"mean colour     R{a[..., 0].mean():.3f} G{a[..., 1].mean():.3f} B{a[..., 2].mean():.3f}",
             f"seam (left vs right edge) mean diff {seam:.2f}/255"]
    if W != 2 * H:
        warns.append("image is not 2:1 - an equirectangular sky must be exactly twice as wide as tall")
    if l.mean() > 0.13:
        warns.append(f"too bright for 'dark' space (mean {l.mean():.3f}); the game's brightest sky is about 0.13")
    if l.mean() < 0.012:
        warns.append(f"almost pure black (mean {l.mean():.3f}) - nothing will be visible")
    if (l > 0.5).mean() > 0.02:
        warns.append("more than 2% of the sky is bright; it will not read as dark space")
    if seam > 6:
        warns.append(f"visible seam at the left/right edge (diff {seam:.1f})")
    if file_kb is not None and file_kb > FILE_BUDGET_KB:
        warns.append(f"file is {file_kb:.0f} KB; every skybox is inlined into the one-file game - lower --quality or --size")
    lines += [f"WARNING: {w}" for w in warns] or ["OK: dark, seamless and within budget"]
    return lines


def view(img8: np.ndarray, yaw_deg: float, pitch_deg: float, fov_deg: float, w: int, h: int) -> np.ndarray:
    """A flat 'camera' view out of the panorama (what a pilot sees looking that way)."""
    H, W = img8.shape[:2]
    f = (w / 2) / math.tan(math.radians(fov_deg) / 2)
    xs = (np.arange(w) + 0.5 - w / 2) / f
    ys = -(np.arange(h) + 0.5 - h / 2) / f
    X, Y = np.meshgrid(xs, ys)
    Z = np.ones_like(X)
    n = np.sqrt(X * X + Y * Y + Z * Z)
    d = np.stack([X / n, Y / n, Z / n], -1)
    p, q = math.radians(pitch_deg), math.radians(yaw_deg)
    Rx = np.array([[1, 0, 0], [0, math.cos(p), -math.sin(p)], [0, math.sin(p), math.cos(p)]], np.float32)
    Ry = np.array([[math.cos(q), 0, math.sin(q)], [0, 1, 0], [-math.sin(q), 0, math.cos(q)]], np.float32)
    d = d @ Rx.T @ Ry.T
    lon = np.arctan2(d[..., 2], d[..., 0]) % (2 * math.pi)
    lat = np.arcsin(np.clip(d[..., 1], -1, 1))
    u = lon / (2 * math.pi) * W - 0.5
    v = (math.pi / 2 - lat) / math.pi * H - 0.5
    x0 = np.floor(u).astype(int); y0 = np.clip(np.floor(v).astype(int), 0, H - 2)
    fx = (u - x0)[..., None]; fy = (v - y0)[..., None]
    x0 %= W; x1 = (x0 + 1) % W
    c = (img8[y0, x0] * (1 - fx) * (1 - fy) + img8[y0, x1] * fx * (1 - fy)
         + img8[y0 + 1, x0] * (1 - fx) * fy + img8[y0 + 1, x1] * fx * fy)
    return np.clip(c, 0, 255).astype(np.uint8)


def make_preview(img8: np.ndarray, path: Path, boost: float = 1.0) -> None:
    """A contact sheet: the whole panorama, then four pilot's-eye views (the game's camera is ~70 degrees)."""
    full = Image.fromarray(img8).resize((1920, 960), Image.LANCZOS)
    tiles = []
    for yaw, pitch in ((0, 0), (90, 10), (180, -5), (270, 25)):
        tiles.append(Image.fromarray(view(img8, yaw, pitch, 70, 480, 270)))
    sheet = Image.new("RGB", (1920, 960 + 270), (0, 0, 0))
    sheet.paste(full, (0, 0))
    for i, t in enumerate(tiles):
        sheet.paste(t, (i * 480, 960))
    if boost != 1.0:
        sheet = Image.fromarray(np.clip(np.asarray(sheet).astype(np.float32) * boost, 0, 255).astype(np.uint8))
    sheet.save(path, quality=90)


# --------------------------------------------------------------------------------------- install into the game
GEN_RE = re.compile(r"([ \t]*// BEGIN GENERATED[^\n]*\n)(.*?)([ \t]*// END GENERATED)", re.S)


def read_manifest() -> dict:
    """The installed skyboxes, read back from src/data/skyboxes.js (one line each)."""
    entries = {}
    if DATA_FILE.exists():
        m = GEN_RE.search(DATA_FILE.read_text(encoding="utf-8"))
        if m:
            for line in m.group(2).splitlines():
                mm = re.match(r'\s*([a-z][a-z0-9_]*): (\{.*\}),\s*$', line)
                if mm:
                    entries[mm.group(1)] = line.strip()
    return entries


def install(spec: dict, webp_path: Path, label: str) -> None:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    SPEC_DIR.mkdir(parents=True, exist_ok=True)
    target = ASSET_DIR / f"{spec['name']}.webp"
    target.write_bytes(webp_path.read_bytes())
    with open(SPEC_DIR / f"{spec['name']}.json", "w", encoding="utf-8") as f:
        json.dump(spec, f, indent=2)
        f.write("\n")
    entries = read_manifest()
    tint = spec["palette"][0].lstrip("#").lower()
    entries[spec["name"]] = (f'{spec["name"]}: {{ n: {json.dumps(label)}, preset: {json.dumps(spec["preset"])}, '
                             f'seed: {spec["seed"]}, size: {spec["size"]}, tint: 0x{tint} }},')
    # src/data/skyboxes.js: pure data, safe for the node tests to import
    block = "".join(f"  {entries[k]}\n" for k in sorted(entries))
    data_src = DATA_FILE.read_text(encoding="utf-8")
    DATA_FILE.write_text(GEN_RE.sub(lambda m: m.group(1) + block + m.group(3), data_src, count=1), encoding="utf-8")
    # src/render/skyboxes.js: the imports the esbuild dataurl loader inlines into the bundle
    imports = "".join(f'import sky_{k} from "../assets/skyboxes/{k}.webp";\n' for k in sorted(entries))
    mapping = "".join(f"  {k}: sky_{k},\n" for k in sorted(entries))
    url_src = URL_FILE.read_text(encoding="utf-8")
    parts = list(GEN_RE.finditer(url_src))
    if len(parts) != 2:
        sys.exit("src/render/skyboxes.js has lost its BEGIN/END GENERATED markers; restore them from git")
    url_src = url_src[:parts[0].start()] + parts[0].group(1) + imports + parts[0].group(3) + url_src[parts[0].end():parts[1].start()] \
        + parts[1].group(1) + mapping + parts[1].group(3) + url_src[parts[1].end():]
    URL_FILE.write_text(url_src, encoding="utf-8")


# --------------------------------------------------------------------------------------- CLI
def cmd_presets(_args) -> None:
    for name, p in sorted(load_presets().items()):
        print(f"{name:16s} {p.get('about', '')}")
    print("\nValid --set keys:", valid_keys())
    print("Moods:", ", ".join(f"{k} ({v})" for k, v in MOODS.items()))


def cmd_list(_args) -> None:
    for k, line in sorted(read_manifest().items()):
        print(line)
    if not read_manifest():
        print("(no generated skyboxes installed yet)")


def cmd_check(args) -> None:
    p = Path(args.file)
    img = np.asarray(Image.open(p).convert("RGB"))
    print("\n".join(report(img, p.name, p.stat().st_size / 1024)))


def cmd_make(args) -> None:
    if not NAME_RE.match(args.name):
        sys.exit("name must be lowercase letters, digits and underscores, starting with a letter (e.g. crimson_pit)")
    spec = resolve_spec(args.name, args.preset, args.spec, args.set or [], args.seed, args.size, args.mood, args.palette)
    if spec["size"] == 8192:
        log("8192 wide: needs ~3 GB of RAM and several minutes; the game's file gets much bigger too")
    log(f"making '{spec['name']}' preset={spec['preset']} seed={spec['seed']} size={spec['size']} mood={spec['mood']}")
    hdr = build_sky(spec)
    img8, exposure = finish(hdr, spec, spec["seed"])
    del hdr
    out_dir = Path(args.out_dir) if args.out_dir else OUT_DIR_DEFAULT
    out_dir.mkdir(parents=True, exist_ok=True)
    webp = out_dir / f"{spec['name']}.webp"
    log("encoding webp")
    Image.fromarray(img8).save(webp, "WEBP", quality=int(args.quality), method=6)
    kb = webp.stat().st_size / 1024
    if args.png:
        Image.fromarray(img8).save(out_dir / f"{spec['name']}.png", optimize=False)
    lines = report(img8, f"{spec['name']} ({webp})", kb)
    if args.preview:
        pv = out_dir / f"{spec['name']}.preview.jpg"
        make_preview(img8, pv, boost=args.preview_boost)
        lines.append(f"preview sheet   {pv}   (whole sky + four pilot's-eye views; --preview-boost brightens the sheet only)")
    print("\n".join(lines))
    if args.install:
        if any(l.startswith("WARNING") for l in lines) and not args.force:
            sys.exit("not installed because of the warnings above (fix them, or add --force if you really mean it)")
        install(spec, webp, args.label or spec["name"].replace("_", " ").title())
        print(f"INSTALLED {spec['name']}: src/assets/skyboxes/{spec['name']}.webp, registered in src/data/skyboxes.js and "
              f"src/render/skyboxes.js; recipe saved to tools/skybox/specs/{spec['name']}.json")
        print(f'Use it in an instance:  sky: {{ kind: "panorama", skybox: "{spec["name"]}", shards: 30 }}')
    else:
        print("Not installed (preview only). Add --install to put it in the game.")


def main() -> None:
    ap = argparse.ArgumentParser(description="Tallow Reach skybox generator")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("presets", help="list looks and valid keys").set_defaults(fn=cmd_presets)
    sub.add_parser("list", help="list installed skyboxes").set_defaults(fn=cmd_list)
    c = sub.add_parser("check", help="report brightness/seam/size of any panorama")
    c.add_argument("file")
    c.set_defaults(fn=cmd_check)
    m = sub.add_parser("make", help="render a skybox")
    m.add_argument("name", help="lowercase_with_underscores")
    m.add_argument("--preset", help="a look (see `presets`)")
    m.add_argument("--spec", help="a JSON spec file (tools/skybox/specs/*.json to re-make one)")
    m.add_argument("--seed", type=int, help="different seed = different sky of the same look")
    m.add_argument("--size", type=int, choices=[1024, 2048, 4096, 8192], help="width in pixels (default 4096)")
    m.add_argument("--mood", choices=list(MOODS), help="overall brightness")
    m.add_argument("--palette", help='gas colours, e.g. "#ff5a2a,#7a1f5c"')
    m.add_argument("--set", action="append", help="override one knob, e.g. --set nebula.coverage=0.7 (repeatable)")
    m.add_argument("--quality", type=int, default=90, help="webp quality (default 90)")
    m.add_argument("--out-dir", help="where to write previews/the webp (default ./skybox-out)")
    m.add_argument("--png", action="store_true", help="also write a lossless PNG")
    m.add_argument("--preview", action="store_true", help="write a contact-sheet preview image")
    m.add_argument("--preview-boost", type=float, default=1.0, help="brighten the preview sheet only (e.g. 2.5)")
    m.add_argument("--install", action="store_true", help="copy into src/assets/skyboxes and register it")
    m.add_argument("--label", help="human name shown in data/skyboxes.js")
    m.add_argument("--force", action="store_true", help="install even with warnings")
    m.set_defaults(fn=cmd_make)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
