// The Test Ship (owner, 2026-11-15): a 1-credit proof-of-concept hull for the
// Hangar — 100× the basic hull's Hull HP, 10× all damage output, the Wasp's
// hold and slot layout, the stock fit the Wasp is delivered with.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { state, applySave } from "../src/state/state.js";
import { newSave, stockFor } from "../src/state/profile.js";
import { SHIPS, DEFAULT_SHIP } from "../src/data/ships.js";
import { SHIP_LAYOUTS, layoutFor } from "../src/data/outfitting.js";
import { createPlayer } from "../src/sim/player.js";
import { configurePlayer } from "../src/sim/session.js";
import { buyShip, selectShip, repairCost } from "../src/sim/economy.js";
import { launchMissile } from "../src/sim/missile.js";
import { V } from "../src/util/math.js";
import { setSeed } from "../src/util/rng.js";

function fresh(cr = 100) {
  state.players.length = 0; state.localPlayerIndex = 0;
  applySave(newSave());
  state.profile.cr = cr;
  state.place = "hollow";
  for (const list of Object.values(state.world)) list.length = 0;
  const local = configurePlayer(createPlayer(), state.profile);
  local.docked = true;
  local.flight.spawnT = 1e9;
  setSeed(12345);
  return { local };
}

test("the Test Ship is in the Hangar data for 1 credit, with the Wasp's layout and hold", () => {
  assert.ok(SHIPS.testship, "SHIPS.testship exists");
  assert.equal(SHIPS.testship.price, 1, "costs one credit");
  assert.equal(SHIPS.testship.n, "Test Ship");
  assert.equal(SHIPS.testship.cargo, SHIPS.wasp.cargo, "same hold as the Wasp");
  assert.equal(SHIPS.testship.dmg, 10, "10× damage");
  assert.equal(SHIPS.testship.hpMul, 100, "100× Hull HP");
  assert.deepEqual(SHIP_LAYOUTS.testship, SHIP_LAYOUTS.wasp, "same slot layout as the Wasp");
  assert.deepEqual(
    layoutFor("testship"),
    { power: 1, cell: 1, thruster: 1, shield: 1, primary: 2, secondary: 1, hull: 1 },
    "the Wasp's layout",
  );
  assert.equal(DEFAULT_SHIP, "wasp", "the Test Ship is not the default hull");
});

test("a fresh profile is delivered a Test Ship fitted exactly like a stocked Wasp", () => {
  const save = newSave();
  assert.deepEqual(save.profile.loadout.testship, stockFor("testship"));
  assert.deepEqual(save.profile.loadout.testship.primary, ["cannon_basic", null]);
  assert.deepEqual(save.profile.loadout.testship.hull, ["hull_basic"]);
});

test("buying it deducts 1 credit and fits the stock modules the same way the Wasp gets them", () => {
  const { local } = fresh(100);
  buyShip("testship");
  assert.ok(state.profile.ships.includes("testship"), "the Test Ship is in the hangar");
  assert.equal(state.profile.cr, 99, "1 credit paid");
  assert.deepEqual(state.profile.loadout.testship, stockFor("testship"), "stock fit, like a bought Wasp");
  assert.equal(state.profile.holds.testship ? Object.keys(state.profile.holds.testship).length : -1, 0, "empty hold");
  assert.equal(state.profile.hp.testship, 1, "fresh hull");
});

test("the Test Ship flies with 1000 Hull HP (100× the stock 10)", () => {
  const { local } = fresh(100);
  buyShip("testship");
  selectShip("testship");
  assert.equal(state.profile.ship, "testship");
  assert.equal(local.hullMax, 1000, "100× hull_basic's 10 HP");
  assert.equal(local.hull, 1000, "freshly bought, full hull");
});

test("repairs are charged against the real 1000 Hull HP, not the module's 10", () => {
  fresh(10000);
  buyShip("testship");
  state.profile.hp.testship = 0.5;      // half hull missing, like the Wasp fixture
  state.profile.hp.wasp = 0.5;
  const waspCost = repairCost("wasp");
  const testCost = repairCost("testship");
  assert.ok(testCost > waspCost * 50, `Test Ship repairs (${testCost} cr) are charged on 1000 HP, Wasp (${waspCost} cr) on 10`);
});

test("everything the Test Ship fires hits ten times harder", () => {
  const { local } = fresh(100);
  buyShip("testship");
  selectShip("testship");
  const m = launchMissile(null, { dmg: 8 }, V(0, 0, -1), V(0, 0, -5), local);
  assert.equal(m.dmg, 80, "missile damage × the hull's 10×");
  selectShip("wasp");
  const m2 = launchMissile(null, { dmg: 8 }, V(0, 0, -1), V(0, 0, -5), local);
  assert.equal(m2.dmg, 8, "the Wasp multiplies by 1");
});
