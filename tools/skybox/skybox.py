#!/usr/bin/env python3
"""
Tallow Reach skybox generator.

Makes a dark, photographic-looking **cube map**: six square 90-degree faces (px, nx, py, ny, pz, nz),
2048x2048 per face by default, that the game draws on the inside of a sky cube.

    python3 tools/skybox/skybox.py presets                        # what looks are available
    python3 tools/skybox/skybox.py make my_sky --preset ember     # render to ./skybox-out/ (safe to experiment)
    python3 tools/skybox/skybox.py make my_sky --preset ember --install   # ... and put it in the game
    python3 tools/skybox/skybox.py check my_sky                   # brightness / seam / size report of an installed sky

Needs only numpy and Pillow (with WebP support). Nothing here is part of the game bundle.
Read tools/skybox/README.md first: it is written for the AI assistants that drive this tool.

How the picture is made (so a number here is never a mystery):
  * every layer is a function of the DIRECTION a pixel looks in (a unit vector), never of its x/y —
    that is what makes the six cube faces agree across their shared edges with no seam line, and
    what means a face edge is not a special case anywhere in this file;
  * light is built in linear HDR over the whole sphere: a faint background, a luminous gas that
    follows the palette, dark dust clouds IN FRONT of it (rim-lit where they are thin), an optional
    Milky-Way-style band, and stars drawn with a realistic brightness/colour spread that the dust
    also hides;
  * the sphere is then sampled into six faces, each rendered with a margin and cropped so the bloom
    and the blur never get cut off at an edge, bloomed a little, tone-mapped (filmic) and
    auto-exposed to the requested MOOD so a sky can never come out bright by accident, dithered (no
    banding in the dark) and saved as one WebP per face.
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
# A whole cube (six faces) is inlined into the one-file game as base64: warn above this.
# 2048 per face measures about 0.4-0.7 MB, so this leaves room for a 4096 face size on request.
FILE_BUDGET_KB = 6000
NAME_RE = re.compile(r"^[a-z][a-z0-9_]{1,40}$")

# The six faces of a cube map, in the order three.js (and WebGL) expects them. `name` is the file
# stem under src/assets/skyboxes/<id>/, and (u, v, w) is the face's own right / up / outward axes in
# the game's world space, so a pixel of a face maps to exactly one direction on the sphere.
#   three.js CubeTexture order: +X, -X, +Y, -Y, +Z, -Z
#   three.js world: +X right, +Y up, +Z toward the viewer (the camera looks down -Z)
FACE_AXES = {
    "px": ((0, 0, -1), (0, 1, 0), (1, 0, 0)),
    "nx": ((0, 0, 1), (0, 1, 0), (-1, 0, 0)),
    "py": ((1, 0, 0), (0, 0, 1), (0, 1, 0)),
    "ny": ((1, 0, 0), (0, 0, -1), (0, -1, 0)),
    "pz": ((1, 0, 0), (0, 1, 0), (0, 0, 1)),
    "nz": ((-1, 0, 0), (0, 1, 0), (0, 0, -1)),
}
FACE_ORDER = ["px", "nx", "py", "ny", "pz", "nz"]
FACE_SIZES = (1024, 2048, 4096, 8192)
DEFAULT_FACE = 2048

# The sphere the six faces are cut from. The soft layers are built once, on a sphere at the SAME
# texel density the old equirectangular picture had (4096 wide = 0.088 degrees per texel), so this
# rewrite changes what the sky looks like as little as possible — and a 2048-per-face cube still
# carries 3x the pixels the equirect picture did, all of them closer to the screen.
#
# The density is expressed in face widths so it stays honest at any face size: the sphere is
# `SOFT_FACE_WIDTHS` face-widths wide, i.e. per face it has `SOFT_FACE_WIDTHS / 4` texels across,
# which is 0.088 degrees per texel at the default 2048 face. Fine texture is the same sphere.
SOFT_FACE_WIDTHS = 2.0     # 2048 face -> 4096-wide sphere (the old panorama's density)
SS = 2                     # project each face at 2x its size, then box-filter down (no aliasing)
FINE_GAIN = 1.5            # fine detail slightly faster than the old sky: it survives the cube cut

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
                 seed: int | None, face: int | None, mood: str | None, palette: str | None) -> dict:
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
    spec = deep_merge(spec, {k: v for k, v in file_spec.items() if k not in ("name", "preset", "seed", "face")})
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
    spec["face"] = int(face if face is not None else file_spec.get("face", DEFAULT_FACE))
    return validate_spec(spec)


def stable_seed(name: str) -> int:
    h = 2166136261
    for ch in name.encode():
        h = ((h ^ ch) * 16777619) & 0xFFFFFFFF
    return h % 100000


def validate_spec(spec: dict) -> dict:
    if spec["mood"] not in MOODS:
        sys.exit(f"mood must be one of {', '.join(MOODS)}; got '{spec['mood']}'")
    if spec["face"] not in FACE_SIZES:
        sys.exit(f"face size must be one of {', '.join(map(str, FACE_SIZES))} "
                 f"(each of the six faces is face x face pixels)")
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


# --------------------------------------------------------------------------------------- sphere / cube helpers
def sphere_dirs(w: int, h: int) -> np.ndarray:
    """Unit directions for a panorama-shaped (h, w) grid — only used to build the soft layers.

    The grid itself is an equirectangular layout, but nothing about a *face* depends on it: it is a
    convenient equal-area-ish sampling of the sphere that `sample_sphere` then reads back in
    direction space, so a face corner and a face edge are the same as any other direction.
    """
    lon = (np.arange(w, dtype=np.float32) + 0.5) / w * (2 * np.pi)
    lat = np.pi / 2 - (np.arange(h, dtype=np.float32) + 0.5) / h * np.pi
    cl = np.cos(lat)[:, None]
    d = np.empty((h, w, 3), np.float32)
    d[..., 0] = cl * np.cos(lon)[None, :]
    d[..., 1] = np.sin(lat)[:, None] * np.ones((1, w), np.float32)
    d[..., 2] = cl * np.sin(lon)[None, :]
    return d


def face_dirs(face: str, n: int) -> np.ndarray:
    """Unit directions for one cube face, row 0 at the top, as the game draws it.

    A pixel of a face is an exact direction: no two faces need to agree about an edge because they
    are all reading the same sphere through this mapping. `n` is the face resolution; FACE_AXES says
    which way the face's right, up and outward axes point in the game's world.
    """
    right, up, out = (np.array(a, np.float32) for a in FACE_AXES[face])
    t = ((np.arange(n, dtype=np.float32) + 0.5) / n) * 2.0 - 1.0        # -1 .. 1 across the face
    # `out` is the axis the face looks along; a direction is out + t_x*right + t_y*(-up) so that
    # row 0 of the image is the face's top.
    d = (out[None, None, :]
         + t[None, :, None] * right[None, None, :]
         - t[:, None, None] * up[None, None, :]).astype(np.float32)
    d /= np.linalg.norm(d, axis=-1, keepdims=True)
    return d


def sphere_weights(h: int) -> np.ndarray:
    """Area weight of each row of a `sphere_dirs` grid (cos(latitude)); the column weights are even."""
    lat = np.pi / 2 - (np.arange(h, dtype=np.float32) + 0.5) / h * np.pi
    return np.cos(lat)[:, None] * np.ones((1, 1), np.float32)


def sample_sphere(grid: np.ndarray, dirs: np.ndarray) -> np.ndarray:
    """Read a sphere sampling `grid` (h, w[, c]) at arbitrary unit `dirs` (n, 3) -> (n[, c]).

    Bilinear, interpolating only between real samples (the caller supplies a margin), so a face edge
    is never a special case: the same code reads the middle of a face and its rim.
    """
    h, w = grid.shape[:2]
    lat = np.arcsin(np.clip(dirs[:, 1], -1, 1))
    lon = np.arctan2(dirs[:, 2], dirs[:, 0]) % (2 * np.pi)
    # sample centres sit at (i + 0.5)/w and (j + 0.5)/h, matching sphere_dirs()
    x = np.clip(lon / (2 * np.pi) * w - 0.5, 0, w - 1.001)
    y = np.clip((np.pi / 2 - lat) / np.pi * h - 0.5, 0, h - 1.001)
    x0 = np.floor(x).astype(np.int32)
    y0 = np.floor(y).astype(np.int32)
    fx = (x - x0).astype(np.float32)
    fy = (y - y0).astype(np.float32)
    x1 = np.minimum(x0 + 1, w - 1)
    y1 = np.minimum(y0 + 1, h - 1)
    if grid.ndim == 3:
        fx = fx[:, None]
        fy = fy[:, None]
    a = grid[y0, x0] * (1 - fx) + grid[y0, x1] * fx
    b = grid[y1, x0] * (1 - fx) + grid[y1, x1] * fx
    return a * (1 - fy) + b * fy


def project_face(grid: np.ndarray, face: str, n: int, ss: int = SS) -> np.ndarray:
    """Project a sphere sampling onto one face at `n x n`, rendering at `ss` times that and box-filtering.

    The box filter uses the face's pixel *centres*, so two faces sharing an edge average over the same
    directions there: the seam measure in `report` sits at zero on a smooth sky, which is what makes it
    a sharp test for a real seam rather than a measure of resampling noise.

    Supersampling matters for the *stars*: they are drawn at face resolution, and without it the
    brightest ones alias into single hard pixels. The box filter averages them the way the old
    equirect picture averaged nothing — extra pixels, no blur.
    """
    big = max(1, int(ss))
    d = face_dirs(face, n * big).reshape(-1, 3)
    out = np.empty((d.shape[0],) + grid.shape[2:], np.float32)
    step = max(1, 4_000_000 // max(1, n * big))
    for s in range(0, d.shape[0], step):
        out[s:s + step] = sample_sphere(grid, d[s:s + step])
    out = out.reshape((n * big, n * big) + grid.shape[2:])
    if big > 1:
        if out.ndim == 3:
            h, w = n * big, n * big
            out = out.reshape(n, big, n, big, out.shape[2]).mean(axis=(1, 3))
        else:
            out = out.reshape(n, big, n, big).mean(axis=(1, 3))
    return out.astype(np.float32)


def face_uv(face: str, n: int) -> np.ndarray:
    """Pixel centres of a face in its own (u, v) plane, used to place stars without re-sampling."""
    t = ((np.arange(n, dtype=np.float32) + 0.5) / n) * 2.0 - 1.0
    return t


def dir_to_face(face: str, d: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Where a direction lands on a face, in pixels (may be outside it: callers clip).

    Row/column convention is `face_dirs`' own, so a star placed through this function and a face
    rendered through `face_dirs` cannot disagree.
    """
    right, up, out = (np.array(a, np.float32) for a in FACE_AXES[face])
    denom = d @ out
    denom = np.where(np.abs(denom) < 1e-6, 1e-6, denom)
    tu = (d @ right) / denom
    tv = (d @ up) / denom          # +1 at the TOP row of the image (row 0), matching face_dirs
    return tu, tv


def upscale(a: np.ndarray, w: int, h: int) -> np.ndarray:
    """Resize a float field (h0,w0[,c]) to (h,w). The sphere wraps in longitude, so the edges are
    extended before the resize and the extension is cropped off again."""
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
    p2 = int(round(pad * sx))
    return np.ascontiguousarray(out[:, p2:p2 + w])


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
    """Returns the sky's soft layers as a sphere sampling, HDR linear light, float32 (hs, ws, 3).

    The sky is one picture of the whole sphere; the cube faces are cut from it later
    (`render_faces`). Building it once means the six faces are guaranteed to agree — there is no
    per-face code that could drift — and it means a 4096-per-face sky does not pay for its soft
    layers six times over.
    """
    W = int(round(spec["face"] * SOFT_FACE_WIDTHS))
    H = W // 2
    seed = spec["seed"]
    noise = Noise3(seed)
    rng = np.random.default_rng(seed + 1)
    neb, dust, stars, band = spec["nebula"], spec["dust"], spec["stars"], spec["band"]

    ws, hs = W, H
    D = sphere_dirs(ws, hs)
    P = D.reshape(-1, 3)
    area = np.broadcast_to(sphere_weights(hs), (hs, ws)).copy()        # equal-area weights

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
    # The soft layers are at the sphere's own resolution (`SOFT_FACE_WIDTHS` face widths): they are
    # smooth, so nothing above that is ever visible, and the whole cube costs one sphere, not six.
    L = np.clip(L + band_light, 0, None).astype(np.float32)

    # Fine photographic texture on the gas, at the sphere's resolution (the old sky's own density),
    # multiplied in before the faces are cut — so it is in direction space like everything else.
    det = float(spec["detail"])
    if det > 0.01:
        log_fn("fine detail")
        Dfull = D.reshape(-1, 3)
        hi = noise.fbm(Dfull * np.float32(32.0 * FINE_GAIN / sc), 3, gain=0.62, lac=2.1, slot=20).reshape(hs, ws)
        hi2 = noise.fbm(Dfull * np.float32(110.0 * FINE_GAIN), 2, gain=0.6, lac=2.0, slot=21).reshape(hs, ws)
        tex = 1.0 + det * (0.45 * hi + 0.16 * hi2)
        del hi, hi2
        L *= np.clip(tex, 0.15, None)[..., None]
        del tex

    # The star density map travels with the sky: stars are placed per face (they need face pixels),
    # but where they are allowed to be is decided here, once, in direction space.
    return L, dens.astype(np.float32)


class StarField:
    """The stars of one sky, in direction space, ready to be drawn face by face.

    Stars are placed once, on the sphere (uniform, thinned by the star-density map so dust hides
    them), and each face then draws whichever of them it can see — with the face's own pixel size, so
    a 4096 face gets finer stars than a 2048 one, which is the whole point of the sharper cube. A
    star that straddles a face edge is drawn by both faces from the same direction and the same
    gaussian, so the two halves meet exactly: drawing in direction-space, not pixel-space, is what
    keeps a cube map free of little cut-off stars along its edges.
    """

    def __init__(self, spec: dict, seed: int, dens: np.ndarray):
        st = spec["stars"]
        rng = np.random.default_rng(seed + 1)
        hs, ws = dens.shape
        n_cand = int(34000 * float(st["density"]))
        self.n = 0
        if n_cand <= 0:
            return
        # uniform points on the sphere, thinned by the density map (dust hides stars, the band and
        # cores add them)
        v = rng.normal(size=(n_cand * 2, 3)).astype(np.float32)
        v /= np.linalg.norm(v, axis=1, keepdims=True)
        lat = np.arcsin(np.clip(v[:, 1], -1, 1))
        lon = np.arctan2(v[:, 2], v[:, 0]) % (2 * np.pi)
        px = np.minimum((lon / (2 * np.pi) * ws).astype(int), ws - 1)
        py = np.minimum(((np.pi / 2 - lat) / np.pi * hs).astype(int), hs - 1)
        p_acc = dens[py, px] / max(float(dens.max()), 1e-6)
        keep = rng.random(len(v)) < p_acc
        idx = np.flatnonzero(keep)[:n_cand]
        n = len(idx)
        self.dir = v[idx]
        # brightness: a power law. Very many faint stars, very few bright ones (like the real sky)
        u = rng.random(n)
        self.flux = np.minimum((1.0 - u) ** (-1.0 / 1.32), 1500.0).astype(np.float32)
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
        self.col = col / np.maximum(luma(col), 1e-4)[:, None]
        # peak brightness in linear HDR units: the faintest are barely there, the brightest bloom hard
        self.peak = (0.010 * self.flux ** 0.78) * float(st["brightness"])
        self.n = n
        log(f"{n} stars placed")

    def draw(self, face: str, rgb: np.ndarray, scale: float, halos: float) -> None:
        """Add this face's share of the stars into `rgb` (n, n, 3) in place. `scale` = face / 2048."""
        if self.n == 0:
            return
        n = rgb.shape[0]
        tu, tv = dir_to_face(face, self.dir)
        front = (self.dir @ np.array(FACE_AXES[face][2], np.float32)) > 1e-6
        sig = (0.62 + 0.20 * np.log2(self.flux) ** 0.9 * 0.35) * scale                 # px, bigger when brighter
        # reach of each star in face pixels, including its halo: only draw what can touch the face
        reach = np.where(self.flux > 90, 42.0 * sig, 3.0 * sig) + 2.0
        cx = (tu * 0.5 + 0.5) * n
        cy = (0.5 - tv * 0.5) * n
        near = front & (cx > -reach) & (cx < n + reach) & (cy > -reach) & (cy < n + reach)
        if not near.any():
            return
        sel = np.flatnonzero(near)
        cx, cy, sig, peak, col = cx[sel], cy[sel], sig[sel], self.peak[sel], self.col[sel]
        flux = self.flux[sel]
        splat(rgb, cx, cy, sig, sig, peak[:, None] * col)
        if halos > 0.01:
            big = flux > 90
            if big.any():
                splat(rgb, cx[big], cy[big], 4.0 * sig[big], 4.0 * sig[big],
                      (peak[big] * 0.022 * halos)[:, None] * col[big])
            huge = flux > 450
            if huge.any():
                splat(rgb, cx[huge], cy[huge], 14.0 * sig[huge], 14.0 * sig[huge],
                      (peak[huge] * 0.004 * halos)[:, None] * col[huge])


def splat(rgb: np.ndarray, cx, cy, sx, sy, col) -> None:
    """Add gaussian stars (centre cx,cy in pixels, width sx,sy, colour*peak) into `rgb` in place.

    The same function the equirect picture used, minus the horizontal wrap: a cube face is a window
    onto the sphere, so a star that falls outside it is drawn by the neighbouring face instead (it is
    clipped here and continues there from the same direction, so the join is invisible).
    """
    H, W = rgb.shape[:2]
    sx = np.minimum(sx, 90.0)
    sy = np.minimum(sy, 90.0)
    rx = np.ceil(3.0 * sx).astype(int)
    ry = np.ceil(3.0 * sy).astype(int)
    key = rx * 1000 + ry
    for k in np.unique(key):
        sel = np.flatnonzero(key == k)
        rxk, ryk = int(k // 1000), int(k % 1000)
        win = (2 * rxk + 1) * (2 * ryk + 1)
        step = max(1, 2_000_000 // max(win, 1))
        ox = np.arange(-rxk, rxk + 1)
        oy = np.arange(-ryk, ryk + 1)
        for s in range(0, len(sel), step):
            ids = sel[s:s + step]
            x0 = np.floor(cx[ids]).astype(int)
            y0 = np.floor(cy[ids]).astype(int)
            dx = (x0[:, None] + ox[None, :] + 0.5) - cx[ids][:, None]
            dy = (y0[:, None] + oy[None, :] + 0.5) - cy[ids][:, None]
            wxs = np.exp(-0.5 * (dx / sx[ids][:, None]) ** 2)
            wys = np.exp(-0.5 * (dy / sy[ids][:, None]) ** 2)
            xx = x0[:, None] + ox[None, :]
            yy = y0[:, None] + oy[None, :]
            ok = (xx >= 0) & (xx < W) & (yy >= 0) & (yy < H)
            if not ok.any():
                continue
            wgt = np.where(ok[:, :, None], wys[:, :, None] * wxs[:, None, :], 0.0)
            flat = np.clip(yy, 0, H - 1)[:, :, None] * W + np.clip(xx, 0, W - 1)[:, None, :]
            ww = wgt.reshape(-1)
            fl = flat.reshape(-1)
            rr = np.repeat(col[ids][:, None, :], len(ox), 1)
            rr = np.repeat(rr, len(oy), 2).reshape(-1, 3)
            for c in range(3):
                add = np.bincount(fl, ww * rr[:, c], minlength=H * W).reshape(H, W)
                rgb[..., c] += add.astype(np.float32)


# --------------------------------------------------------------------------------------- finishing
def aces(x):
    a, b, c, d, e = 2.51, 0.03, 2.43, 0.59, 0.14
    return np.clip((x * (a * x + b)) / (x * (c * x + d) + e), 0, 1)


def bloom(hdr: np.ndarray, face_px: int) -> np.ndarray:
    """A little bloom, in face pixels so it looks the same at every face size.

    Blurring happens inside the face. That is safe here and not a seam risk: the faces are cut from
    ONE sphere, so the glow a star throws across a face edge is already present in the neighbouring
    face's own pixels, arriving there by the same projection. Nothing is duplicated and nothing is
    cut off — the picture is continuous across the twelve edges by construction.
    """
    s = face_px / 2048.0
    bright = np.clip(hdr - 0.08, 0, None)
    return hdr + gauss_blur(bright, 2.2 * s) * 0.22 + gauss_blur(bright, 9.0 * s) * 0.10 \
        + gauss_blur(bright, 36.0 * s) * 0.05


def tone(blk: np.ndarray, exposure: float, spec: dict) -> np.ndarray:
    """Tone map, saturate, encode and contrast one block of linear light -> sRGB 0..1."""
    blk = aces(blk * exposure)
    sat = float(spec["saturation"])
    if sat != 1.0:
        lm = (blk @ LUMA)[..., None]
        blk = np.clip(lm + (blk - lm) * sat, 0, 1)
    blk = lin_to_srgb(blk)
    contrast = float(spec["contrast"])
    if contrast != 1:
        blk = np.clip((blk - 0.5) * contrast + 0.5, 0, 1)
    return blk


def exposure_for(faces: dict, spec: dict) -> float:
    """One exposure for the whole cube: binary-search the mood on a decimated copy of all six faces.

    The mood is a property of the sky, not of a face — exposing each face on its own would make the
    six disagree about how bright the sky is, which is exactly the seam we must never ship.
    """
    target = MOODS[spec["mood"]]

    def mean_at(e):
        tot, wsum = 0.0, 0.0
        for a in faces.values():
            y = tone(a[::4, ::4], e, spec)
            tot += float(luma(y).sum())
            wsum += y.shape[0] * y.shape[1]
        return tot / max(wsum, 1)

    lo, hi = math.log(0.02), math.log(60.0)
    for _ in range(26):
        mid = (lo + hi) / 2
        if mean_at(math.exp(mid)) < target:
            lo = mid
        else:
            hi = mid
    e = math.exp((lo + hi) / 2)
    log(f"exposure x{e:.2f} for mood '{spec['mood']}' (target mean {target})")
    return e


def finish_face(hdr: np.ndarray, exposure: float, spec: dict, rng) -> np.ndarray:
    """Dothered 8-bit sRGB face, in row blocks so a big face never has two copies alive."""
    H, W = hdr.shape[:2]
    grain = float(spec["grain"])
    img8 = np.empty((H, W, 3), np.uint8)
    step = 512
    for r in range(0, H, step):
        blk = tone(hdr[r:r + step], exposure, spec)
        if grain > 0:
            n = (rng.random(blk.shape[:2] + (1,), dtype=np.float32)
                 + rng.random(blk.shape[:2] + (1,), dtype=np.float32) - 1.0)
            blk = blk + n * (grain / 255.0) * 0.85      # triangular dither, under one 8-bit step
        img8[r:r + step] = np.clip(blk * 255.0 + 0.5, 0, 255).astype(np.uint8)
    return img8


def render_faces(spec: dict, log_fn=log) -> dict:
    """Build the sky once, then render, finish and dither the six faces one at a time.

    Returns {face: uint8 (face, face, 3)}. One face is alive at a time as an HDR float image (about
    130 MB at 2048, 500 MB at 4096) so this fits in a few GB of RAM for any face size.
    """
    face = int(spec["face"])
    log_fn("the sky (soft layers)")
    sphere, dens = build_sky(spec, log_fn)
    log_fn("stars")
    stars = StarField(spec, spec["seed"], dens)
    del dens

    halos = float(spec["stars"]["halos"])
    scale = face / 2048.0
    hdr_faces = {}
    for name in FACE_ORDER:
        log_fn(f"face {name}: project")
        f = project_face(sphere, name, face, SS)
        stars.draw(name, f, scale, halos)
        hdr_faces[name] = bloom(f, face)
        del f
    del sphere

    exposure = exposure_for(hdr_faces, spec)
    rng = np.random.default_rng(spec["seed"] + 99)
    out = {}
    for name in FACE_ORDER:
        log_fn(f"face {name}: finish")
        out[name] = finish_face(hdr_faces.pop(name), exposure, spec, rng)
    return out


# --------------------------------------------------------------------------------------- reports / previews
def report(faces: dict, label: str, file_kb: float | None = None) -> list[str]:
    """Brightness / seam / size report for a whole cube.

    The seam check is the important one: each face edge is compared with the edge of the face that
    actually touches it, after undoing the 90-degree turn between the two faces' pixel rows and
    columns. A line along an edge shows up here as a large difference while the rest of the picture
    is smooth.
    """
    a = {k: v.astype(np.float32) / 255.0 for k, v in faces.items()}
    n = next(iter(a.values())).shape[0]
    # luminance of the whole cube, area weighted like the sphere it came from
    tot, wsum = 0.0, 0.0
    for f in a.values():
        tot += float(luma(f).sum())
        wsum += luma(f).size
    mean_l = tot / wsum
    allpix = np.concatenate([luma(f).ravel() for f in a.values()])
    p50, p99, p999 = (float(np.percentile(allpix, q)) for q in (50, 99, 99.9))
    bright = float((allpix > 0.5).mean() * 100)
    very_bright = float((allpix > 0.8).mean() * 100)
    mc = {c: float(np.mean([f[..., i].mean() for f in a.values()])) for i, c in enumerate("RGB")}
    lines = [f"--- {label}",
             f"size           6 faces, {n}x{n} each"
             + (f"   files {file_kb:.0f} KB total" if file_kb is not None else ""),
             f"mean brightness {mean_l:.3f}   median {p50:.3f}   p99 {p99:.3f}   p99.9 {p999:.3f}",
             f"pixels > 0.5    {bright:.3f}%   > 0.8: {very_bright:.4f}%",
             f"mean colour     R{mc['R']:.3f} G{mc['G']:.3f} B{mc['B']:.3f}"]
    warns = []
    seam = cube_seam_error(a)
    lines.append("seam (worst face-to-face edge) mean diff "
                 + ", ".join(f"{k} {v:.2f}" for k, v in seam.items()) + "/255")
    if sizes_disagree(faces):
        warns.append("the six faces are not all the same square size")
    if mean_l > 0.13:
        warns.append(f"too bright for 'dark' space (mean {mean_l:.3f}); the game's brightest sky is about 0.13")
    if mean_l < 0.012:
        warns.append(f"almost pure black (mean {mean_l:.3f}) - nothing will be visible")
    if bright > 2.0:
        warns.append(f"more than 2% of the sky is bright ({bright:.2f}%); it will not read as dark space")
    worst = max(seam.values()) if seam else 0.0
    if worst > 6:
        warns.append(f"visible seam between faces (worst edge diff {worst:.1f}/255)")
    if file_kb is not None and file_kb > FILE_BUDGET_KB:
        warns.append(f"files are {file_kb:.0f} KB; every skybox is inlined into the one-file game "
                     f"- lower --quality or --face-size")
    lines += [f"WARNING: {w}" for w in warns] or ["OK: dark, seamless and within budget"]
    return lines


def sizes_disagree(faces: dict) -> bool:
    shapes = {v.shape for v in faces.values()}
    return len(shapes) != 1 or any(s[0] != s[1] for s in shapes)


# The face that shares each edge of each face. `side` is which edge of the face: t, b, l, r.
CUBE_NEIGHBOURS = {
    ("px", "l"): "pz", ("px", "r"): "nz", ("px", "t"): "py", ("px", "b"): "ny",
    ("nx", "l"): "nz", ("nx", "r"): "pz", ("nx", "t"): "py", ("nx", "b"): "ny",
    ("py", "l"): "nx", ("py", "r"): "px", ("py", "t"): "pz", ("py", "b"): "nz",
    ("ny", "l"): "nx", ("ny", "r"): "px", ("ny", "t"): "nz", ("ny", "b"): "pz",
    ("pz", "l"): "nx", ("pz", "r"): "px", ("pz", "t"): "py", ("pz", "b"): "ny",
    ("nz", "l"): "px", ("nz", "r"): "nx", ("nz", "t"): "py", ("nz", "b"): "ny",
}


def cube_seam_error(a: dict) -> dict:
    """Mean |difference| along every cube edge, in 0..255, keyed by "<face>.<side>".

    Deliberately computed in DIRECTION space: for each pixel along an edge of a face, its direction
    is worked out from `face_dirs`, and that same direction is read out of the neighbouring face.
    Two faces share an edge exactly where those directions meet, so a line drawn along an edge (a
    real seam) shows up as a large difference while the picture itself is smooth. Doing it this way
    means no hand-written table of flips and transposes can be wrong.
    """
    out = {}
    for face, img in a.items():
        n = img.shape[0]
        dirs = face_dirs(face, n)
        for side, neighbour in ((s, CUBE_NEIGHBOURS[(face, s)]) for s in ("t", "b", "l", "r")):
            if neighbour not in a:
                continue
            if side == "t":
                e1, d1 = img[0], dirs[0]
            elif side == "b":
                e1, d1 = img[-1], dirs[-1]
            elif side == "l":
                e1, d1 = img[:, 0], dirs[:, 0]
            else:
                e1, d1 = img[:, -1], dirs[:, -1]
            tu, tv = dir_to_face(neighbour, d1.reshape(-1, 3).astype(np.float32))
            nb = a[neighbour].astype(np.float32)
            u = np.clip((tu * 0.5 + 0.5) * n - 0.5, 0, n - 1.001)
            v = np.clip((0.5 - tv * 0.5) * n - 0.5, 0, n - 1.001)
            x0 = np.floor(u).astype(np.int32)
            y0 = np.floor(v).astype(np.int32)
            fx, fy = (u - x0)[:, None], (v - y0)[:, None]
            x1, y1 = np.minimum(x0 + 1, n - 1), np.minimum(y0 + 1, n - 1)
            top = nb[y0, x0] * (1 - fx) + nb[y0, x1] * fx
            bot = nb[y1, x0] * (1 - fx) + nb[y1, x1] * fx
            e2 = top * (1 - fy) + bot * fy
            out[f"{face}.{side}"] = float(np.abs(e1 - e2).mean() * 255.0)
    return out


def face_image(faces: dict, yaw_deg: float, pitch_deg: float, fov_deg: float, w: int, h: int) -> np.ndarray:
    """A flat 'camera' view out of the cube — what a pilot sees looking that way (for previews)."""
    fov = math.radians(fov_deg)
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    x = (np.arange(w, dtype=np.float32) + 0.5) / w * 2 - 1
    y = 1 - (np.arange(h, dtype=np.float32) + 0.5) / h * 2
    sx = np.tan(fov / 2) * (w / h)
    sy = np.tan(fov / 2)
    d = np.empty((h, w, 3), np.float32)
    d[..., 0] = x[None, :] * sx
    d[..., 1] = y[:, None] * sy
    d[..., 2] = -1.0
    d /= np.linalg.norm(d, axis=-1, keepdims=True)
    cy, syw = math.cos(yaw), math.sin(yaw)
    cp, sp = math.cos(pitch), math.sin(pitch)
    rot_y = np.array([[cy, 0, syw], [0, 1, 0], [-syw, 0, cy]], np.float32)
    rot_x = np.array([[1, 0, 0], [0, cp, -sp], [0, sp, cp]], np.float32)
    d = d.reshape(-1, 3) @ (rot_x @ rot_y).T
    return sample_cube(faces, d.reshape(h, w, 3))


def sample_cube(faces: dict, dirs: np.ndarray) -> np.ndarray:
    """Bilinear sample of the cube in the given directions (n,3) or (h,w,3) -> float 0..1."""
    shape = dirs.shape
    d = dirs.reshape(-1, 3)
    out = np.zeros((d.shape[0], 3), np.float32)
    best = np.full(d.shape[0], -2.0, np.float32)
    for name in FACE_ORDER:
        out_ax = np.array(FACE_AXES[name][2], np.float32)
        dot = d @ out_ax
        tu, tv = dir_to_face(name, d)
        inside = (np.abs(tu) <= 1) & (np.abs(tv) <= 1) & (dot > 0)
        win = inside & (dot > best)
        if not win.any():
            continue
        best[win] = dot[win]
        img = faces[name].astype(np.float32) / 255.0
        n = img.shape[0]
        u = np.clip((tu[win] * 0.5 + 0.5) * n - 0.5, 0, n - 1.001)
        v = np.clip((0.5 - tv[win] * 0.5) * n - 0.5, 0, n - 1.001)
        x0 = np.floor(u).astype(np.int32)
        y0 = np.floor(v).astype(np.int32)
        fx, fy = (u - x0)[:, None], (v - y0)[:, None]
        x1, y1 = np.minimum(x0 + 1, n - 1), np.minimum(y0 + 1, n - 1)
        top = img[y0, x0] * (1 - fx) + img[y0, x1] * fx
        bot = img[y1, x0] * (1 - fx) + img[y1, x1] * fx
        out[win] = top * (1 - fy) + bot * fy
    return out.reshape(shape)


def make_preview(faces: dict, path: Path, boost: float = 1.0) -> None:
    """A contact sheet: the six faces as a cube net, then four pilot's-eye views (~70 degrees)."""
    n = next(iter(faces.values())).shape[0]
    tile = 320
    im = {k: Image.fromarray(v).resize((tile, tile), Image.LANCZOS) for k, v in faces.items()}
    # the net: row 1 = py on top of the middle, middle row = nx, pz, px, nz, row 3 = ny
    sheet = Image.new("RGB", (tile * 4, tile * 3), (0, 0, 0))
    sheet.paste(im["py"], (tile * 2, 0))
    for i, k in enumerate(["nx", "pz", "px", "nz"]):
        sheet.paste(im[k], (tile * i, tile))
    sheet.paste(im["ny"], (tile * 2, tile * 2))
    # four views, below the net
    views = Image.new("RGB", (tile * 4, int(tile * 0.5625)), (0, 0, 0))
    vw, vh = tile, int(tile * 0.5625)
    for i, (yaw, pitch) in enumerate(((0, 0), (90, 0), (180, 0), (270, 1))):
        v = (face_image(faces, yaw, pitch, 70, vw, vh) * 255.0 + 0.5).astype(np.uint8)
        views.paste(Image.fromarray(v), (i * vw, 0))
    out = Image.new("RGB", (tile * 4, tile * 3 + vh), (0, 0, 0))
    out.paste(sheet, (0, 0))
    out.paste(views, (0, tile * 3))
    if boost != 1.0:
        out = Image.fromarray(np.clip(np.asarray(out).astype(np.float32) * boost, 0, 255).astype(np.uint8))
    out.save(path, quality=90)


# --------------------------------------------------------------------------------------- install into the game
GEN_RE = re.compile(r"([ \t]*// BEGIN GENERATED[^\n]*\n)(.*?)([ \t]*// END GENERATED)", re.S)


def read_manifest() -> dict:
    """The installed skyboxes, read back from src/data/skyboxes.js (one line each)."""
    entries = {}
    if DATA_FILE.exists():
        m = GEN_RE.search(DATA_FILE.read_text(encoding="utf-8"))
        if m:
            for line in m.group(2).splitlines():
                mm = re.match(r"\s*([a-z][a-z0-9_]*): (\{.*\}),\s*$", line)
                if mm:
                    entries[mm.group(1)] = line.strip()
    return entries


def face_paths(name: str) -> list[Path]:
    return [ASSET_DIR / name / f"{f}.webp" for f in FACE_ORDER]


def install(spec: dict, faces: dict, label: str, quality: int = 90) -> float:
    """Write the six faces, save the recipe and register the sky. Returns the total KB."""
    total = 0.0
    for name in FACE_ORDER:
        d = ASSET_DIR / spec["name"]
        d.mkdir(parents=True, exist_ok=True)
        target = d / f"{name}.webp"
        Image.fromarray(faces[name]).save(target, "WEBP", quality=int(quality), method=6)
        total += target.stat().st_size / 1024
    SPEC_DIR.mkdir(parents=True, exist_ok=True)
    with open(SPEC_DIR / f"{spec['name']}.json", "w", encoding="utf-8") as f:
        json.dump(spec, f, indent=2)
        f.write("\n")
    entries = read_manifest()
    tint = spec["palette"][0].lstrip("#").lower()
    entries[spec["name"]] = (
        f'{spec["name"]}: {{ n: {json.dumps(label)}, preset: {json.dumps(spec["preset"])}, '
        f'seed: {spec["seed"]}, face: {spec["face"]}, tint: 0x{tint} }},')
    write_registries(entries)
    return total


def write_registries(entries: dict) -> None:
    """Rewrite both GENERATED blocks from `entries` (id -> its data/skyboxes.js line)."""
    block = "".join(f"  {entries[k]}\n" for k in sorted(entries))
    data_src = DATA_FILE.read_text(encoding="utf-8")
    DATA_FILE.write_text(GEN_RE.sub(lambda m: m.group(1) + block + m.group(3), data_src, count=1), encoding="utf-8")
    # src/render/skyboxes.js: six imports per sky, in three.js cube order (px, nx, py, ny, pz, nz)
    imports, mapping = [], []
    for k in sorted(entries):
        for f in FACE_ORDER:
            imports.append(f'import sky_{k}_{f} from "../assets/skyboxes/{k}/{f}.webp";\n')
        mapping.append("  " + k + ": [" + ", ".join(f"sky_{k}_{f}" for f in FACE_ORDER) + "],\n")
    url_src = URL_FILE.read_text(encoding="utf-8")
    parts = list(GEN_RE.finditer(url_src))
    if len(parts) != 2:
        sys.exit("src/render/skyboxes.js has lost its BEGIN/END GENERATED markers; restore them from git")
    url_src = url_src[:parts[0].start()] + parts[0].group(1) + "".join(imports) + parts[0].group(3) \
        + url_src[parts[0].end():parts[1].start()] + parts[1].group(1) + "".join(mapping) + parts[1].group(3) \
        + url_src[parts[1].end():]
    URL_FILE.write_text(url_src, encoding="utf-8")


def remove(name: str) -> None:
    """Un-install one skybox: its six images and both registry lines, in that order.

    The mirror of `install` — `src/assets/skyboxes/` is the tool's folder, so nothing may be deleted
    out of it by hand either. A name that is not installed is not an error.

    **The recipe is kept**, deliberately: `tools/skybox/specs/<name>.json` is the only thing that can
    make the sky again, and a removed sky is exactly the one someone will want back. (Found the hard
    way on 2026-11-15: a `remove` that took the recipe with it left nothing to re-make from.) So a
    removed sky is one command away — `make <name> --spec tools/skybox/specs/<name>.json --install`
    — and re-renders byte-for-byte.
    """
    import shutil
    entries = read_manifest()
    known = name in entries
    removed = []
    folder = ASSET_DIR / name
    if folder.exists():
        shutil.rmtree(folder)
        removed.append(f"{folder}/ ({len(FACE_ORDER)} faces)")
    spec_file = SPEC_DIR / f"{name}.json"
    if known:
        del entries[name]
        write_registries(entries)
        removed.append("its line in src/data/skyboxes.js and src/render/skyboxes.js")
    if not removed:
        print(f"'{name}' was not installed; nothing to remove")
        return
    print(f"REMOVED {name}: " + "; ".join(removed))
    if spec_file.exists():
        print(f"kept its recipe ({spec_file}): `make {name} --spec {spec_file} --install` makes it again")


# --------------------------------------------------------------------------------------- CLI
def cmd_presets(_args) -> None:
    for name, p in sorted(load_presets().items()):
        print(f"{name:16s} {p.get('about', '')}")
    print("\nValid --set keys:", valid_keys())
    print("Moods:", ", ".join(f"{k} ({v})" for k, v in MOODS.items()))
    print(f"Face sizes: {', '.join(map(str, FACE_SIZES))} (default {DEFAULT_FACE}; six faces per sky)")


def cmd_list(_args) -> None:
    for k, line in sorted(read_manifest().items()):
        print(line)
    if not read_manifest():
        print("(no generated skyboxes installed yet)")


def cmd_remove(args) -> None:
    if not NAME_RE.match(args.name):
        sys.exit("name must be lowercase letters, digits and underscores, starting with a letter")
    remove(args.name)


def cmd_check(args) -> None:
    """Report an installed sky (by id) or a folder of six face images."""
    name = args.name
    if NAME_RE.match(name) and (ASSET_DIR / name).is_dir():
        files = face_paths(name)
        missing = [f for f in files if not f.exists()]
        if missing:
            sys.exit(f"{name} is missing {len(missing)} face(s): " + ", ".join(str(m) for m in missing))
        faces = {f: np.asarray(Image.open(p).convert("RGB")) for f, p in zip(FACE_ORDER, files)}
        kb = sum(p.stat().st_size for p in files) / 1024
        print("\n".join(report(faces, f"{name} ({ASSET_DIR / name}/)", kb)))
        return
    p = Path(name)
    if not p.exists():
        sys.exit(f"'{name}' is neither an installed skybox nor a file")
    img = np.asarray(Image.open(p).convert("RGB"))
    h, w = img.shape[:2]
    if w == 2 * h:
        sys.exit("that is an equirectangular panorama: this tool makes cube maps now, so there is "
                 "nothing honest to check it against (see tools/skybox/README.md)")
    face = w // 4 if w % 4 == 0 else w
    sys.exit(f"{w}x{h} is not a sky this tool can check: a sky is six {face}x{face} face images in "
             f"src/assets/skyboxes/<id>/ — check it by id instead, e.g. `check {p.parent.name}`")


def cmd_make(args) -> None:
    if not NAME_RE.match(args.name):
        sys.exit("name must be lowercase letters, digits and underscores, starting with a letter (e.g. crimson_pit)")
    spec = resolve_spec(args.name, args.preset, args.spec, args.set or [], args.seed, args.face, args.mood, args.palette)
    if spec["face"] >= 8192:
        log("8192 per face: six of those is about 400 megapixels; needs a lot of RAM and many minutes")
    log(f"making '{spec['name']}' preset={spec['preset']} seed={spec['seed']} "
        f"6 x {spec['face']}px faces mood={spec['mood']}")
    faces = render_faces(spec)
    out_dir = Path(args.out_dir) if args.out_dir else OUT_DIR_DEFAULT
    out_dir.mkdir(parents=True, exist_ok=True)
    total = 0.0
    for name in FACE_ORDER:
        target = out_dir / f"{spec['name']}_{name}.webp"
        Image.fromarray(faces[name]).save(target, "WEBP", quality=int(args.quality), method=6)
        total += target.stat().st_size / 1024
        if args.png:
            Image.fromarray(faces[name]).save(out_dir / f"{spec['name']}_{name}.png")
    lines = report(faces, f"{spec['name']} ({out_dir}/)", total)
    if args.preview:
        pv = out_dir / f"{spec['name']}.preview.jpg"
        make_preview(faces, pv, boost=args.preview_boost)
        lines.append(f"preview sheet   {pv}   (six faces as a cube net + four pilot's-eye views; "
                     f"--preview-boost brightens the sheet only)")
    print("\n".join(lines))
    if args.install:
        if any(l.startswith("WARNING") for l in lines) and not args.force:
            sys.exit("not installed because of the warnings above (fix them, or add --force if you really mean it)")
        kb = install(spec, faces, args.label or spec["name"].replace("_", " ").title(), args.quality)
        print(f"INSTALLED {spec['name']}: src/assets/skyboxes/{spec['name']}/ (6 faces, {kb:.0f} KB), registered in "
              f"src/data/skyboxes.js and src/render/skyboxes.js; recipe saved to "
              f"tools/skybox/specs/{spec['name']}.json")
        print(f'Use it in an instance:  sky: {{ kind: "cube", skybox: "{spec["name"]}", shards: 30 }}')
    else:
        print("Not installed (preview only). Add --install to put it in the game.")


def main() -> None:
    ap = argparse.ArgumentParser(description="Tallow Reach skybox generator (cube maps)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("presets", help="list looks and valid keys").set_defaults(fn=cmd_presets)
    sub.add_parser("list", help="list installed skyboxes").set_defaults(fn=cmd_list)
    r = sub.add_parser("remove", help="un-install a skybox (faces, recipe and registry lines)")
    r.add_argument("name", help="the id to remove")
    r.set_defaults(fn=cmd_remove)
    c = sub.add_parser("check", help="report brightness/seam/size of an installed skybox")
    c.add_argument("name", help="the id of an installed skybox")
    c.set_defaults(fn=cmd_check)
    m = sub.add_parser("make", help="render a skybox")
    m.add_argument("name", help="lowercase_with_underscores")
    m.add_argument("--preset", help="a look (see `presets`)")
    m.add_argument("--spec", help="a JSON spec file (tools/skybox/specs/*.json to re-make one)")
    m.add_argument("--seed", type=int, help="different seed = different sky of the same look")
    m.add_argument("--face", "--face-size", dest="face", type=int, choices=list(FACE_SIZES),
                   help=f"pixels per side of each of the six faces (default {DEFAULT_FACE})")
    m.add_argument("--mood", choices=list(MOODS), help="overall brightness")
    m.add_argument("--palette", help='gas colours, e.g. "#ff5a2a,#7a1f5c"')
    m.add_argument("--set", action="append", help="override one knob, e.g. --set nebula.coverage=0.7 (repeatable)")
    m.add_argument("--quality", type=int, default=90, help="webp quality (default 90)")
    m.add_argument("--out-dir", help="where to write previews/the webp (default ./skybox-out)")
    m.add_argument("--png", action="store_true", help="also write lossless PNGs")
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
