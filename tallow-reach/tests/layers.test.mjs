// Layer rules (refactor step 6).
//
// The target architecture says dependencies point one way only:
//
//     ui/  ->  render/  ->  core/  ->  sim/  ->  state/  ->  data/  ->  util/
//
// so `src/sim/` is the heart and must not import anything above it. Today it
// still does, and step 6 is the step that fixes it. Step 6 has two halves:
//
//   6a (this change)  no sim/ file imports core/audio.js. The sim emits
//                     `sfx { name }`; core/audio.js listens and plays it.
//   6b (next)         no sim/ file imports core/input.js either. The sim reads a
//                     `controls` object instead of the keyboard.
//
// The test is written so 6b only has to delete one line from the allow-lists
// below, and step 7 then empties RENDER_ALLOWED.
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

/** core/ modules the sim may still import, with the step that removes each. */
const CORE_MODULES_ALLOWED = new Set([
  "input.js",   // step 6b: the sim still reads the keyboard and mouse directly.
  // "audio.js" is deliberately absent: step 6a is done, the sim emits `sfx`.
]);

/** sim/ files that may still import core/. Step 6b empties this. */
const CORE_ALLOWED = new Set(["player.js", "sectors.js", "weapons.js"]);

/** sim/ files that may still import render/. Step 7 empties this. */
const RENDER_ALLOWED = new Set([
  "ai.js", "asteroids.js", "combat.js", "effects.js", "player.js",
  "sectors.js", "targeting.js", "weapons.js", "world.js",
]);

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

test("the sim may import only core/input.js, until step 6b", () => {
  for (const i of importsOfLayer("core")) {
    assert.ok(
      CORE_MODULES_ALLOWED.has(i.to.slice("core/".length)),
      `${i.file} imports ${i.to}; the sim may only import core/input.js until step 6b`
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
