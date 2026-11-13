# Recipe 6: A new enemy type

> One of the step-by-step recipes indexed in [HOW_TO_ADD.md](../HOW_TO_ADD.md). Read the checklist there first.
> Kind of work: data only, plus at most one behaviour function.


An enemy is an entry in `src/data/enemies.js`. The sim (`sim/ai.js`) spawns it with
`spawnEnemy(id, pos)` and runs the behaviour its `ai` field names. Since refactor step 7a a hostile
is **plain data** (`sim/enemy.js`), and `render/views.js` builds its model from the def's `col` and
`scale` (`mkShip(col, scale, true)` in `render/models.js`). **You never write mesh code for an
enemy**: a new type is a data entry, and it is drawn automatically.

1. Copy the `raider` entry in `src/data/enemies.js` and change what you want: `n` name,
   `pl` plural name (used in contract wording), `hp` Hull HP, `col` colour, `scale` size,
   `f` faction, `spdFar`/`spdNear`/`spdOrbit`/`circleAt` how it closes and circles, the ranges,
   `fireDelay`/`fireGap`/`dmg`/`bspd` for its gun, `spawnDist` how far away it appears.
2. Give it a **new** id (the key). `npm test` (`tests/content.test.mjs`) fails if a field is
   missing or its `f` is not a faction in `src/data/factions.js`.
3. Make it appear. Today the spawner at the bottom of `updateEnemies` (`sim/ai.js`) brings in the
   enemy a hunt contract names (`e` in `src/data/contracts.js`) and wandering raiders. Sector
   encounter tables (refactor step 12) will place enemies by data; until then, spawning a new type
   means a line in that spawner.
4. A **new kind of behaviour** (not just new numbers) is `AI_BEHAVIOURS` in `sim/ai.js`: one
   function `(e, def, toTarget, dist, dt)` that moves `e`, then name it in the def's `ai` field.
   The raider uses `chase`. Move an enemy with `enemyPos(e)` for its position and `turnEnemy(e,
   target, k)` to point it — never a mesh: an enemy has none (step 7a).
5. What it **drops** is its `loot` field: a table id from `src/data/loot.js`. See recipe 18.
5. A new faction is one entry in `src/data/factions.js` (`n` name, `d` description).
6. Test it: `tests/enemies.test.mjs` spawns enemies headlessly (`tests/headless.mjs` runs sim code
   with the screen and sound stubbed out), and `tests/headless-sim.test.mjs` flies one for 600
   ticks. Copy either test to check a second type quickly.
