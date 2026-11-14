// Loot tables: what a kill drops, and what a rock is made of.
//
// These are content. The rules that roll them live in `src/sim/loot.js`; nothing
// about a drop is written in the sim any more, so adding a drop is an entry here.
//
// A table is one of two kinds:
//
//   kind: "drops"   every entry is rolled on its own. `w` is the chance of that
//                   entry (0 to 1, default 1 = always) and `c` is how many it
//                   gives. Used for what an enemy leaves behind.
//   kind: "pick"    exactly one entry is chosen, weighted by `w` (any positive
//                   number; the odds are that weight over the total). Used for
//                   the one thing a rock is made of.
//
// Entry keys (short, like the other data tables):
//   i   item id from data/items.js
//   c   [min, max] count, inclusive (drops only; default [1, 1])
//   w   chance (drops, 0 to 1) or weight (pick)
//   j   scatter in metres around the drop point (default 8; 0 = exactly there)
//
// `npm test` checks every item id here (tests/content.test.mjs) and the odds of
// every table (tests/loot.test.mjs, which rolls each one 10,000 times).

export const LOOT_TABLES = {
  // A killed pirate raider: one or two salvage crates (a 50/50 roll), and a 10%
  // chance of a reactor core dropped on the wreck itself.
  raider: {
    kind: "drops",
    entries: [
      { i: "salv", c: [1, 2], w: 1 },
      { i: "core", c: [1, 1], w: 0.1, j: 0 },
    ],
  },

  // What a rift's guardian leaves behind (step 14). It is not a pirate wreck with a cargo hold:
  // it is the pocket's own metal, so the rare ore the canister inside pays in also comes off the
  // wreck. The salvage and the core chance are the raider's, so giving the rift its own hostile
  // did not change what a run pays.
  riftguardian: {
    kind: "drops",
    entries: [
      { i: "salv", c: [1, 2], w: 1 },
      { i: "voidite", c: [1, 1], w: 0.25, j: 0 },
      { i: "core", c: [1, 1], w: 0.1, j: 0 },
    ],
  },

  // The deeper collapse pays better, the way its canister does.
  deepguardian: {
    kind: "drops",
    entries: [
      { i: "salv", c: [2, 3], w: 1 },
      { i: "voidite", c: [1, 2], w: 0.4, j: 0 },
      { i: "core", c: [1, 1], w: 0.2, j: 0 },
    ],
  },

  // A derelict is a larger, guaranteed salvage cache with a rarer core.
  derelict: {
    kind: "drops",
    entries: [
      { i: "salv", c: [2, 4], w: 1, j: 18 },
      { i: "core", c: [1, 1], w: 0.25, j: 0 },
    ],
  },

  // The ore a rock is made of: about six in ten ferrite, three in ten cobalt and
  // eight in a hundred voidite.
  asteroid: {
    kind: "pick",
    entries: [
      { i: "ferrite", w: 62 },
      { i: "cobalt", w: 30 },
      { i: "voidite", w: 8 },
    ],
  },

  // What a rift's rock is made of (step 14): the same ore, but the rare kind is
  // nearly three times as common. This is the "high reward" half of a rift.
  rift_rock: {
    kind: "pick",
    entries: [
      { i: "ferrite", w: 40 },
      { i: "cobalt", w: 38 },
      { i: "voidite", w: 22 },
    ],
  },

  // The locked cache at the heart of a guardian rift. It spills as ordinary
  // crates the pilot collects one by one, so a full hold leaves them floating
  // (nothing is ever added to a hold by itself).
  rift_cache: {
    kind: "drops",
    entries: [
      { i: "salv", c: [4, 6], w: 1, j: 26 },
      { i: "core", c: [1, 1], w: 0.5, j: 12 },
      { i: "voidite", c: [3, 5], w: 0.7, j: 20 },
    ],
  },

  // A deep rift pays roughly twice as much for a harder fight.
  rift_cache_deep: {
    kind: "drops",
    entries: [
      { i: "salv", c: [8, 12], w: 1, j: 34 },
      { i: "core", c: [1, 2], w: 0.85, j: 16 },
      { i: "voidite", c: [6, 10], w: 0.9, j: 26 },
    ],
  },
};

/** The table an enemy uses if its def names none. */
export const DEFAULT_LOOT = "raider";

/** The table `id`, or null when there is no such table. */
export const lootTable = id => LOOT_TABLES[id] || null;
