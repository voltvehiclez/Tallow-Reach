// The edge-compression lens's pure maths — no three.js here, on purpose: the HUD
// and the tests use the same curves the full-screen shader uses, and a mistake
// here is a bug in our shared brain, not in one caller.
//
// The lens is a linear blend of the rectilinear mapping and the stereographic
// one, in NDC form:
//
//   G(a)   = (1 - s) * tan(a) + s * 2 * tan(a / 2)     (s = REMAP.strength)
//   u      = G(a) / G(REMAP.edge)
//
// u is the HUD/shader frame coordinate, a the world half-angle. Frame edges
// land exactly at a = +/-REMAP.edge. Properties worth knowing (all tested):
// G is odd and strictly increasing for 0 <= s <= 1; the circle aspect of a
// small body (width/height, centre = 1) is G'(a) = (1-s)*sec^2(a) + s*sec^2(a/2)
// >= 1 everywhere; stereographic (s = 1) is conformal (circles stay circles);
// s = 0 is plain rectilinear over the edge angle.
//
// The source image is a plain rectilinear render covering REMAP.edge plus a
// margin — `sourceHalfTanB` is that guarantee (aspect-adaptive, so portrait
// frames still fit). On-axis zoom, edge width and oval factor are data knobs in
// `REMAP` (data/camera.js); this file owns the curve only.
//
// Boost/warp widening is NOT animated through this curve: the lens mode keeps
// camera.fov static. The warp streaks and flash carry the speed feel instead.

import { REMAP } from "../data/camera.js";

export const tanDeg = deg => Math.tan((deg * Math.PI) / 180);

/** G(a): the blend, numerator of the frame mapping. a in radians. */
export function blendG(a, s = REMAP.strength) {
  return (1 - s) * Math.tan(a) + s * 2 * Math.tan(a / 2);
}

/** G'(a): px density per radian (also the circle aspect vs centre). */
export function blendGp(a, s = REMAP.strength) {
  return (1 - s) / Math.cos(a) ** 2 + s / Math.cos(a / 2) ** 2;
}

/** u normaliser: u = 1 at the edge angle. */
export function blendNorm() {
  return blendG((REMAP.edge * Math.PI) / 180, REMAP.strength);
}

/** Frame NDC for a view-space direction angle a (radians). Zoom at the centre is G'/G(edge), which is exact. */
export function ndcFromAlpha(a) {
  return blendG(a, REMAP.strength) / blendNorm();
}

/**
 * Solve G(a) = u * G(edge): the shader's per-pixel inversion.
 * Bisection on w = tan(a/2) (w in [-0.7, 0.7] covers every preset edge) over
 * f(w) = 2s·w^3 − uT·w^2 − 2w + uT — the cubic has exactly one root in that
 * bracket, so this cannot diverge. The GLSL twin in remap.js must match.
 */
export function alphaFromU(u) {
  const s = REMAP.strength;
  const uT = u * blendNorm();
  if (uT === 0) return 0;
  const f = w => 2 * s * w ** 3 - uT * w * w - 2 * w + uT;
  let a = -0.7, b = 0.7;
  let fa = f(a);
  const faNegative = fa < 0;
  // Textbook bisection, sign-agnostic; the principal root is the bracket's only crossing.
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if ((fm < 0) === faNegative) { a = m; fa = fm; } else { b = m; }
  }
  return 2 * Math.atan((a + b) / 2);
}

/** View-space vector (fwd = distance in front of the camera, always > 0) → frame NDC. */
export function viewToNdc(x, y, fwd) {
  return {
    x: ndcFromAlpha(Math.atan(x / fwd)),
    y: ndcFromAlpha(Math.atan(y / fwd)),
  };
}

/** Pixels for a cone of `deg` degrees at the frame centre, measured on the vertical axis. */
export function conePixels(deg, heightPx) {
  if (!(deg > 0)) return 0;
  return ndcFromAlpha((deg * Math.PI) / 180) * (heightPx / 2);
}

/**
 * tan(B) the source (rectilinear) render must cover so no output pixel samples
 * outside it. Landscape: the edge angle plus a small margin. Portrait (aspect
 * < 1): the horizontal frame only covers tan(B)·aspect, so B grows until the
 * edge fits across.
 */
export function sourceHalfTanB(tanEdgeRad, aspect) {
  const t = aspect >= 1 ? tanEdgeRad : tanEdgeRad / aspect;
  return Math.tan(Math.atan(t) + Math.PI / 360); // 0.5 degree of margin
}
