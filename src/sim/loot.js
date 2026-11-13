// Rolling loot tables from data/loot.js.
//
// Pure: no screen, no sound, no state. It takes a random source, so a test can
// roll a table ten thousand times and count, and a seeded run repeats exactly.

import { LOOT_TABLES } from "../data/loot.js";
import { random } from "../util/rng.js";

/** Metres of scatter when a table entry does not say. */
const DEFAULT_SCATTER = 8;

/** A whole number in [lo, hi], inclusive, from `rng`. */
const countIn = (lo, hi, rng) => lo + Math.floor(rng() * (hi - lo + 1));

/**
 * Roll a "drops" table. Returns one entry per line that came up:
 * `{ item, count, scatter }`.
 *
 *   item     an id from data/items.js
 *   count    how many units of it
 *   scatter  metres to scatter each one around the drop point
 *
 * A line whose chance is 1 does not spend a die, so changing the odds of one line
 * cannot shift the rolls of the others. An unknown table gives nothing, so a typo
 * in an enemy def cannot break a kill.
 */
export function rollLoot(id, rng = random) {
  const table = LOOT_TABLES[id];
  if (!table || table.kind !== "drops") return [];

  const out = [];
  for (const e of table.entries) {
    const chance = e.w == null ? 1 : e.w;
    if (chance <= 0) continue;
    if (chance < 1 && rng() >= chance) continue;
    const [lo, hi] = e.c || [1, 1];
    out.push({ item: e.i, count: countIn(lo, hi, rng), scatter: e.j == null ? DEFAULT_SCATTER : e.j });
  }
  return out;
}

/**
 * Pick one entry from a "pick" table and return its item id (the ore a rock is
 * made of). Null for an unknown or empty table.
 */
export function pickLoot(id, rng = random) {
  const table = LOOT_TABLES[id];
  if (!table || !Array.isArray(table.entries) || table.entries.length === 0) return null;

  const total = table.entries.reduce((sum, e) => sum + (e.w == null ? 1 : e.w), 0);
  if (!(total > 0)) return null;

  const roll = rng();
  let edge = 0;
  for (const e of table.entries) {
    edge += (e.w == null ? 1 : e.w) / total;
    if (roll < edge) return e.i;
  }
  // Only reachable through floating-point rounding at the very top of the range.
  return table.entries[table.entries.length - 1].i;
}
