// Using an item (refactor step 14).
//
// Right-clicking a tile in the ship's own inventory (press **I** in space) offers **Use** beside
// Discard for anything whose entry in `data/items.js` has a `use` field. What using it does is one
// entry in `USE_ACTIONS` below, so a new consumable is a line of data plus — only if it does
// something nobody has asked for before — one handler here. The card, the menu and the inventory
// grid never change, and no system imports another to get at it.
//
// A handler is given `{ id, where, count, player, profile }` and returns either
//
//   { text }   it worked: one unit is consumed and `text` is shown, or
//   "sentence" it did not: nothing is consumed and the sentence is shown word for word.
//
// So a refusal can never be swallowed and an item is never spent on nothing (no silent failures).

import { state, localPlayer, profileOf } from "../state/state.js";
import { isItem, itemName, itemUse, itemRift } from "../data/items.js";
import { countOf, takeItem } from "./inventory.js";
import { openRift } from "./instances.js";

/** What an item's `use` field can ask for. Keyed by the id in `data/items.js`. */
export const USE_ACTIONS = {
  // Open a rift where the ship is. Which rift it opens, how much clear space it needs and what is
  // on the other side are all data (`data/items.js` `rift`, then `data/instances.js`).
  "spawn-rift": ({ id, player }) => {
    const riftId = itemRift(id);
    if (!riftId) return `${itemName(id)} opens nothing.`;
    const rift = openRift(riftId, player);
    if (typeof rift === "string") return rift;         // the clearance refusal, word for word
    if (!rift) return `${itemName(id)} could not be opened here.`;
    return { text: `A ${rift.dest} opens ahead. Fly to it and press R.` };
  },
};

/** May this item be used at all? The flight card uses it to decide whether to offer **Use**. */
export const canUse = id =>
  isItem(id) && !!itemUse(id) && typeof USE_ACTIONS[itemUse(id)] === "function";

/**
 * Use one of `id` from `where` (a ship id, or the station). Runs the item's declared action,
 * consumes exactly one unit and only when it worked, and always returns a sentence for the pilot.
 */
export function useItem(id, where = null, player = localPlayer(), profile = null) {
  const P = player || localPlayer();
  const prof = profile || profileOf(P) || state.profile;
  if (!isItem(id)) return "Unknown item.";
  const action = itemUse(id);
  if (!action) return `${itemName(id)} cannot be used.`;
  const handler = USE_ACTIONS[action];
  if (typeof handler !== "function") return `${itemName(id)} cannot be used yet.`;
  const hold = where || prof.ship;
  const count = countOf(hold, id, prof);
  if (!(count > 0)) return `There is no ${itemName(id)} to use.`;

  const result = handler({ id, where: hold, count, player: P, profile: prof });
  if (typeof result === "string") return result;
  if (!result || result.ok === false) return `${itemName(id)} cannot be used here.`;
  takeItem(hold, id, 1, prof);
  return result.text || `Used ${itemName(id)}.`;
}
