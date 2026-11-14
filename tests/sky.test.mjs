// The painted sky (step 14, owner bug reports 2026-11-14).
//
// Two complaints, two rules. The first: a sky of flat panels read as triangles, so the sky is painted
// on a canvas and wrapped around a sphere. The second: "Make the skybox less orange. Make it darker,
// no stars, some mysterious nebula and shattered asteroids in the background skybox."
//
// A sky is a look, so what a test can honestly check is: that it is painted from the place's own data,
// that one roll source paints one sky exactly, that the nebula's washes are spread over the *sphere*
// and not over the canvas, that there is nothing in it that could be a star, that the palette really is
// dark and cold, and that the painter covers the canvas with what the generators made. The generators
// are pure and take their roll function, so none of this needs a browser.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as skyModule from "../src/render/sky.js";
import { SKY_SIZE, SKY_COUNTS, skyVeils, skyClouds, skyWisps, skyCracks, paintSky } from "../src/render/sky.js";
import { makeRng } from "../src/util/rng.js";
import { INSTANCE_TEMPLATES } from "../src/data/instances.js";

const SKY = INSTANCE_TEMPLATES.guardian_rift.sky;
const DEEP = INSTANCE_TEMPLATES.deep_rift.sky;

/** `0xrrggbb` as the css rgba() the painter writes. */
const rgba = (hex, a) => `rgba(${(hex >> 16) & 255}, ${(hex >> 8) & 255}, ${hex & 255}, ${a})`;
/** `0xrrggbb` as its three channels. */
const rgb = hex => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
/** Relative luminance, 0..1: how much light a colour carries however it is used. */
const lum = hex => {
  const [r, g, b] = rgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};
/** Amber is red over green over blue. A sky that is not orange does not have that ordering in it. */
const isAmber = hex => {
  const [r, g, b] = rgb(hex);
  return r > g && g > b;
};

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

  assert.deepEqual(a.calls, b.calls, "the same seed paints stroke for stroke, wash for wash");
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

  // Both of the nebula's lights are in the picture, and the fractures are the template's own colour.
  const stops = named(calls, "addColorStop").map(c => c.args[1]);
  for (const colour of [SKY.glow, SKY.veil]) {
    assert.ok(stops.some(s => s.startsWith(rgba(colour, 1).replace(/, 1\)$/, ""))),
      `${colour.toString(16)} is one of this sky's two lights`);
  }
  const strokes = named(calls, "stroke");
  assert.ok(strokes.some(s => s.stroke === rgba(SKY.cracks, 1)), "and so are its fractures");
  assert.ok(strokes.some(s => s.stroke === "rgba(0, 0, 0, 1)"),
    "each fracture has a dark lip, so it reads as a gap and not a line drawn on top");

  // The deeper collapse declares a colder palette; the painter must honour that, not its defaults.
  const deep = stubCanvas();
  paintSky(DEEP, deep.canvas, makeRng(11));
  assert.equal(deep.calls[0].fill, rgba(DEEP.col, 1), "the deep rift is painted in its own dark");
  assert.notEqual(deep.calls[0].fill, first.fill, "which is not the basic rift's");
  const deepStops = named(deep.calls, "addColorStop").map(c => c.args[1]);
  assert.ok(deepStops.some(s => s.startsWith(rgba(DEEP.veil, 1).replace(/, 1\)$/, ""))),
    "and it carries its own second light, not the basic rift's");
});

test("the sky is dark, and the sky itself is not orange", () => {
  // The owner's complaint in numbers (2026-11-14): the rift sky was an orange fog. What is left of it
  // is a near-black base with a cold nebula in it, and the only warm colour anywhere in a rift's sky
  // is the hairline of a fracture — one thin ember in a collapsed pocket, not the mood of the place.
  for (const [id, sky] of [["guardian_rift", SKY], ["deep_rift", DEEP]]) {
    assert.ok(lum(sky.col) < 0.05, `${id}: the base is near-black (${lum(sky.col).toFixed(3)})`);
    for (const [field, colour] of [["glow", sky.glow], ["veil", sky.veil]]) {
      assert.equal(isAmber(colour), false, `${id}: the nebula's ${field} is not amber-ordered`);
      assert.ok(lum(colour) < 0.5, `${id}: and it is not a bright light (${lum(colour).toFixed(3)})`);
    }
    assert.notEqual(sky.veil, sky.glow, `${id}: its two lights are not one colour`);
  }
  // A deep collapse is darker than an ordinary one, in both the base and the light inside it.
  assert.ok(lum(DEEP.col) < lum(SKY.col), "the deep rift's dark is darker");
  assert.ok(lum(DEEP.glow) < lum(SKY.glow), "and its nebula is dimmer");

  // Nothing painted on top of that base is allowed to be loud: every light stop in the picture is a
  // whisper, which is what keeps the whole sky dark rather than dark with a bright band in it.
  const { canvas, calls } = stubCanvas();
  paintSky(SKY, canvas, makeRng(13));
  const alphas = named(calls, "addColorStop")
    .map(c => Number.parseFloat(String(c.args[1]).split(",")[3]) || 0)
    .filter(a => a > 0);
  assert.ok(alphas.length > 0, "the painter used alpha stops");
  assert.ok(Math.max(...alphas) <= 0.8, `no wash is stronger than ${Math.max(...alphas).toFixed(2)}`);
});

test("there are no stars in it: nothing that could be a pinpoint is painted or exported", () => {
  // The generator is gone, not switched off: a sky with a star count in it is a sky somebody can turn
  // the stars back on in.
  assert.equal("skyStars" in skyModule, false, "no star generator is exported");
  assert.equal("stars" in SKY_COUNTS, false, "and the sky is told about no stars");

  const { canvas, calls } = stubCanvas();
  paintSky(SKY, canvas, makeRng(17));

  // A star was a fillRect a pixel or two across. Every fill in this sky is either the base, a wash the
  // width of a good part of the canvas, or one of the two pole gradients — nothing small.
  const small = named(calls, "fillRect").filter(c => c.args[2] < 64 || c.args[3] < 64);
  assert.equal(small.length, 0, "nothing in the picture is smaller than a wash");
  // And no fill is drawn at a bare alpha with a hard colour, which is how a pinpoint would have to be
  // made: every light in this sky goes through a gradient that fades to nothing at its edge.
  const hard = named(calls, "fillRect").filter(c => c.fill !== "gradient" && c.alpha === 1 &&
    c.args[2] < SKY_SIZE.w);
  assert.equal(hard.length, 0, "every fill but the base is a gradient over the whole canvas");
});

test("the nebula's veils are spread over the sphere, not over the canvas", () => {
  const veils = skyVeils(SKY, makeRng(5));
  assert.equal(veils.length, SKY_COUNTS.veils, "the sky is told how many veils it has");
  for (const v of veils) {
    assert.ok(Number.isFinite(v.u) && v.u >= 0 && v.u < 1, "u is across the canvas");
    assert.ok(Number.isFinite(v.v) && v.v >= 0 && v.v <= 1, "v is down it");
    assert.ok(v.r > 0.1 && v.r < 0.7, "a veil is huge: it is the body of the nebula");
    assert.ok(v.a > 0 && v.a < 0.3, "and faint, because the sky is meant to stay dark");
    assert.ok(v.tone === "glow" || v.tone === "veil", "in one of the sky's own two lights");
  }

  // Even over the sphere, not over the canvas. A cap of half-angle θ covers (1 - cos θ) / 2 of the
  // sky, so the top tenth of the *canvas* (θ = 0.1π) holds about 2.4% of it and the middle fifth holds
  // about 31% — the opposite of a flat roll, which would crowd the mapped sky at the poles. With five
  // veils the spread is checked over a great many rolls rather than one.
  const cap = (1 - Math.cos(0.1 * Math.PI)) / 2,
    band = (Math.cos(0.4 * Math.PI) - Math.cos(0.6 * Math.PI)) / 2;
  const many = [];
  for (let seed = 0; seed < 400; seed++) many.push(...skyVeils(SKY, makeRng(seed)));
  const share = (lo, hi) => many.filter(v => v.v >= lo && v.v < hi).length / many.length;
  assert.ok(Math.abs(share(0, 0.1) - cap) < 0.02,
    `${(share(0, 0.1) * 100).toFixed(1)}% of veils are in the top tenth of the map (${(cap * 100).toFixed(1)}% of the sky)`);
  assert.ok(Math.abs(share(0.4, 0.6) - band) < 0.03,
    `${(share(0.4, 0.6) * 100).toFixed(1)}% are across the middle (${(band * 100).toFixed(1)}% of the sky)`);
  assert.ok(veils.some(v => v.tone === "glow") || veils.some(v => v.tone === "veil"),
    "and each one names a light to carry");
});

test("the clouds lie along one band, about a third of them are dust, and they carry two lights", () => {
  const clouds = skyClouds(SKY, makeRng(3));
  assert.equal(clouds.length, SKY_COUNTS.clouds);
  const vs = clouds.map(c => c.v);
  assert.ok(Math.max(...vs) - Math.min(...vs) < 0.7,
    "one band, not an even fog over the whole sky (the band is a third of the map's height)");
  for (const c of clouds) {
    assert.ok(c.r > 0 && c.r < 0.4, "a cloud is a soft roundel, not the whole canvas");
    assert.ok(c.a > 0 && c.a < 0.4, "and never strong enough to be a wall");
    assert.ok(c.tone === "glow" || c.tone === "veil", "in one of the sky's own two lights");
  }
  const dust = clouds.filter(c => c.dark).length / clouds.length;
  assert.ok(dust > 0.15 && dust < 0.55, `${(dust * 100).toFixed(0)}% of the clouds take light away`);
  assert.ok(clouds.some(c => !c.dark), "which is not all of them: a nebula has light in it");
});

test("the wisps are long, soft and few, and lie where the light is", () => {
  const wisps = skyWisps(SKY, makeRng(19));
  assert.equal(wisps.length, SKY_COUNTS.wisps, "a handful of filaments, not a web");
  for (const w of wisps) {
    assert.ok(w.pts.length >= 5, "a wisp is a run of points, so it wanders");
    for (const p of w.pts) assert.ok(Number.isFinite(p.u) && Number.isFinite(p.v), "and drawable");
    const span = Math.hypot(
      Math.max(...w.pts.map(p => p.u)) - Math.min(...w.pts.map(p => p.u)),
      (Math.max(...w.pts.map(p => p.v)) - Math.min(...w.pts.map(p => p.v))) * 2
    );
    assert.ok(span > 0.12, `it is long (${span.toFixed(2)} of the map across)`);
    assert.ok(w.w > 4 && w.a > 0 && w.a < 0.2, "wide, blurred and faint: structure, not a line");
    assert.ok(w.tone === "glow" || w.tone === "veil", "in one of the sky's own two lights");
    // Kept inside the part of an equirectangular map that reads as sky: the poles pinch, and paint
    // spent there is paint wasted.
    for (const p of w.pts) assert.ok(p.v >= 0.08 && p.v <= 0.92, `a wisp stays off the poles (${p.v})`);
  }
  const starts = wisps.map(w => w.pts[0].v);
  assert.ok(Math.max(...starts) - Math.min(...starts) < 0.6, "and they start around the nebula's band");
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

test("the painter draws every wash, wraps the seam, and darkens the poles", () => {
  const { canvas, calls } = stubCanvas();
  paintSky(SKY, canvas, makeRng(21));

  const rects = named(calls, "fillRect");
  // One for the base, up to three per wash (itself and one canvas width either side, so the seam is
  // whole) and two for the poles — and at least one per wash, since a wash in the middle of the map
  // is never wholly off-canvas.
  const washes = SKY_COUNTS.veils + SKY_COUNTS.clouds;
  assert.ok(rects.length >= washes + 3, `${rects.length} fills for ${washes} washes, the base and the poles`);
  assert.ok(rects.length <= 1 + washes * 3 + 2, "and never more than the seam-wrapping allows");
  assert.deepEqual(rects[0].args, [0, 0, SKY_SIZE.w, SKY_SIZE.h], "the base covers the canvas");

  const gradients = named(calls, "createRadialGradient");
  assert.equal(gradients.length, rects.length - 3, "every wash is a gradient, and nothing else is");

  const strokes = named(calls, "stroke");
  // A wisp is one stroke at three offsets; every fracture run is three strokes (the dark lip, the hot
  // hairline, a wide bloom of it) at three offsets, and every crack has at least its own run.
  assert.ok(strokes.length >= SKY_COUNTS.wisps * 3 + SKY_COUNTS.cracks * 9,
    `${strokes.length} strokes for ${SKY_COUNTS.wisps} wisps and ${SKY_COUNTS.cracks} fractures`);
  assert.equal(strokes.length % 3, 0, "everything is stroked at the same three seam offsets");

  const poles = named(calls, "createLinearGradient");
  assert.equal(poles.length, 2, "the top and the bottom of the map are eaten");
  assert.deepEqual(poles[0].args, [0, 0, 0, SKY_SIZE.h * 0.22], "from the top edge down");
});

test("a canvas that cannot give a 2D context is not a crash", () => {
  const canvas = { width: 0, height: 0, getContext: () => null };
  assert.equal(paintSky(SKY, canvas, makeRng(1)), canvas, "the sky is simply not painted");
  assert.equal(paintSky(null, stubCanvas().canvas, makeRng(1)).width, SKY_SIZE.w, "and no sky data is not a crash");
});
