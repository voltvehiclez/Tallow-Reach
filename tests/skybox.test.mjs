// The generated skyboxes (tools/skybox/skybox.py, recipe 24).
//
// The generator is a Python tool and is not run here: what `npm test` can honestly guard is the seam
// between the tool and the game. A skybox is four things that must agree — a line in `data/skyboxes.js`,
// six face images in `src/assets/skyboxes/<id>/`, six imports in `render/skyboxes.js` (which is what
// makes the build inline them) and a recipe in `tools/skybox/specs/` — and a place that names one must
// name one that exists. A lower-level assistant that edits one of them by hand, or deletes a face,
// fails here with a message that says which.
//
// Every sky is a CUBE map since 2026-11-15 (owner: the equirect skies looked blurred and distorted on a
// 4K monitor). The faces are px, nx, py, ny, pz, nz in three.js order, which is also BoxGeometry's face
// order, so `render/scene.js` can hand the array straight to `CubeTextureLoader`.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SKYBOXES } from "../src/data/skyboxes.js";
import { INSTANCE_TEMPLATES, SKY_KINDS } from "../src/data/instances.js";
import { DEFAULT_SKY } from "../src/data/places.js";
import * as THREE from "three";
import { CUBE_FACES, CUBE_FACE_FLIP, orientFace } from "../src/render/cubemap.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const ASSETS = "src/assets/skyboxes";
const FACES = ["px", "nx", "py", "ny", "pz", "nz"];        // three.js cube order
const FACE_BUDGET_KB = 1200;          // one face; keep in step with FILE_BUDGET_KB in skybox.py
const SKY_BUDGET_KB = 6000;           // all six faces of one sky
const PAGE_BUDGET_MB = 12;            // the whole built page, which every sky is inlined into
const MIN_FACE = 1024;                // below this a sky is visibly soft on a 4K screen
const ID = /^[a-z][a-z0-9_]{1,40}$/;

/** Width and height of a WebP, read from its header (no image library: plain node). */
function webpSize(buf) {
  assert.equal(buf.toString("ascii", 0, 4), "RIFF", "not a RIFF file");
  assert.equal(buf.toString("ascii", 8, 12), "WEBP", "not a WebP file");
  const kind = buf.toString("ascii", 12, 16);
  if (kind === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (kind === "VP8L") { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
  if (kind === "VP8X") return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  assert.fail(`unknown WebP chunk ${kind}`);
}

test("the WebP reader agrees with the owner's own panoramas (so the checks below mean something)", () => {
  for (const f of ["sky-rift.webp", "sky-deeprift.webp", "sky-shroud.webp"]) {
    const { w, h } = webpSize(fs.readFileSync(path.join(root, "src/assets", f)));
    assert.deepEqual([w, h], [2880, 1440], f);
  }
});

test("every skybox in data/skyboxes.js has its six square faces, imports, map entry and recipe", () => {
  const urls = read("src/render/skyboxes.js");
  assert.ok(Object.keys(SKYBOXES).length > 0, "at least one skybox is installed");
  for (const [id, s] of Object.entries(SKYBOXES)) {
    assert.match(id, ID, `${id}: ids are lowercase_with_underscores`);
    assert.equal(typeof s.n, "string", `${id}: n (the human name)`);
    assert.equal(typeof s.preset, "string", `${id}: preset`);
    assert.ok(Number.isInteger(s.seed) && s.seed >= 0, `${id}: seed`);
    assert.ok(Number.isInteger(s.face) && s.face >= MIN_FACE,
      `${id}: face is the pixels per side of a cube face (at least ${MIN_FACE})`);
    assert.ok(Number.isInteger(s.tint) && s.tint >= 0 && s.tint <= 0xffffff, `${id}: tint is 0xrrggbb`);

    let totalKb = 0;
    for (const f of FACES) {
      const rel = `${ASSETS}/${id}/${f}.webp`;
      assert.ok(fs.existsSync(path.join(root, rel)),
        `${id}: ${rel} is missing — re-make it: python3 tools/skybox/skybox.py make ${id} --spec tools/skybox/specs/${id}.json --install`);
      const buf = fs.readFileSync(path.join(root, rel));
      const { w, h } = webpSize(buf);
      assert.equal(w, h, `${id}/${f}: a cube face is square (got ${w}x${h})`);
      assert.equal(w, s.face, `${id}/${f}: the face is ${w} wide but data/skyboxes.js says ${s.face}`);
      const kb = buf.length / 1024;
      totalKb += kb;
      assert.ok(kb <= FACE_BUDGET_KB,
        `${id}/${f}: ${kb.toFixed(0)} KB is over the ${FACE_BUDGET_KB} KB face budget (every face is inlined into the game)`);
      assert.ok(urls.includes(`import sky_${id}_${f} from "../assets/skyboxes/${id}/${f}.webp";`),
        `${id}/${f}: render/skyboxes.js has no import for it, so the build would not include the picture`);
    }
    assert.ok(totalKb <= SKY_BUDGET_KB,
      `${id}: its six faces are ${totalKb.toFixed(0)} KB, over the ${SKY_BUDGET_KB} KB sky budget`);

    // the map entry lists all six in cube order, which is what makes CubeTextureLoader read them right
    const entry = urls.match(new RegExp("^  " + id + ": \\[([^\\]]*)\\]", "m"));
    assert.ok(entry, `${id}: render/skyboxes.js has no SKYBOX_URLS entry`);
    const listed = entry[1].split(",").map(t => t.trim()).filter(Boolean);
    assert.deepEqual(listed, FACES.map(f => `sky_${id}_${f}`),
      `${id}: the six faces must be in three.js cube order ${FACES.join(", ")}`);
    assert.equal(listed.length, 6, `${id}: a cube sky is six faces`);

    const specFile = path.join(root, "tools/skybox/specs", `${id}.json`);
    assert.ok(fs.existsSync(specFile),
      `${id}: its recipe tools/skybox/specs/${id}.json is missing (it is what makes the sky again)`);
    const spec = JSON.parse(fs.readFileSync(specFile, "utf8"));
    assert.equal(spec.name, id, `${id}: the recipe is for another sky`);
    assert.equal(spec.face, s.face, `${id}: the recipe's face size and the registry's must agree`);
    assert.equal(spec.seed, s.seed, `${id}: the recipe's seed and the registry's must agree`);
  }
});

test("nothing sits in the skybox folder or the url map without being in data/skyboxes.js", () => {
  const dir = path.join(root, ASSETS);
  const entries = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [];
  for (const e of entries) {
    assert.ok(e.isDirectory(),
      `${ASSETS}/${e.name} is a loose file: a sky is a folder of six faces (an unregistered image is dead weight)`);
    assert.ok(SKYBOXES[e.name], `${ASSETS}/${e.name}/ is not registered in data/skyboxes.js (an unregistered sky is dead weight)`);
    const files = fs.readdirSync(path.join(dir, e.name)).filter(f => f.endsWith(".webp")).sort();
    assert.deepEqual(files, FACES.map(f => `${f}.webp`).sort(), `${ASSETS}/${e.name}/ must hold exactly the six faces`);
  }
  const urls = read("src/render/skyboxes.js");
  for (const m of urls.matchAll(/^import sky_([a-z0-9_]+)_(px|nx|py|ny|pz|nz) from /gm)) {
    assert.ok(SKYBOXES[m[1]], `render/skyboxes.js imports ${m[1]}, which data/skyboxes.js does not list`);
  }
  assert.equal((urls.match(/BEGIN GENERATED/g) || []).length, 2,
    "render/skyboxes.js lost a BEGIN GENERATED marker: restore it from git");
  assert.equal((read("src/data/skyboxes.js").match(/BEGIN GENERATED/g) || []).length, 1,
    "data/skyboxes.js lost its BEGIN GENERATED marker: restore it from git");
});

test("no equirectangular skybox is left anywhere (owner 2026-11-15: cube maps only)", () => {
  const scene = read("src/render/scene.js");
  assert.equal(SKY_KINDS.includes("panorama"), false, "the panorama sky kind is gone from the vocabulary");
  assert.equal(SKY_KINDS.includes("shattered"), false, "the sphere-wearing-a-panorama builder is gone");
  assert.equal(SKY_KINDS.includes("shroud"), false, "the wormhole panorama builder is gone");
  assert.ok(SKY_KINDS.includes("cube"), "cube is the one sky kind");
  assert.match(scene, /cube\(sky\)/, "SKIES in render/scene.js has a cube builder");
  assert.doesNotMatch(scene, /SHATTERED_URLS|sky-rift\.webp|sky-shroud\.webp|sky-deeprift\.webp/,
    "render/scene.js still imports the owner's panoramas: no sky draws them any more");
  assert.match(scene, /new THREE\.BoxGeometry/, "the sky is a box");
  assert.match(scene, /textures\.map\(\(map, i\) => new THREE\.MeshBasicMaterial/, "with one picture per face");
  assert.match(scene, /orientFace\(map, i\)/, "each face pointed right way up by src/render/cubemap.js");
});

test("every sky a place declares is a cube naming an installed skybox", () => {
  const skies = [
    ...Object.entries(INSTANCE_TEMPLATES).map(([id, t]) => [id, t.sky]),
    ["DEFAULT_SKY (normal space)", DEFAULT_SKY],
  ];
  for (const [id, sky] of skies) {
    assert.equal(sky?.kind, "cube", `${id}: every sky is a cube map`);
    assert.ok(SKYBOXES[sky.skybox], `${id}: sky.skybox "${sky.skybox}" is not in data/skyboxes.js`);
    assert.ok(Number.isInteger(sky.shards) && sky.shards >= 0, `${id}: sky.shards is a whole number (0 for none)`);
    for (const k of Object.keys(sky)) {
      assert.ok(["kind", "skybox", "shards", "starfield", "ambient"].includes(k),
        `${id}: a cube sky carries kind, skybox, shards, starfield and optional ambient fill, not ${k}`);
    }
  }
});

test("normal space wears a generated sky, and the drawn starfield is off (owner 2026-11-15)", () => {
  // "remove the existing starfield. This is because our previously generated skybox already has
  // some stars baked in it. I might re-add star fields in the future but not now."
  assert.equal(DEFAULT_SKY.kind, "cube", "ordinary pockets wear a generated cube map");
  assert.ok(SKYBOXES[DEFAULT_SKY.skybox], "and it names an installed skybox");
  assert.equal(DEFAULT_SKY.starfield, false, "no drawn starfield on top of the picture's own stars");
  const scene = read("src/render/scene.js");
  assert.match(scene, /STARFIELD = \{ enabled: false/,
    "the starfield master switch is off, so nothing draws two sets of stars");
  // `showPlace` must consult the place's own sky: a fixed `stars.visible` would be the L19 bug again —
  // the field written in one place and never read.
  assert.match(scene, /stars\.visible = STARFIELD\.enabled && skyDef\.starfield === true/,
    "showPlace reads the place's own sky for the starfield");
});

test("the page stays inside its weight budget (every sky is inlined into it)", () => {
  const page = path.join(root, "game/tallow-reach.html");
  assert.ok(fs.existsSync(page), "game/tallow-reach.html is missing — run: npm run build");
  const mb = fs.statSync(page).size / (1024 * 1024);
  assert.ok(mb <= PAGE_BUDGET_MB,
    `the built page is ${mb.toFixed(2)} MB, over its ${PAGE_BUDGET_MB} MB budget: lower a sky's face size or its webp quality (recipe 24)`);
});

// --- the face convention, proven against the real generator and the real three.js -------------------
// A sky is only a cube map if the six images point the way the generator painted them. `skybox.py`
// lays each face out by the OpenGL cube rules (`FACE_AXES`); `BoxGeometry` groups its faces in the
// same order but frames the top and the bottom the other way up. This test rebuilds both sides from
// their real sources and compares a grid of texels, so a wrong table fails here rather than showing
// up as an upside-down patch of sky in the owner's playtest.

/** Read `FACE_AXES` straight out of the generator (the files' own source of truth). */
function faceAxes() {
  const py = read("tools/skybox/skybox.py");
  const block = py.match(/^FACE_AXES = \{\n([\s\S]*?)^\}/m);
  assert.ok(block, "tools/skybox/skybox.py no longer has a FACE_AXES table");
  const axes = {};
  for (const line of block[1].split("\n")) {
    const m = line.match(/^\s*"(\w\w)": \(\s*\(([^)]*)\),\s*\(([^)]*)\),\s*\(([^)]*)\)\s*\)/);
    if (!m) continue;
    axes[m[1]] = [m[2], m[3], m[4]].map(t => t.split(",").map(x => Number(x.trim())));
  }
  assert.deepEqual(Object.keys(axes).sort(), [...CUBE_FACES].sort(), "the generator and the game list the same six faces");
  return axes;
}

/** The direction a face texel (u, v) stands for, by the generator's own rule. */
function generatorDir(axes, face, u, v) {
  const [right, up, out] = axes[face];
  // (u, v) are texture coordinates: v = 0 is the bottom row of the image and v = 1 its top, which is
  // how three.js reads a texture after its default flipY. The generator's rows count from the top,
  // so its ty is -(2v - 1).
  const tx = u * 2 - 1, ty = -(v * 2 - 1);
  const d = [0, 1, 2].map(k => out[k] + tx * right[k] - ty * up[k]);
  const len = Math.hypot(...d);
  return d.map(x => x / len);
}

/** The direction a `BoxGeometry` texel (u, v) stands for, fitted from the geometry itself. */
function boxFrames() {
  const geo = new THREE.BoxGeometry(2, 2, 2);
  const pos = geo.attributes.position, uv = geo.attributes.uv, idx = geo.index;
  const NAMES = CUBE_FACES;
  return geo.groups.map(grp => {
    const seen = new Set();
    for (let t = grp.start; t < grp.start + grp.count; t++) seen.add(idx.getX(t));
    const V = [...seen];
    const fit = get => {
      let Suu = 0, Suv = 0, Svv = 0, S1u = 0, S1v = 0, S11 = 0, Spu = 0, Spv = 0, Sp1 = 0;
      for (const i of V) {
        const u = uv.getX(i), v = uv.getY(i), p = get(i);
        Suu += u * u; Suv += u * v; Svv += v * v; S1u += u; S1v += v; S11 += 1;
        Spu += p * u; Spv += p * v; Sp1 += p;
      }
      const A = [[Suu, Suv, S1u], [Suv, Svv, S1v], [S1u, S1v, S11]], B = [Spu, Spv, Sp1];
      for (let i = 0; i < 3; i++) {
        let p = i;
        for (let r = i + 1; r < 3; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
        [A[i], A[p]] = [A[p], A[i]];
        [B[i], B[p]] = [B[p], B[i]];
        for (let r = i + 1; r < 3; r++) {
          const f = A[r][i] / A[i][i];
          for (let c = i; c < 3; c++) A[r][c] -= f * A[i][c];
          B[r] -= f * B[i];
        }
      }
      const x = [0, 0, 0];
      for (let i = 2; i >= 0; i--) {
        let s = B[i];
        for (let c = i + 1; c < 3; c++) s -= A[i][c] * x[c];
        x[i] = s / A[i][i];
      }
      return x;
    };
    const cx = fit(i => pos.getX(i)), cy = fit(i => pos.getY(i)), cz = fit(i => pos.getZ(i));
    return {
      face: NAMES[grp.materialIndex],
      at: (u, v) => {
        const p = [
          cx[0] * u + cx[1] * v + cx[2],
          cy[0] * u + cy[1] * v + cy[2],
          cz[0] * u + cz[1] * v + cz[2],
        ];
        const len = Math.hypot(...p);
        return p.map(x => x / len);
      },
    };
  });
}

test("the six faces are drawn the way the generator painted them (no upside-down or mirrored face)", () => {
  const axes = faceAxes();
  const frames = boxFrames();
  assert.deepEqual(frames.map(f => f.face), CUBE_FACES, "BoxGeometry groups its faces in cube order");

  const GRID = 7;
  for (const [i, frame] of frames.entries()) {
    const face = frame.face;
    for (let a = 0; a < GRID; a++) {
      for (let b = 0; b < GRID; b++) {
        const u = (a + 0.5) / GRID, v = (b + 0.5) / GRID;
        // Where the driver actually reads the texture: flipped faces read (u, 1 - v).
        const sampled = CUBE_FACE_FLIP[face] ? [u, 1 - v] : [u, v];
        const drawn = frame.at(sampled[0], sampled[1]);
        const painted = generatorDir(axes, face, u, v);
        const off = Math.hypot(...drawn.map((x, k) => x - painted[k]));
        assert.ok(off < 1e-3,
          `${face} texel (${u.toFixed(2)}, ${v.toFixed(2)}) is drawn pointing ${drawn.map(x => x.toFixed(2))} ` +
          `but the generator painted ${painted.map(x => x.toFixed(2))}: fix CUBE_FACE_FLIP in src/render/cubemap.js`);
      }
    }
  }
});

test("each flip in the table is necessary and no flip is redundant", () => {
  const axes = faceAxes();
  const frames = boxFrames();
  const GRID = 5;
  /** Worst texel error for one face with a given flip. */
  const worst = (frame, flip) => {
    let out = 0;
    for (let a = 0; a < GRID; a++) {
      for (let b = 0; b < GRID; b++) {
        const u = (a + 0.5) / GRID, v = (b + 0.5) / GRID;
        const drawn = frame.at(u, flip ? 1 - v : v);
        const painted = generatorDir(axes, frame.face, u, v);
        out = Math.max(out, Math.hypot(...drawn.map((x, k) => x - painted[k])));
      }
    }
    return out;
  };
  for (const frame of frames) {
    const asIs = worst(frame, false), flipped = worst(frame, true);
    if (CUBE_FACE_FLIP[frame.face]) {
      assert.ok(flipped < 1e-3, `${frame.face}: the table flips it, and flipped it is right (error ${flipped.toFixed(3)})`);
      assert.ok(asIs > 0.5, `${frame.face}: the table flips it, but it would have been fine unflipped`);
    } else {
      assert.ok(asIs < 1e-3, `${frame.face}: the table leaves it alone, and alone it is right (error ${asIs.toFixed(3)})`);
      assert.ok(flipped > 0.5, `${frame.face}: the table leaves it alone, and flipping it would have broken it`);
    }
  }
});

test("the generator's presets are well formed (the tool trusts this file)", () => {
  const presets = JSON.parse(read("tools/skybox/presets.json"));
  const MOODS = ["black", "very_dark", "dark", "dim"];
  const GROUPS = { nebula: ["amount", "coverage", "scale", "wisps", "turbulence", "cores"], dust: ["amount", "coverage", "rim"],
    stars: ["density", "brightness", "color", "warmth", "halos"], band: ["strength", "tilt", "rotation", "width"] };
  const TOP = ["about", "mood", "background", "palette", "detail", "saturation", "contrast", "grain", ...Object.keys(GROUPS)];
  assert.ok(Object.keys(presets).length >= 6, "a useful set of looks");
  for (const [name, p] of Object.entries(presets)) {
    assert.match(name, ID, `preset ${name}`);
    assert.ok(typeof p.about === "string" && p.about.length > 10, `${name}: about says what the look is for`);
    assert.ok(MOODS.includes(p.mood), `${name}: mood is one of ${MOODS}`);
    assert.ok(Array.isArray(p.palette) && p.palette.length >= 1 && p.palette.length <= 4 && p.palette.every(c => /^#[0-9a-fA-F]{6}$/.test(c)), `${name}: palette is 1-4 #rrggbb colours`);
    for (const k of Object.keys(p)) assert.ok(TOP.includes(k), `${name}: unknown key ${k}`);
    for (const [g, keys] of Object.entries(GROUPS)) for (const k of Object.keys(p[g] || {})) assert.ok(keys.includes(k), `${name}: unknown key ${g}.${k}`);
  }
  // the owner asked for DARK space: no look may default to the brightest mood
  for (const [name, p] of Object.entries(presets)) assert.notEqual(p.mood, "dim", `${name}: skyboxes are dark space; "dim" is for a deliberate, owner-approved exception`);
});

test("orientFace sets needsUpdate only when texture.image exists (avoids WebGL texImage2D error on async load)", () => {
  const mkTex = image => {
    let updates = 0;
    return {
      image,
      repeat: { y: 1 },
      offset: { y: 0 },
      get needsUpdate() { return updates; },
      set needsUpdate(v) { if (v) updates++; },
    };
  };
  const pendingPy = mkTex(undefined);
  orientFace(pendingPy, 2); // py = flipped face
  assert.equal(pendingPy.repeat.y, -1);
  assert.equal(pendingPy.offset.y, 1);
  assert.equal(pendingPy.needsUpdate, 0, "pending async texture must not set needsUpdate before image exists");

  const readyNy = mkTex({ width: 1024, height: 1024 });
  orientFace(readyNy, 3); // ny = flipped face
  assert.equal(readyNy.repeat.y, -1);
  assert.equal(readyNy.offset.y, 1);
  assert.equal(readyNy.needsUpdate, 1, "loaded texture marks needsUpdate when image is ready");

  const readyPx = mkTex({ width: 1024, height: 1024 });
  orientFace(readyPx, 0); // px = unflipped face
  assert.equal(readyPx.repeat.y, 1);
  assert.equal(readyPx.needsUpdate, 0);
});
