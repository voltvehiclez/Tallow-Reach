# Tallow Reach: roadmap and status

> **The living plan.** Where we are, what is next, what is waiting. Any AI that finishes a step
> **ticks it here** (and adds the date). The game being built is in [VISION.md](VISION.md); how the
> code must change is in [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md); the detail of every step
> and its prompt is in [REFACTOR_PLAN.md](REFACTOR_PLAN.md); the current state of the game is in
> [HANDOFF.md](HANDOFF.md).

**Current position:** Milestone A is under way. **Steps 0, 1, 2 and 3 are done** (2026-11-07).
**Steps 4 and 5** — the item catalogue with one inventory per place (save v12), and shops and
prices from data — are **built and tested (131 green)**, waiting for the owner's playtest before
they are ticked: `TESTING-INVENTORY.md` (section 8, loading an old save, is the new part there) and
the new `TESTING-SHOPS.md`. The owner's answers so far: found modules do **not** get random stats
yet, so a stock stays a plain count per item; and Meridian also sells the **six standard parts for
1 cr each** (a visible change the owner asked for at step 5), with the beam at 900 cr and the
missile pod at 1500 cr unchanged. The old "Autocannons — Owned" line was removed after the owner's
first look at the build: it listed the same part twice (the module is Basic cannons). Shop stock can be **limited** (`max` on a row) but no row uses it
yet, and nothing restocks: `setShopStock()` is the hook, waiting for the owner to ask for the timers.
**Next: Step 6, the sim stops using sound and the keyboard** — and the owner is free to add data-only
content meanwhile (Milestone A is reached in everything but the tick).

## The order of work

1. **Refactor steps 1 to 15** ([REFACTOR_PLAN.md](REFACTOR_PLAN.md)): make the code ready to grow.
   Add content in parallel once Milestone A is reached.
2. **Open world content** (the bulk of the game), once Milestone C is reached.
3. **Campaign** (10+ missions), once Milestone D is reached. Per VISION.md it is written *after* the
   open world works.
4. **Multiplayer** (step 16). Designed for from step 6 on; built last.

## Step status

Tick with the date when the game plays identically, `npm test` is green and the owner has played it.

| Step | What | Milestone | Status |
| --- | --- | --- | --- |
| 0 | Backup, `npm test`, play TESTING-BASELINE.md once | start | [x] 2026-11-07 |
| 1 | Enemy registry (`data/enemies.js`, `enemy-killed` event) | A | [x] 2026-11-07 |
| 2 | Seeded randomness everywhere | A | [x] 2026-11-07 |
| 3 | Loot tables | A | [x] 2026-11-07 |
| 4 | Item registry and generic inventory (save v12) | A | [ ] built, tested; waiting for playtest |
| 5 | Shops and prices from data | A | [ ] built, tested; waiting for playtest |
| 6 | Sim stops using sound and keyboard (6a sound, 6b input) | B | [ ] |
| 7 | Entities are data, meshes are views (7a enemies, 7b projectiles/crates/FX, 7c rocks/ship) | B | [ ] |
| 8 | Fixed time step and a list of players | B | [ ] |
| 9 | Split the save: profile and world (save v13) | B | [ ] |
| 10 | Sector definitions, current sector saved (save v14) | C | [ ] |
| 11 | Galaxy (100+ sectors) and starmap screen (save v15) | C | [ ] |
| 12 | Encounters, sector templates, sector memory (save v16) | C | [ ] |
| 13 | Mission framework; contracts rebuilt on it (save v17) | D | [ ] |
| 14 | Instanced sectors and wormholes | D | [ ] |
| 15 | Campaign scaffolding (save v18) | D | [ ] |
| 16 | Multiplayer (plan written when reached) | | [ ] |

Save version numbers above are the plan. If a step needs a different one, the AI changes this table.

## Content you can add now (after Milestone A: data only)

Do these as ordinary feature requests (use the feature template in [AI_PROMPTS.md](AI_PROMPTS.md)).
Steps 4 and 5 are built, so these no longer wait for anything: modules, items, loot and shop stock
are all data now (recipes 2, 4, 16 and 17). They are listed below the step table for that reason.

- **More enemy types** (different Hull HP, speed, damage, shields, scale, colour, loot table).
  Factions beyond pirates.
- **More ores, salvage and trade goods**; asteroid types with different ore mixes.
- **Module tiers** (basic, then Mk II, Mk III...) for every group: power, thrusters, shields, hull,
  cannons, beam, missiles. Different weapon kinds (lasers, flak, torpedoes) once the pattern holds.
- **Real hull differences** (speed/turn/shield/bay bonuses as module data or multipliers; today every
  hull is identical apart from the hold). The settled flight feel of the Wasp must not change.
- **More ships**, with their own bay layouts.
- **Paints** for the empty Appearance bays.
- **Shop stock** and prices (a row in `data/shops.js`, recipe 4); a second kind of trader (a new
  `SHOPS` entry — data only, and the first real use of a limited `max` row).

## Content you can add after Milestone C (world data)

- **Sector templates** (asteroid belt, derelict graveyard, pirate den, nebula, trade lane, ...).
- **Encounters** (patrols, ambushes, traders, distress calls, caches, hazards).
- **Hand-made special sectors** (a hub, a boss sector).
- **Wormhole instance templates** (the hard, high-reward content).

## Campaign (after Milestone D)

- At least 10 missions, one file each in `src/data/campaign/`, ordered by `index.js`.
- Start: new game begins in the campaign. End: player becomes a free agent in the open world.
- Replay any completed mission in any order for modest rewards that carry over.
- The AI writing the campaign needs story notes from the owner (add them to VISION.md or a
  `docs/STORY.md`, not into chat only).

## Parking lot (not scheduled; from earlier notes)

- Warp: should enemies keep shooting during the charge, or does a warp grant invulnerability?
  (design decision, undecided).
- Salvage crates are abandoned when you warp out. (Will be handled by sector memory in step 12.)
- Mute state is not saved.
- Inventory is still "untested in the real game" per HANDOFF.md until the owner has played it.

## Log

- 2026-11-07: Vision, target architecture, roadmap and refactor plan written (docs only).
- 2026-11-07: Step 1 (enemy registry) built: enemies are entries in `src/data/enemies.js`, factions in
  `src/data/factions.js`, kills emit `enemy-killed { def, faction }`, plus a headless sim test harness
  (`tests/headless.mjs`). 101 tests green; save version unchanged.
- 2026-11-07: Steps 0 and 1 ticked after the owner played the built game in this version.
- 2026-11-07: Step 2 (seeded randomness) built: `makeRng` added, the six `Math.random()` rolls in the
  sim replaced with `random()`, and `tests/rng.test.mjs` guards it. Old and new code compared side by
  side (rocks, 60 s of raiders, 40 loot rolls): identical. Ticked after the owner's playtest.
- 2026-11-07: Step 3 (loot tables) built: `data/loot.js` + pure `sim/loot.js`, raider drops and the
  asteroid ore mix are data, a crate carries the item it holds. 118 tests green; save unchanged.
  Compared with `main` before the step: 50,000 rocks identical, 200,000 kills at the same odds.
- 2026-11-07: Step 3 ticked after the owner played the loot build and accepted it (merged to `main`).
- 2026-11-07: Step 4 (item catalogue, one inventory per place) built: `ITEMS` in `data/items.js` with
  a category, value, volume and stack rule, and an entry for every module that points at its stats in
  `data/modules.js`; a place is now `{ itemId: count }` (save **v12**, converting v11 and older on
  load, pinned by a real v11 save in `tests/saves/`). 121 tests green. Compared with the previous
  commit: a 29-step scripted session (buy, refuse, move, fill a hold, fit, unequip, buy and switch
  ships, store, load, sell) gave identical credits, stocks, m³ and fitted bays after every step, and
  the Inventory, Shop and Base tabs rendered identical HTML. This replace the first attempt at
  step 4, which was lost when its branch was deleted before it reached `main`.
- 2026-11-07: Step 5 (shops and prices from data) built: `data/shops.js` holds `SHOPS`, one generic
  `buyItem(shopId, itemId, qty)` replaces `buyWeapon`, the Shop tab draws `shopList()`, and the 8
  starter missiles are the missile module's `ammo`. The owner also asked for the six standard parts
  to go on sale at 1 cr each, so the Shop gained six rows (the beam and missiles are unchanged).
  Limited stock (`max`) works and `setShopStock()` is ready for restock timers later; nothing is
  saved, so save version stays 12. 131 tests green. Compared with the previous commit by a 19-step
  scripted outpost session: identical credits, stocks, holds, loadouts and messages, and six of the
  seven tabs render byte-identical HTML.
- 2026-11-07: Shop fix after the owner's look at the step 5 build: the "Autocannons — Owned" line is
  gone, so the Shop lists the cannons once, as **Basic cannons** (`src/data/shops.js` lost its `kit`
  list, the screen stopped drawing it). There is one cannon module today; more will be stock rows
  when they exist. Nothing else about buying changed.
