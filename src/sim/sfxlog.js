// One pocket's transient sfx log — the sounds a *nearby pilot* would hear, not the pocket's
// bookkeeping. The host's entities broadcast drains it; the guest gates by its own ears.
//
//   efires  a list of enemy ids that fired since the last broadcast (empty = nobody fired).
//           A list, not a counter, because hearing needs the distance to the shooter.
//   picks   a monotonic count of crates collected in the pocket (u16 on the wire).
import { placeWorld } from "../state/state.js";

const bags = new Map();

const bagOf = placeId => {
  let bag = bags.get(placeId);
  if (!bag) { bag = { efires: [], picks: 0 }; bags.set(placeId, bag); }
  return bag;
};

/** Record that an enemy in `placeId` fired this tick. */
export function efireLog(placeId, id) {
  const bag = bagOf(placeId);
  if (bag.efires.length < 16) bag.efires.push(Math.floor(Number(id) || 0));
}

/** Record that a crate was collected in `placeId`. */
export function pickupLog(placeId) {
  bagOf(placeId).picks += 1;
}

/** What the packet carries: a cumulative counter, and whoever fired since last time. */
export function pocketPickCount(placeId) {
  return bagOf(placeId).picks;
}
export function drainEFires(placeId) {
  const bag = bagOf(placeId);
  const out = bag.efires.filter(id => id > 0);
  bag.efires = [];
  return out.slice(0, 8);
}
