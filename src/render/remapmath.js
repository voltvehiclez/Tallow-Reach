// The edge-compression lens's pure maths — no three.js here, on purpose: the HUD
// and the tests use the same curves the full-screen shader uses, and a mistake
// here is a bug in our shared brain, not in one caller.
//
// The lens is a linear blend of the rectilinear mapping and the stereographic
// one, in NDC form:
//
//   G(a)   = (1 - s) * tan(a) + s * 2 * tan(a / 2)     (s = REMAP.strength)
//   u      = G(a) / norm     per axis
//
// u is the HUD/shader frame coordinate, a the world half-angle. Each axis maps
// [-1, 1] to [-Ea, Ea] with Ea = G^-1(norm) slightly beyond REMAP.edge
// (G < tan), and both axes share the SAME centre scale:
//
//   landscape (aspect >= 1):   nx = tan(edge) * aspect   (horizontal)
//                              ny = tan(edge)            (vertical)
//   portrait  (aspect  < 1):   nx = tan(edge)            (horizontal)
//                              ny = tan(edge) / aspect   (vertical)
//
// so an object on-axis is drawn at EXACTLY the same scale in both axes on any
// window shape — circles are circles in the middle of the frame, always. The
// per-axis derivative is G'(a) = (1-s)*sec^2(a) + s*sec^2(a/2) >= 1, so the
// rim magnifies relative to centre on each axis. This is separable, not a
// conformal 2-D projection: at the left/right rim a small body reads wider
// than tall; at the top/bottom rim it reads taller than wide. s = 0 is plain
// rectilinear over the axis's range.
//
// The source image is a plain rectilinear render whose tan(B) is chosen so the
// inverse-projected edge of BOTH axes is inside it (`sourceHalfTanB`) — merely
// covering the vertical angle is not enough, and clamping the rim was a real
// bug (blurry frame border, horizontally-squashed edge planets).
//
// Boost/warp widening is NOT animated through this curve: the lens mode keeps
// camera.fov static. The warp streaks and flash carry the speed feel instead.

import { REMAP } from "../data/camera.js";

export const tanDeg = deg => Math.tan((deg * Math.PI) / 180);

const edgeRad = () => (REMAP.edge * Math.PI) / 180;

/** Per-axis normalisers for a window shape. Centre parity (equal px/radian x and y) is exact for every aspect. */
export function axisNorms(aspect) {
  const tanV = tanDeg(REMAP.edge);
  if (aspect >= 1) return { nx: tanV * aspect, ny: tanV };
  return { nx: tanV, ny: tanV / aspect };
}

/** G(a): the blend, numerator of the frame mapping. a in radians. */
export function blendG(a, s = REMAP.strength) {
  return (1 - s) * Math.tan(a) + s * 2 * Math.tan(a / 2);
}

/** G'(a): px density per radian (also the circle aspect vs centre). */
export function blendGp(a, s = REMAP.strength) {
  return (1 - s) / Math.cos(a) ** 2 + s / Math.cos(a / 2) ** 2;
}

/**Frame NDC for a view-space direction angle a (radians) on ONE axis — pass the axis normalizer. */
export function ndcFromAlpha(a, norm = tanDeg(REMAP.edge)) {
  return blendG(a, REMAP.strength) / norm;
}

/**
 * Solve G(a) = u * norm on one axis. Bisection on w = tan(a/2) over
 * f(w) = 2s·w^3 − uT·w^2 − 2w + uT — the cubic has exactly one root in the
 * bracket for every preset edge, so this cannot diverge. The GLSL twin in
 * remap.js must match.
 */
export function alphaFromU(u, norm = tanDeg(REMAP.edge)) {
  const s = REMAP.strength;
  const uT = u * norm;
  if (uT === 0) return 0;
  const f = w => 2 * s * w ** 3 - uT * w * w - 2 * w + uT;
  let a = -0.85, b = 0.85; // covers axis half-angles up to ~80 degrees (any monitor)
  let fa = f(a);
  const faNegative = fa < 0;
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if ((fm < 0) === faNegative) { a = m; fa = fm; } else { b = m; }
  }
  return 2 * Math.atan((a + b) / 2);
}

/** View-space vector (fwd = distance in front of the camera, always > 0) → frame NDC, both axes. */
export function viewToNdc(x, y, fwd, aspect = 1) {
  const { nx, ny } = axisNorms(aspect);
  return {
    x: blendG(Math.atan(x / fwd), REMAP.strength) / nx,
    y: blendG(Math.atan(y / fwd), REMAP.strength) / ny,
  };
}

/** Pixels for a cone of `deg` degrees at the frame centre, measured on the vertical axis. */
export function conePixels(deg, heightPx, aspect = 1) {
  if (!(deg > 0)) return 0;
  const { ny } = axisNorms(aspect);
  return (blendG((deg * Math.PI) / 180, REMAP.strength) / ny) * (heightPx / 2);
}

/**
 * tan(B) the source (rectilinear) render must cover so no output pixel samples
 * outside it. The source is rendered with this same aspect, so its horizontal
 * reach is tan(B) * aspect and its vertical reach is tan(B); both must cover the
 * *inverse-projected* edge angles of the lens. (Checking G(alpha) — the NDC
 * coordinate — instead of tan(alpha) was not enough and clamped the frame's rim.)
 */
export function sourceHalfTanB(aspect) {
  const { nx, ny } = axisNorms(aspect);
  const requiredX = Math.tan(alphaFromU(1, nx)) / aspect;
  const requiredY = Math.tan(alphaFromU(1, ny));
  const need = Math.max(requiredX, requiredY);
  return Math.tan(Math.atan(need) + Math.PI / 360); // 0.5 degree of margin
}
