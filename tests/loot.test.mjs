// Loot tables (refactor step 3): what drops and what a rock is made of is data.
//
// `sim/loot.js` is pure, so these tests roll the real tables tens of thousands of
// times and count — the only honest way to check odds. The numbers pinned here
// are the ones the game shipped with, so a future edit that changes the drops has
// to mean it.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { LOOT_TABLES } from "../src/data/loot.js";
import { rollLoot, pickLoot } from "../src/sim/loot.js";
import { makeRng } from "../src/util/rng.js";
import { isItem } from "../src/data/items.js";

const ROLLS = 10000;

/** Roll a table `n` times from one seeded generator. */
const rollMany = (id, n = ROLLS, seed = 1) => {
  const rng = makeRng(seed);
  return Array.from({ length: n }, () => rollLoot(id, rng));
};

/** What a kill leaves behind, flattened: one tag per crate. */
const cratesOf = drops => drops.flatMap(d => Array.from({ length: d.count }, () => d.item));

/** How close `got` is to `want`, as a fraction of `want` (0.01 = one percent). */
const off = (got, want) => Math.abs(got - want) / want;

test("the same seed rolls the same drops, every time", () => {
  assert.deepEqual(rollMany("raider", 200, 7), rollMany("raider", 200, 7), "seeded rolls repeat");
  assert.notDeepEqual(rollMany("raider", 200, 7), rollMany("raider", 200, 8), "a different seed differs");
  assert.deepEqual(
    rollMany("raider", 200, 7).map(cratesOf),
    rollMany("raider", 200, 7).map(cratesOf),
    "and repeats crate for crate, not just in total"
  );
});

test("a killed raider drops one or two salvage crates, 50/50", () => {
  // Count the salvage only: a kill can also leave a core, which is a separate crate.
  const salvage = rollMany("raider").map(drops =>
    drops.filter(d => d.item === "salv").reduce((n, d) => n + d.count, 0)
  );
  const one = salvage.filter(n => n === 1).length / ROLLS;
  const two = salvage.filter(n => n === 2).length / ROLLS;

  assert.ok(off(one, 0.5) < 0.02, `one crate ${(one * 100).toFixed(2)}% of kills (was 50%)`);
  assert.ok(off(two, 0.5) < 0.02, `two crates ${(two * 100).toFixed(2)}% of kills (was 50%)`);

  // Every crate still holds exactly one unit of the item its line names.
  for (const drops of rollMany("raider", 500)) {
    for (const d of drops) {
      assert.ok(isItem(d.item), `${d.item} is not an item`);
      assert.ok(d.count >= 1 && d.count <= 2, `${d.count} crates is outside the table's range`);
    }
  }
});

test("a raider leaves a reactor core on about one kill in ten", () => {
  const cores = rollMany("raider").filter(drops => drops.some(d => d.item === "core")).length / ROLLS;
  assert.ok(off(cores, 0.1) < 0.15, `a core on ${(cores * 100).toFixed(2)}% of kills (was 10%)`);
});

test("the core is dropped on the wreck and the crates are scattered", () => {
  const drops = rollMany("raider", 200).flat();
  const core = drops.find(d => d.item === "core");
  const salv = drops.find(d => d.item === "salv");
  assert.equal(core.scatter, 0, "the core crate appears exactly on the wreck");
  assert.equal(salv.scatter, 8, "salvage crates scatter a few metres");
});

test("a rock is still about 62% ferrite, 30% cobalt and 8% voidite", () => {
  const rng = makeRng(3);
  const picks = Array.from({ length: ROLLS }, () => pickLoot("asteroid", rng));
  const share = id => picks.filter(p => p === id).length / ROLLS;

  assert.ok(off(share("ferrite"), 0.62) < 0.03, `ferrite ${(share("ferrite") * 100).toFixed(2)}% (was 62%)`);
  assert.ok(off(share("cobalt"), 0.3) < 0.05, `cobalt ${(share("cobalt") * 100).toFixed(2)}% (was 30%)`);
  assert.ok(off(share("voidite"), 0.08) < 0.2, `voidite ${(share("voidite") * 100).toFixed(2)}% (was 8%)`);
  for (const p of picks) assert.ok(isItem(p), `${p} is not an item`);
});

test("a line at 0 never drops and a line at 1 always does", () => {
  LOOT_TABLES.__test = {
    kind: "drops",
    entries: [
      { i: "salv", c: [1, 1], w: 0 },
      { i: "ferrite", c: [1, 1], w: 1 },
    ],
  };
  try {
    const rng = makeRng(5);
    for (let i = 0; i < 100; i++) {
      assert.deepEqual(
        rollLoot("__test", rng).map(d => d.item),
        ["ferrite"],
        "only the certain line comes up"
      );
    }
  } finally {
    delete LOOT_TABLES.__test;
  }
});

test("adding a drop is a data edit, not a code change", () => {
  LOOT_TABLES.__test = { kind: "drops", entries: [{ i: "cobalt", c: [3, 3], w: 1 }] };
  try {
    const [drop] = rollLoot("__test", makeRng(1));
    assert.deepEqual(drop, { item: "cobalt", count: 3, scatter: 8 }, "three cobalt, scattered by default");
  } finally {
    delete LOOT_TABLES.__test;
  }
});

test("an unknown or empty table drops nothing instead of crashing", () => {
  assert.deepEqual(rollLoot("no-such-table"), []);
  assert.deepEqual(rollLoot(undefined), []);
  assert.equal(pickLoot("no-such-table"), null);
  assert.equal(pickLoot(undefined), null);

  LOOT_TABLES.__empty = { kind: "pick", entries: [] };
  try {
    assert.equal(pickLoot("__empty"), null);
  } finally {
    delete LOOT_TABLES.__empty;
  }
});

test("a pick table is never rolled as drops", () => {
  assert.deepEqual(rollLoot("asteroid", makeRng(1)), [], "rocks drop crates from their own table, not the ore one");
});
