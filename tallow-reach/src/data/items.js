// The item catalogue. Everything that can sit in a hold, in the station's
// storage or in a loot crate is an entry here, keyed by a short id: ore,
// salvage, spare modules, and later ammo, consumables and trade goods.
//
//   n     name shown in the screens
//   cat   category: one of ITEM_CATEGORIES
//   v     sell value in credits per unit (no `v` = cannot be sold)
//   vol   m³ one unit takes up (1 unless the entry says otherwise)
//   st    most that fit in one stack (no limit unless the entry says otherwise)
//
// A module's entry carries no numbers of its own: its name, volume and stats
// come from data/modules.js under the same id, so nothing is written twice.
// Every module must be listed here too — tests/content.test.mjs names the one
// that is missing — because the item catalogue is what a hold can carry.
//
// Adding an ore, a salvage good or a trade good is one line here and nowhere
// else. Read it through the helpers below rather than reaching into ITEMS.

import { MODULES } from "./modules.js";

export const ITEM_CATEGORIES = ["ore", "salvage", "module", "ammo", "consumable", "trade"];

export const ITEMS = {
  ferrite: { n: "Ferrite", cat: "ore", v: 10 },
  cobalt: { n: "Cobalt", cat: "ore", v: 24 },
  voidite: { n: "Voidite", cat: "ore", v: 60 },
  salv: { n: "Salvage", cat: "salvage", v: 70 },
  core: { n: "Reactor core", cat: "salvage", v: 350 },

  // Modules: the numbers live in data/modules.js under the same id.
  power_basic: { cat: "module" },
  cell_basic: { cat: "module" },
  thruster_basic: { cat: "module" },
  shield_basic: { cat: "module" },
  cannon_basic: { cat: "module" },
  beam_basic: { cat: "module" },
  hull_basic: { cat: "module" },
  missile_basic: { cat: "module" },
};

/** Every id, in catalogue order — the order the inventory lists things in. */
export const ITEM_IDS = Object.keys(ITEMS);

/** A place's contents: `{ itemId: count }`. A count of zero is never kept. */
export const newStock = () => ({});

export const isItem = id => Object.prototype.hasOwnProperty.call(ITEMS, id);

/** One of ITEM_CATEGORIES, or null for an unknown id. */
export const itemCat = id => (isItem(id) ? ITEMS[id].cat : null);

/** True for a module: a part that goes in a bay, not a stack of goods. */
export const isModule = id => itemCat(id) === "module";

/** Name for the screens. */
export function itemName(id) {
  if (!isItem(id)) return String(id);
  return isModule(id) ? MODULES[id].n : ITEMS[id].n;
}

/** m³ one unit takes up. A module's volume is part of its own stats. */
export function itemVol(id) {
  if (!isItem(id)) return 0;
  return isModule(id) ? MODULES[id].vol : ITEMS[id].vol || 1;
}

/** Credits one unit sells for; 0 means it cannot be sold. */
export const itemValue = id => (isItem(id) ? ITEMS[id].v || 0 : 0);

/** Can this be sold to the station? */
export const canSell = id => itemValue(id) > 0;

/** Most of `id` that fit in one stack (no limit unless the entry says `st`). */
export const itemStack = id => (isItem(id) ? ITEMS[id].st || Infinity : 0);
