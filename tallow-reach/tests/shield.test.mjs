// Shields: capacity, recharge delay and recharge rate. Run with `npm test`.
// sim/shield.js does not touch the scene, so a plain object can stand in for the
// flying ship.

import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../src/state/state.js";
import { newProfile } from "../src/state/profile.js";
import { shieldOf, refreshShield, updateShield } from "../src/sim/shield.js";

/** A new game, with a stand-in player record and the clock at 0. */
function fresh({ loadout, docked = false } = {}) {
  state.profile = newProfile();
  if (loadout) state.profile.loadout.wasp = loadout;
  state.player = { sh: 0, shMax: 0, last: 0, docked };
  state.time = 0;
  refreshShield();
  return state.player;
}

const bay = (id) => ({ shield: [id] });

test("the basic shields hold 100 points, recharge 10 a second, after 4 quiet seconds", () => {
  assert.deepEqual(shieldOf({ shield: ["shield_basic"] }), { cap: 100, regen: 10, delay: 4 });
  assert.deepEqual(shieldOf({ shield: [null] }), { cap: 0, regen: 0, delay: 0 }, "empty bay: no shields");
  assert.deepEqual(shieldOf({}), { cap: 0, regen: 0, delay: 0 }, "no bay at all: no shields");
  assert.deepEqual(shieldOf(undefined), { cap: 0, regen: 0, delay: 0 }, "nothing to read: no crash");
});

test("a fitted shield sets the ship's maximum, and docking fills it", () => {
  const flying = fresh();
  assert.equal(flying.shMax, 100, "100 points from the module");
  assert.equal(flying.sh, 0, "not docked, so the shields stay empty");
  assert.deepEqual({ ...state.shield }, { cap: 100, regen: 10, delay: 4 }, "state.shield mirrors the module");

  const docked = fresh({ docked: true });
  assert.equal(docked.sh, 100, "the outpost fills them");
});

test("no shield module means no shields at all", () => {
  const P = fresh({ loadout: bay(null) });
  assert.equal(P.shMax, 0);
  P.sh = 50;                       // a stray value from an earlier fit
  state.time = 100;
  updateShield(1);
  assert.equal(P.sh, 0, "there is nothing to recharge, so it is cleared");
  assert.deepEqual({ ...state.shield }, { cap: 0, regen: 0, delay: 0 });
});

test("shields recharge 10 points a second once four quiet seconds have passed", () => {
  const P = fresh();
  P.sh = 40;

  // Just hit: the recharge stops dead.
  P.last = 0;
  state.time = 0;
  updateShield(1);
  assert.equal(P.sh, 40, "no recharge the moment damage lands");

  state.time = 3.9;
  updateShield(0.1);
  assert.equal(P.sh, 40, "still inside the 4 second lull");

  state.time = 4.5;
  updateShield(0.5);
  assert.equal(P.sh, 45, "half a second after the lull ends: 40 + 5");

  state.time = 5.5;
  updateShield(1);
  assert.equal(P.sh, 55, "then 10 a second");
});

test("a hit during the recharge stops it again, and it never passes the maximum", () => {
  const P = fresh();
  P.sh = 20;
  state.time = 10;
  P.last = 5.5;                    // 4.5 s ago, so it is recharging
  updateShield(1);
  assert.equal(P.sh, 30);

  P.last = 10;                     // hit now
  state.time = 10.9;
  updateShield(0.9);
  assert.equal(P.sh, 30, "the hit puts the recharge back on hold");

  state.time = 14;                 // 4 s after that hit
  updateShield(0.1);
  assert.equal(P.sh, 31, "and it starts again after another 4 quiet seconds");

  P.sh = 99;
  state.time = 30;
  updateShield(10);
  assert.equal(P.sh, 100, "capped at 100");
});

test("a ship with no shields takes every hit on the hull", () => {
  // hurt() lives in sim/player.js (it needs the scene), so this checks the one
  // number it reads: with no module the maximum is 0, so nothing absorbs damage.
  const P = fresh({ loadout: bay(null) });
  assert.equal(P.shMax, 0, "no shield module, no shield points to absorb a hit");
});
