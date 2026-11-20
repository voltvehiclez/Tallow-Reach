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
  buyItem, buyShip, canSellShip, freeBerths, hangarCap, localShips, selectShip, sellShip, shipBaseStats,
  shopCatalogue, shopMaxBuy,
} from "../src/sim/economy.js";
import { STATION, countOf, itemsAt, addItem } from "../src/sim/inventory.js";
import { itemVol } from "../src/data/items.js";
import { fitModule, unequip } from "../src/sim/fitting.js";
import { createPlayer } from "../src/sim/player.js";
import { configurePlayer, dock, die, setHomeStation } from "../src/sim/session.js";
import { enterPlace } from "../src/sim/places.js";
import { updatePrimary, setWeapon } from "../src/sim/weapons.js";
import { launchMissile } from "../src/sim/missile.js";
import { V } from "../src/util/math.js";
import { TABS, leftPanelHtml, outpostHtml, shipDetailsHtml, shopBuyHtml, viewedShip } from "../src/ui/screens.js";

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
  const primary = mods.subgroups.find(s => s.k === "primary");
  assert.equal(primary.count, 2);
  assert.deepEqual(
    primary.subgroups.map(s => [s.k, s.n]),
    [["cannons", "Cannons"], ["missiles", "Missiles"], ["mining", "Mining beams"]],
    "Primary weapons has Cannons, Missiles and Mining beams sub-categories"
  );
  assert.deepEqual(primary.subgroups.find(s => s.k === "cannons").items.map(i => i.id), ["cannon_basic"]);
  assert.deepEqual(primary.subgroups.find(s => s.k === "missiles").items, []);
  assert.deepEqual(primary.subgroups.find(s => s.k === "mining").items.map(i => i.id), ["beam_basic"]);
  assert.deepEqual(primary.items, [], "every current primary weapon sits in its own sub-category");
  assert.deepEqual(
    mods.subgroups.find(s => s.k === "secondary").items.map(i => i.id),
    ["missile_basic"]
  );

  assert.deepEqual(cat.find(g => g.k === "consumables").items.map(i => i.id), ["rift_basic"]);
  assert.equal(cat.find(g => g.k === "ores").items.length, 0, "Meridian stocks no ores today");
  assert.equal(cat.find(g => g.k === "loot").items.length, 0, "Meridian stocks no loot today");

  // Collapsed left Shop window renders only the 5 group lines, no item Buy buttons yet.
  state.ui.leftPanel = "p";
  state.ui.shopOpen = {};
  const collapsed = leftPanelHtml(state.ui);
  assert.equal((collapsed.match(/data-a="shopGroup"/g) || []).length, 5);
  assert.doesNotMatch(collapsed, /class="shop-buy"/);

  // Expanding Modules -> Primary weapons shows Cannons, Missiles & Mining beams toggles;
  // expanding each reveals its own modules (Missiles shows None in stock until future missiles arrive).
  state.ui.shopOpen = { modules: true, "modules:primary": true, ores: true, ships: true };
  const expanded = leftPanelHtml(state.ui);
  assert.match(expanded, /data-a="shopGroup" data-b="modules:primary:cannons"/);
  assert.match(expanded, /data-a="shopGroup" data-b="modules:primary:missiles"/);
  assert.match(expanded, /data-a="shopGroup" data-b="modules:primary:mining"/);
  assert.doesNotMatch(expanded, /data-b="meridian:item:cannon_basic"/, "cannons stay tucked inside Cannons until opened");
  assert.doesNotMatch(expanded, /data-b="meridian:item:beam_basic"/, "mining beams stay tucked inside Mining beams until opened");
  assert.match(expanded, /data-a="wb" data-b="meridian:ship:prospector"/);
  assert.match(expanded, /data-ship-type="prospector"/, "ship rows support right-click Ship details");
  assert.match(expanded, /None in stock/, "empty Ores group explains nothing is stocked here yet");

  state.ui.shopOpen["modules:primary:cannons"] = true;
  state.ui.shopOpen["modules:primary:missiles"] = true;
  state.ui.shopOpen["modules:primary:mining"] = true;
  const deepExpanded = leftPanelHtml(state.ui);
  assert.match(deepExpanded, /data-a="wb" data-b="meridian:item:cannon_basic"/);
  assert.match(deepExpanded, /data-a="wb" data-b="meridian:item:beam_basic"/);

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

test("#3: ships bought in Shop stay in station Hangar (not Outfitting list or Inventory) with duplicate hulls, berth cap, Sell and v23 save", () => {
  const { P, remoteStation } = freshDocked(10000);
  assert.equal(SAVE_VERSION, 26);

  // Separate Hangar tab is removed (ship list lives inside Inventory); Outfitting has no ship list.
  assert.equal(TABS.some(([k, n]) => k === "h" || n === "Hangar"), false, "Hangar tab is merged into Inventory");
  assert.equal(TABS.some(([k, n]) => k === "i" && n === "Inventory"), true, "Inventory tab is in station menu");

  // Default hangar level 1 -> cap 2 berths (1 used by starter Wasp -> 1 free berth).
  assert.equal(hangarCap(state.worldState), 2);
  assert.equal(freeBerths(state.profile, state.worldState), 1);
  assert.equal(shopMaxBuy("meridian", "wasp", state.profile, state.worldState, "ship"), 1);

  // Cannot sell your only ship at this station.
  assert.equal(canSellShip("wasp", P, state.profile, state.worldState).ok, false);
  assert.match(sellShip("wasp", P, state.profile, state.worldState), /only ship/i);

  // Buy a second Wasp through the Shop -> stored in Hangar as wasp#2, NOT in Inventory!
  const msg1 = buyItem("meridian", "wasp", 1, P, state.profile, state.worldState, "ship");
  assert.match(msg1, /Hangar/);
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
  assert.match(msg2, /2 Prospector stored in Hangar/);
  assert.deepEqual(state.profile.ships, ["wasp", "wasp#2", "prospector", "prospector#2"]);
  assert.equal(itemsAt(STATION).length, 0, "still zero items in Inventory");

  // Selling a stored ship with cargo and a non-stock fitted upgrade moves both into station storage,
  // drops factory stock with the hull, refunds 60% (360 cr), and refuses if station storage is full.
  state.profile.cr = 10000;
  buyItem("meridian", "bulwark", 1, P, state.profile, state.worldState, "ship");
  addItem("bulwark", "ferrite", 4, state.profile, state.worldState);
  state.profile.loadout.bulwark.primary[1] = "beam_basic"; // non-stock 900 cr upgrade (4 m³)
  const preCr = state.profile.cr; // 9400
  // Fill station storage so only 4 m³ remains and 8 m³ (4 Ferrite + 4 m³ beam) cannot fit -> sell refuses cleanly!
  state.worldState.base.store = 0; // 80 m³ cap
  addItem(STATION, "cobalt", 76, state.profile, state.worldState);
  assert.equal(canSellShip("bulwark", P, state.profile, state.worldState).ok, false);
  assert.match(sellShip("bulwark", P, state.profile, state.worldState), /free in station storage/i);
  assert.equal(state.profile.ships.includes("bulwark"), true, "Bulwark kept when station storage is full");
  // Clear station storage -> sell succeeds, pays 360 cr, and saves ferrite + beam_basic (no stock clutter).
  state.worldState.base.store = 1;
  delete state.worldState.store.cobalt;
  const checkBulwark = canSellShip("bulwark", P, state.profile, state.worldState);
  assert.equal(checkBulwark.ok, true);
  assert.equal(checkBulwark.price, 360);
  assert.equal(checkBulwark.unpackVol, 4 + itemVol("beam_basic"));
  assert.match(sellShip("bulwark", P, state.profile, state.worldState), /Sold Bulwark for 360 cr/);
  assert.equal(state.profile.cr, preCr + 360);
  assert.equal(state.profile.ships.includes("bulwark"), false);
  assert.equal(state.profile.holds.bulwark, undefined);
  assert.equal(state.profile.loadout.bulwark, undefined);
  assert.equal(state.profile.shipPlaces.bulwark, undefined);
  assert.equal(countOf(STATION, "ferrite"), 4, "cargo returned to station storage");
  assert.equal(countOf(STATION, "beam_basic"), 1, "non-stock fitted beam returned to station storage");
  assert.equal(countOf(STATION, "cannon_basic"), 0, "factory stock modules are not duplicated");
  delete state.worldState.store.ferrite;
  delete state.worldState.store.beam_basic;

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

  // Cannot switch to or sell a ship parked back at Meridian while docked at the remote station.
  assert.match(selectShip("wasp", P, state.profile, state.worldState), /another station/i);
  assert.match(sellShip("wasp", P, state.profile, state.worldState), /another station/i);
  assert.equal(viewedShip(), "prospector#2", "Inventory ship hold scopes to local station");

  // Buy a Bulwark at the remote station -> parks at remoteStation, not Meridian.
  buyItem("meridian", "bulwark", 1, P, state.profile, state.worldState, "ship");
  assert.deepEqual(localShips(state.profile, state.worldState, remoteStation.id), ["prospector#2", "bulwark"]);
  assert.deepEqual(localShips(state.profile, state.worldState, DEFAULT_PLACE), ["wasp", "wasp#2", "prospector"]);

  // Inventory at the remote station embeds the compact ship list above Station/ship holds,
  // with a quick Fly button beside Active/Stored and no single-click-row auto-equip or ship buy rows.
  state.ui.tab = "i";
  state.ui.invView = "inv";
  const hHtml = outpostHtml(state.ui);
  assert.match(hHtml, /class="hangar-ships"/, "Inventory embeds the compact stored-ship list");
  assert.match(hHtml, /data-hangar-ship="prospector#2"/);
  assert.match(hHtml, /data-hangar-ship="bulwark"/);
  assert.match(hHtml, /class="hangar-fly-btn" data-a="hangarFly" data-b="bulwark"/, "stored ship offers quick Fly button");
  assert.doesNotMatch(hHtml, /data-hangar-ship="wasp"/, "Meridian ships are not in remote station list");
  assert.doesNotMatch(hHtml, /data-a="sel"/, "clicking a ship row itself does not auto-equip it");
  assert.doesNotMatch(hHtml, /data-a="buy"/, "ships are bought in Shop, not Inventory");

  state.ui.leftPanel = "o";
  const outfitHtml = leftPanelHtml(state.ui);
  assert.doesNotMatch(outfitHtml, /ship-switch|in the hangar/, "Outfitting ship-switch box and arrows are removed");
  assert.doesNotMatch(outfitHtml, /hangar-ships|outfit-ships/, "stored-ship list removed from Outfitting");
  assert.match(outfitHtml, /data-ship-type="prospector"/, "active ship stays inspectable in Outfitting");
  assert.doesNotMatch(outfitHtml, /data-ship-type="bulwark"/, "stored ship list is not rendered in Outfitting");

  // While flying in space, shipsAtStation(..., { docked: false }) excludes only the flown ship.
  assert.deepEqual(
    shipsAtStation(state.profile, remoteStation.id, { docked: false }),
    ["bulwark"],
    "the flown ship is in space while Bulwark remains in the remote station's hangar"
  );

  // Save/load round-trip preserves duplicate ship ids, per-ship holds/hp/loadouts and station locations.
  const encoded = encodeSave(currentSave());
  const decoded = decodeSave(encoded);
  assert.equal(decoded.v, 26);
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
  assert.equal(migrated.v, 26);
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
    // 1. Click Buy on Prospector at right-edge cursor (526, 220): Buy button sits right-aligned
    // directly under the cursor (zero extra travel), typing 2 updates total, confirming buys 2 ships.
    const buyBtn = makeEl("button");
    buyBtn.dataset = { a: "wb", b: "meridian:ship:prospector" };
    buyBtn.getBoundingClientRect = () => ({ left: 506, top: 211, right: 546, bottom: 228, width: 40, height: 17 });
    buyBtn.closest = sel => (sel === "button[data-a]" ? buyBtn : null);
    await panel.handlers.click[0]({ target: buyBtn, shiftKey: false, clientX: 526, clientY: 220 });

    const buyPop = panel.children.find(c => c.classList.contains("shop-buy-popover"));
    assert.ok(buyPop, "clicking Buy opens the Buy-amount popup");
    assert.match(buyPop.innerHTML, /Buy Prospector/);
    assert.match(
      buyPop.innerHTML,
      /data-a="shopBuyCancel">Cancel<\/button><button[^>]*data-a="shopBuyConfirm">Buy<\/button>/,
      "popup puts Cancel left and Buy right so Buy sits over the right-edge cursor"
    );
    const popLeft = parseFloat(buyPop.style.left);
    const popTop = parseFloat(buyPop.style.top);
    assert.equal(popLeft + 214, 526, "popup Buy button X centre lands straight on the cursor");
    assert.equal(popTop + 46, 220, "popup Buy button Y centre lands straight on the cursor");

    // Clicking Buy near the bottom edge flips the popup header down so Buy still sits under the cursor.
    await panel.handlers.click[0]({ target: buyBtn, shiftKey: false, clientX: 526, clientY: 690 });
    const lowPop = panel.children.find(c => c.classList.contains("shop-buy-popover"));
    assert.equal(lowPop.classList.contains("flip-up"), true, "bottom-edge Buy popup flips header to bottom");
    assert.ok(Math.abs(parseFloat(lowPop.style.top) + (158 - 24) - 690) <= 6, "flipped Buy button stays over cursor");

    const input = lowPop.querySelector(".inv-sell-amount");
    input.value = "2";
    input.dispatch("input", {});
    assert.equal(lowPop.querySelector("[data-buy-total]").textContent, "1200 cr");

    const confirmBtn = makeEl("button");
    confirmBtn.dataset = { a: "shopBuyConfirm" };
    confirmBtn.closest = sel => {
      if (sel === "button[data-a]") return confirmBtn;
      if (sel === ".shop-buy-popover") return lowPop;
      return null;
    };
    await panel.handlers.click[0]({ target: confirmBtn, shiftKey: false });
    assert.deepEqual(state.profile.ships, ["wasp", "prospector", "prospector#2"]);
    assert.equal(itemsAt(STATION).length, 0, "ships went to Hangar, not Inventory");
    assert.equal(state.profile.cr, 8800);

    // 2. Hangar row: single left-click does NOT auto-equip; double-click flies it; right-click opens menu.
    const hangarRow = makeEl("li");
    hangarRow.dataset = { hangarShip: "prospector", shipType: "prospector" };
    hangarRow.closest = sel => (sel === "[data-hangar-ship]" ? hangarRow : null);
    await panel.handlers.click[0]({ target: hangarRow, shiftKey: false });
    assert.equal(state.profile.ship, "wasp", "single left-clicking a stored ship in Hangar does not equip it");

    const waspRow = makeEl("li");
    waspRow.dataset = { hangarShip: "wasp", shipType: "wasp" };
    waspRow.closest = sel => (sel === "[data-hangar-ship]" ? waspRow : null);
    panel.handlers.dblclick[0]({ target: hangarRow });
    assert.equal(state.profile.ship, "prospector", "double-clicking a stored ship in Hangar flies it");
    panel.handlers.dblclick[0]({ target: waspRow });
    assert.equal(state.profile.ship, "wasp", "double-clicking Wasp switches back so context-menu Fly can be tested");

    let ctxPrevented = false;
    panel.handlers.contextmenu[0]({
      target: hangarRow,
      clientX: 220,
      clientY: 140,
      preventDefault() { ctxPrevented = true; },
    });
    assert.equal(ctxPrevented, true);
    const ctxMenu = panel.children.find(c => c.classList.contains("hangar-context"));
    assert.ok(ctxMenu, "right-clicking a stored ship opens the Hangar context menu");
    assert.deepEqual(
      ctxMenu.children.map(b => b.textContent),
      ["Show info", "Fly ship", "Sell"]
    );
    assert.deepEqual(
      ctxMenu.children.map(b => b.disabled),
      [false, false, false],
      "all three actions enabled on a stored ship"
    );

    // 2a. Show info opens Ship details for Prospector.
    const [infoBtn, flyBtn] = ctxMenu.children;
    infoBtn.closest = sel => (sel === "button[data-a]" ? infoBtn : sel === ".inv-context" ? ctxMenu : null);
    await panel.handlers.click[0]({ target: infoBtn, shiftKey: false });
    const hInfo = panel.children.find(c => c.classList.contains("ship-info-popover"));
    assert.ok(hInfo, "Show info opens Ship details");
    assert.match(hInfo.innerHTML, /Prospector/);
    assert.match(hInfo.innerHTML, /2× mining speed/);

    // 2b. Fly ship equips Prospector; right-clicking it now disables Fly ship and Sell.
    flyBtn.closest = sel => (sel === "button[data-a]" ? flyBtn : null);
    await panel.handlers.click[0]({ target: flyBtn, shiftKey: false });
    assert.equal(state.profile.ship, "prospector", "Fly ship equips the chosen ship");

    panel.handlers.contextmenu[0]({ target: hangarRow, clientX: 220, clientY: 140, preventDefault() {} });
    const activeMenu = panel.children.find(c => c.classList.contains("hangar-context"));
    assert.deepEqual(
      activeMenu.children.map(b => b.disabled),
      [false, true, true],
      "active ship keeps Show info enabled and disables Fly ship and Sell"
    );

    // 2c. Right-click prospector#2 -> Sell -> confirm -> refunds 360 cr and removes ship from Hangar.
    const spareRow = makeEl("li");
    spareRow.dataset = { hangarShip: "prospector#2", shipType: "prospector" };
    spareRow.closest = sel => (sel === "[data-hangar-ship]" ? spareRow : null);
    panel.handlers.contextmenu[0]({ target: spareRow, clientX: 220, clientY: 160, preventDefault() {} });
    const spareMenu = panel.children.find(c => c.classList.contains("hangar-context"));
    const sellBtn = spareMenu.children[2];
    sellBtn.closest = sel => (sel === "button[data-a]" ? sellBtn : sel === ".inv-context" ? spareMenu : null);
    await panel.handlers.click[0]({ target: sellBtn, shiftKey: false });
    const sellPop = panel.children.find(c => c.classList.contains("ship-sell-popover"));
    assert.ok(sellPop, "clicking Sell opens ship sell confirmation");
    assert.match(sellPop.innerHTML, /360 cr/);
    const sellConfirm = makeEl("button");
    sellConfirm.dataset = { a: "shipSellConfirm" };
    sellConfirm.closest = sel => (sel === "button[data-a]" ? sellConfirm : sel === ".ship-sell-popover" ? sellPop : null);
    await panel.handlers.click[0]({ target: sellConfirm, shiftKey: false });
    assert.deepEqual(state.profile.ships, ["wasp", "prospector"]);
    assert.equal(state.profile.cr, 9160);

    // 3. Right-click a ship in Shop or Outfitting -> opens Ship details popup directly.
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
    assert.ok(infoPop, "right-clicking a ship in Shop/Outfitting opens the Ship details popup");
    assert.match(infoPop.innerHTML, /Bulwark/);
    assert.match(infoPop.innerHTML, /10 HP/);
    assert.match(infoPop.innerHTML, /30 m³/);
    assert.match(infoPop.innerHTML, /1\.5× damage \(all weapons\)/);

    // 4. closePanelPopovers() (used by Escape and outside click) closes it cleanly.
    assert.equal(closePanelPopovers(), true);
    assert.equal(panel.children.length, 0);
    assert.equal(closePanelPopovers(), false);
  } finally {
    globalThis.document = prevDoc;
  }
});
