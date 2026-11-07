# Tallow Reach: roadmap and status

> **The living plan.** Where we are, what is next, what is waiting. Any AI that finishes a step
> **ticks it here** (and adds the date). The game being built is in [VISION.md](VISION.md); how the
> code must change is in [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md); the detail of every step
> and its prompt is in [REFACTOR_PLAN.md](REFACTOR_PLAN.md); the current state of the game is in
> [HANDOFF.md](HANDOFF.md).

**Current position:** Milestone A is under way. **Steps 0 and 1 are done** (2026-11-07). **Step 2
(seeded randomness) is built and tested (108 tests green)** — waiting for the owner's playtest before
it is ticked. **Next: Step 3, loot tables.**

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
| 2 | Seeded randomness everywhere | A | [ ] |
| 3 | Loot tables | A | [ ] |
| 4 | Item registry and generic inventory (save v12) | A | [ ] |
| 5 | Shops and prices from data | A | [ ] |
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
Not before step 5, or the work will have to be redone.

- **More enemy types** (different Hull HP, speed, damage, shields, scale, colour, loot table).
  Factions beyond pirates.
- **More ores, salvage and trade goods**; asteroid types with different ore mixes.
- **Module tiers** (basic, then Mk II, Mk III...) for every group: power, thrusters, shields, hull,
  cannons, beam, missiles. Different weapon kinds (lasers, flak, torpedoes) once the pattern holds.
- **Real hull differences** (speed/turn/shield/bay bonuses as module data or multipliers; today every
  hull is identical apart from the hold). The settled flight feel of the Wasp must not change.
- **More ships**, with their own bay layouts.
- **Paints** for the empty Appearance bays.
- **Shop stock** and prices; a second kind of trader.

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
  side (rocks, 60 s of raiders, 40 loot rolls): identical.
