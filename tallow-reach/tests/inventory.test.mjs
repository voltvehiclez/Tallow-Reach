// Inventory: the station's storage and every ship's hold, in m³. Run with `npm test`.
// Every test starts from a brand-new save, so nothing here depends on real play.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { state } from "../src/state/state.js";
import { newProfile, sanitizeProfile, SAVE_VERSION } from "../src/state/profile.js";
import { MODULES } from "../src/data/modules.js";
import { ITEM_VOL, KEYS } from "../src/data/items.js";
import { SHIPS } from "../src/data/ships.js";
import { STORAGE_PER_LEVEL } from "../src/data/station.js";
import { refillPower } from "../src/sim/power.js";
import { refreshDrive } from "../src/sim/drive.js";
import { refreshShield } from "../src/sim/shield.js";
import { fitModule, unequip, storedFor, ownedCount } from "../src/sim/fitting.js";
import {
  STATION, holdOf, cargoOf, loadOf, capacityOf, freeOf, countModule, moduleStacks,
  addModule, buyModule, moveCargo, moveModule,
} from "../src/sim/inventory.js";

/** A new game, as if it had just booted docked at the outpost. */
function freshGame() {
  state.profile = newProfile();
  refillPower();
  refreshDrive();
  state.player = { sh: 0, shMax: 0, last: 0, docked: true };
  refreshShield();
  return state.profile;
}

const WASP_HOLD = SHIPS.wasp.cargo;

test("every module has a whole, positive volume in m³", () => {
  for (const [id, m] of Object.entries(MODULES)) {
    assert.ok(Number.isInteger(m.vol) && m.vol > 0, `${id}: vol (m³) must be a positive whole number`);
  }
});

test("a new game has an empty hold per ship and an empty station", () => {
  const p = freshGame();
  assert.equal(p.v, SAVE_VERSION);
  assert.deepEqual(Object.keys(p.holds), ["wasp"]);
  assert.deepEqual(p.holds.wasp.modules, []);
  KEYS.forEach(k => assert.equal(p.holds.wasp.cargo[k], 0));
  assert.equal(loadOf(STATION), 0);
  assert.equal(loadOf("wasp"), 0);
  assert.equal(capacityOf(STATION), STORAGE_PER_LEVEL, "storage bay level 1");
  assert.equal(capacityOf("wasp"), WASP_HOLD, "a hold is as big as the hull says");
});

test("a save from before 11 gives its single cargo to the ship being flown", () => {
  const old = {
    v: 10, cr: 100, cargo: { ferrite: 4, core: 1 }, store: { cobalt: 7 },
    ships: ["wasp", "bulwark"], ship: "bulwark", modules: ["cannon_basic", "cannon_basic"],
  };
  const p = sanitizeProfile(old);
  assert.equal(p.v, SAVE_VERSION);
  assert.equal(p.cargo, undefined, "the old single cargo is gone");
  assert.equal(p.holds.bulwark.cargo.ferrite, 4, "the flown ship carries what it was carrying");
  assert.equal(p.holds.bulwark.cargo.core, 1);
  assert.equal(p.holds.wasp.cargo.ferrite, 0, "the other ship starts with an empty hold");
  assert.deepEqual(p.holds.wasp.modules, []);
  assert.equal(p.store.cobalt, 7, "station ore is untouched");
  assert.deepEqual(p.modules, ["cannon_basic", "cannon_basic"], "station modules are untouched (and can repeat)");
});

test("a new-format save round-trips, and bad holds are cleaned", () => {
  const p = freshGame();
  p.holds.wasp.cargo.ferrite = 5;
  p.holds.wasp.modules = ["beam_basic"];
  assert.deepEqual(sanitizeProfile(JSON.parse(JSON.stringify(p))), p);

  const odd = sanitizeProfile({
    v: 11, ships: ["wasp"], ship: "wasp",
    holds: { wasp: { cargo: { ferrite: -3, nope: 9 }, modules: ["beam_basic", "junk", 7] }, ghost: { cargo: { ferrite: 9 } } },
  });
  assert.equal(odd.holds.wasp.cargo.ferrite, 0, "no negative ore");
  assert.deepEqual(odd.holds.wasp.modules, ["beam_basic"], "only real module ids survive");
  assert.equal(odd.holds.ghost, undefined, "a hold with no ship is dropped");

  const notThere = sanitizeProfile({ v: 11, ships: ["wasp", "bulwark"], ship: "wasp" });
  assert.deepEqual(Object.keys(notThere.holds).sort(), ["bulwark", "wasp"], "every owned ship has a hold");
});

test("room is counted in m³: ore at 1 each, modules at their own volume, in one place", () => {
  const p = freshGame();
  p.holds.wasp.cargo.ferrite = 5;
  p.holds.wasp.modules = ["cannon_basic", "thruster_basic"];
  const expected = 5 * ITEM_VOL + MODULES.cannon_basic.vol + MODULES.thruster_basic.vol;
  assert.equal(loadOf("wasp"), expected);
  assert.equal(freeOf("wasp"), WASP_HOLD - expected);

  p.store.cobalt = 10;
  p.modules = ["power_basic"];
  assert.equal(loadOf(STATION), 10 + MODULES.power_basic.vol);
});

test("you can buy the same module more than once; each lands in the station", () => {
  const p = freshGame();
  p.cr = 10000;
  assert.equal(buyModule("beam_basic", 900), null);
  assert.equal(buyModule("beam_basic", 900), null);
  assert.equal(buyModule("beam_basic", 900), null);
  assert.equal(countModule(STATION, "beam_basic"), 3, "three beams in the station");
  assert.equal(p.cr, 10000 - 3 * 900, "each one was paid for");
  assert.equal(ownedCount("beam_basic"), 3);

  assert.equal(buyModule("missile_basic", 1500), null);
  assert.equal(buyModule("missile_basic", 1500), null);
  assert.equal(countModule(STATION, "missile_basic"), 2);
  assert.match(buyModule("beam_basic", 999999), /credits/i, "too poor is refused");
  assert.equal(countModule(STATION, "beam_basic"), 3);
});

test("a purchase with no room in the station is refused and costs nothing", () => {
  const p = freshGame();
  p.cr = 5000;
  p.store.ferrite = STORAGE_PER_LEVEL;       // the store is brim full
  assert.match(buyModule("beam_basic", 900), /no room/i);
  assert.equal(p.cr, 5000, "nothing was charged");
  assert.deepEqual(p.modules, [], "nothing was stored");
  assert.equal(addModule(STATION, "beam_basic"), false);
});

test("moving modules between the station and a ship respects the hold's size", () => {
  const p = freshGame();
  p.modules = Array(11).fill("cannon_basic");      // 11 x 2 m³ = 22, a Wasp holds 20
  const text = moveModule(STATION, "wasp", "cannon_basic", Infinity);
  assert.match(text, /Moved 10/);
  assert.equal(countModule("wasp", "cannon_basic"), 10);
  assert.equal(countModule(STATION, "cannon_basic"), 1);
  assert.equal(freeOf("wasp"), 0);
  assert.match(moveModule(STATION, "wasp", "cannon_basic", 1), /no room/i, "a full hold takes nothing more");

  // And back again, one at a time.
  assert.match(moveModule("wasp", STATION, "cannon_basic", 1), /Moved 1/);
  assert.equal(countModule("wasp", "cannon_basic"), 9);
  assert.equal(countModule(STATION, "cannon_basic"), 2);
  assert.match(moveModule("wasp", STATION, "beam_basic", 1), /no/i, "cannot move what is not there");
});

test("ore and modules share one hold", () => {
  const p = freshGame();
  p.store.ferrite = 30;
  p.modules = ["cannon_basic"];
  moveModule(STATION, "wasp", "cannon_basic", 1);      // 2 m³ of the 20
  const text = moveCargo(STATION, "wasp", "ferrite");  // as much ore as fits
  assert.match(text, /Moved 18/);
  assert.equal(cargoOf("wasp").ferrite, 18);
  assert.equal(p.store.ferrite, 12);
  assert.equal(freeOf("wasp"), 0);
});

test("every ship has its own hold, made when first needed", () => {
  const p = freshGame();
  assert.equal(p.holds.bulwark, undefined);
  assert.deepEqual(holdOf("bulwark").modules, [], "a ship bought later gets an empty hold on first use");
  assert.ok(p.holds.bulwark, "and it is kept");

  p.store.ferrite = 5;
  moveCargo(STATION, "bulwark", "ferrite", 3);
  assert.equal(cargoOf("bulwark").ferrite, 3);
  assert.equal(cargoOf("wasp").ferrite, 0, "the Wasp's hold is separate");
  assert.equal(p.store.ferrite, 2);
  assert.equal(capacityOf("bulwark"), SHIPS.bulwark.cargo, "each hold is as big as its own hull");
  assert.match(moveCargo("wasp", STATION, "cobalt"), /No Cobalt/i, "moving what is not there says so");
});

test("Outfitting fits every module kept in the station, as many as there are", () => {
  const p = freshGame();
  p.modules = ["cannon_basic", "cannon_basic", "beam_basic"];
  assert.deepEqual(storedFor("primary"), ["cannon_basic", "cannon_basic", "beam_basic"]);
  assert.deepEqual(moduleStacks(STATION), [{ id: "cannon_basic", n: 2 }, { id: "beam_basic", n: 1 }]);

  // The stock Wasp has one cannon in bay 0; fit a second cannon in bay 1 and the beam over it.
  fitModule("primary", 1, "cannon_basic");
  assert.equal(countModule(STATION, "cannon_basic"), 1);
  fitModule("primary", 1, "beam_basic");               // swaps: the cannon returns to the station
  assert.equal(countModule(STATION, "cannon_basic"), 2);
  assert.deepEqual(p.loadout.wasp.primary, ["cannon_basic", "beam_basic"]);
  assert.equal(countModule(STATION, "beam_basic"), 0);
});

test("a part cannot come off a ship if the station has no room for it", () => {
  const p = freshGame();
  p.store.ferrite = STORAGE_PER_LEVEL;                 // full
  const text = unequip("power", 0);
  assert.match(text, /no room/i);
  assert.deepEqual(p.loadout.wasp.power, ["power_basic"], "the part stays fitted");
  assert.deepEqual(p.modules, []);

  // Room for exactly one powerplant: now it works.
  p.store.ferrite = STORAGE_PER_LEVEL - MODULES.power_basic.vol;
  assert.match(unequip("power", 0), /storage/i);
  assert.deepEqual(p.modules, ["power_basic"]);
});

test("the Inventory tab, the shop and the picker are wired up (source guards)", () => {
  const screens = readFileSync(new URL("../src/ui/screens.js", import.meta.url), "utf8");
  const menu = readFileSync(new URL("../src/ui/menu.js", import.meta.url), "utf8");
  assert.match(screens, /\["i",\s*"Inventory"\]/, "there is an Inventory tab");
  assert.match(screens, /i:\s*inventoryHtml/, "and a screen for it");
  assert.doesNotMatch(screens, /ownsModule/, "the shop no longer hides Buy once you own one");
  assert.match(screens, /&times;\$\{n\}/, "the picker shows how many of a part there are");
  for (const action of ["mv", "invPrev", "invNext"]) {
    assert.match(menu, new RegExp(`\\b${action}\\(`), `menu.js has the ${action} action`);
    assert.match(screens, new RegExp(`data-a="${action}`), `a button in screens.js uses ${action}`);
  }

  // Nothing may read the old single `profile.cargo` any more: it is the flown ship's
  // hold now, reached through cargoOf() in sim/inventory.js.
  const walk = dir =>
    readdirSync(dir).flatMap(f => {
      const path = `${dir}/${f}`;
      return statSync(path).isDirectory() ? walk(path) : path.endsWith(".js") ? [path] : [];
    });
  const root = new URL("../src", import.meta.url).pathname;
  for (const file of walk(root)) {
    if (file.endsWith("state/profile.js")) continue;      // the save migration reads the old field by name
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /\b(S|p|profile|state\.profile)\.cargo\b|S\(\)\.cargo/, `${file} reads the old profile.cargo`);
  }
  const economy = readFileSync(new URL("../src/sim/economy.js", import.meta.url), "utf8");
  assert.match(economy, /buyModule\(w\.module, w\.price\)/, "the shop buys through the inventory (no Owned limit)");
  assert.doesNotMatch(economy, /Store your cargo first/, "ships keep their own cargo, so switching is never refused");
});
