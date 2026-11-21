// What each shop sells, what it charges, and how the compact Shop screen groups
// entries. A shop is a list of stock rows; each row names either a regular item
// (`data/items.js`, default `kind: "item"`) or a ship hull (`data/ships.js`,
// `kind: "ship"`):
//
//   n      the shop's name, shown as the screen's heading
//   d      the line of explanation under the heading
//   stock  the rows for sale, top to bottom in the order written here:
//            kind   OPTIONAL: `"ship"` for a hull in data/ships.js, omitted or
//                   `"item"` for an item/module/consumable/ore/loot in data/items.js.
//                   Bought items go to this station's inventory; bought ships go
//                   to this station's Outfitting hangar (never the Inventory grid).
//            id     item id (data/items.js) or hull id (data/ships.js)
//            price  credits for one
//            n, d   how the row is sold: its name and its description. Kept here
//                   so a trader can word or price its own stock independently.
//            max    OPTIONAL. The most this shop has of the row. Leave it out
//                   and the shop never runs out (that is how Meridian works).
//            own    OPTIONAL. `false` hides the "You own N" count on the row.
//
// **Stock is not saved yet.** Finite row counts live in session state
// (`state.shops`, `shopStock()` / `setShopStock()` in sim/economy.js).
//
// `SHOP_GROUPS` drives the compact collapsible one-line Shop tree. Under
// `modules`, `shopModuleSubgroups()` walks `MODULE_GROUPS` (data/outfitting.js)
// so a new module group appears automatically. Ores and loot are shown even when
// a station has none in stock, ready for future traders that sell them.
// See docs/HOW_TO_ADD.md recipe 4.

import { SHIPS, isShipType } from "./ships.js";
import { MODULE_GROUPS } from "./outfitting.js";
import { MODULES } from "./modules.js";
import { isModule, itemCat } from "./items.js";

/** Top-level one-line collapsible groups in the compact Shop tab. */
export const SHOP_GROUPS = [
  { k: "ships", n: "Ships" },
  { k: "modules", n: "Modules", nested: true },
  { k: "consumables", n: "Consumables" },
  { k: "ores", n: "Ores" },
  { k: "loot", n: "Loot" },
];

/** Plural subgroup labels for `MODULE_GROUPS`; any new module group falls back to its own `n`. */
const MODULE_GROUP_SHOP_NAMES = {
  power: "Powerplants",
  cell: "Power cells",
  thruster: "Thrusters",
  shield: "Shield generators",
  primary: "Primary weapons",
  secondary: "Secondary weapons",
  hull: "Hulls",
};

/**
 * Optional collapsible sub-categories inside a module subgroup in the Shop tree.
 * Under `Primary weapons`, `Cannons`, `Missiles` and `Mining beams` each hold
 * their current and future module variants.
 */
export const MODULE_SUBCATEGORIES = {
  primary: [
    { k: "cannons", n: "Cannons", family: "cannon" },
    { k: "missiles", n: "Missiles", family: "missile" },
    { k: "mining", n: "Mining beams", family: "mining" },
  ],
};

/** All module subgroups in `MODULE_GROUPS` order, with any nested sub-categories. */
export const shopModuleSubgroups = () =>
  MODULE_GROUPS.map(g => {
    const subcats = MODULE_SUBCATEGORIES[g.k];
    return subcats
      ? { k: g.k, n: MODULE_GROUP_SHOP_NAMES[g.k] || g.n, subgroups: subcats.map(s => ({ k: s.k, n: s.n })) }
      : { k: g.k, n: MODULE_GROUP_SHOP_NAMES[g.k] || g.n };
  });

/** Canonical row kind (`"ship"` or `"item"`). */
export const shopRowKind = row => (row && row.kind === "ship" ? "ship" : "item");

/** Classify a shop row into `{ group, subgroup, subcat }` inside `SHOP_GROUPS`. */
export function shopGroupFor(row) {
  if (!row) return { group: "loot", subgroup: null, subcat: null };
  if (shopRowKind(row) === "ship") return { group: "ships", subgroup: null, subcat: null };
  const id = row.id;
  if (isModule(id) && MODULES[id]) {
    const mod = MODULES[id];
    const subgroup = mod.g;
    const subcats = MODULE_SUBCATEGORIES[subgroup] || [];
    const matched = row.subcat
      ? subcats.find(s => s.k === row.subcat)
      : subcats.find(s => s.family && mod.weaponFamily === s.family);
    return { group: "modules", subgroup, subcat: matched ? matched.k : null };
  }
  const cat = itemCat(id);
  if (cat === "ore") return { group: "ores", subgroup: null, subcat: null };
  if (cat === "consumable" || cat === "ammo") return { group: "consumables", subgroup: null, subcat: null };
  return { group: "loot", subgroup: null, subcat: null };
}

export const SHOPS = {
  // Korr Flight Academy's stores. Deliberately empty: an act owns its challenge,
  // so the pilot cannot buy their way through the flight academy.
  school: {
    n: "Korr Flight Academy stores",
    d: "The school does not sell to cadets on a live exercise. Fly what you were given.",
    stock: [],
  },
  meridian: {
    n: "Shop",
    d:
      "Click a group to browse. Items go to this station's Inventory; bought ships go to this station's Hangar. Right-click a ship for details.",
    stock: [
      // Ships: stored in this station's Outfitting hangar, never as cargo items.
      {
        kind: "ship",
        id: "wasp",
        price: SHIPS.wasp.price,
        n: SHIPS.wasp.n,
        d: SHIPS.wasp.d,
      },
      {
        kind: "ship",
        id: "prospector",
        price: SHIPS.prospector.price,
        n: SHIPS.prospector.n,
        d: SHIPS.prospector.d,
      },
      {
        kind: "ship",
        id: "bulwark",
        price: SHIPS.bulwark.price,
        n: SHIPS.bulwark.n,
        d: SHIPS.bulwark.d,
      },
      {
        kind: "ship",
        id: "testship",
        price: SHIPS.testship.price,
        n: SHIPS.testship.n,
        d: SHIPS.testship.d,
      },
      // Modules: grouped automatically under their module subgroup.
      {
        id: "beam_basic",
        price: 900,
        n: "Basic mining beam",
        d: "Primary. Cuts ore from asteroids. Fit it in a primary bay, then press 2 in flight.",
      },
      {
        id: "missile_basic",
        price: 1500,
        n: "Basic missiles",
        d: "Secondary. Lock a hostile inside the dashed ring to guide the missile, or fire unguided. 8 damage, a 12-missile stock, 4 seconds between launches. Includes 8 missiles.",
      },
      // The six standard parts, one credit each: a pilot who takes a powerplant
      // or a hull off a ship (or loses one with the ship) can always buy it back.
      {
        id: "power_basic",
        price: 1,
        own: false,
        n: "Basic powerplant",
        d: "Power. Standard reactor: 10 MJ/s for the whole ship.",
      },
      {
        id: "cell_basic",
        price: 1,
        own: false,
        n: "Basic power cell",
        d: "Power. Standard storage bank: holds 100 MJ.",
      },
      {
        id: "thruster_basic",
        price: 1,
        own: false,
        n: "Basic thrusters",
        d: "Thrusters. The reference drive: 150 m/s and 69 deg/s, with a boost tank.",
      },
      {
        id: "shield_basic",
        price: 1,
        own: false,
        n: "Basic shields",
        d: "Shields. Standard deflectors: 10 Shield HP, one a second back after a 4-second lull.",
      },
      {
        id: "cannon_basic",
        price: 1,
        own: false,
        n: "Basic cannons",
        d: "Primary. Standard autocannons. Twin-linked, one damage a shot, three a second each.",
      },
      {
        id: "hull_basic",
        price: 1,
        own: false,
        n: "Basic hull",
        d: "Hull. Standard armour plating: 10 Hull HP.",
      },
      // Step 14: the first rift. Ten credits, one use — right-click it in the ship's own inventory
      // (press I in space) and choose Use to open it where you are.
      {
        id: "rift_basic",
        price: 10,
        n: "Basic rift",
        d: "Consumable. Opens a rift where you fly it, at least 1 km clear of any station, asteroid field or planet and 150 m clear of any single rock. Inside: hardened guardians, rich debris, and a locked cache that opens only when they are all destroyed — the way out stays sealed until then. The rift collapses 20 minutes after you enter, with you in it. One use: move it to a ship, press I in space, right-click it and choose Use.",
      },
    ],
  },
};

/** Every shop id, in the order written above. */
export const SHOP_IDS = Object.keys(SHOPS);

/** What `shopDef()` returns for an id that is not in SHOPS. */
// The shop an unknown id falls back to. Named, not "whichever is first": a shop
// with nothing on its shelves (Korr Flight Academy) must never become everyone's
// fallback just because it was written above the others.
export const DEFAULT_SHOP = "meridian";

export const isShop = id => Object.prototype.hasOwnProperty.call(SHOPS, id);

/** A shop's definition, or Meridian's when the id is unknown (a screen never blanks). */
export const shopDef = id => (isShop(id) ? SHOPS[id] : SHOPS[DEFAULT_SHOP]);

/**
 * The row a shop sells `id` under, or null when this shop does not sell it.
 * Pass `kind` (`"ship"` or `"item"`) to restrict the lookup to that row kind.
 */
export const shopRow = (shopId, id, kind = null) =>
  (shopDef(shopId).stock || []).find(
    r => r.id === id && (!kind || shopRowKind(r) === kind)
  ) || null;

/** True when `row` points to a real ship hull (`kind: "ship"`) in `SHIPS`. */
export const isShipRow = row => shopRowKind(row) === "ship" && isShipType(row.id);
