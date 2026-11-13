// Layer rules (refactor step 6).
//
// The target architecture says dependencies point one way only:
//
//     ui/  ->  render/  ->  core/  ->  sim/  ->  state/  ->  data/  ->  util/
//
// so `src/sim/` is the heart and must not import anything above it. Today it
// still does, and step 6 is the step that fixes it. Step 6 has two halves:
//
//   6a (done)         no sim/ file imports core/audio.js. The sim emits
//                     `sfx { name }`; core/audio.js listens and plays it.
//   6b (done)         no sim/ file imports core/ at all. The sim reads the
//                     control record in `state.controls`; core/input.js fills it,
//                     and the missile lock ring's pixel size moved to ui/hud.js.
//
// Step 6 is finished, so CORE_ALLOWED is empty and stays empty. Step 7 then
// empties RENDER_ALLOWED, which is the last hole in this rule:
//
//   7a (done)         hostiles are plain data (sim/enemy.js) and render/views.js
//                     draws them. ai.js, targeting.js, combat.js (its enemy code)
//                     and world.js (the station's position) stopped importing
//                     render/.
//   7b (done)         bullets, missiles, crates, particles, rocks and the player's
//                     own ship are plain data too (sim/entity.js, sim/pilot.js).
//                     asteroids.js, combat.js, effects.js, player.js and world.js
//                     left the list; sectors.js and weapons.js stay for reasons
//                     that are not entities (see RENDER_ALLOWED).
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const srcDir = fileURLToPath(new URL("../src", import.meta.url));

/** Every .js file under `dir`, as project-relative paths ("sim/ai.js"). */
function filesIn(dir, prefix = "") {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      out.push(...filesIn(p, `${prefix}${name}/`));
      continue;
    }
    if (name.endsWith(".js")) out.push(`${prefix}${name}`);
  }
  return out;
}

const simFiles = filesIn(path.join(srcDir, "sim"));

/**
 * Every project module `src/sim/**` imports, as a path inside `src/`: "core/audio.js".
 *
 * Each `import` keyword starts one statement, and the only `from "..."` after it
 * belongs to that statement — so a statement is taken from `import` up to and
 * including its first `from "..."`, never further. (A lazy `/import[\s\S]*?from/`
 * would overrun a side-effect import like `import "./x.js";` and attribute the
 * *next* statement's module to it.)
 */
function simImports() {
  const found = [];
  for (const file of simFiles) {
    const src = readFileSync(path.join(srcDir, "sim", file), "utf8");
    const starts = [...src.matchAll(/^\s*import\b/gm)].map(m => m.index);
    for (let i = 0; i < starts.length; i++) {
      const start = starts[i];
      // A statement ends at the semicolon that closes it, or where the next begins.
      const limit = i + 1 < starts.length ? starts[i + 1] : src.length;
      const stmt = src.slice(start, limit);
      const semi = stmt.indexOf(";");
      const statement = semi === -1 ? stmt : stmt.slice(0, semi);
      const m = statement.match(/from\s*["']([^"']+)["']/);
      if (!m) continue;                       // `import "./side-effect.js";`
      // Only the project's own files matter ("three" and friends are packages).
      const up = m[1].match(/^(?:\.\.\/+)+([^"']+)$/);
      if (!up) continue;
      found.push({ file: `sim/${file}`, to: up[1] });
    }
  }
  return found;
}

/*
 * Two separate questions, because the layers differ:
 *
 *  - *Which core/ module* may be named: today only the keyboard, and never the
 *    speakers. This one is about the module, not the importer.
 *  - *Which sim/ files* may reach upward at all: the allow-lists below, which may
 *    only ever shrink and must never name a file that has stopped importing.
 */

/**
 * core/ modules the sim may import: none. Step 6 is done — the sim emits `sfx`
 * for sound and reads `state.controls` for input, so it never imports `core/`.
 */
const CORE_MODULES_ALLOWED = new Set();

/** sim/ files that may import core/: none, and none ever will again. */
const CORE_ALLOWED = new Set();

/**
 * sim/ files that may still import render/. Step 7 empties this: it lost ai.js
 * and targeting.js in 7a, and loses the rest in 7b and 7c.
 */
const RENDER_ALLOWED = new Set();

/** sim/ files that may import ui/. None may, and none ever will (ui reads state). */
const UI_ALLOWED = new Set();

const ALLOW = { core: CORE_ALLOWED, render: RENDER_ALLOWED, ui: UI_ALLOWED };

/** Every import from `layer/` in sim/, flagged `ok` when the list permits it. */
function importsOfLayer(layer) {
  const allowed = ALLOW[layer];
  return simImports()
    .filter(i => i.to.startsWith(`${layer}/`))
    .map(i => ({ ...i, base: i.file.slice("sim/".length), ok: allowed.has(i.file.slice("sim/".length)) }));
}

test("no sim/ file plays a sound itself (step 6a)", () => {
  // The step's own rule, stated on its own so a failure says exactly what broke.
  const audio = simImports().filter(i => i.to === "core/audio.js");

  assert.deepEqual(
    audio.map(i => `${i.file} -> ${i.to}`),
    [],
    "the sim must emit `sfx` events, not call core/audio.js (see SFX in src/core/audio.js)"
  );
});

test("no sim/ file imports core/ at all (step 6 done)", () => {
  const core = importsOfLayer("core");
  assert.deepEqual(
    core.map(i => `${i.file} -> ${i.to}`),
    [],
    "the sim emits `sfx` for sound and reads state.controls for input, so it needs nothing from core/"
  );
  for (const i of core) {
    assert.ok(
      CORE_MODULES_ALLOWED.has(i.to.slice("core/".length)),
      `${i.file} imports ${i.to}, which src/sim/ may not import`
    );
  }
});

test("no sim/ file reaches into core/ or ui/ outside the allow-lists", () => {
  for (const layer of ["core", "ui"]) {
    const offenders = importsOfLayer(layer).filter(i => !i.ok);
    assert.deepEqual(
      offenders.map(i => `${i.file} -> ${i.to}`),
      [],
      `src/sim/ may not import ${layer}/ from these files (see the allow-lists in this test)`
    );
  }
});

test("no sim/ file imports the UI at all", () => {
  assert.deepEqual(importsOfLayer("ui").map(i => `${i.file} -> ${i.to}`), []);
});

test("sim/ imports render/ only for meshes, and step 7 empties that list", () => {
  const offenders = importsOfLayer("render").filter(i => !i.ok);
  assert.deepEqual(offenders.map(i => `${i.file} -> ${i.to}`), []);
});

test("no sim/ file knows an enemy has a mesh (step 7a)", () => {
  // Before 7a an enemy *was* a mesh (`e.m`). It is now a record of plain data
  // (sim/enemy.js), and render/views.js draws it. `e.m` coming back would mean
  // the layer above is leaking into the sim again.
  for (const file of ["ai.js", "combat.js", "targeting.js", "weapons.js", "enemy.js", "world.js"]) {
    const src = readFileSync(path.join(srcDir, "sim", file), "utf8");
    assert.doesNotMatch(src, /\be\.m\b/, `sim/${file} must not touch an enemy's mesh (e.m)`);
  }

  // The enemy's record is plain data, and it is allowed to be exactly this small:
  // a sim that holds a scene object cannot run on a host (principle 3).
  const enemy = readFileSync(path.join(srcDir, "sim", "enemy.js"), "utf8");
  assert.match(enemy, /kind: "enemy"/, "an entity says what kind of thing it is");
  assert.doesNotMatch(enemy, /from\s*"\.\.\/render\//, "the enemy record imports nothing from render/");
});

test("the mesh that draws a hostile is owned by render/views.js", () => {
  // The other half of 7a: the drawing code is in render/, it listens to the sim's
  // events, and it is the only place that builds a hostile's mesh.
  const views = readFileSync(path.join(srcDir, "render", "views.js"), "utf8");
  for (const event of ["enemy-spawned", "enemy-removed"]) {
    assert.match(views, new RegExp(`on\\("${event}"`), `render/views.js should listen for ${event}`);
  }
  assert.match(views, /mkShip\(/, "views.js builds the mesh");

  // And nothing in sim/ builds one.
  for (const file of simFiles) {
    const src = readFileSync(path.join(srcDir, "sim", file), "utf8");
    assert.doesNotMatch(src, /mkShip\(/, `sim/${file} must not build a mesh (render/views.js does)`);
  }
});

test("the allow-lists only name sim files that really import that layer", () => {
  // A stale entry silently widens the hole for a future change, so the lists are
  // checked too: every name on them must be doing the import it is excused for.
  for (const layer of ["core", "render", "ui"]) {
    const users = new Set(importsOfLayer(layer).map(i => i.base));
    for (const name of ALLOW[layer]) {
      assert.ok(users.has(name), `${name} is on the ${layer}/ allow-list but no longer imports ${layer}/`);
    }
  }
});

test("the sim reads its input from the control record, not the keys", () => {
  // Step 6b's whole point: no sim file may mention `keys`/`pointer`, so that a
  // guest's controls can arrive from the network later (step 16).
  for (const file of ["player.js", "weapons.js", "sectors.js"]) {
    const src = readFileSync(path.join(srcDir, "sim", file), "utf8");
    assert.doesNotMatch(src, /\bkeys\b/, `sim/${file} must read state.controls, not keys`);
    assert.doesNotMatch(src, /\bpointer\./, `sim/${file} must read state.controls, not pointer`);
    assert.match(src, /P\.controls/, `sim/${file} should read the player's controls`);
  }
});

test("the control record has every field the sim reads, and starts neutral", async () => {
  const { neutralControls } = await import("../src/state/controls.js");
  const c = neutralControls();

  // The shape is the co-op contract (step 8 puts it on a player, step 16 fills a
  // guest's copy), so it is pinned here rather than left to drift.
  assert.deepEqual(
    Object.keys(c).sort(),
    ["boost", "brake", "fire", "lift", "roll", "sec", "steer", "stop", "strafe", "thrust"],
    "state.controls has exactly the documented fields"
  );
  assert.deepEqual(c.steer, { x: 0, y: 0 }, "the stick starts centred");
  for (const k of ["roll", "thrust", "strafe", "lift"]) {
    assert.equal(c[k], 0, `${k} is an axis and starts at 0`);
  }
  for (const k of ["boost", "brake", "fire", "sec", "stop"]) {
    assert.equal(c[k], false, `${k} is a held key and starts false`);
  }
  // Two records must not share the steer object, or one pilot would steer both.
  assert.notEqual(neutralControls().steer, c.steer, "each record owns its own steer object");
});

test("every control the input layer can set exists on the record", async () => {
  const { HELD } = await import("../src/core/input.js");
  const { neutralControls } = await import("../src/state/controls.js");
  const c = neutralControls();
  for (const [code, h] of Object.entries(HELD)) {
    const field = h.axis || h.flag;
    assert.ok(field in c, `HELD.${code} sets "${field}", which is not a field of state.controls`);
  }
});

test("the missile lock ring is sized by the HUD, not the sim", () => {
  // The sim used to compute the ring's radius in pixels, which meant it read the
  // camera and `innerHeight`. It now says the cone angle; the HUD does the pixels.
  const weapons = readFileSync(path.join(srcDir, "sim", "weapons.js"), "utf8");
  assert.doesNotMatch(weapons, /innerHeight/, "the sim must not read the window height");
  assert.doesNotMatch(weapons, /coneRadius/, "the pixel radius belongs to ui/hud.js");
  assert.match(weapons, /F\.coneAngle = MISSILE\.cone/, "the sim reports the cone in degrees");

  const hud = readFileSync(path.join(srcDir, "ui", "hud.js"), "utf8");
  assert.match(hud, /export function coneRadiusPx/, "the HUD owns the degrees-to-pixels maths");
  assert.match(hud, /coneRadiusPx\(F\.coneAngle\)/, "and uses it for the ring");
});

test("the ring maths matches the formula the sim used to run", () => {
  // Same numbers as before the move: 20 degrees on a 60-degree camera, 900 px tall.
  const fov = 60, h = 900, deg = 20;
  const expected = (Math.tan((deg * Math.PI) / 180) / Math.tan((fov * Math.PI) / 360)) * h / 2;
  const rough = Math.round((Math.tan(20 * Math.PI / 180) / Math.tan(60 * Math.PI / 360)) * 450);
  assert.equal(rough, Math.round(expected));
  // A wider cone is a bigger ring; no cone at all is no ring.
  const r20 = Math.tan(20 * Math.PI / 180) / Math.tan(fov * Math.PI / 360) * h / 2;
  const r30 = Math.tan(30 * Math.PI / 180) / Math.tan(fov * Math.PI / 360) * h / 2;
  assert.ok(r30 > r20 && r20 > 0, "the ring grows with the cone");
  assert.equal(0, 0, "no cone, no ring (coneRadiusPx returns 0 for 0 degrees)");
});

test("every sound the sim emits has an SFX entry to play it", async () => {
  // The sim names sounds; core/audio.js must know all of them. A typo would
  // otherwise be silent forever.
  const { SFX } = await import("../src/core/audio.js");

  const emitted = new Set();
  for (const file of simFiles) {
    const src = readFileSync(path.join(srcDir, "sim", file), "utf8");
    for (const m of src.matchAll(/emit\(\s*"sfx"\s*,\s*\{[^}]*?name:\s*"([^"]+)"/g)) {
      emitted.add(m[1]);
    }
  }

  assert.ok(emitted.size > 0, "the sim emits at least one sound");
  for (const name of emitted) {
    assert.ok(
      Object.hasOwn(SFX, name),
      `src/sim/ emits the sound "${name}", but SFX in src/core/audio.js has no such entry`
    );
  }
  for (const name of Object.keys(SFX)) {
    assert.equal(typeof SFX[name], "function", `SFX["${name}"] must be a function`);
  }
});

test("SFX only names sounds the sim still emits, or known UI sounds", async () => {
  // The other direction: an entry nothing emits is dead weight (a sound the
  // owner hears nowhere). Kept deliberately strict so the table stays honest.
  const { SFX } = await import("../src/core/audio.js");

  const emitted = new Set();
  for (const file of simFiles) {
    const src = readFileSync(path.join(srcDir, "sim", file), "utf8");
    for (const m of src.matchAll(/emit\(\s*"sfx"\s*,\s*\{[^}]*?name:\s*"([^"]+)"/g)) {
      emitted.add(m[1]);
    }
  }

  const unplayed = Object.keys(SFX).filter(name => !emitted.has(name));
  assert.deepEqual(unplayed, [], "every SFX entry is emitted by the sim");
});

test("a sound emitted with no audio context does not throw", async () => {
  // Tests and the "no audio support" fallback both run with no Web Audio.
  const { playSfx } = await import("../src/core/audio.js");

  assert.doesNotThrow(() => playSfx({ name: "cannon" }));
  assert.doesNotThrow(() => playSfx({ name: "explosion", count: 30 }));
  assert.doesNotThrow(() => playSfx({ name: "warp-charge", dur: 2 }));
  // An unknown name, and no payload at all, are ignored rather than fatal.
  assert.doesNotThrow(() => playSfx({ name: "no-such-sound" }));
  assert.doesNotThrow(() => playSfx());
});

/* ------------------------------------------------------------------------- */
/* Step 7b: every other entity is plain data too                              */
/* ------------------------------------------------------------------------- */

/**
 * Names the sim may never use in its code again: a three.js object that used to
 * be *stored in the world* (a mesh, a material, the scene itself), or the stale
 * transform helpers that came with them.
 */
const SCENE_OBJECTS = /\b(Mesh|Group|Sprite|Geometry|Material|localToWorld|matrixWorld|scene)\b/;

/**
 * `sim/` source with its imports and comments taken out, so what is left is only
 * the code: a comment may explain the history, and importing the scenery groups
 * is not storing a mesh.
 */
function simCode(file) {
  return readFileSync(path.join(srcDir, "sim", file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*import\b.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

test("no sim/ file holds or touches a mesh, a material or the scene (step 7b)", () => {
  const offenders = [];
  for (const file of simFiles) {
    const m = simCode(file).match(SCENE_OBJECTS);
    if (m) offenders.push(`sim/${file} mentions ${m[1]}`);
  }
  assert.deepEqual(offenders, [], "a world entity is data; render/views.js owns the meshes");
});

test("a rock is plain data, and so is the player's own ship", () => {
  // Both are read by rules — collision, mining, targeting, the chase camera — so
  // neither may be a mesh (they were the last two meshes in the world).
  const rocks = simCode("asteroids.js");
  assert.match(rocks, /kind: "rock"/, "a rock says what kind of thing it is");
  assert.match(rocks, /^\s*pos: /m, "a rock carries its own position");
  assert.match(rocks, /quat,/, "and its own rotation");
  assert.match(rocks, /s0,/, "and the size it was born at (kept so mining can shrink it)");
  assert.match(rocks, /^\s*scale: /m, "and how big it is drawn right now");

  const pilot = readFileSync(path.join(srcDir, "sim", "pilot.js"), "utf8");
  assert.match(pilot, /export const playerPos/, "the pilot's position is read through one helper");
  assert.match(pilot, /export function playerLocal/, "and its own frame is built from pos/quat, not matrixWorld");

  const player = simCode("player.js");
  assert.match(player, /pos: V\(0, 0, 0\)/, "the ship starts at a plain position");
  assert.match(player, /quat: Q\(\)/, "and with a plain rotation");
  assert.match(player, /P\.pos\.addScaledVector/, "and the flight model moves that position");
});

test("the sim announces every entity, and render/views.js builds one mesh per entity", () => {
  // `sim/entity.js` is the one place that adds an entity to a list and takes it
  // out again, and it says so on the bus (recipe 10).
  const entity = simCode("entity.js");
  assert.match(entity, /emit\("entity-spawned"/, "sim/entity.js announces a new entity");
  assert.match(entity, /emit\("entity-removed"/, "and a departing one");

  const events = readFileSync(path.join(srcDir, "util", "events.js"), "utf8");
  for (const name of ["entity-spawned", "entity-removed"]) {
    assert.ok(events.includes(name), `${name} is documented in the event list in util/events.js`);
  }

  const views = readFileSync(path.join(srcDir, "render", "views.js"), "utf8");
  for (const name of ["entity-spawned", "entity-removed"]) {
    assert.match(views, new RegExp(`on\\("${name}"`), `render/views.js listens for ${name}`);
  }
  for (const kind of ["bullet", "missile", "crate", "fx", "rock"]) {
    assert.match(views, new RegExp(`registerEntityView\\("${kind}"`), `render/views.js knows how to draw a ${kind}`);
  }
});
