// The edge-compression lens maths: the blend the full-screen shader and the HUD
// must agree on. If these fail, the picture and its markers drift apart at the
// frame's edges — the exact bug class the lens exists to avoid.
import { test } from "node:test";
import assert from "node:assert/strict";
import { REMAP } from "../src/data/camera.js";
import {
  tanDeg,
  axisNorms,
  blendG,
  blendGp,
  ndcFromAlpha,
  alphaFromU,
  conePixels,
  viewToNdc,
  sourceHalfTanB,
} from "../src/render/remapmath.js";

const EDGE = (REMAP.edge * Math.PI) / 180;
const EDGE_TAN = Math.tan(EDGE);

test("the window shape never stretches the centre: exact px/radian parity", () => {
  // For the same angular offset, an on-axis object is drawn at the same scale
  // on both axes — circles are circles in the middle of the frame, any aspect.
  for (const aspect of [0.5, 0.75, 1, 1.15, 16 / 9, 21 / 9]) {
    const W = 1600 * Math.min(1, aspect) * 1, H = 1600 * Math.min(1, 1 / aspect) * 1;
    const f = 10, a = 0.05; // radians between points
    const px = (x, y) => viewToNdc(x, y, f, aspect);
    const nx = px(Math.tan(a) * f, 0, f).x;
    const ny = px(0, Math.tan(a) * f, f).y;
    assert.ok(Math.abs(Math.abs(nx) * W - Math.abs(ny) * H) < 1e-6 * W, `centre parity broken at aspect ${aspect}`);
  }
});

test("both axes cover at least the data edge, odd and monotonic", () => {
  for (const aspect of [0.75, 1, 1.15, 16 / 9]) {
    const { nx, ny } = axisNorms(aspect);
    assert.ok(Math.abs(alphaFromU(-1, nx) + alphaFromU(1, nx)) < 1e-12);
    assert.ok(alphaFromU(1, nx) >= EDGE - 1e-12, `short axis undershoots at aspect ${aspect}`);
    assert.ok(alphaFromU(1, ny) >= EDGE - 1e-12);
    let prev = -Infinity;
    for (let i = 0; i <= 400; i++) {
      const u = -1 + (2 * i) / 400;
      const a = alphaFromU(u, nx);
      assert.ok(a > prev, "curve folded");
      prev = a;
    }
  }
});

test("the shader's inversion recovers the sample angle (round trip, both axes)", () => {
  for (const aspect of [0.75, 1, 16 / 9]) {
    const { nx, ny } = axisNorms(aspect);
    for (const norm of [nx, ny]) {
      for (const u of [-1, -0.93, -0.5, -0.13, 0, 0.07, 0.42, 0.8, 0.97, 1]) {
        const a = alphaFromU(u, norm);
        assert.ok(Math.abs(ndcFromAlpha(a, norm) - u) < 1e-9, `round trip failed at u=${u}, norm=${norm}`);
      }
    }
  }
  assert.equal(alphaFromU(0, 1), 0);
});

test("circles never read taller than they are (aspect >= 1 everywhere)", () => {
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
  // Small-angle limit: px ≈ deg(rad) * (H/2) / tan(edge).
  const { ny } = axisNorms(1);
  const deg = 0.5;
  const expected = ((deg * Math.PI) / 180) * (h / 2) / ny;
  assert.ok(Math.abs(conePixels(deg, h) - expected) / expected < 1e-3, "small-angle limit drifted");
});

test("a point in front of the camera projects, a point behind does not", () => {
  const centre = viewToNdc(0, 0, 10);
  assert.deepEqual(centre, { x: 0, y: 0 });
  // Same angular offset lands symmetrically on both axes in a square window.
  const t = Math.tan(0.2) * 10;
  const a = viewToNdc(t, t, 10, 1);
  assert.ok(Math.abs(a.x - a.y) < 1e-12);
});

test("the source render always covers the frame — no black edges, any aspect", () => {
  // Every output pixel must sample inside the source: horizontal samples need
  // |tan(a(u))| <= tanB * aspect, vertical samples need |tan(a(u))| <= tanB.
  const aspectList = [0.25, 0.5, 0.75, 1, 1.33, 16 / 9, 21 / 9, 32 / 9];
  for (const aspect of aspectList) {
    const tanB = sourceHalfTanB(aspect);
    const { nx, ny } = axisNorms(aspect);
    for (let i = 0; i <= 100; i++) {
      const u = -1 + (2 * i) / 100;
      const tx = Math.abs(Math.tan(alphaFromU(u, nx)));
      const ty = Math.abs(Math.tan(alphaFromU(u, ny)));
      assert.ok(tx <= tanB * aspect + 1e-9, `horizontal samples outside the source (aspect ${aspect})`);
      assert.ok(ty <= tanB + 1e-9, `vertical samples outside the source (aspect ${aspect})`);
    }
  }
});

test("strength 0 is plain rectilinear over the axis range", () => {
  const E = tanDeg(REMAP.edge);
  for (const u of [-0.8, -0.3, 0.2, 0.7]) {
    assert.ok(Math.abs(blendG(Math.atan(u * E), 0) - u * E) < 1e-12);
  }
});
