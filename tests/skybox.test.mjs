// The generated skyboxes (tools/skybox/skybox.py, recipe 24).
//
// The generator is a Python tool and is not run here: what `npm test` can honestly guard is the seam
// between the tool and the game. A skybox is four things that must agree — a line in `data/skyboxes.js`,
// an image in `src/assets/skyboxes/`, an import in `render/skyboxes.js` (which is what makes the build
// inline it) and a recipe in `tools/skybox/specs/` — and a place that names one must name one that exists.
// A lower-level assistant that edits one of them by hand, or deletes an image, fails here with a message
// that says which.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SKYBOXES } from "../src/data/skyboxes.js";
import { INSTANCE_TEMPLATES, SKY_KINDS } from "../src/data/instances.js";
import { DEFAULT_SKY } from "../src/data/places.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const ASSETS = "src/assets/skyboxes";
const BUDGET_KB = 2200;               // each skybox rides inside the one-file game: keep in step with skybox.py
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

test("every skybox in data/skyboxes.js has its image, its import, its map entry and its recipe", () => {
  const urls = read("src/render/skyboxes.js");
  for (const [id, s] of Object.entries(SKYBOXES)) {
    assert.match(id, ID, `${id}: ids are lowercase_with_underscores`);
    assert.equal(typeof s.n, "string", `${id}: n (the human name)`);
    assert.equal(typeof s.preset, "string", `${id}: preset`);
    assert.ok(Number.isInteger(s.seed) && s.seed >= 0, `${id}: seed`);
    assert.ok([1024, 2048, 4096, 8192].includes(s.size), `${id}: size is one the tool can make`);
    assert.ok(Number.isInteger(s.tint) && s.tint >= 0 && s.tint <= 0xffffff, `${id}: tint is 0xrrggbb`);

    const file = path.join(root, ASSETS, `${id}.webp`);
    assert.ok(fs.existsSync(file), `${id}: ${ASSETS}/${id}.webp is missing — re-make it: python3 tools/skybox/skybox.py make ${id} --spec tools/skybox/specs/${id}.json --install`);
    const buf = fs.readFileSync(file);
    const { w, h } = webpSize(buf);
    assert.equal(w, 2 * h, `${id}: an equirectangular sky is exactly twice as wide as tall (got ${w}x${h})`);
    assert.equal(w, s.size, `${id}: the image is ${w} wide but data/skyboxes.js says ${s.size}`);
    assert.ok(buf.length / 1024 <= BUDGET_KB, `${id}: ${(buf.length / 1024).toFixed(0)} KB is over the ${BUDGET_KB} KB budget (every skybox is inlined into the game)`);

    assert.ok(urls.includes(`import sky_${id} from "../assets/skyboxes/${id}.webp";`), `${id}: render/skyboxes.js has no import for it, so the build would not include the picture`);
    assert.ok(urls.includes(`  ${id}: sky_${id},`), `${id}: render/skyboxes.js has no SKYBOX_URLS entry`);

    const specFile = path.join(root, "tools/skybox/specs", `${id}.json`);
    assert.ok(fs.existsSync(specFile), `${id}: its recipe tools/skybox/specs/${id}.json is missing (it is what makes the sky again)`);
    assert.equal(JSON.parse(fs.readFileSync(specFile, "utf8")).name, id, `${id}: the recipe is for another sky`);
  }
});

test("nothing is in the skybox folder or the url map without being in data/skyboxes.js", () => {
  const dir = path.join(root, ASSETS);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith(".webp")) : [];
  for (const f of files) assert.ok(SKYBOXES[f.slice(0, -5)], `${ASSETS}/${f} is not registered in data/skyboxes.js (an unregistered image is dead weight)`);
  const urls = read("src/render/skyboxes.js");
  for (const m of urls.matchAll(/^import sky_([a-z0-9_]+) from /gm)) assert.ok(SKYBOXES[m[1]], `render/skyboxes.js imports ${m[1]}, which data/skyboxes.js does not list`);
  assert.equal((urls.match(/BEGIN GENERATED/g) || []).length, 2, "render/skyboxes.js lost a BEGIN GENERATED marker: restore it from git");
  assert.equal((read("src/data/skyboxes.js").match(/BEGIN GENERATED/g) || []).length, 1, "data/skyboxes.js lost its BEGIN GENERATED marker: restore it from git");
});

test("a place that wears a generated skybox names one that exists", () => {
  assert.ok(SKY_KINDS.includes("panorama"), "panorama is declared sky vocabulary");
  assert.match(read("src/render/scene.js"), /panorama\(sky\)/, "SKIES in render/scene.js has a panorama builder");
  const PANORAMA_KEYS = ["kind", "skybox", "shards", "starfield"];
  // Every sky a template declares, and normal space's own default (`DEFAULT_SKY`, data/places.js):
  // the ordinary pockets are not templates, so a skybox only they name would be unchecked.
  const skies = [...Object.entries(INSTANCE_TEMPLATES).map(([id, t]) => [id, t.sky]), ["DEFAULT_SKY (normal space)", DEFAULT_SKY]];
  for (const [id, sky] of skies) {
    if (sky?.kind !== "panorama") continue;
    assert.ok(SKYBOXES[sky.skybox], `${id}: sky.skybox "${sky.skybox}" is not in data/skyboxes.js — make it: python3 tools/skybox/skybox.py make ${sky.skybox} --preset <look> --install`);
    assert.ok(Number.isInteger(sky.shards) && sky.shards >= 0, `${id}: sky.shards is a whole number (0 for none)`);
    if (sky.starfield !== undefined) assert.equal(typeof sky.starfield, "boolean", `${id}: sky.starfield is true or false`);
    for (const k of Object.keys(sky)) assert.ok(PANORAMA_KEYS.includes(k), `${id}: a panorama sky carries ${PANORAMA_KEYS.join(", ")} only, not ${k}`);
  }
});

test("normal space wears a generated sky, and the drawn starfield is off (owner 2026-11-15)", () => {
  // "remove the existing starfield. This is because our previously generated skybox already has
  // some stars baked in it. I might re-add star fields in the future but not now."
  assert.equal(DEFAULT_SKY.kind, "panorama", "ordinary pockets wear a generated skybox");
  assert.ok(SKYBOXES[DEFAULT_SKY.skybox], "and it names an installed skybox");
  assert.equal(DEFAULT_SKY.starfield, false, "no drawn starfield on top of the picture's own stars");
  const scene = read("src/render/scene.js");
  assert.match(scene, /STARFIELD = \{ enabled: false/, "the starfield master switch is off, so nothing draws two sets of stars");
  // `showPlace` must consult the place's sky (the reader's own path): a fixed `stars.visible` would
  // be the L19 bug again — the field written in one place and never read.
  assert.match(scene, /stars\.visible = STARFIELD\.enabled && skyDef\.starfield === true/, "showPlace reads the place's own sky for the starfield");
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
