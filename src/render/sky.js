// The sky a place is seen under, painted (step 14).
//
// The first rift sky was built out of flat panels with one shade each, and flat panels read as what
// they are: triangles. A broken geometry, not a place (owner bug report 2026-11-14 — "should look
// like space but a bit hellish / dark / shattered. Should look realistic").
//
// So the sky is painted instead, on one canvas, and wrapped around the inside of a sphere by
// `scene.js`: a near-black base with a temperature of its own, soft clouds of the rift's light,
// dust that eats it, a starfield, and the fractures of a pocket that has broken open.
//
// Every number here is a look, never a rule, and every colour comes from the place's own `sky` data
// (`data/instances.js`), so a deep rift is not wearing a basic rift's sky. The three generators are
// pure and take the seeded `cosmeticRandom`, so a test can check what will be painted without a
// canvas at all (tests/sky.test.mjs); only `paintSky` touches one.

import { cosmeticRandom } from "../util/rng.js";

/** The canvas a sky is painted on: wide enough for crisp stars, small enough to paint on arrival. */
export const SKY_SIZE = { w: 2048, h: 1024 };

/** How many of each thing a sky is made of. Kept here so a test can ask for the same counts. */
export const SKY_COUNTS = { clouds: 34, stars: 3200, cracks: 9 };

/** `0xrrggbb` plus an alpha, as a css colour the 2D context can take. */
function rgba(hex, a) {
  const n = Number(hex) || 0;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, a))})`;
}

/** Black at `a`, for the dust and the poles: the same colour stops, no hue of its own. */
const black = a => `rgba(0, 0, 0, ${Math.max(0, Math.min(1, a))})`;

/**
 * The clouds: soft roundels of the rift's own light lying along one band, the way a nebula lies
 * along a plane, so the sky has a shape to it instead of an even fog. Every third one or so is
 * dust — it takes light away rather than adding it, which is what gives a nebula its dark lanes.
 *
 * `u`, `v` are 0..1 across the canvas, `r` is a radius in canvas widths, `a` how strong it is.
 *
 * `rnd` is the roll function: `paintSky` passes one down to all three generators, so one seed paints
 * one sky exactly, and a test can ask for the sky that will be painted.
 */
export function skyClouds(sky, rnd = cosmeticRandom, n = SKY_COUNTS.clouds) {
  const band = 0.5 + (rnd() - 0.5) * 0.3;   // one band for the whole sky, rolled once
  const clouds = [];
  for (let i = 0; i < n; i++) {
    clouds.push({
      u: rnd(),
      v: band + (rnd() - 0.5) * 0.62,
      r: 0.04 + rnd() * 0.16,
      // Faint on purpose: thirty of these overlap where the band crosses the view, and space is
      // mostly dark — a nebula is a whisper of light, not a wall of it.
      a: 0.025 + rnd() * 0.075,
      dark: rnd() < 0.45,
    });
  }
  return clouds;
}

/**
 * The stars. Evenly over the *sphere*, not over the canvas: this map is equirectangular, so a flat
 * roll would crowd the poles. Most stars are faint pinpoints; a handful are bright enough to carry
 * a colour and a glow, and about one in six is warm rather than blue-white.
 */
export function skyStars(sky, rnd = cosmeticRandom, n = SKY_COUNTS.stars) {
  const stars = [];
  for (let i = 0; i < n; i++) {
    const bright = Math.pow(rnd(), 6);      // a long tail: very few stars are very bright
    stars.push({
      u: rnd(),
      v: Math.acos(1 - 2 * rnd()) / Math.PI,
      b: 0.3 + bright * 0.7,
      r: bright > 0.72 ? 2.8 : bright > 0.34 ? 1.8 : 1,
      warm: rnd() < 0.17,
      glow: bright > 0.86,
    });
  }
  return stars;
}

/**
 * The fractures: the shattered half of the sky. Each is a wandering polyline with nothing to do
 * with the geometry of anything — a crack runs where the pocket gave way, and forks where it met
 * something. Points are 0..1 across the canvas, `w` the line's weight, `a` how bright it burns.
 */
export function skyCracks(sky, rnd = cosmeticRandom, n = SKY_COUNTS.cracks) {
  /** One wandering run of points from `u`,`v`, heading `dir`. */
  const walk = (u, v, dir, steps) => {
    const pts = [];
    for (let s = 0; s < steps; s++) {
      pts.push({ u, v });
      dir += (rnd() - 0.5) * 2.2;                 // a fracture jags; it does not run
      const len = 0.012 + rnd() * 0.035;
      u += Math.cos(dir) * len;
      v += Math.sin(dir) * len * 0.5;         // the canvas is twice as wide as it is tall
    }
    pts.push({ u, v });
    return pts;
  };

  const cracks = [];
  for (let i = 0; i < n; i++) {
    const pts = walk(rnd(), 0.12 + rnd() * 0.76, rnd() * Math.PI * 2, 8 + Math.floor(rnd() * 9));
    // A fork starts somewhere along its parent and leaves at an angle, the way glass does.
    const forks = [];
    const forkCount = rnd() < 0.7 ? 1 + Math.floor(rnd() * 2) : 0;
    for (let f = 0; f < forkCount; f++) {
      const from = pts[1 + Math.floor(rnd() * Math.max(1, pts.length - 2))];
      forks.push(walk(from.u, from.v, rnd() * Math.PI * 2, 2 + Math.floor(rnd() * 4)));
    }
    cracks.push({ pts, forks, w: 0.4 + rnd() * 1.2, a: 0.22 + rnd() * 0.3 });
  }
  return cracks;
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
  const col = Number(sky?.col) || 0x120806,
    glow = Number(sky?.glow) || 0xff7a2a,
    crackCol = Number(sky?.cracks) || glow,
    // A cool white for most stars, and the rift's own light for the warm ones, so the starfield
    // belongs to this sky rather than being pasted over it.
    cool = 0xcfe0ff;

  // The dark. Not black: the base colour of the place's own sky, so the whole picture has a
  // temperature before anything is drawn on it.
  ctx.fillStyle = rgba(col, 1);
  ctx.fillRect(0, 0, W, H);

  // Clouds, then the dust that eats them. Each is drawn three times — at its own spot and one
  // canvas width either side — so a cloud on the seam is whole all the way round the sky.
  for (const c of skyClouds(sky, rnd)) {
    for (const shift of [-1, 0, 1]) {
      const x = (c.u + shift) * W,
        y = c.v * H,
        r = Math.max(2, c.r * W);
      if (x + r < 0 || x - r > W) continue;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, c.dark ? black(c.a * 2.4) : rgba(glow, c.a));
      g.addColorStop(0.55, c.dark ? black(c.a * 1) : rgba(glow, c.a * 0.28));
      g.addColorStop(1, black(0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  // Stars: square pinpoints, because a star at this distance is a pixel, not a disc. The bright
  // ones get a small halo so they read as near rather than merely loud.
  for (const s of skyStars(sky, rnd)) {
    const x = s.u * W,
      y = s.v * H;
    if (s.glow) {
      // A tight halo: a star's light falls off fast, and a wide soft one reads as a smudge on the
      // lens rather than a sun a few light-years off.
      const r = s.r * 4.5,
        g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(s.warm ? glow : cool, 0.4 * s.b));
      g.addColorStop(0.35, rgba(s.warm ? glow : cool, 0.12 * s.b));
      g.addColorStop(1, black(0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = s.b;
    ctx.fillStyle = rgba(s.warm ? glow : cool, 1);
    ctx.fillRect(x, y, s.r, s.r);
  }
  ctx.globalAlpha = 1;

  // The fractures: a dark lip on one side (the pocket's thickness, so the crack is a gap and not a
  // line drawn on top), then the burning edge of it. Wrapped like the clouds, so a crack that runs
  // off one side comes back on the other.
  const stroke = (pts, width, colour, alpha, blur) => {
    for (const shift of [-1, 0, 1]) {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const x = (p.u + shift) * W,
          y = p.v * H;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.lineWidth = Math.max(0.5, width);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = colour;
      ctx.globalAlpha = alpha;
      ctx.shadowBlur = blur;
      ctx.shadowColor = colour;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  };
  for (const c of skyCracks(sky, rnd)) {
    for (const run of [c.pts, ...c.forks]) {
      // A wide near-black lip first: the pocket's own thickness at the break, so the crack is a
      // gap with light bleeding out of it rather than a line drawn over the sky.
      stroke(run, c.w * 3.2, black(1), Math.min(1, c.a * 0.85 + 0.25), 0);
      // Then the burning edge of it, twice: a hot hairline and a wide faint bloom of the same
      // colour, so the crack lights the air around the break instead of sitting on top of the sky.
      stroke(run, c.w, rgba(crackCol, 1), Math.min(1, c.a * 1.7), c.w * 14);
      stroke(run, c.w * 3, rgba(crackCol, 1), c.a * 0.28, c.w * 30);
    }
  }

  // The poles of an equirectangular map pinch, and a pocket that has broken is darkest away from
  // its light: both are served by eating the top and bottom of the picture.
  for (const [y0, y1] of [[0, H * 0.22], [H, H * 0.78]]) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, black(0.72));
    g.addColorStop(1, black(0));
    ctx.fillStyle = g;
    ctx.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0));
  }

  return canvas;
}
