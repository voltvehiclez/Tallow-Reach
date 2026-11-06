// Fitting: moving modules between the ship's bays and storage. Run with `npm test`.
// Every test starts from a brand-new save, so nothing here depends on real play.

import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../src/state/state.js";
import { newProfile, sanitizeProfile, SAVE_VERSION } from "../src/state/profile.js";
import { refillPower } from "../src/sim/power.js";
import { fitModule, unequip, storedFor, fittedAt } from "../src/sim/fitting.js";

/** A new game, as if it had just booted docked at the outpost. */
function freshGame() {
  state.profile = newProfile();
  refillPower();
  return state.profile;
}

test("a new game has the power parts fitted and nothing in storage", () => {
  const p = freshGame();
  assert.deepEqual(p.modules, [], "storage starts empty");
  assert.deepEqual(p.loadout.wasp.power, ["power_basic"]);
  assert.deepEqual(p.loadout.wasp.cell, ["cell_basic"]);
  assert.deepEqual(state.power, { gen: 10, cap: 100, stored: 100, draw: 0 });
});

test("unequipping a module puts it in storage and changes the ship at once", () => {
  const p = freshGame();

  const text = unequip("power", 0);
  assert.match(text, /storage/i, "the message says where the part went");
  assert.deepEqual(p.loadout.wasp.power, [null], "the bay is empty");
  assert.deepEqual(p.modules, ["power_basic"], "the part is in storage");
  assert.equal(state.power.gen, 0, "the ship stops making power immediately");
  assert.equal(state.power.cap, 100, "the cell is still fitted");

  // And the same for the cell: no capacity left to run anything.
  unequip("cell", 0);
  assert.equal(state.power.cap, 0);
  assert.deepEqual(storedFor("cell"), ["cell_basic"]);
});

test("a stored module can be fitted again, into any bay that takes its group", () => {
  const p = freshGame();
  unequip("cell", 0);
  assert.deepEqual(p.modules, ["cell_basic"]);

  const text = fitModule("cell", 0, "cell_basic");
  assert.match(text, /Fitted/i);
  assert.deepEqual(p.loadout.wasp.cell, ["cell_basic"], "back in the bay");
  assert.deepEqual(p.modules, [], "and out of storage");
  assert.equal(state.power.cap, 100, "the capacity is back");

  assert.equal(fittedAt("cell", 0), "cell_basic", "the screen can ask what is in a bay");
});

test("fitting refuses the wrong group, parts that are not stored, and bays that do not exist", () => {
  const p = freshGame();

  const wrong = fitModule("power", 0, "cell_basic");
  assert.match(wrong, /does not fit/i);
  assert.deepEqual(p.loadout.wasp.power, ["power_basic"], "nothing moved");

  const unstored = (() => {
    unequip("thruster", 0);            // empty bay: nothing to take out
    return fitModule("thruster", 0, "cell_basic");
  })();
  assert.match(unstored, /does not fit/i, "a cell is not a thruster");

  p.modules = ["cell_basic"];
  assert.match(fitModule("power", 0, "cell_basic"), /does not fit/i, "still the wrong group");

  assert.equal(fitModule("power", 9, "power_basic"), undefined, "bay 9 does not exist");
  assert.equal(unequip("shield", 9), undefined, "and neither does bay 9 of the shields");
  assert.deepEqual(p.loadout.wasp.power, ["power_basic"]);
});

test("fitting into a full bay swaps the old part into storage", () => {
  const p = freshGame();
  p.modules = ["power_basic"];           // a spare in the store

  const text = fitModule("power", 0, "power_basic");
  assert.match(text, /moved to storage/i, "the part it replaced is named");
  assert.deepEqual(p.loadout.wasp.power, ["power_basic"], "the bay is still filled");
  assert.deepEqual(p.modules, ["power_basic"], "one went in, one came out");
});

test("an old save gains an empty module store, and unknown parts are dropped", () => {
  const old = sanitizeProfile({ v: 3, ships: ["wasp"], ship: "wasp", cr: 100 });
  assert.equal(old.v, SAVE_VERSION);
  assert.deepEqual(old.modules, [], "older saves start with nothing in storage");
  assert.deepEqual(old.loadout.wasp.power, ["power_basic"], "and keep the fitted parts");

  const odd = sanitizeProfile({ ships: ["wasp"], modules: ["power_basic", "junk", 42, "cell_basic"] });
  assert.deepEqual(odd.modules, ["power_basic", "cell_basic"], "only real module ids survive");

  const notArray = sanitizeProfile({ ships: ["wasp"], modules: "power_basic" });
  assert.deepEqual(notArray.modules, [], "a corrupted store is emptied, not fatal");
});
