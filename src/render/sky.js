// The sky a place is seen under, painted (step 14).
//
// STATUS 2026-11-14: unused at runtime. Both skies (rift `shattered` and wormhole `shroud`) are now the
// owner's equirect panoramas wrapped by `scene.js`, inlined from `src/assets/`. This painter survives
// only because `tests/sky.test.mjs` exercises it; deleting both, or wiring it back in, is the owner's call.
//
// The first rift sky was built out of flat panels with one shade each, and flat panels read as what
// they are: triangles. A broken geometry, not a place (owner bug report 2026-11-14 — "should look
// like space but a bit hellish / dark / shattered. Should look realistic").
//
// So the sky is painted instead, on one canvas, and wrapped around the inside of a sphere by
// `scene.js`: a near-black base with a temperature of its own and the veils and dust of a nebula that
// belongs to nowhere else. Nothing in it is drawn with a line.
//
// Two owner rules shape it. First (2026-11-14): "Make the skybox less orange. Make it darker, no
// stars, some mysterious nebula and shattered asteroids in the background skybox" — so there are no
// stars in it, and the light it has is its own. Second (the same day, a round later): the fractures
// and filaments the first painted sky carried read as **odd lines** drawn over the picture, and had
// to go — "the skybox otherwise looks good ... important the skybox looks realistic/professional".
// A real nebula photograph has no polylines in it: it is gradients all the way down. So this painter
// only ever lays down soft roundels and one invisible pass of dither grain (which keeps the dark
// gradients from banding into contour lines of their own on an 8-bit screen), and the "shattered"
// half of the look is the broken rock drifting in front of the sky, built by `scene.js`.
//
// Every number here is a look, never a rule, and every colour comes from the place's own `sky` data
// (`data/instances.js`), so a deep rift is not wearing a basic rift's sky. The generators are pure and
// take the seeded `cosmeticRandom`, so a test can check what will be painted without a canvas at all
// (tests/sky.test.mjs); only `paintSky` touches one.

import { cosmeticRandom } from "../util/rng.js";

/** The canvas a sky is painted on: wide enough for soft detail, small enough to paint on arrival. */
export const SKY_SIZE = { w: 2048, h: 1024 };

/** How many of each thing a sky is made of. Kept here so a test can ask for the same counts. */
export const SKY_COUNTS = { veils: 5, clouds: 30, cores: 8, grain: 6000 };

/** `0xrrggbb` plus an alpha, as a css colour the 2D context can take. */
function rgba(hex, a) {
  const n = Number(hex) || 0;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, a))})`;
}

/** Black at `a`, for the dust and the poles: the same colour stops, no hue of its own. */
const black = a => `rgba(0, 0, 0, ${Math.max(0, Math.min(1, a))})`;

/**
 * The nebula's two lights: its main colour and the second one a template may declare for the veils
 * that lie under it. A sky with only one colour in it reads as a lamp in fog; two that are not quite
 * the same read as something with a chemistry of its own, which is the "mysterious" the owner asked
 * for. A template that declares no second colour gets a cold one worked out from its first.
 */
function skyColours(sky) {
  const glow = Number(sky?.glow) || 0x6a4cb0;
  const veil = Number(sky?.veil) || glow;
  return { glow, veil };
}

/**
 * The veils: a handful of enormous, very faint washes spread over the whole sphere. They are what the
 * nebula mostly is — light with no edge to it, lying behind everything else — and they are why the sky
 * is not simply black with a stripe across it.
 *
 * `u`, `v` are 0..1 across the canvas, `r` a radius in canvas widths, `a` how strong it is, and `tone`
 * which of the sky's two lights it carries.
 *
 * `rnd` is the roll function: `paintSky` passes one down to every generator, so one seed paints one
 * sky exactly, and a test can ask for the sky that will be painted.
 */
export function skyVeils(sky, rnd = cosmeticRandom, n = SKY_COUNTS.veils) {
  const veils = [];
  for (let i = 0; i < n; i++) {
    veils.push({
      u: rnd(),
      // Evenly over the *sphere*, not over the canvas: this map is equirectangular, so a flat roll
      // would crowd the washes at the poles and leave the middle of the sky empty.
      v: Math.acos(1 - 2 * rnd()) / Math.PI,
      r: 0.22 + rnd() * 0.3,
      // Faint, but present: five of these overlap into the nebula's body, and the sky has to be dark
      // *with something in it* — a collapsed pocket is not an empty one (owner 2026-11-14: "some
      // mysterious nebula").
      a: 0.1 + rnd() * 0.16,
      tone: rnd() < 0.5 ? "glow" : "veil",
    });
  }
  return veils;
}

/**
 * The clouds: soft roundels of the rift's own light lying along one band, the way a nebula lies along
 * a plane, so the sky has a shape to it instead of an even fog. They are drawn in two passes — the
 * light ones, then the dust — because dust that eats light has to be painted over what it eats, and
 * that is what gives a nebula its dark lanes.
 */
export function skyClouds(sky, rnd = cosmeticRandom, n = SKY_COUNTS.clouds) {
  const band = 0.5 + (rnd() - 0.5) * 0.3;   // one band for the whole sky, rolled once
  const clouds = [];
  for (let i = 0; i < n; i++) {
    clouds.push({
      u: rnd(),
      v: band + (rnd() - 0.5) * 0.62,
      r: 0.03 + rnd() * 0.13,
      // Thirty of these overlap where the band crosses the view, so each one stays well under what
      // the pile would read as — a nebula is a whisper of light, not a wall of it.
      a: 0.04 + rnd() * 0.1,
      dark: rnd() < 0.45,
      tone: rnd() < 0.4 ? "veil" : "glow",
    });
  }
  return clouds;
}

/**
 * The cores: the hearts of the nebula. Real emission nebulae are not evenly luminous — the light
 * piles up where the gas is thickest, into knots a fraction of the cloud's width, and the dust lanes
 * cross in front of some of them. These are those knots: small, the brightest things the painter
 * lays down, and still only washes of one colour with soft edges. They are what a pilot's eye rests
 * on in a sky with no stars and no lines in it.
 */
export function skyCores(sky, rnd = cosmeticRandom, n = SKY_COUNTS.cores) {
  const cores = [];
  for (let i = 0; i < n; i++) {
    cores.push({
      u: rnd(),
      // Inside the cloud band, tighter than the clouds themselves: the hearts sit where the body is.
      v: 0.5 + (rnd() - 0.5) * 0.5,
      r: 0.02 + rnd() * 0.04,
      a: 0.07 + rnd() * 0.1,
      tone: rnd() < 0.5 ? "glow" : "veil",
    });
  }
  return cores;
}

/**
 * The grain: single pixels of near-nothing, light and dark, spread evenly over the canvas. It is not
 * content — at these alphas nobody could call it stars or dust — it is a dither: an 8-bit screen
 * turns a wide, dark, smooth gradient into visible contour bands, and a scatter of pixels a fraction
 * of a shade off breaks the contours up before they form. This is the pass that keeps a near-black
 * sky looking like a photograph instead of a poster.
 */
export function skyGrain(sky, rnd = cosmeticRandom, n = SKY_COUNTS.grain) {
  const grains = [];
  for (let i = 0; i < n; i++) {
    grains.push({
      u: rnd(),
      v: rnd(),
      // Under four hundredths of alpha, and most of it under two: enough to move a pixel off its
      // contour, far too little to read as a point of light. A star was painted at up to full
      // alpha; this is the difference between grain and stars.
      a: 0.006 + rnd() * 0.028,
      dark: rnd() < 0.5,
    });
  }
  return grains;
}

/**
 * Paint `sky` (a place record's own `sky` data) onto `canvas` and hand the canvas back. `scene.js`
 * wraps it around the inside of a sphere; nothing here knows about the scene.
 */
export function paintSky(sky, canvas, rnd = cosmeticRandom) {
  const W = (canvas.width = SKY_SIZE.w),
    H = (canvas.height = SKY_SIZE.h),
    ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const col = Number(sky?.col) || 0x05060b,
    { glow, veil } = skyColours(sky),
    tone = which => (which === "veil" ? veil : glow);

  /** A soft roundel of one of the sky's lights, or of the dust that eats them. */
  const wash = (u, v, r, colour, a, dark) => {
    // Drawn three times — at its own spot and one canvas width either side — so a wash on the seam is
    // whole all the way round the sky.
    for (const shift of [-1, 0, 1]) {
      const x = (u + shift) * W,
        y = v * H,
        rad = Math.max(2, r * W);
      if (x + rad < 0 || x - rad > W) continue;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, dark ? black(a * 2.4) : rgba(colour, a));
      g.addColorStop(0.55, dark ? black(a) : rgba(colour, a * 0.28));
      g.addColorStop(1, black(0));
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  };

  // The dark. Not black: the base colour of the place's own sky, so the whole picture has a
  // temperature before anything is drawn on it — and that temperature is nearly nothing, because a
  // collapsed pocket is a dark place to be inside.
  ctx.fillStyle = rgba(col, 1);
  ctx.fillRect(0, 0, W, H);

  // The veils first: the nebula's body, behind everything else in it.
  for (const v of skyVeils(sky, rnd)) wash(v.u, v.v, v.r, tone(v.tone), v.a, false);

  // Then the clouds' light, and then the dust that eats it. Two passes, so a dark lane really does
  // lie in front of the light it is cutting through.
  const clouds = skyClouds(sky, rnd);
  for (const c of clouds) if (!c.dark) wash(c.u, c.v, c.r, tone(c.tone), c.a, false);

  // The hearts of the nebula: brighter and smaller than the body, laid down before the dust so that
  // some of them are crossed by a lane and sit behind something.
  for (const c of skyCores(sky, rnd)) wash(c.u, c.v, c.r, tone(c.tone), c.a, false);

  for (const c of clouds) if (c.dark) wash(c.u, c.v, c.r, tone(c.tone), c.a, true);

  // The poles of an equirectangular map pinch, and a pocket that has broken is darkest away from
  // its light: both are served by eating the top and bottom of the picture.
  for (const [y0, y1] of [[0, H * 0.22], [H, H * 0.78]]) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, black(0.78));
    g.addColorStop(1, black(0));
    ctx.fillStyle = g;
    ctx.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0));
  }

  // Last, the grain, over everything including the pole vignette: one pixel each, no wrap needed (a
  // pixel on the seam is a pixel on the seam), and never bright enough to be a thing in the sky.
  for (const gr of skyGrain(sky, rnd)) {
    ctx.globalAlpha = gr.a;
    ctx.fillStyle = gr.dark ? "#000000" : "#c8d2e1";
    ctx.fillRect(gr.u * W, gr.v * H, 1, 1);
  }
  ctx.globalAlpha = 1;

  return canvas;
}
