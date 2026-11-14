// The painted sky (step 14, owner bug report 2026-11-14: the rift's sky read as triangles).
//
// A sky is a look, so what a test can honestly check is: that it is painted from the place's own
// data, that one roll source paints one sky exactly, that the stars are spread over the sphere and
// not over the canvas, and that the painter really covers the canvas with what the generators made.
// The generators are pure and take their roll function, so none of this needs a browser.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { SKY_SIZE, SKY_COUNTS, skyClouds, skyStars, skyCracks, paintSky } from "../src/render/sky.js";
import { makeRng } from "../src/util/rng.js";
import { INSTANCE_TEMPLATES } from "../src/data/instances.js";

const SKY = INSTANCE_TEMPLATES.guardian_rift.sky;
const DEEP = INSTANCE_TEMPLATES.deep_rift.sky;

/** `0xrrggbb` as the css rgba() the painter writes. */
const rgba = (hex, a) => `rgba(${(hex >> 16) & 255}, ${(hex >> 8) & 255}, ${hex & 255}, ${a})`;

/** A canvas that records every call made on it, so a test can see the picture that was painted. */
function stubCanvas(context = true) {
  const calls = [];
  const gradient = () => ({
    addColorStop: (offset, colour) => calls.push({ name: "addColorStop", args: [offset, colour] }),
  });
  const ctx = {
    fillStyle: "", strokeStyle: "", globalAlpha: 1, lineWidth: 1, lineJoin: "", lineCap: "",
    shadowBlur: 0, shadowColor: "",
    // A gradient is a fresh object every call, so it is recorded as what it is: its own stops are
    // recorded separately, in order, which is where the colours are compared.
    fillRect: (...args) => calls.push({
      name: "fillRect", args,
      fill: typeof ctx.fillStyle === "object" ? "gradient" : ctx.fillStyle,
      alpha: ctx.globalAlpha,
    }),
    createRadialGradient: (...args) => { calls.push({ name: "createRadialGradient", args }); return gradient(); },
    createLinearGradient: (...args) => { calls.push({ name: "createLinearGradient", args }); return gradient(); },
    beginPath: () => calls.push({ name: "beginPath" }),
    moveTo: (...args) => calls.push({ name: "moveTo", args }),
    lineTo: (...args) => calls.push({ name: "lineTo", args }),
    stroke: () => calls.push({
      name: "stroke", stroke: ctx.strokeStyle, width: ctx.lineWidth, blur: ctx.shadowBlur, alpha: ctx.globalAlpha,
    }),
  };
  const canvas = { width: 0, height: 0, getContext: kind => (context && kind === "2d" ? ctx : null) };
  return { canvas, calls, ctx };
}

const named = (calls, name) => calls.filter(c => c.name === name);

test("one roll source paints one sky, exactly, and a different seed paints a different one", () => {
  const a = stubCanvas(), b = stubCanvas(), c = stubCanvas();
  paintSky(SKY, a.canvas, makeRng(7));
  paintSky(SKY, b.canvas, makeRng(7));
  paintSky(SKY, c.canvas, makeRng(8));

  assert.deepEqual(a.calls, b.calls, "the same seed paints stroke for stroke, star for star");
  assert.notDeepEqual(a.calls, c.calls, "and another seed does not");
  assert.equal(a.canvas.width, SKY_SIZE.w, "the canvas is the size the sky asked for");
  assert.equal(a.canvas.height, SKY_SIZE.h);
});

test("the sky is painted from the place's own palette, so two rifts are not the same sky", () => {
  const { canvas, calls } = stubCanvas();
  paintSky(SKY, canvas, makeRng(11));

  // The dark goes down first, over the whole canvas, in the place's own base colour.
  const first = calls[0];
  assert.equal(first.name, "fillRect", "the base is laid down before anything else");
  assert.deepEqual(first.args, [0, 0, SKY_SIZE.w, SKY_SIZE.h], "and it covers the canvas");
  assert.equal(first.fill, rgba(SKY.col, 1), "in the colour the template authored");

  // The clouds and the bright stars are the place's glow; the fractures are its own crack colour.
  const stops = named(calls, "addColorStop").map(c => c.args[1]);
  assert.ok(stops.some(s => s.startsWith(rgba(SKY.glow, 1).replace(/, 1\)$/, ""))),
    "the rift's glow is in the picture");
  const strokes = named(calls, "stroke");
  assert.ok(strokes.some(s => s.stroke === rgba(SKY.cracks, 1)), "and so are its fractures");
  assert.ok(strokes.some(s => s.stroke === "rgba(0, 0, 0, 1)"),
    "each fracture has a dark lip, so it reads as a gap and not a line drawn on top");

  // The deeper collapse declares a colder palette; the painter must honour that, not its defaults.
  const deep = stubCanvas();
  paintSky(DEEP, deep.canvas, makeRng(11));
  assert.equal(deep.calls[0].fill, rgba(DEEP.col, 1), "the deep rift is painted in its own dark");
  assert.notEqual(deep.calls[0].fill, first.fill, "which is not the basic rift's");
});

test("the stars are spread over the sphere, not over the canvas, and very few of them are bright", () => {
  const stars = skyStars(SKY, makeRng(5));
  assert.equal(stars.length, SKY_COUNTS.stars, "the sky is told how many stars it has");
  for (const s of stars) {
    assert.ok(Number.isFinite(s.u) && s.u >= 0 && s.u < 1, "u is across the canvas");
    assert.ok(Number.isFinite(s.v) && s.v >= 0 && s.v <= 1, "v is down it");
    assert.ok(s.b > 0 && s.b <= 1, "and every star has a brightness");
    assert.ok(s.r >= 1, "no star is thinner than a pixel");
  }

  // Even over the sphere, not over the canvas. A cap of half-angle θ covers (1 - cos θ) / 2 of the
  // sky, so the top tenth of the *canvas* (θ = 0.1π) holds about 2.4% of the stars and the middle
  // fifth holds about 31% — the opposite of a flat roll, which would give 10% and 20% and leave the
  // mapped sky crowded at the poles and thin at the equator.
  const share = (lo, hi) => stars.filter(s => s.v >= lo && s.v < hi).length / stars.length;
  const cap = (1 - Math.cos(0.1 * Math.PI)) / 2,
    band = (Math.cos(0.4 * Math.PI) - Math.cos(0.6 * Math.PI)) / 2;
  assert.ok(Math.abs(share(0, 0.1) - cap) < 0.01,
    `${(share(0, 0.1) * 100).toFixed(1)}% of the stars are in the top tenth of the map (${(cap * 100).toFixed(1)}% of the sky)`);
  assert.ok(Math.abs(share(0.4, 0.6) - band) < 0.02,
    `${(share(0.4, 0.6) * 100).toFixed(1)}% are across the middle (${(band * 100).toFixed(1)}% of the sky)`);

  const bright = stars.filter(s => s.glow).length / stars.length;
  assert.ok(bright < 0.06, `${(bright * 100).toFixed(1)}% of stars are bright enough to carry a glow`);
  assert.ok(stars.filter(s => s.b < 0.5).length > stars.length * 0.6, "most of them are faint");
  assert.ok(stars.some(s => s.warm) && stars.some(s => !s.warm), "some are warm and some are not");
});

test("the clouds lie along one band, and about a third of them are dust", () => {
  const clouds = skyClouds(SKY, makeRng(3));
  assert.equal(clouds.length, SKY_COUNTS.clouds);
  const vs = clouds.map(c => c.v);
  assert.ok(Math.max(...vs) - Math.min(...vs) < 0.7,
    "one band, not an even fog over the whole sky (the band is a third of the map's height)");
  for (const c of clouds) {
    assert.ok(c.r > 0 && c.r < 0.4, "a cloud is a soft roundel, not the whole canvas");
    assert.ok(c.a > 0 && c.a < 0.4, "and never strong enough to be a wall");
  }
  const dust = clouds.filter(c => c.dark).length / clouds.length;
  assert.ok(dust > 0.15 && dust < 0.55, `${(dust * 100).toFixed(0)}% of the clouds take light away`);
});

test("the fractures wander and fork, and stay numbers a canvas can draw", () => {
  const cracks = skyCracks(SKY, makeRng(9));
  assert.equal(cracks.length, SKY_COUNTS.cracks);
  for (const c of cracks) {
    assert.ok(c.pts.length >= 6, "a fracture is a run of points, not one straight line");
    for (const p of [...c.pts, ...c.forks.flat()]) {
      assert.ok(Number.isFinite(p.u) && Number.isFinite(p.v), `${JSON.stringify(p)} is drawable`);
    }
    assert.ok(c.w > 0 && c.a > 0 && c.a <= 1, "with a weight and a brightness");
    // A fork leaves from somewhere along its parent, the way glass does.
    for (const fork of c.forks) {
      assert.ok(fork.length >= 3, "a fork is a run too");
      assert.ok(c.pts.some(p => p.u === fork[0].u && p.v === fork[0].v), "and it starts on the parent");
    }
  }
  assert.ok(cracks.some(c => c.forks.length > 0), "some of them fork");
});

test("the painter draws every star, wraps the seam, and darkens the poles", () => {
  const { canvas, calls } = stubCanvas();
  const rnd = makeRng(21);
  paintSky(SKY, canvas, rnd);

  const rects = named(calls, "fillRect");
  // One for the base, three per cloud (itself and one canvas width either side, so the seam is
  // whole), a halo and a pinpoint for the bright stars and a pinpoint for every other one, and two
  // for the poles. The stars are the bulk of it.
  assert.ok(rects.length > SKY_COUNTS.stars, `${rects.length} fills for ${SKY_COUNTS.stars} stars`);

  const strokes = named(calls, "stroke");
  // Every run is stroked three times (the dark lip, the hot hairline, a wide bloom of it) at three
  // offsets (wrapped), and every crack has at least its own run.
  assert.ok(strokes.length >= SKY_COUNTS.cracks * 9, `${strokes.length} strokes for ${SKY_COUNTS.cracks} fractures`);
  assert.equal(strokes.length % 9, 0, "each run is the same nine strokes");

  const poles = named(calls, "createLinearGradient");
  assert.equal(poles.length, 2, "the top and the bottom of the map are eaten");
  assert.deepEqual(poles[0].args, [0, 0, 0, SKY_SIZE.h * 0.22], "from the top edge down");
});

test("a canvas that cannot give a 2D context is not a crash", () => {
  const canvas = { width: 0, height: 0, getContext: () => null };
  assert.equal(paintSky(SKY, canvas, makeRng(1)), canvas, "the sky is simply not painted");
  assert.equal(paintSky(null, stubCanvas().canvas, makeRng(1)).width, SKY_SIZE.w, "and no sky data is not a crash");
});
