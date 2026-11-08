// Shops: what a shop sells is data (src/data/shops.js), and one purchase in
// src/sim/economy.js serves every counter. These tests run the real sim code
// with the screen and the sound stubbed out (tests/headless.mjs), so they prove
// that adding a shop or a row is a data edit.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadHeadless } from "./headless.mjs";
import { ITEMS, itemVol } from "../src/data/items.js";
import { MODULES } from "../src/data/modules.js";
import { MISSILE } from "../src/data/weapons.js";
import { SHOPS, OUTPOST_SHOP, isShop, shopRow } from "../src/data/shops.js";

// The data tables are re-exported *from the bundle*, so a test that adds a
// temporary shop edits the same object the sim code reads.
const sim = await loadHeadless("src/sim/economy.js", {
  state: "src/state/state.js",
  applySave: "src/state/state.js",
  newSave: "src/state/profile.js",
  SHOPS: "src/data/shops.js",
  SHOP_IDS: "src/data/shops.js",
});

/** A brand-new save with plenty of credits. */
function freshGame(cr = 10000) {
  sim.applySave(sim.newSave());
  sim.state.profile.cr = cr;
  sim.state.shops = {};          // session state: starts empty, like a fresh page load
  return sim.state.profile;
}

const W = () => sim.state.worldState;

const M = OUTPOST_SHOP;

/**
 * Run `fn` with a temporary shop, and always take it out again, so a failing
 * assertion cannot leave a fake shop behind for the next test. It goes into the
 * bundle's own SHOPS (`sim.SHOPS`), because that is the object the sim code reads.
 */
function withShop(id, def, fn) {
  sim.SHOPS[id] = def;
  sim.SHOP_IDS.push(id);
  try {
    return fn();
  } finally {
    delete sim.SHOPS[id];
    const i = sim.SHOP_IDS.indexOf(id);
    if (i >= 0) sim.SHOP_IDS.splice(i, 1);
    if (sim.state.shops) delete sim.state.shops[`${id}:beam_basic`];
  }
}

test("every shop row is complete, and names a real item", () => {
  assert.ok(isShop(OUTPOST_SHOP), "the outpost's shop must exist in SHOPS");
  for (const [id, shop] of Object.entries(SHOPS)) {
    assert.equal(typeof shop.n, "string", `${id}: n (the heading)`);
    assert.equal(typeof shop.d, "string", `${id}: d (the line under it)`);
    assert.ok(Array.isArray(shop.stock) && shop.stock.length > 0, `${id}: stock must list rows`);
    for (const row of shop.stock) {
      const where = `${id} / ${row.id}`;
      assert.ok(ITEMS[row.id], `${where}: the item must be in data/items.js`);
      assert.ok(Number.isInteger(row.price) && row.price > 0, `${where}: price must be a whole number above 0`);
      assert.equal(typeof row.n, "string", `${where}: n (the row's name)`);
      assert.equal(typeof row.d, "string", `${where}: d (the sales pitch)`);
      assert.ok(row.max == null || (Number.isInteger(row.max) && row.max > 0), `${where}: max must be a whole number above 0 when given`);
      assert.ok(row.own == null || typeof row.own === "boolean", `${where}: own must be true or false when given`);
    }
    // A row is the only way something reaches the screen: a hidden "already
    // owned" list (the old `kit`) would list a part twice.
    assert.equal(shop.kit, undefined, `${id}: no kit list — every part shown is a stock row`);
    // One row per item: two rows for the same item would make the Buy buttons ambiguous.
    const ids = shop.stock.map(r => r.id);
    assert.equal(new Set(ids).size, ids.length, `${id}: one row per item`);
  }
});

test("Meridian sells exactly what it always has, at the prices the owner set", () => {
  const rows = SHOPS[M].stock;
  const price = id => (shopRow(M, id) || {}).price;
  // The two real purchases, unchanged since they were shop weapons.
  assert.equal(price("beam_basic"), 900, "the mining beam is 900 cr");
  assert.equal(price("missile_basic"), 1500, "the missile pod is 1500 cr");
  assert.equal(SHOPS[M].n, "Weapons shop", "the heading is the one the player knows");
  // The six standard parts, one credit each (the owner's decision, 2026-11-07).
  for (const id of ["power_basic", "cell_basic", "thruster_basic", "shield_basic", "cannon_basic", "hull_basic"]) {
    assert.equal(price(id), 1, `${id} costs 1 cr`);
    assert.equal(shopRow(M, id).own, false, `${id}: no "You own N" (it counts every hull's stock fit)`);
  }
  // Nothing else is sold yet: no ore, no spare anything.
  assert.equal(rows.length, 8, "eight rows in the shop");
  for (const row of rows) assert.ok(ITEMS[row.id].cat === "module", `${row.id}: only parts are sold today`);
  // Every part is listed once. The old standard-issue "Autocannons" line is gone:
  // there is only one cannon module (basic cannons), and it is a stock row now.
  assert.equal(rows.filter(r => r.id === "cannon_basic").length, 1, "the cannons are listed once");
  for (const id of new Set(rows.map(r => r.id))) {
    assert.equal(rows.filter(r => r.id === id).length, 1, `${id} is listed once`);
  }
});

test("buying the beam and the missiles behaves exactly as before", () => {
  const p = freshGame(20000);
  assert.equal(
    sim.buyItem(M, "beam_basic"),
    "Basic mining beam in the station inventory. Fit it in a primary bay to use it.",
    "the message the player knows"
  );
  assert.equal(p.cr, 19100, "900 cr was charged");
  assert.equal(W().store.beam_basic, 1, "and the beam is in the station");

  assert.equal(
    sim.buyItem(M, "missile_basic"),
    "Basic missiles in the station inventory. Fit it in a secondary bay to use it. 8 missiles included.",
    "buying the pod still includes 8 missiles"
  );
  assert.equal(p.cr, 17600, "1500 cr was charged");
  assert.equal(p.msl, 8, "8 missiles loaded");

  // A second pod is bought normally, but never takes missiles away.
  assert.equal(sim.buyItem(M, "missile_basic"), "Basic missiles in the station inventory. Fit it in a secondary bay to use it.");
  assert.equal(p.msl, 8, "a full missile rack is left alone");
  p.msl = 3;
  assert.ok(sim.buyItem(M, "missile_basic"));
  assert.equal(p.msl, 8, "a part-used rack is topped up to the 8 that come with a pod");
});

test("a purchase that cannot happen changes nothing and says nothing", () => {
  const p = freshGame(10);
  assert.equal(sim.buyItem(M, "beam_basic"), undefined, "too poor");
  assert.equal(p.cr, 10);
  assert.deepEqual(W().store, {});

  assert.equal(sim.buyItem("no-such-shop", "beam_basic"), undefined, "unknown shop");
  assert.equal(sim.buyItem(M, "ferrite"), undefined, "an item this shop does not sell");
  assert.equal(sim.buyItem(M, "no-such-item"), undefined, "an item that does not exist");
  assert.deepEqual(W().store, {}, "none of it stored anything");

  p.cr = 10000;
  W().store.ferrite = 250;                      // the station's storage is brim full (250 m³ at level 1)
  assert.match(sim.buyItem(M, "beam_basic"), /no room/i, "a full station is refused, as before");
  assert.equal(p.cr, 10000, "and nothing was charged");
  assert.equal(W().store.beam_basic, undefined);
});

test("the six standard parts can be bought back for a credit, and quantity works", () => {
  const p = freshGame();
  for (const id of ["power_basic", "cell_basic", "thruster_basic", "shield_basic", "cannon_basic", "hull_basic"]) {
    assert.equal(sim.buyItem(M, id), `${MODULES[id].n} in the station inventory. Fit it in a ${MODULES[id].g} bay to use it.`);
    assert.equal(W().store[id], 1, `${id} is in the station`);
  }
  assert.equal(p.cr, 10000 - 6, "one credit each");
  p.cr = 100;
  assert.equal(sim.buyItem(M, "power_basic", 3), "3 Basic powerplant in the station inventory.");
  assert.equal(W().store.power_basic, 4);
  assert.equal(p.cr, 97, "three credits for three");
});

test("shopList() gives the screen everything it needs", () => {
  freshGame();
  W().store.beam_basic = 2;
  const rows = sim.shopList(M);
  assert.equal(rows.length, SHOPS[M].stock.length, "one row per stock row, in data order");
  const beam = rows.find(r => r.id === "beam_basic");
  assert.equal(beam.n, "Basic mining beam");
  assert.equal(beam.price, 900);
  assert.equal(beam.vol, MODULES.beam_basic.vol, "the m³ comes from the module");
  assert.equal(beam.owned, 2, "how many the player has");
  assert.equal(beam.left, null, "Meridian never runs out");
  assert.equal(beam.room, true);
  // An unknown shop id falls back to the default shop, so a screen never blanks.
  assert.equal(sim.shopList("no-such-shop").length, rows.length);
});

test("a limited row runs out, and setShopStock is the restock hook", () => {
  withShop("trader", {
    n: "Scrap trader",
    d: "A one-off stall.",
    stock: [
      { id: "beam_basic", price: 100, n: "Spare beam", d: "Two only.", max: 2 },
      { id: "ferrite", price: 5, n: "Ferrite", d: "Loose ore." },
    ],
  }, () => {
    const p = freshGame(1000);

    assert.equal(sim.shopStock("trader", "beam_basic"), 2, "a limited row starts at its max");
    assert.equal(sim.shopStock("trader", "ferrite"), null, "a row without max never runs out");

    assert.equal(sim.buyItem("trader", "beam_basic"), "Spare beam in the station inventory. Fit it in a primary bay to use it.");
    assert.equal(sim.shopStock("trader", "beam_basic"), 1, "one bought");
    assert.equal(p.cr, 900);

    assert.ok(sim.buyItem("trader", "beam_basic"));
    assert.equal(sim.shopStock("trader", "beam_basic"), 0, "sold out");

    assert.equal(sim.buyItem("trader", "beam_basic"), undefined, "a sold-out row cannot be bought");
    assert.equal(W().store.beam_basic, 2, "and nothing more was stored");
    assert.equal(p.cr, 800, "nor charged");

    // Unlimited rows are unaffected.
    assert.equal(sim.buyItem("trader", "ferrite", 3), "3 Ferrite in the station inventory.");
    assert.equal(W().store.ferrite, 3);

    // The future restock timer / event / roll calls this and nothing else.
    sim.setShopStock("trader", "beam_basic", 2);
    assert.equal(sim.shopStock("trader", "beam_basic"), 2, "restocked");
    assert.ok(sim.buyItem("trader", "beam_basic"), "and buyable again");

    // A limited row can be asked for a quantity it cannot cover.
    sim.setShopStock("trader", "beam_basic", 1);
    p.cr = 1000;
    assert.equal(sim.buyItem("trader", "beam_basic", 2), undefined, "two wanted, one left");
    assert.equal(sim.shopStock("trader", "beam_basic"), 1, "nothing was taken");
  });
});

test("shop stock is session state: never in the save, and reset on a new game", () => {
  const profile = readFileSync(new URL("../src/state/profile.js", import.meta.url), "utf8");
  const stateSrc = readFileSync(new URL("../src/state/state.js", import.meta.url), "utf8");
  assert.doesNotMatch(profile, /shops?\b\s*[:=]/, "the save does not carry shop stock");
  assert.match(stateSrc, /shops:\s*\{\}/, "the runtime state holds it");
  const p = freshGame();
  assert.deepEqual(sim.state.shops, {}, "a fresh game starts with no counts");
  assert.equal(p.v, 13, "save version is 13 after profile/world split");
});

test("the Shop tab draws its rows from SHOPS", () => {
  const screens = readFileSync(new URL("../src/ui/screens.js", import.meta.url), "utf8");
  const menu = readFileSync(new URL("../src/ui/menu.js", import.meta.url), "utf8");
  const weapons = readFileSync(new URL("../src/data/weapons.js", import.meta.url), "utf8");
  assert.doesNotMatch(weapons, /SHOP_WEAPONS/, "the hard-coded shop list is gone");
  assert.doesNotMatch(screens, /SHOP_WEAPONS/, "and no screen reads it");
  assert.match(screens, /shopList\(OUTPOST_SHOP\)/, "the rows come from the shop");
  assert.match(screens, /shopDef\(OUTPOST_SHOP\)/, "so does the heading and the blurb");
  assert.match(screens, /data-a="wb" data-b="\$\{OUTPOST_SHOP\}:\$\{s\.id\}"/, "a Buy button names its shop and item");
  assert.match(menu, /eco\.buyItem\(shop, id\)/, "the Buy action is the one generic purchase");
  assert.doesNotMatch(menu, /buyWeapon/, "the old special-case purchase is gone");
});

test("the 8 starter missiles belong to the missile item, not the shop code", () => {
  assert.equal(MODULES.missile_basic.ammo, 8, "the pod says how many missiles come with it");
  assert.ok(MISSILE.unitPrice > 0, "the restock price is still the missile's own data");
  for (const [id, m] of Object.entries(MODULES)) {
    assert.ok(m.ammo == null || (Number.isInteger(m.ammo) && m.ammo > 0), `${id}: ammo must be a whole number above 0 when given`);
  }
  // Buying an item sells it by its own volume, so the shop cannot disagree with a hold.
  for (const row of SHOPS[M].stock) {
    const vol = MODULES[row.id] ? MODULES[row.id].vol : itemVol(row.id);
    assert.ok(Number.isInteger(vol) && vol > 0, `${row.id}: a row's item must take up room`);
  }
});
