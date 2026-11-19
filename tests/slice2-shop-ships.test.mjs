// Roadmap Slice 2 (#2, #3, #4 + unblurred flight inventory/cargo-transfer overlays):
//   - Compact collapsible 1-line Shop catalogue (Ships, Modules -> per-module-group
//     subgroups, Consumables, Ores, Loot) with right-side Buy button and Buy-amount popup
//   - Hangar tab removed; ships are bought in the Shop and stored per station in
//     Outfitting (never as cargo items in Inventory), allowing duplicate hull copies
//     while enforcing per-station Hangar berth caps and v23 save compatibility
//   - Wasp (no bonus), Prospector (2× mining speed, same base Hull HP as Wasp),
//     Bulwark (1.5× all-weapon damage), plus right-click Ship details in Shop & Outfitting
//   - Flight inventory (#cargo), rift cache (#cache) and shared .cargo-overlay never blur
//     the live space background

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SHIPS, shipBonuses, shipDef, shipLabel, shipTypeOf, nextShipId } from "../src/data/ships.js";
import { MODULE_GROUPS } from "../src/data/outfitting.js";
import { SHOPS, SHOP_GROUPS, shopRow } from "../src/data/shops.js";
import { DEFAULT_PLACE, placeDef, setPlaceCatalog } from "../src/data/places.js";
import { SAVE_VERSION, newSave, sanitizeSave, shipsAtStation, stockFor } from "../src/state/profile.js";
import { encodeSave, decodeSave } from "../src/state/storage.js";
import { state, applySave, currentSave, placeWorld, resetPlaces } from "../src/state/state.js";
import { generateGalaxy } from "../src/sim/galaxy.js";
import {
  buyItem, buyShip, freeBerths, hangarCap, localShips, selectShip, shipBaseStats,
  shopCatalogue, shopMaxBuy,
} from "../src/sim/economy.js";
import { STATION, countOf, itemsAt, addItem } from "../src/sim/inventory.js";
import { fitModule, unequip } from "../src/sim/fitting.js";
import { createPlayer } from "../src/sim/player.js";
import { configurePlayer, dock, die, setHomeStation } from "../src/sim/session.js";
import { enterPlace } from "../src/sim/places.js";
import { updatePrimary, setWeapon } from "../src/sim/weapons.js";
import { launchMissile } from "../src/sim/missile.js";
import { V } from "../src/util/math.js";
import { TABS, outpostHtml, shipDetailsHtml, shopBuyHtml, viewedShip } from "../src/ui/screens.js";

function freshDocked(cr = 10000) {
  resetPlaces();
  state.players.length = 0;
  state.localPlayerIndex = 0;
  state.galaxy = generateGalaxy();
  setPlaceCatalog(state.galaxy);
  applySave(newSave());
  state.profile.cr = cr;
  state.shops = {};
  state.ui.intro = false;
  state.ui.tab = "p";
  state.ui.shopOpen = {};
  state.ui.invShip = null;
  state.place = DEFAULT_PLACE;
  const P = configurePlayer(createPlayer(), state.profile);
  P.docked = true;
  const remoteStation = Object.values(state.galaxy.pockets).find(
    p => p.id !== DEFAULT_PLACE && placeDef(p.id).features.some(f => f.kind === "station")
  );
  return { P, remoteStation };
}

test("#2: compact shop groups Ships, nested Modules subgroups, Consumables, Ores and Loot with Buy-amount caps", () => {
  freshDocked(5000);
  state.worldState.base.hangar = 5; // 6 berths total -> 5 free alongside starting Wasp

  const cat = shopCatalogue("meridian");
  assert.deepEqual(
    cat.map(g => g.k),
    ["ships", "modules", "consumables", "ores", "loot"],
    "top-level one-line groups match SHOP_GROUPS"
  );
  assert.equal(SHOP_GROUPS.length, 5);

  const ships = cat.find(g => g.k === "ships");
  assert.deepEqual(ships.items.map(i => i.id), ["wasp", "prospector", "bulwark", "testship"]);

  const mods = cat.find(g => g.k === "modules");
  assert.deepEqual(
    mods.subgroups.map(s => s.k),
    MODULE_GROUPS.map(g => g.k),
    "every module group has its own subgroup under Modules"
  );
  assert.equal(mods.subgroups.find(s => s.k === "power").items[0].id, "power_basic");
  assert.equal(mods.subgroups.find(s => s.k === "cell").items[0].id, "cell_basic");
  assert.equal(mods.subgroups.find(s => s.k === "thruster").items[0].id, "thruster_basic");
  assert.equal(mods.subgroups.find(s => s.k === "shield").items[0].id, "shield_basic");
  assert.equal(mods.subgroups.find(s => s.k === "hull").items[0].id, "hull_basic");
  assert.deepEqual(
    mods.subgroups.find(s => s.k === "primary").items.map(i => i.id),
    ["beam_basic", "cannon_basic"]
  );
  assert.deepEqual(
    mods.subgroups.find(s => s.k === "secondary").items.map(i => i.id),
    ["missile_basic"]
  );

  assert.deepEqual(cat.find(g => g.k === "consumables").items.map(i => i.id), ["rift_basic"]);
  assert.equal(cat.find(g => g.k === "ores").items.length, 0, "Meridian stocks no ores today");
  assert.equal(cat.find(g => g.k === "loot").items.length, 0, "Meridian stocks no loot today");

  // Collapsed Shop tab renders only the 5 group lines, no item Buy buttons yet.
  state.ui.tab = "p";
  state.ui.shopOpen = {};
  const collapsed = outpostHtml(state.ui);
  assert.equal((collapsed.match(/data-a="shopGroup"/g) || []).length, 5);
  assert.doesNotMatch(collapsed, /class="shop-buy"/);

  // Expanding Modules reveals subgroups; expanding a subgroup reveals one-line items with right Buy buttons.
  state.ui.shopOpen = { modules: true, "modules:primary": true, ores: true, ships: true };
  const expanded = outpostHtml(state.ui);
  assert.match(expanded, /data-a="wb" data-b="meridian:item:beam_basic"/);
  assert.match(expanded, /data-a="wb" data-b="meridian:ship:prospector"/);
  assert.match(expanded, /data-ship-type="prospector"/, "ship rows support right-click Ship details");
  assert.match(expanded, /None in stock/, "empty Ores group explains nothing is stocked here yet");

  // Future station stocking ores and loot classifies automatically without UI changes.
  SHOPS._future = {
    n: "Frontier market",
    d: "",
    stock: [
      { id: "cobalt", price: 30, n: "Cobalt", d: "Refined ore." },
      { id: "salv", price: 90, n: "Salvage", d: "Hull scrap." },
      { id: "core", price: 420, n: "Reactor core", d: "Recovered core.", max: 2 },
    ],
  };
  try {
    const futureCat = shopCatalogue("_future");
    assert.deepEqual(futureCat.find(g => g.k === "ores").items.map(i => i.id), ["cobalt"]);
    assert.deepEqual(futureCat.find(g => g.k === "loot").items.map(i => i.id), ["salv", "core"]);
    assert.equal(shopMaxBuy("_future", "core", state.profile, state.worldState, "item"), 2);
  } finally {
    delete SHOPS._future;
  }

  // Buy-amount popup calculates bounded max and live total, and batch item buy works.
  assert.equal(shopMaxBuy("meridian", "rift_basic", state.profile, state.worldState, "item"), 10, "capped by stack limit 10");
  const popup = shopBuyHtml(cat.find(g => g.k === "consumables").items[0], 10, 4);
  assert.match(popup, /Buy amount/);
  assert.match(popup, /40 cr/);
  assert.match(buyItem("meridian", "rift_basic", 4, state.player, state.profile, state.worldState, "item"), /4 Basic rift/);
  assert.equal(countOf(STATION, "rift_basic"), 4);
  assert.equal(state.profile.cr, 4960);
});

test("#3: Hangar tab removed; ships bought in Shop stay in station Outfitting with duplicate hulls, berth cap and v23 save", () => {
  const { P, remoteStation } = freshDocked(10000);
  assert.equal(SAVE_VERSION, 23);

  // Hangar tab is removed from station navigation.
  assert.equal(TABS.some(([k, n]) => k === "h" || /hangar/i.test(n)), false, "no Hangar tab");

  // Default hangar level 1 -> cap 2 berths (1 used by starter Wasp -> 1 free berth).
  assert.equal(hangarCap(state.worldState), 2);
  assert.equal(freeBerths(state.profile, state.worldState), 1);
  assert.equal(shopMaxBuy("meridian", "wasp", state.profile, state.worldState, "ship"), 1);

  // Buy a second Wasp through the Shop -> stored in Outfitting as wasp#2, NOT in Inventory!
  const msg1 = buyItem("meridian", "wasp", 1, P, state.profile, state.worldState, "ship");
  assert.match(msg1, /Outfitting/);
  assert.deepEqual(state.profile.ships, ["wasp", "wasp#2"]);
  assert.equal(itemsAt(STATION).length, 0, "bought ship never enters station Inventory items");
  assert.equal(shipLabel("wasp", state.profile.ships), "Wasp #1");
  assert.equal(shipLabel("wasp#2", state.profile.ships), "Wasp #2");
  assert.equal(freeBerths(state.profile, state.worldState), 0);

  // Buying a 3rd ship at this station is blocked by the hangar berth cap until upgraded.
  assert.match(
    buyItem("meridian", "prospector", 1, P, state.profile, state.worldState, "ship"),
    /berth/i
  );
  assert.equal(state.profile.ships.length, 2);

  // Upgrading Hangar berth allows batch-buying 2 Prospectors at once via Buy amount.
  state.worldState.base.hangar = 4; // cap 5 -> 3 free berths
  assert.equal(shopMaxBuy("meridian", "prospector", state.profile, state.worldState, "ship"), 3);
  const msg2 = buyItem("meridian", "prospector", 2, P, state.profile, state.worldState, "ship");
  assert.match(msg2, /2 Prospector stored in Outfitting/);
  assert.deepEqual(state.profile.ships, ["wasp", "wasp#2", "prospector", "prospector#2"]);
  assert.equal(itemsAt(STATION).length, 0, "still zero items in Inventory");

  // Each duplicate ship keeps its own hold, damage and loadout.
  addItem("prospector", "ferrite", 12, state.profile, state.worldState);
  addItem("prospector#2", "cobalt", 5, state.profile, state.worldState);
  state.profile.hp["prospector#2"] = 0.6;
  assert.equal(countOf("prospector", "cobalt"), 0);
  assert.equal(countOf("prospector#2", "ferrite"), 0);

  // Fly prospector#2 to a remote station and dock there; buy a Bulwark there.
  assert.equal(selectShip("prospector#2", P, state.profile, state.worldState), undefined);
  enterPlace(remoteStation.id, P);
  dock(P, state.profile, state.worldState);
  assert.deepEqual(localShips(state.profile, state.worldState, remoteStation.id), ["prospector#2"]);
  assert.deepEqual(localShips(state.profile, state.worldState, DEFAULT_PLACE), ["wasp", "wasp#2", "prospector"]);

  // Cannot switch to a ship parked back at Meridian while docked at the remote station.
  assert.match(selectShip("wasp", P, state.profile, state.worldState), /another station/i);
  assert.equal(viewedShip(), "prospector#2", "Inventory ship hold scopes to local station");

  // Buy a Bulwark at the remote station -> parks at remoteStation, not Meridian.
  buyItem("meridian", "bulwark", 1, P, state.profile, state.worldState, "ship");
  assert.deepEqual(localShips(state.profile, state.worldState, remoteStation.id), ["prospector#2", "bulwark"]);
  assert.deepEqual(localShips(state.profile, state.worldState, DEFAULT_PLACE), ["wasp", "wasp#2", "prospector"]);

  // Outfitting at remote station shows only the 2 ships parked there.
  state.ui.tab = "o";
  const outfitHtml = outpostHtml(state.ui);
  assert.match(outfitHtml, /1 of 2 in the hangar/);
  assert.match(outfitHtml, /data-ship-type="prospector"/);
  assert.match(outfitHtml, /data-ship-type="bulwark"/);
  assert.doesNotMatch(outfitHtml, /data-ship-type="wasp"/);

  // While flying in space, shipsAtStation(..., { docked: false }) excludes only the flown ship.
  assert.deepEqual(
    shipsAtStation(state.profile, remoteStation.id, { docked: false }),
    ["bulwark"],
    "the flown ship is in space while Bulwark remains in the remote station's hangar"
  );

  // Save/load round-trip preserves duplicate ship ids, per-ship holds/hp/loadouts and station locations.
  const encoded = encodeSave(currentSave());
  const decoded = decodeSave(encoded);
  assert.equal(decoded.v, 23);
  assert.deepEqual(decoded.profile.ships, ["wasp", "wasp#2", "prospector", "prospector#2", "bulwark"]);
  assert.equal(decoded.profile.shipPlaces.wasp, DEFAULT_PLACE);
  assert.equal(decoded.profile.shipPlaces["wasp#2"], DEFAULT_PLACE);
  assert.equal(decoded.profile.shipPlaces["prospector#2"], remoteStation.id);
  assert.equal(decoded.profile.shipPlaces.bulwark, remoteStation.id);
  assert.equal(decoded.profile.holds["prospector#2"].cobalt, 5);
  assert.equal(decoded.profile.holds.prospector.ferrite, 12);

  // Pre-v23 save without shipPlaces upgrades cleanly without losing any ship.
  const v22Raw = JSON.parse(JSON.stringify(decoded));
  v22Raw.v = 22;
  v22Raw.profile.v = 22;
  v22Raw.profile.ships = ["wasp", "prospector"];
  v22Raw.profile.ship = "prospector";
  delete v22Raw.profile.shipPlaces;
  v22Raw.world.v = 22;
  v22Raw.world.place = remoteStation.id;
  v22Raw.world.resume = null;
  const migrated = sanitizeSave(v22Raw);
  assert.equal(migrated.v, 23);
  assert.equal(migrated.profile.shipPlaces.wasp, remoteStation.id);
  assert.equal(migrated.profile.shipPlaces.prospector, remoteStation.id);

  // Dying when all remaining ships sit at another station keeps remote ships parked and lends a local Wasp.
  setHomeStation(P, state.profile); // home is remoteStation
  selectShip("bulwark", P, state.profile, state.worldState);
  // Move prospector#2 back to Meridian and lose bulwark in space -> remoteStation has 0 ships left.
  state.profile.shipPlaces["prospector#2"] = DEFAULT_PLACE;
  P.docked = false;
  enterPlace("hollow", P);
  die();
  assert.equal(state.place, remoteStation.id);
  assert.equal(state.profile.ship, "wasp#3", "home station lends a fresh numbered Wasp");
  assert.equal(state.profile.shipPlaces["wasp#3"], remoteStation.id);
  assert.equal(state.profile.shipPlaces.wasp, DEFAULT_PLACE, "Meridian ships stay parked at Meridian");
  assert.equal(state.profile.shipPlaces["prospector#2"], DEFAULT_PLACE);
  assert.equal(shipTypeOf("wasp#3"), "wasp");
  assert.equal(nextShipId("wasp", state.profile.ships), "wasp#4");
});

test("#4: Prospector mines 2× faster with Wasp HP, Bulwark deals 1.5× on all weapons, and Ship details reports unfitted base stats", () => {
  const { P } = freshDocked(20000);
  state.worldState.base.hangar = 4;

  // Base stats without fitted modules.
  const waspStats = shipBaseStats("wasp");
  const prospStats = shipBaseStats("prospector");
  const bulwarkStats = shipBaseStats("bulwark");
  const testStats = shipBaseStats("testship");

  assert.equal(waspStats.hullHp, 10);
  assert.equal(waspStats.cargo, 20);
  assert.deepEqual(waspStats.bonuses, []);

  assert.equal(prospStats.hullHp, waspStats.hullHp, "Prospector has the exact same base Hull HP as Wasp");
  assert.equal(prospStats.cargo, 70);
  assert.deepEqual(prospStats.bonuses, ["2× mining speed"]);

  assert.equal(bulwarkStats.hullHp, waspStats.hullHp, "Bulwark has baseline Hull HP");
  assert.equal(bulwarkStats.cargo, 30);
  assert.deepEqual(bulwarkStats.bonuses, ["1.5× damage (all weapons)"]);

  assert.equal(testStats.hullHp, 1000);
  assert.equal(testStats.cargo, 20);
  assert.deepEqual(shipBonuses("testship"), ["100× Hull HP", "10× damage (all weapons)"]);

  // Even when a ship strips its hull module, right-click Ship details still reports base unfitted stats.
  unequip("hull", 0, P, state.profile, state.worldState);
  assert.equal(P.hullMax, 0, "live ship has no hull plating fitted");
  const waspCard = shipDetailsHtml("wasp");
  assert.match(waspCard, /10 HP/, "Ship details still reports unmodified base 10 HP");
  assert.match(waspCard, /20 m³/);
  assert.match(waspCard, /None/, "Wasp lists no unique bonuses");
  fitModule("hull", 0, "hull_basic", P, state.profile, state.worldState);

  const prospCard = shipDetailsHtml("prospector#2");
  assert.match(prospCard, /Prospector/);
  assert.match(prospCard, /10 HP/);
  assert.match(prospCard, /70 m³/);
  assert.match(prospCard, /2× mining speed/);

  const bulwarkCard = shipDetailsHtml("bulwark");
  assert.match(bulwarkCard, /Bulwark/);
  assert.match(bulwarkCard, /10 HP/);
  assert.match(bulwarkCard, /30 m³/);
  assert.match(bulwarkCard, /1\.5× damage \(all weapons\)/);

  // Live simulation check 1: Prospector mines an asteroid in 2.0s vs Wasp's 4.0s (exact 2× speed).
  buyShip("prospector", state.profile, state.worldState);
  buyShip("bulwark", state.profile, state.worldState);
  addItem(STATION, "beam_basic", 2, state.profile, state.worldState);
  fitModule("primary", 1, "beam_basic", P, state.profile, state.worldState); // on Wasp
  selectShip("prospector", P, state.profile, state.worldState);
  fitModule("primary", 1, "beam_basic", P, state.profile, state.worldState); // on Prospector
  assert.equal(P.hullMax, 10, "Prospector flies with same 10 HP as Wasp");

  const mineSeconds = (shipId, seconds) => {
    selectShip(shipId, P, state.profile, state.worldState);
    enterPlace("hollow", P);
    P.docked = false;
    P.pos.set(0, 0, 0);
    P.quat.set(0, 0, 0, 1); // faces -Z
    const W = placeWorld("hollow");
    W.asteroids.length = 0;
    W.asteroids.push({
      id: "r1",
      kind: "rock",
      pos: V(0, 0, -100),
      scale: V(1, 1, 1),
      s0: V(1, 1, 1),
      r: 12,
      type: "ferrite",
      ore: 10,
      max: 10,
      shape: 0,
    });
    setWeapon("2", P);
    P.controls.fire = true;
    const steps = Math.round(seconds * 60);
    for (let i = 0; i < steps; i++) updatePrimary(1 / 60, P);
    P.controls.fire = false;
    P.docked = true;
    enterPlace(DEFAULT_PLACE, P);
    return countOf(shipId, "ferrite", state.profile, state.worldState);
  };

  assert.equal(mineSeconds("wasp", 2.05), 0, "Wasp needs 4s per ore, so 2s yields 0");
  assert.equal(mineSeconds("prospector", 2.05), 1, "Prospector cuts 1 ore in 2s (2× speed)");
  assert.equal(mineSeconds("prospector", 2.05), 2, "Prospector cuts a second ore in another 2s");

  // Live simulation check 2: Bulwark multiplies BOTH primary cannon bolts and secondary missiles by 1.5×.
  selectShip("bulwark", P, state.profile, state.worldState);
  addItem(STATION, "missile_basic", 1, state.profile, state.worldState);
  fitModule("secondary", 0, "missile_basic", P, state.profile, state.worldState);
  state.profile.msl = 4;
  P.missileStock = 4;
  enterPlace("hollow", P);
  P.docked = false;
  P.pos.set(0, 0, 0);
  P.quat.set(0, 0, 0, 1);
  const W = placeWorld("hollow");
  W.bullets.length = 0;
  W.missiles.length = 0;
  setWeapon("1", P);
  P.controls.fire = true;
  updatePrimary(1 / 60, P);
  P.controls.fire = false;
  assert.ok(W.bullets.length >= 1, "Bulwark fired primary cannon bolts");
  for (const b of W.bullets) {
    assert.equal(b.dmg, 1.5, "each Bulwark cannon bolt deals 1.5× base damage (1 -> 1.5)");
  }
  const msl = launchMissile(null, P.missiles[0], V(0, 0, -1), V(0, -1, -5), P);
  assert.equal(msl.dmg, P.missiles[0].dmg * 1.5, "Bulwark missile deals 1.5× base damage (8 -> 12)");
  assert.equal(shipDef("bulwark").dmg, SHIPS.bulwark.dmg);
});

test("in-space inventory and all cargo-transfer overlays (.cargo-overlay, #cargo, #cache) have no background blur", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const cargoJs = readFileSync(new URL("../src/ui/cargo.js", import.meta.url), "utf8");
  const cacheJs = readFileSync(new URL("../src/ui/cache.js", import.meta.url), "utf8");

  assert.match(cargoJs, /className\s*=\s*"cargo-overlay"/, "flight inventory uses shared .cargo-overlay");
  assert.match(cacheJs, /className\s*=\s*"cargo-overlay"/, "rift cache uses shared .cargo-overlay");

  // No rule referencing .cargo-overlay, #cargo or #cache may apply a blur() backdrop-filter.
  const rulePattern = /([^{}]*(?:\.cargo-overlay|#cargo|#cache)[^{}]*)\{([^}]*)\}/g;
  let matched = 0;
  for (const m of css.matchAll(rulePattern)) {
    matched++;
    assert.doesNotMatch(m[2], /blur\s*\(/i, `rule "${m[1].trim()}" must not blur the background`);
  }
  assert.ok(matched >= 2, "found cargo/cache overlay rules in styles.css");
  assert.match(css, /\.cargo-overlay[\s\S]*?backdrop-filter:\s*none/, "shared .cargo-overlay explicitly disables backdrop-filter");
});

test("menu wiring: clicking Buy opens Buy-amount popup and right-clicking a ship in Shop or Outfitting opens Ship details", async () => {
  const { registerHooks } = await import("node:module");
  registerHooks({
    load(url, ctx, next) {
      if (/\.(txt|glb|png|ogg|wav|mp3)$/.test(url)) return { format: "module", shortCircuit: true, source: 'export default "";' };
      return next(url, ctx);
    },
  });
  const { setupMenu, closePanelPopovers } = await import("../src/ui/menu.js");
  freshDocked(10000);
  state.worldState.base.hangar = 5;

  const makeEl = (tag = "div") => {
    const el = {
      tagName: tag.toUpperCase(),
      id: "",
      hidden: false,
      innerHTML: "",
      textContent: "",
      value: "1",
      className: "",
      disabled: false,
      dataset: {},
      style: {},
      scrollLeft: 0,
      scrollTop: 0,
      clientWidth: 580,
      clientHeight: 720,
      children: [],
      handlers: {},
      attrs: {},
      classList: {
        contains: c => el.className.split(/\s+/).includes(c),
        add: c => { if (!el.className.split(/\s+/).includes(c)) el.className = `${el.className} ${c}`.trim(); },
        remove: c => { el.className = el.className.split(/\s+/).filter(x => x !== c).join(" "); },
        toggle: (c, on) => (on ? el.classList.add(c) : el.classList.remove(c)),
      },
      append(...kids) { for (const k of kids) this.appendChild(k); },
      appendChild(kid) { this.children.push(kid); kid.parentNode = this; return kid; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return this.attrs[k] ?? null; },
      addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); },
      dispatch(type, evt) { for (const fn of this.handlers[type] || []) fn(evt); },
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 540, bottom: 40, width: 580, height: 720 }),
      focus() {},
      select() {},
      closest() { return null; },
      querySelector(sel) {
        if (sel === ".inv-sell-amount") return (this._input ||= makeEl("input"));
        if (sel === "[data-buy-total]") return (this._total ||= makeEl("strong"));
        if (sel === ".inv-sell-error") return (this._err ||= makeEl("div"));
        return this.children.find(c => sel.split(",").some(s => c.classList.contains(s.trim().replace(/^\./, "")))) || null;
      },
      querySelectorAll(sel) {
        const classes = sel.split(",").map(s => s.trim().replace(/^\./, ""));
        return this.children.filter(c => classes.some(cls => c.classList.contains(cls)));
      },
      remove() {
        if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this);
        this.parentNode = null;
      },
    };
    return el;
  };

  const panel = makeEl("div");
  panel.id = "panel";
  const prevDoc = globalThis.document;
  globalThis.document = {
    body: makeEl("body"),
    getElementById: id => (id === "panel" ? panel : null),
    createElement: tag => makeEl(tag),
  };
  try {
    setupMenu();
    // 1. Click Buy on Prospector in Shop -> opens Buy-amount popup, type 2, confirm -> 2 Prospectors in Outfitting!
    const buyBtn = makeEl("button");
    buyBtn.dataset = { a: "wb", b: "meridian:ship:prospector" };
    buyBtn.getBoundingClientRect = () => ({ left: 480, top: 120, right: 530, bottom: 138, width: 50, height: 18 });
    buyBtn.closest = sel => (sel === "button[data-a]" ? buyBtn : null);
    await panel.handlers.click[0]({ target: buyBtn, shiftKey: false });

    const buyPop = panel.children.find(c => c.classList.contains("shop-buy-popover"));
    assert.ok(buyPop, "clicking Buy opens the Buy-amount popup");
    assert.match(buyPop.innerHTML, /Buy Prospector/);
    const input = buyPop.querySelector(".inv-sell-amount");
    input.value = "2";
    input.dispatch("input", {});
    assert.equal(buyPop.querySelector("[data-buy-total]").textContent, "1200 cr");

    const confirmBtn = makeEl("button");
    confirmBtn.dataset = { a: "shopBuyConfirm" };
    confirmBtn.closest = sel => {
      if (sel === "button[data-a]") return confirmBtn;
      if (sel === ".shop-buy-popover") return buyPop;
      return null;
    };
    await panel.handlers.click[0]({ target: confirmBtn, shiftKey: false });
    assert.deepEqual(state.profile.ships, ["wasp", "prospector", "prospector#2"]);
    assert.equal(itemsAt(STATION).length, 0, "ships went to Outfitting, not Inventory");
    assert.equal(state.profile.cr, 8800);

    // 2. Right-click a ship in Shop or Outfitting -> opens Ship details popup with base stats & bonuses.
    const shipRow = makeEl("li");
    shipRow.dataset = { shipType: "bulwark" };
    shipRow.closest = sel => (sel === "[data-ship-type]" ? shipRow : null);
    let prevented = false;
    panel.handlers.contextmenu[0]({
      target: shipRow,
      clientX: 200,
      clientY: 160,
      preventDefault() { prevented = true; },
    });
    assert.equal(prevented, true);
    const infoPop = panel.children.find(c => c.classList.contains("ship-info-popover"));
    assert.ok(infoPop, "right-clicking a ship opens the Ship details popup");
    assert.match(infoPop.innerHTML, /Bulwark/);
    assert.match(infoPop.innerHTML, /10 HP/);
    assert.match(infoPop.innerHTML, /30 m³/);
    assert.match(infoPop.innerHTML, /1\.5× damage \(all weapons\)/);

    // 3. closePanelPopovers() (used by Escape and outside click) closes it cleanly.
    assert.equal(closePanelPopovers(), true);
    assert.equal(panel.children.length, 0);
    assert.equal(closePanelPopovers(), false);
  } finally {
    globalThis.document = prevDoc;
  }
});
