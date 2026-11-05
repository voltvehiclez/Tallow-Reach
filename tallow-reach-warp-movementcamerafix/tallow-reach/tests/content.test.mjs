// Content checks. These fail when someone adds a ship, item, weapon, base module
// or contract type and forgets a field or a second place that needs updating.
// Run with `npm test`. When one fails, the message says which entry is wrong.

import { test } from "node:test";
import assert from "node:assert/strict";
import { SHIPS, DEFAULT_SHIP, FLIGHT } from "../src/data/ships.js";
import { ITEM, KEYS, emptyCargo } from "../src/data/items.js";
import { PRIMARY, MISSILE, SHOP_WEAPONS } from "../src/data/weapons.js";
import { BASE_MODULES, BASE_DEFAULT } from "../src/data/station.js";
import { CONTRACT, CONTRACT_TYPES, DESCRIBE, CONTRACTS_PER_BOARD } from "../src/data/contracts.js";
import { SECTORS, SECTOR_IDS, DEFAULT_SECTOR, sectorAt, nextSector, WARP, WARP_TIME, WARP_SWITCH_AT, WARP_FLASH_RAMP, WARP_FLASH_FADE, WARP_COAST, warpPhaseAt, warpFlashAt, warpSteerEase } from "../src/data/sectors.js";
import { newProfile, sanitizeProfile, MISSION_TYPES } from "../src/state/profile.js";
import { CAMERA, cameraTrail } from "../src/data/camera.js";

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
