// Selling: what the outpost pays for, in a shipped hold or in the station.
// Spare modules sell like any other item (the owner's rule, 2026-11-07); a part
// fitted in a bay is in no stock and is never sold.
//
// These run the real sim code with the screen and the sound stubbed out
// (tests/headless.mjs), because sim/economy.js reaches the 3D layer through
// sim/player.js. Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadHeadless } from "./headless.mjs";
import { ITEM_IDS, canSell, itemValue } from "../src/data/items.js";
import { SHOPS } from "../src/data/shops.js";

const sim = await loadHeadless("src/sim/economy.js", {
  state: "src/state/state.js",
  newProfile: "src/state/profile.js",
  STATION: "src/sim/inventory.js",
  countOf: "src/sim/inventory.js",
});

/** A brand-new save docked at the outpost. */
function freshGame() {
  sim.state.profile = sim.newProfile();
  sim.state.profile.cr = 0;
  // Some economy actions write the flying ship's Hull HP (see repairShip).
  sim.state.player = { hull: 10, hullMax: 10, sh: 0, shMax: 0, last: 0, docked: true };
  return sim.state.profile;
}

const P = () => sim.state.profile;

test("every item that can be sold is worth something — parts included", () => {
  for (const id of ITEM_IDS) {
    if (!canSell(id)) continue;
    assert.ok(Number.isInteger(itemValue(id)) && itemValue(id) > 0, `${id}: a sellable item must be worth whole credits`);
  }
  // Spare parts sell at 60% of the shop price, never below 1 credit.
  for (const shop of Object.values(SHOPS)) {
    for (const row of shop.stock || []) {
      const expected = Math.max(1, Math.floor(row.price * 0.6));
      assert.equal(canSell(row.id), true, `${row.id} is sold by a shop, so a spare one must be sellable`);
      assert.ok(itemValue(row.id) >= 1, `${row.id}: at least 1 credit, or it could never be sold`);
      assert.ok(itemValue(row.id) <= row.price, `${row.id}: never worth more sold than bought`);
      assert.equal(itemValue(row.id), expected, `${row.id}: 60% of ${row.price} cr`);
    }
  }
});

test("a single spare part sells from the station or a ship's hold", () => {
  const p = freshGame();
  p.store.beam_basic = 2;

  assert.equal(sim.sellInventoryItem("beam_basic", "station", 1), "Sold 1 Basic mining beam for 540 cr.");
  assert.equal(p.cr, 540, "the credits arrived");
  assert.equal(sim.countOf("station", "beam_basic"), 1, "one is left");

  // One more leaves nothing behind.
  assert.equal(sim.sellInventoryItem("beam_basic", "station", 1), "Sold 1 Basic mining beam for 540 cr.");
  assert.equal(p.cr, 1080);
  assert.equal(sim.countOf("station", "beam_basic"), 0, "the stack is gone");

  // A bigger stack, part of it: 2 of the 3.
  p.holds.wasp.cannon_basic = 3;
  assert.equal(sim.sellInventoryItem("cannon_basic", "wasp", 2), "Sold 2 Basic cannons for 2 cr.");
  assert.equal(p.cr, 1082);
  assert.equal(sim.countOf("wasp", "cannon_basic"), 1, "one cannon is left in the hold");

  // A missile pod from a hold is worth the same as one from the station.
  p.holds.wasp.missile_basic = 1;
  assert.equal(sim.sellInventoryItem("missile_basic", "wasp", 1), "Sold 1 Basic missiles for 900 cr.");
  assert.equal(p.cr, 1982);
  assert.equal(sim.countOf("wasp", "missile_basic"), 0);
});

test("a refusal changes nothing, and says why", () => {
  const p = freshGame();
  p.store.beam_basic = 1;
  assert.match(sim.sellInventoryItem("beam_basic", "station", 5), /from 1 to 1/, "more than is there");
  assert.match(sim.sellInventoryItem("beam_basic", "station", 0), /from 1 to 1/, "zero is not a sale");
  assert.match(sim.sellInventoryItem("beam_basic", "station", 1.5), /from 1 to 1/, "whole items only");
  assert.equal(p.cr, 0, "no credits for a refusal");
  assert.equal(sim.countOf("station", "beam_basic"), 1, "and nothing was taken");
  assert.equal(sim.sellInventoryItem("no-such-item", "station", 1), "That cannot be sold.");
  assert.match(sim.sellInventoryItem("ferrite", "station", 1), /from 1 to 0/, "nothing there to sell");
});

test("the refinery bonus applies to parts exactly as it does to ore", () => {
  const p = freshGame();
  p.store.missile_basic = 1;
  p.base.refinery = 1;                       // the 800 cr upgrade: +15%
  assert.equal(sim.sellInventoryItem("missile_basic", "station", 1), "Sold 1 Basic missiles for 1035 cr.");
  assert.equal(p.cr, 1035, "900 + 15%");
});

test("selling a whole hold takes the spare parts with the ore", () => {
  const p = freshGame();
  p.holds.wasp = { ferrite: 2, core: 1, missile_basic: 1 };
  assert.equal(sim.sellHold(), "Sold 4 items for 1270 cr.", "2 ferrite (20) + a reactor core (350) + a missile pod (900)");
  assert.equal(p.cr, 1270, "the hold sale paid");
  assert.deepEqual(p.holds.wasp, {}, "everything with a value went");
  assert.equal(p.msl, 0, "missiles loaded in the rack are not cargo and are not sold");
});

test("selling the station's stock takes the spare parts too", () => {
  const p = freshGame();
  p.store = { ferrite: 5, beam_basic: 1 };
  assert.equal(sim.sellStored(), "Sold 6 items for 590 cr.", "5 ferrite (50) + a beam (540)");
  assert.equal(p.cr, 590);
  assert.deepEqual(p.store, {});
});

test("nothing to sell says so, and pays nothing", () => {
  const p = freshGame();
  assert.equal(sim.sellHold(), "Nothing in the hold can be sold.");
  assert.equal(sim.sellStored(), "Nothing in the station can be sold.");
  assert.equal(p.cr, 0);
  assert.equal(sim.sellStored(), "Nothing in the station can be sold.", "and it stays quiet the second time");

  // One item reads "1 item", not "1 items".
  p.store.ferrite = 1;
  assert.equal(sim.sellStored(), "Sold 1 item for 10 cr.");
});

test("a part fitted in a bay is never sold; only stocks are", () => {
  const p = freshGame();
  p.loadout.wasp.power = ["power_basic"];
  p.store.power_basic = 1;
  assert.equal(sim.sellStored(), "Sold 1 item for 1 cr.", "the 1 cr standard part is sellable (60% would round to nothing)");
  assert.deepEqual(p.loadout.wasp.power, ["power_basic"], "the fitted powerplant is untouched");
  assert.equal(sim.sellStored(), "Nothing in the station can be sold.", "and the fitted one never becomes sellable by asking twice");
});

test("the screens and the click handler let a part be sold (source guards)", () => {
  const screens = readFileSync(new URL("../src/ui/screens.js", import.meta.url), "utf8");
  const menu = readFileSync(new URL("../src/ui/menu.js", import.meta.url), "utf8");
  const economy = readFileSync(new URL("../src/sim/economy.js", import.meta.url), "utf8");
  // The old "cargo only" rules are gone.
  assert.doesNotMatch(menu, /Modules cannot be sold/, "the tooltip that refused part sales is gone");
  assert.doesNotMatch(menu, /kind !== "c"/, "the Sell box no longer insists on cargo tiles");
  assert.doesNotMatch(economy, /Only cargo can be sold/, "the economy no longer refuses parts");
  assert.doesNotMatch(screens, /Selling only concerns ore/, "the Base tab's sell buttons no longer ignore parts");
  // The Sell box names the thing being sold, and only refuses when there is no value.
  assert.match(menu, /Sell \$\{itemName\(id\)\}/, "the Sell box names the item, part or cargo");
  assert.match(menu, /if \(!canSell\(tile\.dataset\.id\)\)/, "right-click Sell is offered whenever the item has a value");
  // Base tab: the two buttons report what they did.
  assert.match(menu, /toast\(eco\.sellHold\(\)\)/, "Sell hold reports its sale");
  assert.match(menu, /toast\(eco\.sellStored\(\)\)/, "Sell stored reports its sale");
  assert.match(economy, /p\.cr \+= earned/, "a whole-place sale adds the credits it counted");
});
