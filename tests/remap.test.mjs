// The edge-compression lens maths: the blend the full-screen shader and the HUD
// must agree on. If these fail, the picture and its markers drift apart at the
// frame's edges — the exact bug class the lens exists to avoid.
import { test } from "node:test";
import assert from "node:assert/strict";
import { REMAP } from "../src/data/camera.js";
import {
  tanDeg,
  blendG,
  blendGp,
  blendNorm,
  ndcFromAlpha,
  alphaFromU,
  conePixels,
  viewToNdc,
  sourceHalfTanB,
} from "../src/render/remapmath.js";

const EDGE = (REMAP.edge * Math.PI) / 180;
const tanE = Math.tan(EDGE);

test("the frame edge lands exactly at REMAP.edge degrees, odd and monotonic", () => {
  assert.ok(Math.abs(ndcFromAlpha(EDGE) - 1) < 1e-12, "the edge angle maps to NDC 1");
  assert.ok(Math.abs(ndcFromAlpha(-EDGE) + 1) < 1e-12);
  let prev = -Infinity;
  for (let i = 0; i <= 400; i++) {
    const a = -EDGE + (2 * EDGE * i) / 400;
    const u = ndcFromAlpha(a);
    assert.ok(u > prev, "curve folded");
    prev = u;
  }
  assert.ok(Math.abs(blendG(EDGE) - blendNorm()) < 1e-12);
});

test("the shader's inversion recovers the sample angle (round trip)", () => {
  for (const u of [-1, -0.93, -0.5, -0.13, 0, 0.07, 0.42, 0.8, 0.97, 1]) {
    const a = alphaFromU(u);
    assert.ok(Math.abs(ndcFromAlpha(a) - u) < 1e-9, `round trip failed at u=${u}`);
  }
  assert.equal(alphaFromU(0), 0);
});

test("circles never read taller than they are (aspect >= 1 everywhere)", () => {
  // The width/height of a small circle at the equator is G'(a); G' >= 1 for any
  // strength in [0, 1]. This is the property the whole feature exists for.
  for (const s of [0, 0.3, 0.6, 0.75, 0.9, 1]) {
    for (let i = 0; i <= 100; i++) {
      const a = -EDGE + (2 * EDGE * i) / 100;
      assert.ok(blendGp(a, s) >= 1 - 1e-12, `aspect dipped below 1 at s=${s}, a=${a}`);
    }
  }
});

test("the oval factor shrinks with strength, as intended", () => {
  const edgeOf = s => blendGp(EDGE, s);
  assert.ok(edgeOf(0) > edgeOf(0.6));
  assert.ok(edgeOf(0.6) > edgeOf(0.9));
  assert.ok(Math.abs(edgeOf(1) - 1 / Math.cos(EDGE / 2) ** 2) < 1e-12);
});

test("the missile-lock ring keeps growing with the cone", () => {
  const h = 900;
  const r10 = conePixels(10, h), r20 = conePixels(20, h), r30 = conePixels(30, h);
  assert.ok(r10 > 0 && r20 > r10 && r30 > r20, "the ring grows with the cone");
  assert.equal(conePixels(0, h), 0);
  // Small-angle limit: px ≈ deg(rad) * (H/2) / G(edge).
  const deg = 0.5;
  const expected = ((deg * Math.PI) / 180) * (h / 2) / blendNorm();
  assert.ok(Math.abs(conePixels(deg, h) - expected) / expected < 1e-3, "small-angle limit drifted");
});

test("a point in front of the camera projects, a point at the edge lands on it", () => {
  const centre = viewToNdc(0, 0, 10);
  assert.deepEqual(centre, { x: 0, y: 0 });
  const edge = viewToNdc(tanE * 10, 0, 10);
  assert.ok(Math.abs(edge.x - 1) < 1e-12, "the edge angle lands exactly on the frame edge");
});

test("the source render always covers the frame — no black edges, any aspect", () => {
  // Every output pixel must sample inside the source: |t(u)| <= tanB for the
  // vertical axis, |t(u)| <= tanB * aspect for the horizontal one. The live
  // half-angle is the data edge (boost/warp widening is disabled in lens mode).
  const aspectList = [0.5, 0.75, 1, 1.33, 16 / 9, 21 / 9];
  for (const aspect of aspectList) {
    const tanB = sourceHalfTanB(tanE, aspect);
    for (let i = 0; i <= 100; i++) {
      const u = -1 + (2 * i) / 100;
      const t = Math.abs(blendG(alphaFromU(u), REMAP.strength));
      assert.ok(t <= tanB * aspect + 1e-9, `horizontal samples outside the source (aspect ${aspect})`);
      assert.ok(t <= tanB + 1e-9, `vertical samples outside the source (aspect ${aspect})`);
    }
  }
});

test("strength 0 is plain rectilinear over the edge angle", () => {
  const E = tanDeg(REMAP.edge);
  for (const u of [-0.8, -0.3, 0.2, 0.7]) {
    assert.ok(Math.abs(blendG(Math.atan(u * E), 0) - u * E) < 1e-12);
    assert.ok(Math.abs(ndcFromAlpha(Math.atan(u * E)) , 1) <= 1); // frame still covers the same cone
  }
});
