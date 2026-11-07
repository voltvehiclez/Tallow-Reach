// Inventory: the station's storage and every ship's hold, in m³. Run with `npm test`.
// Every test starts from a brand-new save, so nothing here depends on real play.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { state } from "../src/state/state.js";
import { newProfile, sanitizeProfile, SAVE_VERSION } from "../src/state/profile.js";
import { MODULES } from "../src/data/modules.js";
import { ITEMS, itemName, itemVol, isModule } from "../src/data/items.js";
import { SHIPS } from "../src/data/ships.js";
import { STORAGE_PER_LEVEL } from "../src/data/station.js";
import { refillPower } from "../src/sim/power.js";
import { refreshDrive } from "../src/sim/drive.js";
import { refreshShield } from "../src/sim/shield.js";
import { fitModule, unequip, storedFor, ownedCount } from "../src/sim/fitting.js";
import {
  STATION, holdOf, loadOf, capacityOf, freeOf, countOf, itemsAt, unitsOf,
  addItem, buyItem, moveItem, valueOf,
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
const V11_SAVE = JSON.parse(readFileSync(new URL("./saves/v11-real.json", import.meta.url), "utf8"));

test("every module has a whole, positive volume in m³", () => {
  for (const [id, m] of Object.entries(MODULES)) {
    assert.ok(Number.isInteger(m.vol) && m.vol > 0, `${id}: vol (m³) must be a positive whole number`);
  }
});

test("a new game has an empty hold per ship and an empty station", () => {
  const p = freshGame();
  assert.equal(p.v, SAVE_VERSION);
  assert.deepEqual(Object.keys(p.holds), ["wasp"]);
  assert.deepEqual(p.holds.wasp, {}, "a hold is one stock, empty to begin with");
  assert.deepEqual(p.store, {}, "so is the station's storage");
  assert.equal(p.modules, undefined, "there is no separate list of spare parts any more");
  assert.equal(loadOf(STATION), 0);
  assert.equal(loadOf("wasp"), 0);
  assert.equal(unitsOf(STATION), 0, "nothing in the station yet");
  assert.equal(capacityOf(STATION), STORAGE_PER_LEVEL, "storage bay level 1");
  assert.equal(capacityOf("wasp"), WASP_HOLD, "a hold is as big as the hull says");
});

test("a real v11 save converts to one stock per place", () => {
  const p = sanitizeProfile(V11_SAVE);
  state.profile = p;                    // the place helpers read the live save
  assert.equal(p.v, SAVE_VERSION);
  assert.equal(p.modules, undefined, "the old modules list left the save");
  assert.equal(p.v > 11, true, "the version moved on");

  // Station: the old goods and the old parts list, poured into one stock.
  assert.deepEqual(p.store, { ferrite: 12, salv: 3, beam_basic: 1, cannon_basic: 2 });
  assert.equal(countOf(STATION, "cannon_basic"), 2, "two of the same part still stack");
  // The ship: its cargo plus the spare part it was hauling.
  assert.deepEqual(p.holds.wasp, { ferrite: 5, core: 1, thruster_basic: 1 });
  assert.equal(loadOf("wasp"), 5 + 1 + MODULES.thruster_basic.vol, "m³ are the same as before the conversion");
  // Nothing else moved: credits, stats and the loadout are untouched.
  assert.equal(p.cr, 2450);
  assert.equal(p.done, 4);
  assert.equal(p.kills, 17);
  assert.deepEqual(p.loadout.wasp.primary, ["cannon_basic", null]);
  // Converting again changes nothing: a v12 save is already one stock per place.
  assert.deepEqual(sanitizeProfile(p), p);
});

test("a save from before 11 gives its single cargo to the ship being flown", () => {
  const old = {
    v: 10, cr: 100, cargo: { ferrite: 4, core: 1 }, store: { cobalt: 7 },
    ships: ["wasp", "bulwark"], ship: "bulwark", modules: ["cannon_basic", "cannon_basic"],
  };
  const p = sanitizeProfile(old);
  assert.equal(p.v, SAVE_VERSION);
  assert.equal(p.cargo, undefined, "the old single cargo is gone");
  assert.deepEqual(p.holds.bulwark, { ferrite: 4, core: 1 }, "the flown ship carries what it was carrying");
  assert.deepEqual(p.holds.wasp, {}, "the other ship starts with an empty hold");
  assert.equal(p.store.cobalt, 7, "station ore is untouched");
  assert.equal(p.store.cannon_basic, 2, "and the station's parts went into the same stock (and can repeat)");
});

test("a new-format save round-trips, and bad stocks are cleaned", () => {
  const p = freshGame();
  p.holds.wasp.ferrite = 5;
  p.holds.wasp.beam_basic = 1;
  assert.deepEqual(sanitizeProfile(JSON.parse(JSON.stringify(p))), p);

  const odd = sanitizeProfile({
    v: 12, ships: ["wasp"], ship: "wasp",
    holds: { wasp: { ferrite: -3, nope: 9, beam_basic: 1, junk: 2, core: 1.7 }, ghost: { ferrite: 9 } },
    store: { salv: "4", voidite: null, cannon_basic: 0 },
  });
  assert.deepEqual(odd.holds.wasp, { beam_basic: 1, core: 1 }, "no negative counts, no unknown ids, whole numbers only");
  assert.equal(odd.holds.ghost, undefined, "a hold with no ship is dropped");
  assert.deepEqual(odd.store, { salv: 4 }, "a zero count is not kept, and a string becomes a number");

  const notThere = sanitizeProfile({ v: 12, ships: ["wasp", "bulwark"], ship: "wasp" });
  assert.deepEqual(Object.keys(notThere.holds).sort(), ["bulwark", "wasp"], "every owned ship has a hold");
  assert.deepEqual(notThere.holds.bulwark, {}, "and it starts empty");
});

test("room is counted in m³ from the catalogue: goods at their volume, modules at theirs", () => {
  const p = freshGame();
  p.holds.wasp.ferrite = 5;
  p.holds.wasp.cannon_basic = 1;
  p.holds.wasp.thruster_basic = 1;
  const expected = 5 * itemVol("ferrite") + MODULES.cannon_basic.vol + MODULES.thruster_basic.vol;
  assert.equal(loadOf("wasp"), expected);
  assert.equal(freeOf("wasp"), WASP_HOLD - expected);

  p.store.cobalt = 10;
  p.store.power_basic = 1;
  assert.equal(loadOf(STATION), 10 + MODULES.power_basic.vol);
});

test("you can buy the same module more than once; each lands in the station", () => {
  const p = freshGame();
  p.cr = 10000;
  assert.equal(buyItem("beam_basic", 900), null);
  assert.equal(buyItem("beam_basic", 900), null);
  assert.equal(buyItem("beam_basic", 900), null);
  assert.equal(countOf(STATION, "beam_basic"), 3, "three beams in the station");
  assert.equal(p.cr, 10000 - 3 * 900, "each one was paid for");
  assert.equal(ownedCount("beam_basic"), 3);

  assert.equal(buyItem("missile_basic", 1500), null);
  assert.equal(buyItem("missile_basic", 1500), null);
  assert.equal(countOf(STATION, "missile_basic"), 2);
  assert.match(buyItem("beam_basic", 999999), /credits/i, "too poor is refused");
  assert.equal(countOf(STATION, "beam_basic"), 3);
  assert.match(buyItem("no-such-item", 10), /unknown/i, "and so is an item that does not exist");
});

test("a purchase with no room in the station is refused and costs nothing", () => {
  const p = freshGame();
  p.cr = 5000;
  p.store.ferrite = STORAGE_PER_LEVEL;       // the store is brim full
  assert.match(buyItem("beam_basic", 900), /no room/i);
  assert.equal(p.cr, 5000, "nothing was charged");
  assert.equal(countOf(STATION, "beam_basic"), 0, "nothing was stored");
  assert.equal(addItem(STATION, "beam_basic", 1), 0, "and nothing can be forced in");
});

test("moving goods and modules between the station and a ship respects the hold's size", () => {
  const p = freshGame();
  p.store.cannon_basic = 11;                      // 11 x 2 m³ = 22, a Wasp holds 20
  const text = moveItem(STATION, "wasp", "cannon_basic", Infinity);
  assert.match(text, /Moved 10/);
  assert.equal(countOf("wasp", "cannon_basic"), 10);
  assert.equal(countOf(STATION, "cannon_basic"), 1);
  assert.equal(freeOf("wasp"), 0);
  assert.match(moveItem(STATION, "wasp", "cannon_basic", 1), /no room/i, "a full hold takes nothing more");

  // And back again, one at a time.
  assert.match(moveItem("wasp", STATION, "cannon_basic", 1), /Moved 1/);
  assert.equal(countOf("wasp", "cannon_basic"), 9);
  assert.equal(countOf(STATION, "cannon_basic"), 2);
  assert.match(moveItem("wasp", STATION, "beam_basic", 1), /no/i, "cannot move what is not there");
});

test("ore and modules share one hold", () => {
  const p = freshGame();
  p.store.ferrite = 30;
  p.store.cannon_basic = 1;
  moveItem(STATION, "wasp", "cannon_basic", 1);      // 2 m³ of the 20
  const text = moveItem(STATION, "wasp", "ferrite", Infinity);  // as much ore as fits
  assert.match(text, /Moved 18/);
  assert.equal(countOf("wasp", "ferrite"), 18);
  assert.equal(p.store.ferrite, 12);
  assert.equal(freeOf("wasp"), 0);
});

test("every ship has its own hold, made when first needed", () => {
  const p = freshGame();
  assert.equal(p.holds.bulwark, undefined);
  assert.deepEqual(holdOf("bulwark"), {}, "a ship bought later gets an empty hold on first use");
  assert.ok(p.holds.bulwark, "and it is kept");

  p.store.ferrite = 5;
  moveItem(STATION, "bulwark", "ferrite", 3);
  assert.equal(countOf("bulwark", "ferrite"), 3);
  assert.equal(countOf("wasp", "ferrite"), 0, "the Wasp's hold is separate");
  assert.equal(p.store.ferrite, 2);
  assert.equal(capacityOf("bulwark"), SHIPS.bulwark.cargo, "each hold is as big as its own hull");
  assert.match(moveItem("wasp", STATION, "cobalt", Infinity), /No Cobalt/i, "moving what is not there says so");
});

test("Outfitting fits every module kept in the station, as many as there are", () => {
  const p = freshGame();
  p.store.cannon_basic = 2;
  p.store.beam_basic = 1;
  assert.deepEqual(storedFor("primary"), ["cannon_basic", "cannon_basic", "beam_basic"]);

  // The stock Wasp has one cannon in bay 0; fit a second cannon in bay 1 and the beam over it.
  fitModule("primary", 1, "cannon_basic");
  assert.equal(countOf(STATION, "cannon_basic"), 1);
  fitModule("primary", 1, "beam_basic");               // swaps: the cannon returns to the station
  assert.equal(countOf(STATION, "cannon_basic"), 2);
  assert.deepEqual(p.loadout.wasp.primary, ["cannon_basic", "beam_basic"]);
  assert.equal(countOf(STATION, "beam_basic"), 0);
});

test("a part cannot come off a ship if the station has no room for it", () => {
  const p = freshGame();
  p.store.ferrite = STORAGE_PER_LEVEL;                 // full
  const text = unequip("power", 0);
  assert.match(text, /no room/i);
  assert.deepEqual(p.loadout.wasp.power, ["power_basic"], "the part stays fitted");
  assert.equal(countOf(STATION, "power_basic"), 0);

  // Room for exactly one powerplant: now it works.
  p.store.ferrite = STORAGE_PER_LEVEL - MODULES.power_basic.vol;
  assert.match(unequip("power", 0), /storage/i);
  assert.equal(countOf(STATION, "power_basic"), 1);
});

test("the Inventory tab lists one stock: goods in catalogue order, then parts as they arrived", () => {
  const p = freshGame();
  p.store.beam_basic = 1;
  p.store.cobalt = 3;
  p.store.ferrite = 2;
  p.store.cannon_basic = 2;
  assert.deepEqual(itemsAt(STATION), [
    { id: "ferrite", n: 2 },
    { id: "cobalt", n: 3 },
    { id: "beam_basic", n: 1 },
    { id: "cannon_basic", n: 2 },
  ], "ore first (always the same order), then modules in the order they were stored");
  assert.equal(unitsOf(STATION), 5, "five units of goods; the parts are not goods");
});

test("a new item is a data edit: the catalogue decides its name, size, value and stack", () => {
  const p = freshGame();
  // The sort of line an author adds to data/items.js. Nothing else in the code
  // knows what a gizmo is; it is carried, listed, moved and sold all the same.
  ITEMS.gizmo = { n: "Gizmo", cat: "trade", v: 25, vol: 3, st: 2 };
  try {
    assert.equal(addItem(STATION, "gizmo", 5), 2, "the stack rule stops it at two");
    assert.equal(loadOf(STATION), 6, "each gizmo takes its own 3 m³");
    assert.equal(itemName("gizmo"), "Gizmo");
    assert.equal(itemVol("gizmo"), 3);
    assert.equal(valueOf({ gizmo: 2 }), 50, "and it sells for its own value");
    assert.deepEqual(itemsAt(STATION), [{ id: "gizmo", n: 2 }], "it is listed with no code change");
    assert.equal(isModule("gizmo"), false);
    assert.match(moveItem(STATION, "wasp", "gizmo", Infinity), /Moved 2 Gizmo/);
    assert.equal(freeOf("wasp"), WASP_HOLD - 6, "and it fills the hold by its own volume");
  } finally {
    delete ITEMS.gizmo;
  }
  assert.equal(p.store.gizmo, undefined, "the test left nothing behind in the game");
});

test("the Inventory tab, the shop and the picker are wired up (source guards)", () => {
  const screens = readFileSync(new URL("../src/ui/screens.js", import.meta.url), "utf8");
  const menu = readFileSync(new URL("../src/ui/menu.js", import.meta.url), "utf8");
  const economy = readFileSync(new URL("../src/sim/economy.js", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(screens, /\["i",\s*"Inventory"\]/, "there is an Inventory tab");
  assert.match(screens, /i:\s*inventoryHtml/, "and a screen for it");
  assert.match(screens, /class="inv-grid"/, "inventory contents render as a grid of item tiles");
  assert.match(screens, /class="inv-item"/, "each item is shown as an individual tile");
  assert.match(screens, /while \(rows\.length < 25\)/, "empty slots keep each inventory grid at a 25-slot minimum");
  assert.match(styles, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/, "each inventory row has five slots");
  assert.match(styles, /height: calc\(3 \* var\(--inv-row-height\) \+ 2 \* var\(--inv-row-gap\)\)/, "each hold grid keeps a three-row viewport");
  assert.match(styles, /overflow-y: auto/, "each hold grid scrolls independently");
  assert.match(screens, /Shift-click to move its whole stack/, "the Inventory explains stack movement");
  assert.match(menu, /name === "mv" && e\.shiftKey/, "Shift-click moves the full stack");
  assert.doesNotMatch(menu, /inv\.moveCargo|inv\.moveModule/, "one move handles goods and parts");
  assert.match(menu, /addEventListener\("contextmenu", onInventoryContextMenu\)/, "inventory tiles open a right-click menu");
  assert.match(menu, /dataset\.a = "invSellOpen"/, "the item context menu opens the in-game Sell box");
  assert.match(menu, /className = "inv-sell-popover"/, "Sell uses a styled in-game popover");
  assert.match(menu, /value="\$\{stack \|\| available\}"/, "the amount field defaults to the whole stack");
  assert.doesNotMatch(menu, /window\.prompt/, "selling does not use a browser prompt");
  assert.match(economy, /sellInventoryItem/, "inventory selling uses an economy action");
  assert.match(economy, /takeItem\(where, id, count\)/, "only the requested amount is removed");
  assert.doesNotMatch(screens, /ownsModule/, "the shop no longer hides Buy once you own one");
  assert.match(screens, /&times;\$\{n\}/, "the picker shows how many of a part there are");
  for (const action of ["mv", "invPrev", "invNext"]) {
    assert.match(menu, new RegExp(`\\b${action}\\(`), `menu.js has the ${action} action`);
    assert.match(screens, new RegExp(`data-a="${action}`), `a button in screens.js uses ${action}`);
  }
  assert.match(economy, /buyItem\(w\.module, w\.price\)/, "the shop buys through the inventory (no Owned limit)");
  assert.doesNotMatch(economy, /Store your cargo first/, "ships keep their own cargo, so switching is never refused");

  // The fixed list of cargo types is gone for good: no file may read the old
  // single `profile.cargo` or `profile.modules`, and no file may import a list of
  // item keys, an empty-cargo builder or a fixed unit volume. The catalogue is
  // the only place that knows what items exist.
  const walk = dir =>
    readdirSync(dir).flatMap(f => {
      const path = `${dir}/${f}`;
      return statSync(path).isDirectory() ? walk(path) : path.endsWith(".js") ? [path] : [];
    });
  const root = new URL("../src", import.meta.url).pathname;
  for (const file of walk(root)) {
    const name = file.slice(root.length);
    const text = readFileSync(file, "utf8");
    if (name !== "state/profile.js") {          // the save migration reads the old field names
      assert.doesNotMatch(text, /\b(S|p|profile|state\.profile)\.cargo\b/, `${name} reads the old single cargo`);
      assert.doesNotMatch(text, /\b(S|p|profile|state\.profile)\.modules\b/, `${name} reads the old modules list`);
    }
    assert.doesNotMatch(text, /\bemptyCargo\b|\bITEM_VOL\b|\bKEYS\b/, `${name} still uses a fixed list of cargo types`);
  }
});
