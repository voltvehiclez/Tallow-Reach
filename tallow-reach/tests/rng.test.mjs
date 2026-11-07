// Seeded randomness (refactor step 2): one source for every gameplay roll.
//
// "Same seed, same run" is what generated sectors, wormholes and co-op will be
// built on, so these tests guard it from the outside in:
//   - no sim/ or data/ file may call Math.random() itself;
//   - makeRng(n) is a generator of its own, unaffected by the rest of the game;
//   - setSeed(n) makes the real spawn and loot code repeat itself exactly.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { makeRng, random, setSeed } from "../src/util/rng.js";
import { loadHeadless } from "./headless.mjs";

const srcDir = fileURLToPath(new URL("../src", import.meta.url));

// The real game code, in one bundle, with the screen and sound stubbed out.
const sim = await loadHeadless("src/sim/ai.js", {
  state: "src/state/state.js",
  setSeed: "src/util/rng.js",
  random: "src/util/rng.js",
  hitHostile: "src/sim/combat.js",
  spawnAsteroid: "src/sim/asteroids.js",
});

const at = { x: 0, y: 0, z: 0 };

test("no file in sim/ or data/ rolls its own dice", () => {
  const offenders = [];
  const scan = dir => {
    for (const file of readdirSync(dir)) {
      const p = path.join(dir, file);
      if (statSync(p).isDirectory()) {
        scan(p);
        continue;
      }
      if (!p.endsWith(".js")) continue;
      readFileSync(p, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (line.includes("Math.random")) offenders.push(`${path.relative(srcDir, p)}:${i + 1}: ${line.trim()}`);
        });
    }
  };
  scan(path.join(srcDir, "sim"));
  scan(path.join(srcDir, "data"));

  assert.deepEqual(
    offenders,
    [],
    "gameplay randomness must come from src/util/rng.js:\n  " + offenders.join("\n  ")
  );
});

test("makeRng: one seed, one sequence, and the values stay in [0, 1)", () => {
  const a = makeRng(1),
    b = makeRng(1),
    c = makeRng(2);
  const seqA = Array.from({ length: 32 }, () => a());
  const seqB = Array.from({ length: 32 }, () => b());
  const seqC = Array.from({ length: 32 }, () => c());

  assert.deepEqual(seqA, seqB, "the same seed gives the same numbers, every time");
  assert.notDeepEqual(seqA, seqC, "a different seed gives a different run");
  for (const v of [...seqA, ...seqC]) assert.ok(v >= 0 && v < 1, `${v} is outside [0, 1)`);
});

test("an independent generator ignores what the rest of the game rolls", () => {
  const generator = makeRng(7),
    expected = makeRng(7)(),
    before = makeRng(7)();

  setSeed(3);
  for (let i = 0; i < 200; i++) random(); // the shared stream moves on ...
  assert.equal(generator(), expected, "... and the independent generator does not care");

  // The other way round: drawing from an independent generator leaves the shared
  // stream where it was.
  setSeed(3);
  const shared = [random(), random(), random()];
  setSeed(3);
  makeRng(999)();
  assert.deepEqual([random(), random(), random()], shared);
  assert.equal(before, expected);
});

test("unseeded, random() follows Math.random, so nothing is pinned by accident", () => {
  setSeed(null);
  const original = Math.random;
  try {
    const sequence = [0.1, 0.2, 0.3];
    let i = 0;
    Math.random = () => sequence[i++ % sequence.length];
    assert.equal(random(), 0.1);
    assert.equal(random(), 0.2);
    assert.equal(random(), 0.3);
  } finally {
    Math.random = original;
    setSeed(null);
  }
  for (let i = 0; i < 100; i++) {
    const v = random();
    assert.ok(v >= 0 && v < 1, `${v} is outside [0, 1)`);
  }
});

test("setSeed(n) makes the raider spawn repeat itself exactly", () => {
  const circles = seed => {
    sim.setSeed(seed);
    sim.state.world.enemies.length = 0;
    return Array.from({ length: 12 }, () => sim.spawnEnemy("raider", at).o);
  };

  const first = circles(1);
  const second = circles(1);
  const other = circles(2);

  assert.deepEqual(first, second, "same seed, same circling directions");
  assert.ok(new Set(first).size > 1, "the spawn really does roll (both directions appear)");
  assert.notDeepEqual(first, other, "a different seed is a different run");
});

test("setSeed(n) makes the loot rolls repeat themselves exactly", () => {
  const kill = seed => {
    sim.setSeed(seed);
    sim.state.world.enemies.length = 0;
    sim.state.world.crates.length = 0;
    const e = sim.spawnEnemy("raider", at);
    sim.hitHostile(e, 99, at);
    return sim.state.world.crates.map(c => (c.core ? "core" : "salvage"));
  };

  assert.deepEqual(kill(5), kill(5), "same seed, same crates");
  assert.deepEqual(kill(5), kill(5), "and again");
  const runs = new Set([kill(1), kill(2), kill(3), kill(4)].map(r => r.join(",")));
  assert.ok(runs.size > 1, "the drop is still random across seeds");
});

test("setSeed(n) makes the asteroid ore mix repeat itself exactly", () => {
  const field = seed => {
    sim.setSeed(seed);
    sim.state.world.asteroids.length = 0;
    for (let i = 0; i < 25; i++) sim.spawnAsteroid();
    return sim.state.world.asteroids.map(a => `${a.type}:${a.r.toFixed(4)}`);
  };

  const first = field(11);
  assert.equal(first.length, 25);
  assert.deepEqual(first, field(11), "same seed, same rocks");
  assert.notDeepEqual(first, field(12), "a different seed, different rocks");
  assert.ok(first.some(r => r.startsWith("cobalt")) || first.some(r => r.startsWith("ferrite")), "rocks carry ore");
});
