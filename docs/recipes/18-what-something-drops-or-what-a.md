# Recipe 18: What something drops, or what a rock is made of

> One of the step-by-step recipes indexed in [HOW_TO_ADD.md](../HOW_TO_ADD.md). Read the checklist there first.
> Kind of work: data only.


Loot is data (`src/data/loot.js`), rolled by the pure `src/sim/loot.js`. Nothing about a drop is
written in the game code.

A table is one of two kinds:

- **`kind: "drops"`** — every line is rolled on its own. `w` is the chance (0 to 1, default 1 =
  always), `c` is `[min, max]` how many, and `j` is how far the crate scatters (default 8 m, `0` =
  exactly on the wreck). Used for enemies.
- **`kind: "pick"`** — exactly one line is chosen, weighted by `w`. Used for the ore a rock is made
  of.

Steps:

1. Add or edit an entry in `LOOT_TABLES` in `src/data/loot.js`. Every `i` must be an item id from
   `src/data/items.js` (a new item first: recipe 2).
2. Point an enemy at it with `loot: "<table id>"` in `src/data/enemies.js`.
3. For a brand-new table used by something else (a crate in the field, an encounter), call
   `rollLoot("<table id>")` for drops or `pickLoot("<table id>")` for a single weighted pick. Both
   use the seeded random source, so a run repeats.
4. `npm test` checks every item id, every weight and the odds of every table (`tests/loot.test.mjs`
   rolls each table 10,000 times), so a typo or a missing item fails the tests, not the game.

Today: a killed raider drops one or two salvage crates (50/50) and a reactor core on one kill in
ten; a rock is about 62% ferrite, 30% cobalt, 8% voidite.
