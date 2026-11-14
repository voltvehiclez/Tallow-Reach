// The sky a place is seen under, painted (step 14).
//
// The first rift sky was built out of flat panels with one shade each, and flat panels read as what
// they are: triangles. A broken geometry, not a place (owner bug report 2026-11-14 — "should look
// like space but a bit hellish / dark / shattered. Should look realistic").
//
// So the sky is painted instead, on one canvas, and wrapped around the inside of a sphere by
// `scene.js`: a near-black base with a temperature of its own, the veils and dust of a nebula that
// belongs to nowhere else, and the fractures of a pocket that has broken open.
//
// There are no stars in it. The owner asked for that plainly (2026-11-14 — "Make the skybox less
// orange. Make it darker, no stars, some mysterious nebula and shattered asteroids in the background
// skybox"), and it is also the honest look: a rift is a collapsed pocket, not a place with a sky full
// of other suns, and the light in it is its own. What is left is dark, cold and a little bit wrong —
// which is what the shattered asteroids drifting inside it (built by `scene.js`) are there to sell.
//
// Every number here is a look, never a rule, and every colour comes from the place's own `sky` data
// (`data/instances.js`), so a deep rift is not wearing a basic rift's sky. The generators are pure and
// take the seeded `cosmeticRandom`, so a test can check what will be painted without a canvas at all
// (tests/sky.test.mjs); only `paintSky` touches one.

import { cosmeticRandom } from "../util/rng.js";

/** The canvas a sky is painted on: wide enough for soft detail, small enough to paint on arrival. */
export const SKY_SIZE = { w: 2048, h: 1024 };

/** How many of each thing a sky is made of. Kept here so a test can ask for the same counts. */
export const SKY_COUNTS = { veils: 5, clouds: 30, wisps: 7, cracks: 9 };

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
 * The wisps: long thin filaments of light, wandering the way a crack wanders but soft, blurred and
 * far too faint to have an edge. They are the structure inside the nebula — the part that reads as
 * something happening out there rather than as a gradient — and they lie along the clouds' band, since
 * that is where the light is.
 */
export function skyWisps(sky, rnd = cosmeticRandom, n = SKY_COUNTS.wisps) {
  const band = 0.5 + (rnd() - 0.5) * 0.3;
  const wisps = [];
  for (let i = 0; i < n; i++) {
    let u = rnd(),
      v = band + (rnd() - 0.5) * 0.5,
      dir = rnd() * Math.PI * 2;
    const pts = [];
    const steps = 10 + Math.floor(rnd() * 7);
    for (let s = 0; s < steps; s++) {
      pts.push({ u, v });
      dir += (rnd() - 0.5) * 1.2;               // a wisp drifts; it does not zigzag like a fracture
      const len = 0.02 + rnd() * 0.05;          // short steps: a filament that meanders, never a bar
      u += Math.cos(dir) * len;
      // The canvas is twice as wide as it is tall, and its poles pinch: a wisp is kept inside the part
      // of the map that reads as sky, so none of the paint is spent where the sphere squeezes it.
      v = Math.min(0.92, Math.max(0.08, v + Math.sin(dir) * len * 0.4));
    }
    pts.push({ u, v });
    wisps.push({ pts, w: 3 + rnd() * 10, a: 0.05 + rnd() * 0.08, tone: rnd() < 0.5 ? "glow" : "veil" });
  }
  return wisps;
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
  const col = Number(sky?.col) || 0x05060b,
    { glow, veil } = skyColours(sky),
    crackCol = Number(sky?.cracks) || glow,
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

  /** One polyline, stroked at three offsets so it wraps the seam like everything else. */
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
  for (const c of clouds) if (c.dark) wash(c.u, c.v, c.r, tone(c.tone), c.a, true);

  // The wisps: blurred strokes of the same two lights, so the nebula has filaments in it and not only
  // blobs. Wide and faint — a wisp is structure, not a line anybody should be able to point at.
  for (const w of skyWisps(sky, rnd)) stroke(w.pts, w.w, rgba(tone(w.tone), 1), w.a, w.w * 4);

  // The fractures: a dark lip on one side (the pocket's thickness, so the crack is a gap and not a
  // line drawn on top), then the burning edge of it.
  for (const c of skyCracks(sky, rnd)) {
    for (const run of [c.pts, ...c.forks]) {
      // A wide near-black lip first: the pocket's own thickness at the break, so the crack is a
      // gap with light bleeding out of it rather than a line drawn over the sky.
      stroke(run, c.w * 3.2, black(1), Math.min(1, c.a * 0.85 + 0.3), 0);
      // Then the burning edge of it, twice: a hot hairline and a wide faint bloom of the same
      // colour, so the crack lights the air around the break instead of sitting on top of the sky.
      // Dim on purpose: a fracture is a hairline of light in a dark place, and the sky around it is
      // the subject — bright cracks read as neon and steal the whole view (owner 2026-11-14: the sky
      // was too orange).
      stroke(run, c.w, rgba(crackCol, 1), Math.min(0.62, c.a * 1.3), c.w * 14);
      stroke(run, c.w * 3, rgba(crackCol, 1), c.a * 0.3, c.w * 30);
    }
  }

  // The poles of an equirectangular map pinch, and a pocket that has broken is darkest away from
  // its light: both are served by eating the top and bottom of the picture.
  for (const [y0, y1] of [[0, H * 0.22], [H, H * 0.78]]) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, black(0.78));
    g.addColorStop(1, black(0));
    ctx.fillStyle = g;
    ctx.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0));
  }

  return canvas;
}
