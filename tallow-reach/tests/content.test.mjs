// Content checks. These fail when someone adds a ship, item, weapon, base module
// or contract type and forgets a field or a second place that needs updating.
// Run with `npm test`. When one fails, the message says which entry is wrong.

import { test } from "node:test";
import assert from "node:assert/strict";
import { SHIPS, DEFAULT_SHIP } from "../src/data/ships.js";
import { ITEM, KEYS, emptyCargo } from "../src/data/items.js";
import { PRIMARY, MISSILE, SHOP_WEAPONS } from "../src/data/weapons.js";
import { BASE_MODULES, BASE_DEFAULT } from "../src/data/station.js";
import { CONTRACT, CONTRACT_TYPES, DESCRIBE, CONTRACTS_PER_BOARD } from "../src/data/contracts.js";
import { newProfile, sanitizeProfile, MISSION_TYPES } from "../src/state/profile.js";

const isNum = v => typeof v === "number" && Number.isFinite(v);

test("every ship has all the fields the game reads", () => {
  assert.ok(SHIPS[DEFAULT_SHIP], "DEFAULT_SHIP must exist in SHIPS");
  for (const [id, s] of Object.entries(SHIPS)) {
    assert.equal(typeof s.n, "string", `${id}: n (name)`);
    assert.equal(typeof s.d, "string", `${id}: d (description)`);
    for (const f of ["spd", "cargo", "hull", "sh", "dmg", "mine", "turn", "sc", "price", "col"]) {
      assert.ok(isNum(s[f]) && s[f] > 0, `${id}: ${f} must be a positive number`);
    }
  }
});

test("every item has a name and a value, and cargo objects cover them all", () => {
  for (const [id, it] of Object.entries(ITEM)) {
    assert.equal(typeof it.n, "string", `${id}: n (name)`);
    assert.ok(isNum(it.v) && it.v > 0, `${id}: v (value) must be positive`);
  }
  assert.deepEqual(Object.keys(emptyCargo()), KEYS);
});

test("weapon data is complete", () => {
  assert.ok(isNum(PRIMARY.cannon.cooldown) && isNum(PRIMARY.cannon.speed) && isNum(PRIMARY.cannon.damage));
  assert.ok(isNum(PRIMARY.beam.range) && isNum(PRIMARY.beam.rate) && isNum(PRIMARY.beam.price));
  for (const f of ["price", "startStock", "unitPrice", "cap", "dmg", "cd", "range"]) {
    assert.ok(isNum(MISSILE[f]) && MISSILE[f] > 0, `MISSILE.${f}`);
  }
  for (const [id, w] of Object.entries(SHOP_WEAPONS)) {
    assert.equal(typeof w.n, "string", `${id}: n`);
    assert.equal(typeof w.d, "string", `${id}: d`);
    assert.ok(isNum(w.price) && w.price > 0, `${id}: price`);
  }
});

test("every base module has a cost curve and a default level, and saves keep it", () => {
  const loaded = sanitizeProfile(newProfile()).base;
  for (const [id, m] of Object.entries(BASE_MODULES)) {
    assert.equal(typeof m.n, "string", `${id}: n`);
    assert.equal(typeof m.d, "string", `${id}: d`);
    assert.ok(Number.isInteger(m.max) && m.max > 0, `${id}: max`);
    assert.ok(id in BASE_DEFAULT, `${id} is missing from BASE_DEFAULT in data/station.js`);
    // The game asks for cost(current level) when upgrading, from the starting level up to max - 1.
    for (let level = BASE_DEFAULT[id]; level < m.max; level++) {
      assert.ok(isNum(m.cost(level)) && m.cost(level) > 0, `${id}: cost(${level})`);
    }
    assert.ok(
      id in loaded,
      `${id} is not kept by sanitizeProfile in state/profile.js (add it there, bump SAVE_VERSION)`
    );
  }
});

test("every contract type has a generator, a description and is accepted by the save loader", () => {
  assert.ok(CONTRACTS_PER_BOARD > 0);
  const rolls = [0, 0.5, 0.999];
  for (const type of CONTRACT_TYPES) {
    assert.equal(typeof CONTRACT[type], "function", `${type}: missing generator in CONTRACT`);
    assert.equal(typeof DESCRIBE[type], "function", `${type}: missing line in DESCRIBE`);
    assert.ok(MISSION_TYPES.includes(type), `${type}: not accepted by the save loader`);
    for (const tier of [1, 2, 3]) {
      for (const r of rolls) {
        const c = { type, tier, p: 0, ...CONTRACT[type](tier, () => r) };
        assert.ok(Number.isInteger(c.n) && c.n > 0, `${type} tier ${tier}: n must be a whole number above 0`);
        assert.ok(Number.isInteger(c.r) && c.r > 0, `${type} tier ${tier}: r (reward) must be a whole number above 0`);
        if (type === "mine") assert.ok(ITEM[c.o], `mine: ore "${c.o}" is not in ITEM`);
        const text = DESCRIBE[type](c);
        assert.ok(text && !text.includes("undefined"), `${type}: description reads "${text}"`);
      }
    }
    // An accepted contract of this type must survive a save and load.
    const p = newProfile();
    p.mission = { type, tier: 1, p: 0, n: 3, r: 100, o: "ferrite" };
    assert.ok(sanitizeProfile(p).mission, `${type}: contract was dropped when the save loaded`);
  }
});
