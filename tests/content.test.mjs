// Content checks. These fail when someone adds a ship, item, weapon, base module
// or contract type and forgets a field or a second place that needs updating.
// Run with `npm test`. When one fails, the message says which entry is wrong.

import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { SHIPS, DEFAULT_SHIP, FLIGHT } from "../src/data/ships.js";
import {
  ITEMS, ITEM_IDS, ITEM_CATEGORIES, canSell, isItem, isModule, itemName, itemStack, itemValue, itemVol,
} from "../src/data/items.js";
import { MISSILE } from "../src/data/weapons.js";
import { SHOPS, isShop, shopRow } from "../src/data/shops.js";
import { BASE_MODULES, BASE_DEFAULT } from "../src/data/station.js";
import { CONTRACT, CONTRACT_TYPES, DESCRIBE, CONTRACTS_PER_BOARD } from "../src/data/contracts.js";
import { ENEMIES, DEFAULT_ENEMY, enemyDef } from "../src/data/enemies.js";
import { FACTIONS } from "../src/data/factions.js";
import { LOOT_TABLES } from "../src/data/loot.js";
import { ENCOUNTERS, ENCOUNTER_IDS, encounterDef } from "../src/data/encounters.js";
import { PLACE_TEMPLATES, PLACE_TEMPLATE_IDS, encounterIdsFor, templateEncounterIds, templateFeatures, isPlaceTemplate } from "../src/data/place-templates.js";
import { WARP, WARP_TIME, WARP_SWITCH_AT, WARP_FLASH_RAMP, WARP_FLASH_FADE, WARP_COAST, warpPhaseAt, warpFlashAt, warpSteerEase } from "../src/data/sectors.js";
import { PLACES, PLACE_IDS, DEFAULT_PLACE, placeAt, nextPocket, pocketsIn, isPocket } from "../src/data/places.js";
import { stationAt } from "../src/sim/places.js";
import {
  newProfile,
  newWorld,
  sanitizeProfile,
  sanitizeWorld,
  sanitizeSave,
  SAVE_VERSION,
  MISSION_TYPES,
} from "../src/state/profile.js";
import { CAMERA, cameraTrail } from "../src/data/camera.js";
import { MODULE_GROUPS, SHIP_LAYOUTS, layoutFor, slotsFor, APPEARANCE_SLOTS } from "../src/data/outfitting.js";
import { MODULES, STOCK_FIT } from "../src/data/modules.js";
import { powerOf, updatePower } from "../src/sim/power.js";
import { driveOf, hasDrive, driveDraw } from "../src/sim/drive.js";
import { gunsOf, beamsOf, missilesOf, moduleListName } from "../src/sim/guns.js";
import { hullOf } from "../src/sim/hull.js";
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
    for (const f of ["cargo", "dmg", "mine", "sc", "price", "col"]) {
      assert.ok(isNum(s[f]) && s[f] > 0, `${id}: ${f} must be a positive number`);
    }
  }
});

test("every hull is the same ship apart from its hold (m³)", () => {
  const [first, ...rest] = Object.values(SHIPS);
  for (const s of rest) {
    for (const f of ["hull", "dmg", "mine", "sc", "price"]) {
      assert.equal(s[f], first[f], `every hull ships the same ${f} — only the hold differs`);
    }
  }
  const holds = Object.values(SHIPS).map(s => s.cargo);
  assert.ok(new Set(holds).size > 1, "the hulls differ in hold size (that is the point of them)");
});

test("every item is complete, and the catalogue agrees with the module table", () => {
  for (const [id, it] of Object.entries(ITEMS)) {
    assert.ok(ITEM_CATEGORIES.includes(it.cat), `${id}: cat must be one of ${ITEM_CATEGORIES.join(", ")}`);
    if (it.cat === "module") continue;    // a module's name, volume and value live in data/modules.js
    assert.equal(typeof it.n, "string", `${id}: n (name)`);
    assert.ok(isNum(it.v) && (it.cat === "mission" ? it.v >= 0 : it.v > 0),
      `${id}: v (value) must be positive unless it is a non-sellable mission object`);
    assert.ok(it.vol == null || (isNum(it.vol) && it.vol > 0), `${id}: vol (m³) must be above 0`);
    assert.ok(it.st == null || (Number.isInteger(it.st) && it.st > 0), `${id}: st (stack) must be a whole number above 0`);
  }

  // A module is an item too — that is what lets it be carried, stored and moved —
  // and an item that says "module" must be a real module.
  for (const id of Object.keys(MODULES)) {
    assert.ok(isItem(id), `${id} is a module with no item entry: add \`${id}: { cat: "module" }\` to data/items.js`);
    assert.ok(isModule(id), `${id}: its item entry must say cat: "module"`);
  }
  for (const id of ITEM_IDS) if (isModule(id)) assert.ok(MODULES[id], `${id}: item module with no entry in data/modules.js`);

  // One place per number: names, volumes and values are read through the helpers.
  assert.equal(itemName("ferrite"), "Ferrite");
  assert.equal(itemName("beam_basic"), MODULES.beam_basic.n, "a module's name comes from its stats");
  assert.equal(itemVol("beam_basic"), MODULES.beam_basic.vol, "and so does its volume");
  assert.equal(itemVol("ferrite"), 1, "a good is 1 m³ unless its entry says otherwise");
  assert.ok(itemValue("core") > itemValue("voidite"), "the catalogue carries the prices");
  assert.equal(canSell("core"), true);
  assert.equal(canSell("beam_basic"), true, "a spare module sells like any other item");
  assert.equal(itemStack("ferrite"), Infinity, "nothing has a stack limit yet");
  assert.equal(itemName("beacon"), "Beacon", "the story object has its own player-facing name");
  assert.equal(canSell("beacon"), false, "the mission Beacon is not ordinary salvage for sale");
  assert.equal(itemName("no-such-thing"), "no-such-thing", "an unknown id does not crash a screen");
  assert.equal(itemVol("no-such-thing"), 0);
});

test("weapon data is complete", () => {
  for (const f of ["unitPrice", "sp0", "max", "acc", "life", "turn", "range", "lock", "cone"]) {
    assert.ok(isNum(MISSILE[f]) && MISSILE[f] > 0, `MISSILE.${f}`);
  }
  // What a shop sells is data now (data/shops.js); the row-by-row checks live in
  // tests/shops.test.mjs. What matters here is that the outpost has a shop and
  // that a row never names an item the catalogue does not know.
  assert.ok(isShop(stationAt(DEFAULT_PLACE).shop), `the outpost's shop (${stationAt(DEFAULT_PLACE).shop}) must exist in SHOPS`);
  for (const [id, shop] of Object.entries(SHOPS)) {
    for (const row of shop.stock || []) {
      assert.ok(isItem(row.id), `${id} / ${row.id}: not in data/items.js`);
      assert.ok(isNum(row.price) && row.price > 0, `${id} / ${row.id}: price`);
    }
  }
  // The two things the shop has always sold, at the prices the owner set.
  assert.equal(shopRow(stationAt(DEFAULT_PLACE).shop, "beam_basic").price, 900, "the mining beam is still 900 cr");
  assert.equal(shopRow(stationAt(DEFAULT_PLACE).shop, "missile_basic").price, 1500, "the missile pod is still 1500 cr");
});

test("a spare module sells for 60% of what a shop charges for it", () => {
  // The rule the owner set: 60% of the shop price, rounded down and never below 1
  // credit. Both numbers are data, so this test is what stops a shop price change
  // from leaving the sell price behind.
  for (const [shopId, shop] of Object.entries(SHOPS)) {
    for (const row of shop.stock || []) {
      if (!isModule(row.id)) continue;
      const expected = Math.max(1, Math.floor(row.price * 0.6));
      assert.equal(
        itemValue(row.id),
        expected,
        `${shopId} sells ${row.id} for ${row.price} cr, so a spare one sells for ${expected} cr (data/items.js \`v\`)`
      );
    }
  }
  assert.equal(itemValue("beam_basic"), 540, "the beam: 900 cr in the shop, 540 cr sold back");
  assert.equal(itemValue("missile_basic"), 900, "the missile pod: 1500 cr in the shop, 900 cr sold back");
  assert.equal(itemValue("hull_basic"), 1, "a 1-cr standard part sells for 1 cr: 60% would round to nothing");
  // Every item that can be sold is worth something, module or not.
  for (const id of ITEM_IDS) if (canSell(id)) assert.ok(itemValue(id) > 0, `${id}: sell value must be above 0`);
});

test("every base module has a cost curve and a default level, and saves keep it", () => {
  const loaded = sanitizeWorld(newWorld()).base;
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
      `${id} is not kept by sanitizeWorld in state/profile.js`
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
        if (type === "mine") assert.ok(isItem(c.o), `mine: ore "${c.o}" is not in data/items.js`);
        if (type === "hunt") assert.ok(ENEMIES[c.e], `hunt: enemy "${c.e}" is not in ENEMIES`);
        if (type === "hunt") assert.match(DESCRIBE.hunt(c), /^Destroy \d+ pirate raiders$/, "hunt wording is built from the enemy's plural name");
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

test("every pocket has a name, description, arrival point, parent system and definition", () => {
  assert.ok(isPocket(DEFAULT_PLACE), `DEFAULT_PLACE "${DEFAULT_PLACE}" must be a pocket`);
  for (const id of PLACE_IDS) {
    const p = PLACES[id];
    assert.equal(p.id, id);
    assert.ok(["system", "pocket"].includes(p.kind), `${id}: kind`);
    assert.equal(typeof p.n, "string", `${id}: n (name)`);
    if (p.kind !== "pocket") continue;
    assert.equal(typeof p.d, "string", `${id}: d (description)`);
    assert.ok(p.parent && PLACES[p.parent]?.kind === "system", `${id}: parent system`);
    assert.ok(Array.isArray(p.enter.pos) && p.enter.pos.length === 3 && p.enter.pos.every(isNum), `${id}: enter.pos`);
    assert.equal(p.enter.kind, "warp");
    assert.equal(p.leave.kind, "warp");
  }
  assert.ok(stationAt(DEFAULT_PLACE), "the starting pocket has a station feature");
});

test("legacy nextPocket helper cycles every pocket of the current system, however many there are", () => {
  const system = PLACES[DEFAULT_PLACE].parent;
  const siblings = pocketsIn(system);
  assert.ok(siblings.length >= 2);
  let id = DEFAULT_PLACE;
  const seen = [id];
  for (let i = 1; i < siblings.length; i++) {
    id = nextPocket(id);
    seen.push(id);
  }
  assert.deepEqual(seen.sort(), [...siblings].sort());
  assert.equal(nextPocket(id), DEFAULT_PLACE);
});

test("an unknown place id falls back to the starting pocket", () => {
  assert.equal(placeAt("no-such-place"), PLACES[DEFAULT_PLACE]);
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
    assert.equal(FLIGHT[k], 0.6, `FLIGHT.${k} is tuned to 60% of forward speed`);
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
    if (m.g === "primary") {
      if (m.period) {
        // a mining beam, not a gun
        assert.ok(isNum(m.period) && m.period > 0, `${id}: the beam takes period seconds per ore`);
        assert.ok(isNum(m.range) && m.range > 0, `${id}: the beam states its reach in metres`);
        assert.ok(isNum(m.draw) && m.draw >= 0, `${id}: the beam states its power draw`);
      } else {
        assert.ok(isNum(m.dmg) && m.dmg > 0, `${id}: guns do damage a shot`);
        assert.ok(isNum(m.rate) && m.rate > 0, `${id}: guns set a fire rate`);
        assert.ok(isNum(m.bspd) && m.bspd > 0, `${id}: guns set a bullet speed`);
        assert.ok(isNum(m.draw) && m.draw >= 0, `${id}: guns state their power draw`);
      }
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

test("the hull is a module, and every hull is delivered with it", () => {
  const m = MODULES.hull_basic;
  assert.ok(m, "there is a basic hull module");
  assert.equal(m.g, "hull", "it fits the hull bay");
  assert.equal(m.hp, 10, "10 hull points");
  assert.deepEqual(STOCK_FIT.hull, ["hull_basic"], "every hull is delivered with one");
  for (const [id, s] of Object.entries(SHIPS)) {
    assert.equal(s.hull, undefined, `${id}: hit points come from the module, not the hull`);
  }
  const p = newProfile();
  for (const id of Object.keys(SHIPS)) {
    assert.deepEqual(p.loadout[id].hull, ["hull_basic"], `${id} has the basic hull fitted`);
  }
});

test("a new game starts with the basic plant, cell and thrusters", () => {
  const p = newProfile();
  assert.deepEqual(p.loadout.wasp.power, ["power_basic"], "the basic powerplant is fitted");
  assert.deepEqual(p.loadout.wasp.cell, ["cell_basic"], "the basic power cell is fitted");
  assert.deepEqual(p.loadout.wasp.thruster, ["thruster_basic"], "the basic thrusters are fitted");
  assert.deepEqual(powerOf(p.loadout.wasp), { gen: 10, cap: 100 }, "10 MJ/s and 100 MJ");
  assert.deepEqual(p.loadout.wasp.primary, ["cannon_basic", null], "one basic cannon in the first primary bay");
  assert.deepEqual(p.loadout.wasp.secondary, [null], "the secondary bay is still empty");
});

test("a ship with no thrusters warns the player when they try to move", () => {
  // The warning is player-facing wording, so guard it: sim/player.js is its only home.
  const src = readFileSync(new URL("../src/sim/player.js", import.meta.url), "utf8");
  assert.match(src, /msg\("Equip thrusters to move"/, "the warning must say exactly that");
  assert.match(
    src,
    /if \(!W && !powered && P\.noDriveT === 0 && tryingToMove\(c, stick\)\)/,
    "the warning fires when a control is pressed and there is no drive, and not on a warp"
  );
  // The flight model reads the player's control record, not keys.
  assert.match(src, /c = P\.controls/, "the flight model reads the control record");
});

test("basic cannons: 1 damage a shot, 3 a second per barrel, 2 MJ/s while firing", () => {
  const m = MODULES.cannon_basic;
  assert.ok(m, "there is a basic cannon module");
  assert.equal(m.g, "primary", "it fits a primary weapon bay");
  assert.equal(m.dmg, 1, "1 damage a shot");
  assert.equal(m.rate, 3, "3 shots a second, per barrel");
  assert.equal(m.barrels, 2, "twin-linked: two bolts per shot");
  assert.equal(m.draw, 2, "2 MJ/s while the trigger is held, however many bolts it puts out");
  assert.deepEqual(STOCK_FIT.primary, ["cannon_basic"], "every hull is delivered with one");
});

test("any primary slot with nothing in it is called 'Empty weapon slot'", () => {
  // Player-facing wording lives in sim/weapons.js and ui/hud.js; guard both.
  const weapons = readFileSync(new URL("../src/sim/weapons.js", import.meta.url), "utf8");
  assert.match(weapons, /"Empty weapon slot"/, "an empty slot says exactly that");
  assert.match(weapons, /state\.guns\.length > 0/, "the cannon slot is empty when no guns are fitted");
  const hud = readFileSync(new URL("../src/ui/hud.js", import.meta.url), "utf8");
  assert.match(hud, /"Empty weapon slot"/, "the HUD names the empty slot the same way");
  assert.doesNotMatch(hud, /"No guns"/, "the old 'No guns' wording is gone");
  // The equipped line and the toast take the module's own name now.
  assert.match(hud, /moduleListName\(/, "the HUD builds the primary line from the modules' names");
  assert.match(weapons, /moduleListName\(/, "the equip toast too");
  assert.doesNotMatch(weapons, /"Cannons equipped"/, "the hardcoded 'Cannons equipped' is gone");
});

test("the basic mining beam: one ore per 4 s of contact, 2 MJ/s, any primary bay", () => {
  const m = MODULES.beam_basic;
  assert.ok(m, "there is a basic mining beam module");
  assert.equal(m.g, "primary", "it fits a primary weapon bay");
  assert.equal(m.period, 4, "one ore per 4 seconds of continuous contact");
  assert.equal(m.range, 340, "the same reach the old beam had");
  assert.equal(m.draw, 2, "2 MJ/s while it is cutting");
  assert.equal(m.dmg, undefined, "a beam is not a gun");
  assert.deepEqual(STOCK_FIT.primary, ["cannon_basic"], "the beam is not standard issue");
});

test("the basic missiles: 8 damage, 12 capacity, 4 s reload, any secondary bay", () => {
  const m = MODULES.missile_basic;
  assert.ok(m, "there is a basic missiles module");
  assert.equal(m.g, "secondary", "it fits the secondary weapon bay");
  assert.equal(m.dmg, 8, "8 damage a missile");
  assert.equal(m.cap, 12, "a 12-missile stock");
  assert.equal(m.cd, 4, "4 seconds between launches");
  assert.equal(STOCK_FIT.secondary, undefined, "the launcher is not standard issue");
});

test("a fitted launcher is not a gun, and missilesOf finds it", () => {
  const both = { secondary: ["missile_basic"], primary: ["cannon_basic"] };
  assert.deepEqual(gunsOf(both).map(g => g.id), ["cannon_basic"], "the launcher is no gun");
  assert.deepEqual(beamsOf(both), [], "and no beam");
  const launchers = missilesOf(both);
  assert.equal(launchers.length, 1, "the launcher is picked up");
  assert.equal(launchers[0].i, 0, "from its bay");
  assert.equal(launchers[0].dmg, 8);
  assert.equal(launchers[0].cap, 12);
  assert.equal(launchers[0].cd, 4);
  assert.deepEqual(missilesOf({ secondary: [null] }), [], "no launcher fitted, empty list");
  assert.deepEqual(missilesOf({}), [], "no secondary bay at all");
  assert.deepEqual(missilesOf(undefined), [], "nothing to read");
});

test("hullOf: a fitted hull grants its points, no module fitted means none", () => {
  assert.equal(hullOf({ hull: ["hull_basic"] }), 10);
  assert.equal(hullOf({ hull: [null] }), 0, "the empty hull bay is a one-shot kill");
  assert.equal(hullOf({}), 0);
  assert.equal(hullOf(undefined), 0);
});

test("save version 10: the pre-module hull bay is filled with the stock hull", () => {
  const old = sanitizeProfile({
    v: 9, ships: ["wasp"], ship: "wasp", cr: 100,
    loadout: { wasp: { hull: [null] } },
  });
  assert.equal(old.v, SAVE_VERSION);
  assert.deepEqual(old.loadout.wasp.hull, ["hull_basic"], "a pre-10 save gets the stock hull fitted");

  const emptied = sanitizeProfile({
    v: 10, ships: ["wasp"], ship: "wasp", cr: 100,
    loadout: { wasp: { hull: [null] } },
  });
  assert.deepEqual(emptied.loadout.wasp.hull, [null], "a v10 save where the player emptied the bay stays hull-less");
});

test("a fitted beam is not a gun, and beamsOf finds it", () => {
  const both = { primary: ["beam_basic", "cannon_basic"] };
  assert.deepEqual(gunsOf(both).map(g => g.id), ["cannon_basic"], "only the gun is a gun");
  const beams = beamsOf(both);
  assert.equal(beams.length, 1, "the beam is picked up");
  assert.equal(beams[0].i, 0, "from its bay");
  assert.equal(beams[0].period, 4);
  assert.equal(beams[0].draw, 2);
  assert.deepEqual(beamsOf({ primary: [null, null] }), [], "no beam fitted, empty list");
  assert.deepEqual(beamsOf({}), [], "no primary bay at all");
  assert.deepEqual(beamsOf(undefined), [], "nothing to read");
});

test("moduleListName names the equipped modules for the HUD and the toast", () => {
  const cannon = { id: "cannon_basic", n: "Basic cannons" };
  const beam = { id: "beam_basic", n: "Basic mining beam" };
  assert.equal(moduleListName([cannon]), "Basic cannons");
  assert.equal(moduleListName([cannon, cannon]), "Basic cannons x2");
  assert.equal(moduleListName([beam, cannon]), "Basic mining beam + Basic cannons");
  assert.equal(moduleListName([]), "");
  assert.equal(moduleListName(undefined), "");
});

test("the flight HUD lists every active mission by title", () => {
  const hud = readFileSync(new URL("../src/ui/hud.js", import.meta.url), "utf8");
  assert.match(hud, /missions\.map\(mission =>/, "the top-right HUD renders every active mission");
  assert.match(hud, /class="hud-missions"/, "missions have a dedicated HUD block");
  assert.match(hud, /missionNextText\(mission\)/, "the top-right HUD shows each mission's current objective");
  assert.match(hud, /hud-mission-objective/, "the current objective has its own HUD line");
  assert.doesNotMatch(hud, /activeMissions\(S\)\[0\]/, "the HUD must not discard missions after the first");
  assert.match(hud, /hud-mission hud-mission-\$\{kind\}/, "the HUD tags each mission with its kind");
  assert.match(hud, /kind = mission\.kind === "contract" \? "contract" : "story"/, "contracts and stories are told apart");
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /#tr \.hud-mission/, "each active mission has a readable top-right style");
  assert.match(css, /#tr \.hud-mission \{[^}]*color: var\(--amber\)/, "story missions keep the amber");
  assert.match(css, /#tr \.hud-mission\.hud-mission-contract \{[^}]*color: var\(--ice\)/, "contract names are light blue");
  const screens = readFileSync(new URL("../src/ui/screens.js", import.meta.url), "utf8");
  assert.doesNotMatch(hud, /missionRequirementText/, "the HUD has no obsolete item-requirement text");
  assert.doesNotMatch(screens, /missionRequirementText/, "contract rows have no obsolete item-requirement text");
  assert.match(hud, /mission\.type === "hunt"/, "Destroy missions show their progress in flight");
  assert.match(hud, /missionProgress\(mission\)/, "the flight HUD renders Destroy progress");
  assert.match(screens, /m\.type === "hunt"/, "Destroy missions show their progress while docked");
  assert.match(screens, /missionProgress\(m\)/, "the Contracts screen renders Destroy progress");
  assert.match(screens, /canCollectMissionReward\(m\)/, "reward collection checks current inventories");
});

test("the shield and hull bars show numbers with their HP units", () => {
  const html = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
  assert.match(html, /Shield HP/, "the shield bar is labelled Shield HP");
  assert.match(html, /Hull HP/, "the hull bar is labelled Hull HP");
  const hud = readFileSync(new URL("../src/ui/hud.js", import.meta.url), "utf8");
  assert.match(hud, /sh-val/, "the shield bar has a numeric readout");
  assert.match(hud, /hull-val/, "the hull bar has a numeric readout");
  const screens = readFileSync(new URL("../src/ui/screens.js", import.meta.url), "utf8");
  assert.match(screens, /Shield HP/, "the bay stat line uses Shield HP");
  assert.match(screens, /Hull HP/, "the bay stat line uses Hull HP");
});

test("the beam loses its progress the moment contact stops", () => {
  // weapons.js imports the scene, so the rule is guarded rather than imported.
  const src = readFileSync(new URL("../src/sim/weapons.js", import.meta.url), "utf8");
  assert.match(src, /if \(!F\.beamOn && F\.beamT > 0\)/, "the reset fires the moment contact stops");
  assert.match(src, /state\.beams/, "which beam fits comes from the fitted modules");
  assert.ok(!src.includes("beamIdle"), "no lingering idle timer: the reset is immediate");
});

test("save version 8: the old mining beam purchase becomes the beam module", () => {
  const owner = sanitizeSave({
    v: 7, ships: ["wasp"], ship: "wasp", cr: 100,
    wp: { beam: true, msl: false }, pw: "beam",
  });
  assert.equal(owner.v, SAVE_VERSION);
  assert.equal(owner.world.store.beam_basic, 1, "an owner of the old beam gets one beam module in storage");
  assert.equal(owner.profile.wp, undefined, "the whole wp object is gone from the save");
  assert.equal(owner.profile.pw, "beam", "the selected slot is kept");

  const never = sanitizeSave({ v: 7, ships: ["wasp"], ship: "wasp", cr: 100, wp: { beam: false, msl: false } });
  assert.equal(never.world.store.beam_basic, undefined, "a save that never bought the beam gets nothing");

  const again = sanitizeSave(owner);
  assert.equal(again.world.store.beam_basic, 1, "importing keeps exactly one");
});

test("save version 9: the old missile launcher purchase becomes the missile module", () => {
  const owner = sanitizeSave({
    v: 8, ships: ["wasp"], ship: "wasp", cr: 100,
    wp: { beam: false, msl: true }, msl: 5,
  });
  assert.equal(owner.v, SAVE_VERSION);
  assert.equal(owner.world.store.missile_basic, 1, "an owner of the old launcher gets one missile module in storage");
  assert.equal(owner.profile.wp, undefined, "the whole wp object is gone from the save");
  assert.equal(owner.profile.msl, 5, "the missiles they carried stay");

  const never = sanitizeSave({ v: 8, ships: ["wasp"], ship: "wasp", cr: 100, wp: { msl: false } });
  assert.equal(never.world.store.missile_basic, undefined, "a save that never bought the launcher gets nothing");

  const again = sanitizeSave(owner);
  assert.equal(again.world.store.missile_basic, 1, "importing keeps exactly one");

  const rich = sanitizeProfile({ v: 8, ships: ["wasp"], ship: "wasp", cr: 100, wp: { msl: true }, msl: 99 });
  assert.equal(rich.msl, 12, "carried missiles clamp to the module's capacity");
});

test("the primary fire loop puts one bolt downrange per linked barrel", () => {
  // weapons.js imports the scene, so it cannot be imported here; guard the rule.
  const src = readFileSync(new URL("../src/sim/weapons.js", import.meta.url), "utf8");
  assert.match(src, /g\.barrels/, "the number of barrels comes from the module");
  assert.match(src, /for \(let b = 0; b < n; b\+\+\)/, "one bolt per barrel, on the gun's own cooldown");
  assert.match(src, /setDraw\("guns", gunsOn \? gunDraw : 0\)/, "the power bill does not count bolts");
});

test("a gun fires from whichever primary bay it is fitted in", () => {
  // Either bay works, and the bay only decides the barrel the shot comes from.
  const bay0 = gunsOf({ primary: ["cannon_basic", null] });
  const bay1 = gunsOf({ primary: [null, "cannon_basic"] });
  assert.equal(bay0.length, 1);
  assert.equal(bay1.length, 1);
  assert.equal(bay0[0].dmg, bay1[0].dmg, "same damage in either bay");
  assert.equal(bay0[0].rate, bay1[0].rate, "same fire rate in either bay");
  assert.equal(bay0[0].barrels, 2, "the basic cannon carries its linked pair of barrels");
  assert.equal(bay0[0].i, 0, "bay 0 is the left barrel");
  assert.equal(bay1[0].i, 1, "bay 1 is the right barrel");

  assert.deepEqual(gunsOf({ primary: [null, null] }), [], "no gun fitted, nothing fires");
  assert.deepEqual(gunsOf({}), [], "no primary bay at all");
  assert.deepEqual(gunsOf(undefined), [], "nothing to read");
});

test("every enemy def is complete, and adding one is a data entry", () => {
  // The hostile numbers live in data/enemies.js; an enemy is nothing but an entry.
  assert.ok(ENEMIES[DEFAULT_ENEMY], `DEFAULT_ENEMY "${DEFAULT_ENEMY}" must be in ENEMIES`);
  const numbers = ["hp", "col", "scale", "turn", "spdFar", "spdNear", "spdOrbit", "circleAt",
    "fireRange", "lostRange", "hearRange", "fireDelay", "dmg", "bspd"];

  for (const [id, d] of Object.entries(ENEMIES)) {
    for (const f of ["n", "pl", "ai"]) {
      assert.equal(typeof d[f], "string", `${id}: ${f} must be text`);
    }
    assert.ok(d.n.length > 0 && d.pl.length > 0, `${id}: it needs a name and a plural name`);
    for (const f of numbers) {
      assert.ok(isNum(d[f]) && d[f] > 0, `${id}: ${f} must be a positive number`);
    }
    for (const [f, parts] of [["fireGap", 2], ["spawnDist", 2]]) {
      assert.ok(
        Array.isArray(d[f]) && d[f].length === parts && d[f].every(isNum) && d[f][0] < d[f][1],
        `${id}: ${f} must be [low, high] with low < high`
      );
    }
    assert.ok(FACTIONS[d.f], `${id}: faction "${d.f}" is not in data/factions.js`);
    assert.ok(LOOT_TABLES[d.loot], `${id}: loot table "${d.loot}" is not in data/loot.js`);
  }

  // The raider keeps exactly the numbers the game has today.
  const r = ENEMIES.raider;
  assert.equal(r.n, "Newbie Raider");
  assert.equal(r.hp, 10, "10 Hull HP");
  assert.equal(r.dmg, 1, "1 damage a shot (the shields are balanced against this)");
  assert.equal(r.f, "pirates");
  assert.equal(r.ai, "chase", "close in, then circle and shoot");
});

test("every loot table is complete and names real items", () => {
  const kinds = ["drops", "pick"];
  for (const [id, t] of Object.entries(LOOT_TABLES)) {
    assert.ok(kinds.includes(t.kind), `${id}: kind must be one of ${kinds.join(" / ")}`);
    assert.ok(Array.isArray(t.entries) && t.entries.length > 0, `${id}: needs at least one entry`);

    for (const [i, e] of t.entries.entries()) {
      const where = `${id} entry ${i + 1}`;
      assert.ok(isItem(e.i), `${where}: item "${e.i}" is not in data/items.js`);
      assert.ok(isNum(e.w == null ? 1 : e.w) && (e.w == null ? 1 : e.w) > 0, `${where}: w must be a positive number`);
      if (t.kind === "drops") assert.ok((e.w == null ? 1 : e.w) <= 1, `${where}: a chance cannot be over 1`);
      if (e.c) {
        assert.ok(Array.isArray(e.c) && e.c.length === 2, `${where}: c must be [min, max]`);
        assert.ok(Number.isInteger(e.c[0]) && Number.isInteger(e.c[1]) && e.c[0] >= 1 && e.c[0] <= e.c[1],
          `${where}: c must be whole numbers with min <= max`);
      }
      if (e.j != null) assert.ok(isNum(e.j) && e.j >= 0, `${where}: j (scatter) must be 0 or more`);
    }
  }

  // Today's drops, pinned: an edit here is a balance change, not a refactor.
  const raider = LOOT_TABLES.raider.entries;
  const salv = raider.find(e => e.i === "salv"),
    core = raider.find(e => e.i === "core");
  assert.deepEqual(salv.c, [1, 2], "one or two salvage crates");
  assert.equal(salv.w, 1, "salvage always drops");
  assert.equal(core.w, 0.1, "a reactor core on one kill in ten");
  assert.equal(core.j, 0, "and it lands on the wreck");

  const ore = LOOT_TABLES.asteroid.entries;
  assert.deepEqual(ore.map(e => `${e.i}:${e.w}`), ["ferrite:62", "cobalt:30", "voidite:8"], "the ore mix");
});

test("encounters are four data-defined kinds and every reference resolves", () => {
  assert.equal(ENCOUNTER_IDS.length, Object.keys(ENCOUNTERS).length);
  const kinds = new Set();
  for (const [id, encounter] of Object.entries(ENCOUNTERS)) {
    assert.ok(typeof encounter.kind === "string" && encounter.kind.length > 0, `${id}: kind`);
    kinds.add(encounter.kind);
    assert.ok(typeof encounter.n === "string" && encounter.n.length > 0, `${id}: n`);
    assert.ok(typeof encounter.d === "string" && encounter.d.length > 0, `${id}: d`);
    assert.ok(isNum(encounter.respawnSec) && encounter.respawnSec >= 0, `${id}: respawnSec`);
    if (encounter.enemy) assert.ok(ENEMIES[encounter.enemy], `${id}: enemy ${encounter.enemy}`);
    if (encounter.faction) assert.ok(FACTIONS[encounter.faction], `${id}: faction ${encounter.faction}`);
    if (encounter.shop) assert.ok(isShop(encounter.shop), `${id}: shop ${encounter.shop}`);
    if (encounter.loot) assert.ok(LOOT_TABLES[encounter.loot], `${id}: loot ${encounter.loot}`);
    if (encounter.item) assert.ok(isItem(encounter.item), `${id}: item ${encounter.item}`);
    if (encounter.count) assert.ok(Array.isArray(encounter.count) && encounter.count[0] <= encounter.count[1], `${id}: count range`);
    if (encounter.interval) assert.ok(Array.isArray(encounter.interval) && encounter.interval[0] < encounter.interval[1], `${id}: interval`);
    assert.equal(encounterDef(id), encounter, `${id}: lookup returns the data entry`);
  }
  assert.deepEqual(
    [...kinds].sort(),
    ["derelict", "friendlyTrader", "hostilePatrol", "resourceCache"].sort(),
    "the proof content has the four planned encounter kinds"
  );
  for (const id of ["no-such-encounter"]) assert.equal(encounterDef(id), ENCOUNTERS.hostile_patrol);
});

test("place templates are tiered, complete and data-only", () => {
  assert.ok(PLACE_TEMPLATE_IDS.length >= 3, "step 12 needs at least three templates");
  const all = new Set(ENCOUNTER_IDS);
  for (const [id, template] of Object.entries(PLACE_TEMPLATES)) {
    assert.ok(template.n && template.d, `${id}: name and description`);
    assert.ok(Array.isArray(template.features), `${id}: features`);
    assert.ok(Object.keys(template.tiers || {}).length >= 3, `${id}: encounters by tier`);
    for (const tier of [1, 2, 3]) {
      const ids = encounterIdsFor(id, tier);
      assert.ok(ids.length > 0, `${id} tier ${tier}: at least one encounter`);
      for (const encounter of ids) assert.ok(all.has(encounter), `${id} tier ${tier}: unknown encounter ${encounter}`);
    }
    for (const encounter of templateEncounterIds(id)) assert.ok(all.has(encounter), `${id}: unknown encounter ${encounter}`);
    const resolved = templateFeatures(id, { id: `test-${id}`, tier: 2 });
    for (const feature of resolved.features) {
      if (feature.kind === "asteroidField") assert.ok(LOOT_TABLES[feature.ore], `${id}: asteroid ore table`);
      if (feature.kind === "station") assert.ok(isShop(feature.shop), `${id}: station shop ${feature.shop}`);
      if (feature.kind === "spawner") assert.ok(all.has(feature.encounter), `${id}: spawner encounter`);
      if (feature.kind === "encounter") assert.ok(all.has(feature.encounter), `${id}: static encounter`);
    }
    assert.ok(isPlaceTemplate(id));
  }
});

test("an unknown enemy id resolves to the default enemy instead of blowing up", () => {
  for (const id of [undefined, null, "", "no-such-enemy"]) {
    assert.equal(enemyDef(id), ENEMIES[DEFAULT_ENEMY], `${id} should fall back to ${DEFAULT_ENEMY}`);
  }
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

test("cannons arrived in save version 7: older saves are fitted with one", () => {
  const v6 = sanitizeProfile({ v: 6, ships: ["wasp"], ship: "wasp", cr: 100 });
  assert.equal(v6.v, SAVE_VERSION);
  assert.deepEqual(v6.loadout.wasp.primary, ["cannon_basic", null], "a v6 save gains basic cannons");
  assert.deepEqual(v6.loadout.wasp.shield, ["shield_basic"], "and keeps its shields");

  const emptied = sanitizeProfile({
    v: SAVE_VERSION,
    ships: ["wasp"],
    ship: "wasp",
    loadout: { wasp: { primary: [null, null] } },
  });
  assert.deepEqual(emptied.loadout.wasp.primary, [null, null], "a current save can run with no guns");
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

test("an enemy's shot uses its own def's damage and bullet speed", () => {
  // The sim must never hard-code an enemy's numbers (tests/enemies.test.mjs spawns
  // a fake enemy to prove the same thing at runtime). Since step 14 the one thing
  // that may modify them is the instance's declared difficulty scalar, read from
  // the runtime instance record — a number from data/instances.js, never a literal.
  const src = readFileSync(new URL("../src/sim/ai.js", import.meta.url), "utf8");
  const shot = src.match(/const shot = fire\(([^;]*)\);/);
  assert.ok(shot, "an enemy shoots through sim/combat.js `fire`");
  assert.match(shot[1], /def\.bspd/, "the shot's speed comes from the enemy's def");
  assert.match(shot[1], /def\.dmg/, "and its damage comes from the enemy's def");
  assert.doesNotMatch(shot[1], /def\.(bspd|dmg)\s*[-+*/]\s*[\d.]/, "never combined with a literal number");
  assert.doesNotMatch(shot[1], /(?:^|,)\s*[\d.]+\s*(?:,|$)/, "and no argument of the call is a literal");
  assert.match(
    src,
    /const dmgScale = instanceAt\(placeId\)\?\.difficulty\?\.dmg;/,
    "the only modifier is the instance's own scalar (data/instances.js)"
  );
  assert.equal(ENEMIES.raider.dmg, 1, "the raider still does 1 damage a shot");
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

test("outfitting has the ship switcher above the 3D viewer; the Hangar shows no berth count", () => {
  const screens = readFileSync(new URL("../src/ui/screens.js", import.meta.url), "utf8");
  // The Hangar tab used to read "Berths 2/3"; the switcher replaces it.
  assert.ok(!screens.includes("Berths"), "the berth count is gone from the Hangar");
  assert.match(screens, /class="ship-switch"/, "the outfitting screen has the ship switcher");
  assert.match(screens, /data-a="shipPrev"/, "the switcher has a left arrow");
  assert.match(screens, /data-a="shipNext"/, "the switcher has a right arrow");
  const menu = readFileSync(new URL("../src/ui/menu.js", import.meta.url), "utf8");
  assert.match(menu, /shipPrev\(\)/, "the left arrow is wired to an action");
  assert.match(menu, /shipNext\(\)/, "the right arrow is wired to an action");
});

test("paid repairs and missile restock live in outfitting, not the hangar or the shop", () => {
  const screens = readFileSync(new URL("../src/ui/screens.js", import.meta.url), "utf8");
  assert.match(screens, /class="outfit-service"/, "outfitting has the services box");
  // Both services target the ship in the viewer, selected ship only:
  assert.match(screens, /data-a="rp" data-b="\$\{S\.ship\}"/, "repairs act on the selected ship");
  assert.match(screens, /data-a="wr"/, "missile restock is wired in outfitting");
  // The moved rows are gone from their old homes:
  assert.ok(!screens.includes("Missile stock"), "the shop no longer lists the restock row");
  assert.equal((screens.match(/Hull repairs/g) || []).length, 1, "the Hangar no longer lists repair rows");
});
