// Shields: capacity, recharge delay and recharge rate. Run with `npm test`.
// sim/shield.js does not touch the scene, so a plain object can stand in for the
// flying ship.

import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../src/state/state.js";
import { newProfile } from "../src/state/profile.js";
import { shieldOf, shieldDraw, refreshShield, updateShield } from "../src/sim/shield.js";
import { refillPower } from "../src/sim/power.js";

/** A new game, with a stand-in player record and the clock at 0. */
function fresh({ loadout, docked = false } = {}) {
  state.profile = newProfile();
  if (loadout) state.profile.loadout.wasp = loadout;
  state.player = { sh: 0, shMax: 0, last: 0, docked };
  state.time = 0;
  refillPower();          // a full powerplant and cell, so shields can be paid for
  refreshShield();
  return state.player;
}

const bay = (id) => ({ shield: [id] });

test("the basic shields hold 10 points, recharge 1 a second, after 4 quiet seconds", () => {
  assert.deepEqual(shieldOf({ shield: ["shield_basic"] }), { cap: 10, regen: 1, delay: 4, draw: 1, charge: 1 });
  assert.deepEqual(shieldOf({ shield: [null] }), { cap: 0, regen: 0, delay: 0, draw: 0, charge: 0 }, "empty bay: no shields");
  assert.deepEqual(shieldOf({}), { cap: 0, regen: 0, delay: 0, draw: 0, charge: 0 }, "no bay at all: no shields");
  assert.deepEqual(shieldOf(undefined), { cap: 0, regen: 0, delay: 0, draw: 0, charge: 0 }, "nothing to read: no crash");
});

test("a fitted shield sets the ship's maximum, and docking fills it", () => {
  const flying = fresh();
  assert.equal(flying.shMax, 10, "10 points from the module");
  assert.equal(flying.sh, 0, "not docked, so the shields stay empty");
  assert.deepEqual({ ...state.shield }, { cap: 10, regen: 1, delay: 4, draw: 1, charge: 1 }, "state.shield mirrors the module");

  const docked = fresh({ docked: true });
  assert.equal(docked.sh, 10, "the outpost fills them");
});

test("no shield module means no shields at all", () => {
  const P = fresh({ loadout: bay(null) });
  assert.equal(P.shMax, 0);
  P.sh = 50;                       // a stray value from an earlier fit
  state.time = 100;
  updateShield(1);
  assert.equal(P.sh, 0, "there is nothing to recharge, so it is cleared");
  assert.deepEqual({ ...state.shield }, { cap: 0, regen: 0, delay: 0, draw: 0, charge: 0 });
});

test("shields recharge 1 point a second once four quiet seconds have passed", () => {
  const P = fresh();
  P.sh = 4;

  // Just hit: the recharge stops dead.
  P.last = 0;
  state.time = 0;
  updateShield(1);
  assert.equal(P.sh, 4, "no recharge the moment damage lands");

  state.time = 3.9;
  updateShield(0.1);
  assert.equal(P.sh, 4, "still inside the 4 second lull");

  state.time = 4.5;
  updateShield(0.5);
  assert.equal(P.sh, 4.5, "half a second after the lull ends: 4 + 0.5");

  state.time = 5.5;
  updateShield(1);
  assert.equal(P.sh, 5.5, "then 1 a second");
});

test("a hit during the recharge stops it again, and it never passes the maximum", () => {
  const P = fresh();
  P.sh = 2;
  state.time = 10;
  P.last = 5.5;                    // 4.5 s ago, so it is recharging
  updateShield(1);
  assert.equal(P.sh, 3);

  P.last = 10;                     // hit now
  state.time = 10.9;
  updateShield(0.9);
  assert.equal(P.sh, 3, "the hit puts the recharge back on hold");

  state.time = 14;                 // 4 s after that hit
  updateShield(0.1);
  assert.equal(P.sh, 3.1, "and it starts again after another 4 quiet seconds");

  P.sh = 9;
  state.time = 30;
  updateShield(10);
  assert.equal(P.sh, 10, "capped at 10");
});

test("a ship with no shields takes every hit on the hull", () => {
  // hurt() lives in sim/player.js (it needs the scene), so this checks the one
  // number it reads: with no module the maximum is 0, so nothing absorbs damage.
  const P = fresh({ loadout: bay(null) });
  assert.equal(P.shMax, 0, "no shield module, no shield points to absorb a hit");
});

test("shields cost 1 MJ/s while up and 2 MJ/s while recharging", () => {
  const up = { cap: 10, regen: 1, delay: 4, draw: 1, charge: 1 };
  assert.equal(shieldDraw(up, false), 1, "up and holding: 1 MJ/s");
  assert.equal(shieldDraw(up, true), 2, "and filling: 2 MJ/s");
  assert.equal(shieldDraw(shieldOf({ shield: [null] }), true), 0, "no shields, no draw");
  assert.equal(shieldDraw(shieldOf({ shield: [null] }), false), 0);
  assert.equal(shieldDraw(null, true), 0, "nothing fitted at all");
});

test("the power bill follows the shields: 1 up, 2 filling, 0 without a module", () => {
  const P = fresh({ docked: true });
  state.time = 1;
  P.last = -999;                   // nothing has hit the ship
  P.sh = P.shMax;                  // full, so not recharging
  updateShield(1);
  assert.equal(state.power.use.shield, 1, "full shields still draw their 1 MJ/s");
  assert.equal(state.power.draw, 1, "and that is the whole bill with the drive idle");

  P.sh = 4;                        // damaged, and the lull has long passed
  updateShield(1);
  assert.equal(state.power.use.shield, 2, "recharging costs the extra 1 MJ/s");
  assert.equal(state.power.draw, 2);

  P.last = state.time;             // hit now: the recharge stops
  updateShield(1);
  assert.equal(P.sh, 5, "filled a point before the hit landed");
  state.time += 1;
  updateShield(1);
  assert.equal(state.power.use.shield, 1, "under fire they only cost the standing 1 MJ/s");
  assert.equal(P.sh, 5, "and they do not fill");

  const none = fresh({ loadout: bay(null) });
  none.sh = 5;
  updateShield(1);
  assert.equal(state.power.use.shield, 0, "no shield module, nothing to pay for");
});
