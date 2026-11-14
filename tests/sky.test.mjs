// The painted sky (step 14, owner bug reports 2026-11-14).
//
// Three complaints, three rules. The first: a sky of flat panels read as triangles, so the sky is
// painted on a canvas and wrapped around a sphere. The second: "Make the skybox less orange. Make it
// darker, no stars, some mysterious nebula and shattered asteroids in the background skybox." The
// third, on the painted sky: it carried "odd lines" — painted fractures and filaments — and a sky
// with polylines in it is a drawing, not a place, so the painter may not stroke a line at all.
//
// A sky is a look, so what a test can honestly check is: that it is painted from the palette it is given,
// that one roll source paints one sky exactly, that the nebula's washes are spread over the *sphere*
// and not over the canvas, that there is nothing in it that could be a star, that the palette really is
// dark and cold, and that the painter covers the canvas with what the generators made. The generators
// are pure and take their roll function, so none of this needs a browser.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as skyModule from "../src/render/sky.js";
import { SKY_SIZE, SKY_COUNTS, skyVeils, skyClouds, skyCores, skyGrain, paintSky } from "../src/render/sky.js";
import { makeRng } from "../src/util/rng.js";

// Since 2026-11-14 the runtime's skies are the owner's panoramas (see `scene.js`), not this
// painter, so the tests carry their own two stand-in palettes — a basic rift's and a deeper
// collapse's — and keep the painter honest as a piece of kept code, not as the shipped look.
const SKY = { col: 0x05060b, glow: 0x7a5cc4, veil: 0x2a8794 };
const DEEP = { col: 0x03040a, glow: 0x54439f, veil: 0x9c4279 };

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

  // Both of the nebula's lights are in the picture, and nothing else is: no fracture colour, no
  // star white — the palette a template authors is exactly the palette that gets painted.
  const stops = named(calls, "addColorStop").map(c => c.args[1]);
  for (const colour of [SKY.glow, SKY.veil]) {
    assert.ok(stops.some(s => s.startsWith(rgba(colour, 1).replace(/, 1\)$/, ""))),
      `${colour.toString(16)} is one of this sky's two lights`);
  }
  // And nothing in the picture is a line: the owner's round-two complaint was odd lines over an
  // otherwise good sky, and a stroke is the only way this painter could draw one.
  assert.equal(named(calls, "stroke").length, 0, "the painter strokes nothing: no lines in the sky");

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

  // A star was a fillRect a pixel or two across at up to full alpha. The only pixel-scale fills this
  // sky may hold are the dither grain — every wash, even a core of the nebula, is dozens of pixels
  // wide — and grain lives under four hundredths of alpha: the difference between film grain and a
  // point of light.
  const dots = named(calls, "fillRect").filter(c => c.args[2] <= 2 && c.args[3] <= 2);
  assert.equal(dots.length, SKY_COUNTS.grain, "the only pixel-scale fills are the grain");
  assert.ok(dots.every(c => c.alpha <= 0.04), "and no grain pixel is bright enough to be a star");
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

test("the nebula has hearts: small bright cores where the body of it is thickest", () => {
  const cores = skyCores(SKY, makeRng(31));
  assert.equal(cores.length, SKY_COUNTS.cores, "a handful, not a field");
  for (const c of cores) {
    assert.ok(Math.abs(c.v - 0.5) <= 0.25, `a core sits inside the cloud band (v ${c.v.toFixed(2)})`);
    assert.ok(c.r >= 0.02 && c.r <= 0.06, `small against a cloud's 0.03–0.16 (r ${c.r.toFixed(2)})`);
    assert.ok(c.a >= 0.07 && c.a <= 0.17, `the brightest wash in the sky, and still faint (a ${c.a.toFixed(2)})`);
  }
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

test("the grain is a dither, not content: pixels, faint, and everywhere", () => {
  const grain = skyGrain(SKY, makeRng(23));
  assert.equal(grain.length, SKY_COUNTS.grain, "enough pixels to break a contour before it forms");
  for (const g of grain) {
    assert.ok(Number.isFinite(g.u) && g.u >= 0 && g.u < 1, "spread over the whole canvas");
    assert.ok(Number.isFinite(g.v) && g.v >= 0 && g.v < 1, "including the poles' vignette");
    assert.ok(g.a > 0 && g.a <= 0.034, `and each one under four hundredths of alpha (${g.a})`);
  }
  assert.ok(grain.some(g => g.dark) && grain.some(g => !g.dark), "light and dark both, like real dither");
  // A starfield would crowd nowhere and light everything; grain is uniform and lifts nothing.
  const share = grain.filter(g => g.v < 0.1).length / grain.length;
  assert.ok(Math.abs(share - 0.1) < 0.02, "uniform down the canvas, not banded anywhere");
});

test("the painter draws every wash, wraps the seam, and darkens the poles", () => {
  const { canvas, calls } = stubCanvas();
  paintSky(SKY, canvas, makeRng(21));

  const rects = named(calls, "fillRect");
  // One for the base, up to three per wash (itself and one canvas width either side, so the seam is
  // whole), two for the poles, and one per grain pixel — and at least one per wash, since a wash in
  // the middle of the map is never wholly off-canvas.
  const washes = SKY_COUNTS.veils + SKY_COUNTS.clouds + SKY_COUNTS.cores;
  assert.ok(rects.length >= washes + 3 + SKY_COUNTS.grain,
    `${rects.length} fills for ${washes} washes, the base, the poles and the grain`);
  assert.ok(rects.length <= 1 + washes * 3 + 2 + SKY_COUNTS.grain,
    "and never more than the seam-wrapping and the grain allow");
  assert.deepEqual(rects[0].args, [0, 0, SKY_SIZE.w, SKY_SIZE.h], "the base covers the canvas");

  const gradients = named(calls, "createRadialGradient");
  assert.equal(gradients.length, rects.length - 3 - SKY_COUNTS.grain,
    "every wash is a gradient, and nothing else is");

  // The rule the owner's second round of feedback made: this painter has no line in it.
  assert.equal(named(calls, "stroke").length, 0, "nothing is stroked, so nothing can read as a line");
  assert.equal(named(calls, "beginPath").length + named(calls, "moveTo").length + named(calls, "lineTo").length, 0,
    "not even a path is started");

  const poles = named(calls, "createLinearGradient");
  assert.equal(poles.length, 2, "the top and the bottom of the map are eaten");
  assert.deepEqual(poles[0].args, [0, 0, 0, SKY_SIZE.h * 0.22], "from the top edge down");
});

test("a canvas that cannot give a 2D context is not a crash", () => {
  const canvas = { width: 0, height: 0, getContext: () => null };
  assert.equal(paintSky(SKY, canvas, makeRng(1)), canvas, "the sky is simply not painted");
  assert.equal(paintSky(null, stubCanvas().canvas, makeRng(1)).width, SKY_SIZE.w, "and no sky data is not a crash");
});
