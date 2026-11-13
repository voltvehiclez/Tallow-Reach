# Recipe 17: A better part: a new tier of module, on sale

> One of the step-by-step recipes indexed in [HOW_TO_ADD.md](../HOW_TO_ADD.md). Read the checklist there first.
> Kind of work: data only.


This was "a module shop" before refactor step 5. The shop exists now, so a better powerplant, a
second cannon or a new shield is one data file plus one shop row — no code.

1. **The part.** Add it to `MODULES` in `src/data/modules.js`, copying the basic entry and
   changing the numbers: same `g` (the bay group it fits), a new `vol`, `n`, `d`, and the stat
   that group uses (`mjps`, `mj`; thruster `spd`/`turn` and its power appetite; shield
   `sh`/`regen`/`delay`/`draw`/`drain`; hull `hp`; primary `dmg`/`rate`/`bspd`/`draw`/`barrels`;
   beam `period`/`range`/`draw`; secondary `dmg`/`cap`/`cd`, plus `ammo` if buying it should hand
   out missiles). A module may only carry the stats its group uses.
2. **The item.** Add `id: { cat: "module" }` to `ITEMS` in `src/data/items.js`. `npm test` names
   the module if you forget: a part you cannot carry is not a part.
3. **The sale.** Add a row to Meridian in `src/data/shops.js` (recipe 4). Add `max` if the shop
   should only have a few.
4. **Nothing else.** The picker lists it in the right bay automatically (`ui/screens.js`,
   `sim/fitting.js`), `moduleStat()` gives the one-line number in the bay, and the systems that
   read the module (`sim/power.js`, `drive.js`, `shield.js`, `hull.js`, `guns.js`) already read
   the fields.

`npm test` then checks the tables agree (`tests/content.test.mjs`) and the row is complete
(`tests/shops.test.mjs`). Anything a hull's combat or mining multiplier would scale is 1 on every
hull today: do not put per-hull bonuses on a part.
