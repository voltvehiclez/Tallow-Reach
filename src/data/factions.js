// Factions: who a hostile belongs to. Enemies name one with their `f` field, and
// it travels with the `enemy-killed` event, so contracts, reputation and (later)
// sector encounter tables can tell one group from another without knowing the
// enemy types. Add an entry here before naming it from an enemy.
//
//   n   name shown to the player
//   d   one-line description

export const FACTIONS = {
  pirates: {
    n: "Pirates",
    d: "Raiders who prey on the shipping around Meridian.",
  },
  // Step 14: what holds a collapsed pocket shut. Its own group, because it is not a group the
  // pilot can hail, trade with or be blamed for offending — and a contract that asks for pirates
  // must not be paid by a rift's guardians (owner bug report 2026-11-14).
  rift: {
    n: "Rift Guardians",
    d: "Whatever keeps a broken pocket closed. It does not hail, trade or run.",
  },
};

/** What an unknown faction id falls back to. */
export const DEFAULT_FACTION = "pirates";

/** The entry for `id`, falling back to the default faction. */
export const factionAt = id => FACTIONS[id] || FACTIONS[DEFAULT_FACTION];
