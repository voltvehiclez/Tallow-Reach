// Content checks. These fail when someone adds a ship, item, weapon, base module
// or contract type and forgets a field or a second place that needs updating.
// Run with `npm test`. When one fails, the message says which entry is wrong.

import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { SHIPS, DEFAULT_SHIP, FLIGHT } from "../src/data/ships.js";
import { ITEM, KEYS, emptyCargo } from "../src/data/items.js";
import { PRIMARY, MISSILE, SHOP_WEAPONS } from "../src/data/weapons.js";
import { BASE_MODULES, BASE_DEFAULT } from "../src/data/station.js";
import { CONTRACT, CONTRACT_TYPES, DESCRIBE, CONTRACTS_PER_BOARD } from "../src/data/contracts.js";
import { SECTORS, SECTOR_IDS, DEFAULT_SECTOR, sectorAt, nextSector, WARP, WARP_TIME, WARP_SWITCH_AT, WARP_FLASH_RAMP, WARP_FLASH_FADE, WARP_COAST, warpPhaseAt, warpFlashAt, warpSteerEase } from "../src/data/sectors.js";
import { newProfile, sanitizeProfile, SAVE_VERSION, MISSION_TYPES } from "../src/state/profile.js";
import { CAMERA, cameraTrail } from "../src/data/camera.js";
import { MODULE_GROUPS, SHIP_LAYOUTS, layoutFor, slotsFor, APPEARANCE_SLOTS } from "../src/data/outfitting.js";
import { MODULES, STOCK_FIT } from "../src/data/modules.js";
import { powerOf, updatePower } from "../src/sim/power.js";
import { driveOf, hasDrive, driveDraw } from "../src/sim/drive.js";
import { hasPower } from "../src/sim/power.js";
import { state } from "../src/state/state.js";

const isNum = v => typeof v === "number" && Number.isFinite(v);
// What a ship with an empty thruster bay has: nothing to move or turn with, and
// nothing to pay for.
const PARKED = { spd: 0, turn: 0, draw: 0, boost: 0, ignite: 0, bmax: 0, buse: 0, bfill: 0 };

test("every ship has all the fields the game reads", () => {
  assert.ok(SHIPS[DEFAULT_SHIP], "DEFAULT_SHIP must exist in SHIPS");
  for (const [id, s] of Object.entries(SHIPS)) {
    assert.equal(typeof s.n, "string", `${id}: n (name)`);
    assert.equal(typeof s.d, "string", `${id}: d (description)`);
    for (const f of ["cargo", "hull", "dmg", "mine", "sc", "price", "col"]) {
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

test("every sector has a name, a description, a spawn point and its flags", () => {
  assert.ok(SECTORS[DEFAULT_SECTOR], `DEFAULT_SECTOR "${DEFAULT_SECTOR}" must be in SECTORS`);
  assert.ok(SECTOR_IDS.length >= 2, "the warp key needs at least two sectors");
  for (const id of SECTOR_IDS) {
    const s = SECTORS[id];
    assert.ok(s, `${id} is listed in SECTOR_IDS but missing from SECTORS`);
    assert.equal(typeof s.n, "string", `${id}: n (name)`);
    assert.equal(typeof s.d, "string", `${id}: d (description)`);
    assert.ok(
      Array.isArray(s.sn) && s.sn.length === 3 && s.sn.every(isNum),
      `${id}: sn (spawn point) must be three numbers`
    );
    for (const f of ["st", "fd", "foes"]) {
      assert.equal(typeof s[f], "boolean", `${id}: ${f} must be true or false`);
    }
  }
  assert.deepEqual(
    Object.keys(SECTORS).sort(),
    [...SECTOR_IDS].sort(),
    "SECTORS and SECTOR_IDS must list the same sectors"
  );
});

test("warping visits every sector and comes back to where it started", () => {
  let id = DEFAULT_SECTOR;
  const seen = [id];
  for (let i = 1; i < SECTOR_IDS.length; i++) {
    id = nextSector(id);
    seen.push(id);
  }
  assert.deepEqual(seen.sort(), [...SECTOR_IDS].sort(), "the warp cycle must reach every sector");
  assert.equal(nextSector(id), DEFAULT_SECTOR, "the warp cycle must return to the starting sector");
});

test("an unknown sector id falls back to the starting sector", () => {
  assert.equal(sectorAt("no-such-sector"), SECTORS[DEFAULT_SECTOR]);
});

test("a warp takes about two seconds and its phases run in order", () => {
  for (const f of ["charge", "flash", "settle"]) {
    assert.ok(isNum(WARP[f]) && WARP[f] > 0, `WARP.${f} must be a positive number of seconds`);
  }
  assert.ok(
    WARP_TIME >= 1.7 && WARP_TIME <= 2.3,
    `a warp should take about two seconds, but WARP_TIME is ${WARP_TIME}`
  );
  assert.equal(WARP_SWITCH_AT, WARP.charge, "the sector should change when the charge ends");
  assert.equal(warpPhaseAt(0), "charge", "a warp starts by charging");
  assert.equal(warpPhaseAt(WARP.charge - 0.01), "charge");
  assert.equal(warpPhaseAt(WARP_SWITCH_AT), "flash", "the flash begins as the sector changes");
  assert.equal(warpPhaseAt(WARP_TIME - 0.01), "settle");
  assert.equal(warpPhaseAt(WARP_TIME), "done", "control must come back when the warp ends");
});

test("the warp white-out peaks at the switch and is gone by the end", () => {
  assert.equal(warpFlashAt(0), 0, "the screen is clear when the charge starts");
  assert.equal(warpFlashAt(WARP_SWITCH_AT - WARP_FLASH_RAMP - 0.01), 0);
  assert.ok(warpFlashAt(WARP_SWITCH_AT) > 0.99, "it must be at full white when the sector changes");
  assert.ok(warpFlashAt(WARP_SWITCH_AT + WARP.flash + 0.01) > 0.9, "and stay bright through the flash");
  assert.ok(warpFlashAt(WARP_SWITCH_AT + WARP.flash + WARP_FLASH_FADE + 0.01) === 0, "then fade out");
  assert.equal(warpFlashAt(WARP_TIME), 0, "nothing is left on the screen when the warp ends");
});

test("the controls ease to neutral during a warp, they do not snap off", () => {
  assert.equal(warpSteerEase(0), 1, "the ship is still steering on the frame the drive engages");
  const half = warpSteerEase(WARP_COAST.steer / 2);
  assert.ok(half > 0.4 && half < 0.6, `half-way through the ease the stick should be near half, got ${half}`);
  assert.equal(warpSteerEase(WARP_COAST.steer), 0, "the stick is centred after WARP_COAST.steer seconds");
  assert.equal(warpSteerEase(99), 0, "and it stays centred");
  assert.ok(
    WARP_COAST.steer < WARP.charge,
    "a turn must have unwound before the sector changes, or the player sees it snap at the flash"
  );
});

test("only forward thrust reaches full speed, and turning is scaled", () => {
  for (const k of ["strafe", "lift", "reverse"]) {
    assert.ok(
      isNum(FLIGHT[k]) && FLIGHT[k] > 0 && FLIGHT[k] < 1,
      `FLIGHT.${k} must be a fraction of forward speed, above 0 and below 1`
    );
  }
  assert.ok(isNum(FLIGHT.turn) && FLIGHT.turn > 0, "FLIGHT.turn must be a positive multiplier");
  assert.ok(FLIGHT.turn <= 1, "FLIGHT.turn scales the hulls down, it should not exceed 1");
});

test("the camera trail is bounded: idle, flat out and full reverse land on fixed distances", () => {
  const fwdTop = 300, revTop = 45;              // a Wasp: 150 m/s, boost 2x, reverse 0.3x
  assert.ok(CAMERA.reverse < CAMERA.base && CAMERA.base < CAMERA.fast, "reverse < idle < fast");
  assert.equal(cameraTrail(0, fwdTop, revTop), CAMERA.base, "standing still is the idle distance");
  assert.equal(cameraTrail(fwdTop, fwdTop, revTop), CAMERA.fast, "full boost is the furthest the camera goes");
  assert.equal(cameraTrail(fwdTop * 4, fwdTop, revTop), CAMERA.fast, "and nothing can push it further");
  assert.equal(cameraTrail(-revTop, fwdTop, revTop), CAMERA.reverse, "full reverse is the closest");
  assert.equal(cameraTrail(-revTop * 4, fwdTop, revTop), CAMERA.reverse, "and nothing can pull it closer");
  let prev = -Infinity;
  for (let vf = -revTop; vf <= fwdTop; vf += 5) {
    const d = cameraTrail(vf, fwdTop, revTop);
    assert.ok(d > prev, "the trail grows with speed and never doubles back");
    assert.ok(d >= CAMERA.reverse && d <= CAMERA.fast, `distance ${d} is inside the limits`);
    prev = d;
  }
  // A slower hull reaches its own top speed lower down, so it never hits 17.
  const slow = cameraTrail(210, 210, 30);
  assert.equal(slow, CAMERA.fast, "every hull reaches the full trail at its own top speed");
  assert.ok(cameraTrail(210, 300, 45) < CAMERA.fast, "at the same speed a faster hull trails less");
});

test("every module group is complete, and every hull has a bay count for it", () => {
  assert.ok(MODULE_GROUPS.length > 0, "MODULE_GROUPS needs at least one group");

  const groups = new Set();
  for (const g of MODULE_GROUPS) {
    assert.equal(typeof g.k, "string", "every group needs k (id)");
    assert.ok(!groups.has(g.k), `duplicate module group id: ${g.k}`);
    groups.add(g.k);
    assert.equal(typeof g.n, "string", `${g.k}: n (name)`);
    assert.equal(typeof g.d, "string", `${g.k}: d (description)`);
  }

  // Every hull lays out every group once, through slotsFor.
  for (const id of Object.keys(SHIPS)) {
    const layout = layoutFor(id);
    for (const g of MODULE_GROUPS) {
      assert.ok(
        Number.isInteger(layout[g.k]) && layout[g.k] >= 1,
        `${id}: ${g.k} needs a whole number of bays, at least one`
      );
      assert.equal(slotsFor(g, id), layout[g.k], `${id}: slotsFor must read the hull's layout`);
    }
    for (const k of Object.keys(layout)) {
      assert.ok(groups.has(k), `${id}: layout mentions ${k}, which is not a module group`);
    }
  }

  // The layout the screen was built for: the Wasp's, copied to every hull today.
  assert.deepEqual(
    layoutFor("wasp"),
    { power: 1, cell: 1, thruster: 1, shield: 1, primary: 2, secondary: 1, hull: 1 },
    "the Wasp's layout"
  );
  for (const id of Object.keys(SHIP_LAYOUTS)) {
    assert.deepEqual(layoutFor(id), layoutFor("wasp"), `${id} should start with the Wasp's layout`);
  }
});

test("every module fits its own group and carries that group's stat", () => {
  const groupIds = new Set(MODULE_GROUPS.map(g => g.k));
  for (const [id, m] of Object.entries(MODULES)) {
    assert.ok(groupIds.has(m.g), `${id}: g must name a module group, not ${m.g}`);
    assert.equal(typeof m.n, "string", `${id}: n (name)`);
    assert.equal(typeof m.d, "string", `${id}: d (description)`);
    if (m.g === "power") assert.ok(isNum(m.mjps) && m.mjps > 0, `${id}: a powerplant makes MJ/s`);
    if (m.g === "cell") assert.ok(isNum(m.mj) && m.mj > 0, `${id}: a power cell holds MJ`);
    if (m.g === "thruster") {
      assert.ok(isNum(m.spd) && m.spd > 0, `${id}: thrusters set a top speed`);
      assert.ok(isNum(m.turn) && m.turn > 0, `${id}: thrusters set a turn rate`);
    }
    if (m.g === "shield") {
      assert.ok(isNum(m.sh) && m.sh > 0, `${id}: shields hold shield points`);
      assert.ok(isNum(m.regen) && m.regen > 0, `${id}: shields set a recharge rate`);
      assert.ok(isNum(m.delay) && m.delay >= 0, `${id}: shields set the lull before recharging`);
      assert.ok(isNum(m.draw) && m.draw > 0, `${id}: shields state a flat power draw`);
      assert.ok(isNum(m.drain) && m.drain > 0, `${id}: shields state how fast they bleed without power`);
    }
  }
  for (const [g, list] of Object.entries(STOCK_FIT)) {
    for (const id of list) {
      assert.ok(MODULES[id], `${g}: stock module ${id} must exist`);
      assert.equal(MODULES[id].g, g, `${id} can only be fitted in a ${MODULES[id].g} bay`);
    }
  }
});

test("shields are a module, and every hull is delivered with them", () => {
  const m = MODULES.shield_basic;
  assert.ok(m, "there is a basic shield module");
  assert.equal(m.g, "shield", "it fits the shield bay");
  assert.equal(m.sh, 10, "10 shield points");
  assert.equal(m.regen, 1, "1 point a second");
  assert.equal(m.delay, 4, "and only after 4 seconds without a hit");
  assert.equal(m.draw, 2, "2 MJ/s flat, whenever they are fitted");
  assert.equal(m.drain, 1, "and 1 point a second lost when that cannot be paid");
  assert.deepEqual(STOCK_FIT.shield, ["shield_basic"], "every hull is delivered with them");
  for (const [id, s] of Object.entries(SHIPS)) {
    assert.equal(s.sh, undefined, `${id}: shield points come from the module, not the hull`);
  }
  const p = newProfile();
  for (const id of Object.keys(SHIPS)) {
    assert.deepEqual(p.loadout[id].shield, ["shield_basic"], `${id} has basic shields fitted`);
  }
});

test("a new game starts with the basic plant, cell and thrusters", () => {
  const p = newProfile();
  assert.deepEqual(p.loadout.wasp.power, ["power_basic"], "the basic powerplant is fitted");
  assert.deepEqual(p.loadout.wasp.cell, ["cell_basic"], "the basic power cell is fitted");
  assert.deepEqual(p.loadout.wasp.thruster, ["thruster_basic"], "the basic thrusters are fitted");
  assert.deepEqual(powerOf(p.loadout.wasp), { gen: 10, cap: 100 }, "10 MJ/s and 100 MJ");
  assert.deepEqual(p.loadout.wasp.primary, [null, null], "weapon bays are delivered empty");
});

test("a ship with no thrusters warns the player when they try to move", () => {
  // The warning is player-facing wording, so guard it: sim/player.js is its only home.
  const src = readFileSync(new URL("../src/sim/player.js", import.meta.url), "utf8");
  assert.match(src, /msg\("Equip thrusters to move"/, "the warning must say exactly that");
  assert.match(
    src,
    /if \(!W && !powered && P\.noDriveT === 0 && tryingToMove\(stick\)\)/,
    "the warning fires when a control is pressed and there is no drive, and not on a warp"
  );
});

test("the basic thrusters draw power while flying, and a 20 MJ gulp to light the boost", () => {
  const d = driveOf(newProfile().loadout[DEFAULT_SHIP]);
  assert.equal(d.draw, 2, "2 MJ/s while the throttle is off centre");
  assert.equal(d.boost, 1, "1 MJ/s more while the boost burns");
  assert.equal(d.ignite, 20, "a flat 20 MJ each time the boost lights");
  assert.equal(driveDraw(d, 0, false), 0, "hands off the throttle, not boosting: no draw");
});

test("the boost tank is 10 units, burns 2 a second and refills at 1", () => {
  const m = MODULES.thruster_basic;
  assert.equal(m.bmax, 10, "10 units in the tank");
  assert.equal(m.buse, 2, "2 units a second while boosting");
  assert.equal(m.bfill, 1, "1 unit a second back");
  assert.ok(m.bmax / m.buse > 1, "a full tank must buy more than a second of boost");

  const d = driveOf(newProfile().loadout[DEFAULT_SHIP]);
  assert.equal(d.bmax, 10, "the drive carries the tank size");
  assert.equal(d.buse, 2);
  assert.equal(d.bfill, 1);
  assert.equal(PARKED.bmax, 0, "no thrusters, no tank");
});

test("any throttle setting off zero runs the thrusters, and the boost adds its share", () => {
  const d = { spd: 150, turn: 1.2, draw: 2, boost: 1, ignite: 20 };
  for (const thr of [1, 0.99, 0.5, -0.01, -0.3, -1]) {
    assert.equal(driveDraw(d, thr, false), 2, `throttle ${thr} runs the drive at 2 MJ/s`);
  }
  assert.equal(driveDraw(d, 0, false), 0, "exactly zero throttle draws nothing");
  assert.equal(driveDraw(d, 1, false), 2, "flying without boosting draws 2 MJ/s");
  assert.equal(driveDraw(d, 1, true), 3, "flying and boosting together draws 3 MJ/s");
  assert.equal(driveDraw(d, -0.5, true), 3, "reversing under boost draws 3 MJ/s too");
  assert.equal(driveDraw(PARKED, 1, true), 0, "no thrusters, nothing to pay for");
});

test("a ship with empty cells and no powerplant has no power to fly on", () => {
  assert.equal(hasPower(0, { stored: 0, gen: 0 }), true, "asking for nothing always works");
  assert.equal(hasPower(2, { stored: 0, gen: 0 }), false, "empty cells and no plant: no thrust");
  assert.equal(hasPower(2, { stored: 0, gen: 2 }), true, "a plant that covers the draw is enough");
  assert.equal(hasPower(2, { stored: 0, gen: 1.5 }), false, "a plant that cannot cover it is not");
  assert.equal(hasPower(2, { stored: 0.1, gen: 0 }), true, "anything left in the cells will do");
});

test("every hull flies exactly like the old Wasp on the basic thrusters", () => {
  const p = newProfile();
  // The basic thrusters carry the figures the old Wasp had, so the feel is kept.
  const t = MODULES.thruster_basic;
  const reference = {
    spd: t.spd,
    turn: t.turn,
    draw: t.draw,
    boost: t.boost,
    ignite: t.ign,
    bmax: t.bmax,
    buse: t.buse,
    bfill: t.bfill,
  };
  for (const id of Object.keys(SHIPS)) {
    assert.deepEqual(driveOf(p.loadout[id]), reference, `${id} should fly like the Wasp today`);
  }
});

test("a hull has no speed of its own, so no thrusters means it cannot move", () => {
  // Speed and turn live in the thruster module now, nowhere else.
  for (const [id, s] of Object.entries(SHIPS)) {
    assert.equal(s.spd, undefined, `${id}: the hull must not define a top speed`);
    assert.equal(s.turn, undefined, `${id}: the hull must not define a turn rate`);
  }
  const p = newProfile();
  for (const id of Object.keys(SHIPS)) {
    const empty = { ...p.loadout[id], thruster: [null] };
    assert.deepEqual(driveOf(empty), PARKED, `${id} with an empty thruster bay is dead in space`);
    assert.equal(hasDrive(driveOf(empty)), false, `${id} must not be able to move`);
  }
  assert.equal(
    hasDrive(driveOf(newProfile().loadout[DEFAULT_SHIP])),
    true,
    "a fitted thruster does move the ship"
  );
});

test("thrusters are the only thing that sets speed and turn", () => {
  // Anyone reading the data should find the numbers in one place.
  const thrusters = Object.entries(MODULES).filter(([, m]) => m.g === "thruster");
  assert.ok(thrusters.length > 0, "at least one thruster must exist");
  for (const [id, m] of thrusters) {
    assert.ok(isNum(m.spd) && m.spd > 0, `${id}: spd is the top speed in m/s`);
    assert.ok(isNum(m.turn) && m.turn > 0, `${id}: turn is the steering rate`);
  }
  // No drive at all is a parked ship rather than a crash.
  assert.deepEqual(driveOf(undefined), PARKED);
  assert.deepEqual(driveOf({ thruster: ["junk", null] }), PARKED);
});

test("an old save gets the stock fit, and bad modules are dropped", () => {
  const old = sanitizeProfile({ v: 2, ships: ["wasp"], ship: "wasp", cr: 50 });
  assert.equal(old.v, SAVE_VERSION, "old saves are stamped with the new version");
  assert.deepEqual(old.loadout.wasp.power, ["power_basic"], "an old save is fitted with the basic plant");
  assert.deepEqual(powerOf(old.loadout.wasp), { gen: 10, cap: 100 });

  const wrong = sanitizeProfile({
    ships: ["wasp"],
    loadout: { wasp: { power: ["cell_basic", "power_basic"], cell: ["cell_basic"] } },
  });
  assert.deepEqual(wrong.loadout.wasp.power, [null], "a cell cannot sit in a powerplant bay, and the extra bay is dropped");

  const emptied = sanitizeProfile({
    ships: ["wasp"],
    loadout: { wasp: { power: [null], cell: ["cell_basic"] } },
  });
  assert.deepEqual(emptied.loadout.wasp.power, [null], "a bay the player emptied stays empty");
});

test("shields arrived in save version 6: older saves are fitted with them", () => {
  const v5 = sanitizeProfile({ v: 5, ships: ["wasp"], ship: "wasp", cr: 100 });
  assert.equal(v5.v, SAVE_VERSION);
  assert.deepEqual(v5.loadout.wasp.shield, ["shield_basic"], "a v5 save gains basic shields");
  assert.deepEqual(v5.loadout.wasp.thruster, ["thruster_basic"], "and keeps its thrusters");

  const ancient = sanitizeProfile({ v: 2, ships: ["wasp"], ship: "wasp", cr: 100 });
  assert.deepEqual(ancient.loadout.wasp.shield, ["shield_basic"], "so does a very old one");

  // A save from this version that really has an empty shield bay keeps it empty.
  const removed = sanitizeProfile({
    v: SAVE_VERSION,
    ships: ["wasp"],
    ship: "wasp",
    loadout: { wasp: { shield: [null] } },
  });
  assert.deepEqual(removed.loadout.wasp.shield, [null], "the player's choice to run shieldless stands");
});

test("a pirate cannon does 1 damage a shot", () => {
  // The pirate numbers live in sim/ai.js (see ARCHITECTURE.md), so guard the one
  // the shields are balanced against.
  const src = readFileSync(new URL("../src/sim/ai.js", import.meta.url), "utf8");
  assert.match(src, /fire\(e\.m\.position, dir, 520, false, 1\)/, "enemy cannons must do 1 a shot");
});

test("the cells charge at the plants' rate, never overflow and never go negative", () => {
  const p = state.power;
  p.gen = 10;
  p.cap = 100;
  p.draw = 0;
  p.stored = 0;

  updatePower(1);
  assert.equal(p.stored, 10, "one second at 10 MJ/s puts 10 MJ in the cells");
  for (let i = 0; i < 20; i++) updatePower(1);
  assert.equal(p.stored, 100, "the cells stop at their capacity");

  p.draw = 25;   // using more than the plant makes
  updatePower(1);
  assert.equal(p.stored, 85, "the cells make up the difference");

  p.draw = 1000;
  updatePower(1);
  assert.equal(p.stored, 0, "the cells empty, they do not go negative");
});

test("the appearance card has its two paint bays, primary first", () => {
  const seen = new Set();
  for (const a of APPEARANCE_SLOTS) {
    assert.equal(typeof a.k, "string", "every paint slot needs k (id)");
    assert.ok(!seen.has(a.k), `duplicate paint slot id: ${a.k}`);
    seen.add(a.k);
    assert.equal(typeof a.n, "string", `${a.k}: n (name)`);
    assert.ok(a.n.trim().length > 0, `${a.k}: the bay needs a name`);
  }
  assert.deepEqual(
    APPEARANCE_SLOTS.map(a => a.k),
    ["primary", "secondary"],
    "the hull has a primary and a secondary colour, in that order"
  );
});

test("the bay box style sits on .mod-bay itself, so paint bays get a box too", () => {
  // Module bays are buttons; paint bays on the Appearance card are divs. When the
  // box styling lived only on `button.mod-bay`, the paint bays collapsed into bare
  // text ("PRIMARYEmpty"). Keep the box on the bare class.
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  const box = css.match(/(?:^|\n)\.mod-bay\s*\{([\s\S]*?)\}/);
  assert.ok(box, "styles.css needs a bare .mod-bay rule for every bay, button or not");
  for (const re of [/display:\s*grid/, /padding:/, /border:/, /background:/]) {
    assert.match(box[1], re, `.mod-bay is missing ${re} - every bay needs the box`);
  }

  const button = css.match(/(?:^|\n)button\.mod-bay\s*\{([\s\S]*?)\}/);
  assert.ok(button, "button.mod-bay should keep the button reset (font, colour, cursor)");
  assert.ok(
    !/(?:^|\n)\s*(?:border|padding|display|background)\s*:/.test(button[1]),
    "button.mod-bay must not hold the box styles: the paint bays would lose them"
  );
});
