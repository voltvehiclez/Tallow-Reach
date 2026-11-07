# Changelog

Newest first. Every AI session adds a short entry when it changes the project, so the
next assistant (which has no memory of earlier chats) can see what happened and why.

Entry format: date, a one-line title, then what changed, which files, and anything
the next person must know (save version, rebuild needed, known issues).

**How this file stays a useful size**

- This file holds the newest entries in full, then the **Older entries** index at the bottom:
  one line for every entry that has been moved to [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md).
  Read the entries here and the index; open the archive only when the index shows something
  relevant to the task (the archive has the full text, nothing was shortened).
- **Rule:** when this file holds more than 15 full entries, move the oldest ones to the top of
  the archive (word for word, newest first) until 10 remain, and add one index line for each
  entry moved, at the top of the index. Do this in the same change that adds the new entry.
- Never delete an entry. History is only ever moved.

---

## 2026-11-07: Refactor step 1 — enemies are data (enemy registry, `enemy-killed` event)

- **Why:** the Newbie Raider's numbers were written inside `sim/ai.js`, so a second enemy meant
  editing game code. Now an enemy is one entry in `src/data/enemies.js`, which is the first piece of
  Milestone A (content becomes data-only additions).
- **New:** `src/data/enemies.js` (`ENEMIES`, the `raider` entry with exactly today's numbers: name,
  plural name, 10 Hull HP, colour, scale, faction, `chase` behaviour, close/near/orbit speeds,
  circling distance, fire/lost/hear ranges, first-shot delay, shot gap, 1 damage, 520 m/s bolt, spawn
  distance; plus `DEFAULT_ENEMY` and `enemyDef()`), `src/data/factions.js` (`FACTIONS`: `pirates`),
  `tests/headless.mjs` (runs `src/sim/` code in a test with the screen and sound stubbed out — no new
  package, it uses the esbuild the build already needs), `tests/enemies.test.mjs`, `TESTING-ENEMIES.md`.
- **Changed:** `src/sim/ai.js` — `spawnPirate(p)` is now `spawnEnemy(id, pos)`; the model, record
  (`def`, `n`, `f`, `hp`, `mx`, fire timer) and the shot all read the def, and the behaviour comes
  from `AI_BEHAVIOURS` (one entry, `chase`). `src/sim/combat.js` emits
  `enemy-killed { def, faction }`; `src/util/events.js` lists it; `src/sim/contracts.js` counts only
  the enemy a hunt contract names; `src/data/contracts.js` stores that id (`e`) and builds the wording
  from the def's plural name, so it still reads "Destroy 3 pirate raiders".
- **Nothing plays differently.** The same numbers were copied, not retuned, and the old and new
  `sim/ai.js` were run side by side for 60 simulated seconds in three situations (a lone raider, the
  wandering spawner, a hunt contract): enemy positions, Hull HP, fire timers and every bullet's
  position and damage matched step for step. Hunt contracts still count raiders only. Contract text,
  rewards, the lock marker ("Newbie Raider 100%") and loot are unchanged.
- **Saves:** no change; save version still 11, no migration. A hunt contract saved by an older
  version has no enemy id, so it keeps its old wording and still counts any hostile.
- **Tests:** 101 pass (94 before; two `content.test.mjs` source-guards were replaced by real
  enemy-table checks, and six headless enemy tests are new).
- **Roadmap:** steps 0 and 1 ticked 2026-11-07 (the owner played this build; old save with a
  Prospector loaded unchanged).
- Files: `src/data/enemies.js`, `src/data/factions.js`, `src/sim/ai.js`, `src/sim/combat.js`,
  `src/sim/contracts.js`, `src/data/contracts.js`, `src/util/events.js`, `tests/headless.mjs`,
  `tests/enemies.test.mjs`, `tests/content.test.mjs`, `TESTING-ENEMIES.md`, `src/data/README.md`,
  `src/sim/README.md`, `docs/ARCHITECTURE.md`, `docs/TARGET_ARCHITECTURE.md` (two closed debts
  removed), `docs/HOW_TO_ADD.md` (recipe 6 rewritten), `docs/HANDOFF.md`, this changelog.
  Run `npm run build` and `npm test`.

## 2026-11-07: Vision, target architecture, roadmap and refactor plan (docs only, no code change)

- **Why:** the owner's plan is much bigger than the code's shape (100+ sector starmap, wormhole
  instances, a story campaign, host-run co-op) and several different AI assistants will work on it.
  The docs now say what the game is, where it is heading, in what order, and how to get there safely.
- **New:** `docs/VISION.md` (scope, design pillars, open design questions with defaults),
  `docs/TARGET_ARCHITECTURE.md` (eight principles, data model, save split, multiplayer model, a
  "Debt today" table with evidence), `docs/ROADMAP.md` (status of every step, content to add and when),
  `docs/REFACTOR_PLAN.md` (15 behaviour-preserving steps in 4 milestones, each with goal, work, "done
  when", save version and how the owner runs it), `TESTING-BASELINE.md` (a 10-minute whole-game
  click-through), root `AGENTS.md` and `CLAUDE.md` (pointers for tools that read them).
- **Changed:** `docs/HANDOFF.md` (big picture, reading order, "keep the structure" now means keep
  folders and conventions, restructure only through numbered steps), `docs/ARCHITECTURE.md` (reading
  order, the `sim/` imports `render/`+`core/` exception stated honestly), `docs/AI_PROMPTS.md`
  (model-agnostic starter prompt, refactor-step prompt, content prompt, using several AIs),
  `docs/HOW_TO_ADD.md` (note on which recipes change), `README.md` (links).
- **Housekeeping:** this file had 24 full entries (the limit is 15). The 15 oldest were moved
  word for word to `CHANGELOG_ARCHIVE.md` and indexed below; 10 plus this one remain.
- No source, data, test or save change; save version still 11. No rebuild needed.

## 2026-11-07: Inventory Sell quantity uses a game-styled popover

- Replaced the browser-owned quantity prompt with a small in-game box positioned beside the
  selected inventory tile. It contains the quantity field (prefilled with the stack size),
  inline validation, and Sell/Cancel buttons. No other inventory layout changed.
- Files: `src/ui/menu.js`, `src/styles.css`, `tests/inventory.test.mjs`, this changelog.
  Save version unchanged. Run `npm run build` and `npm test`.

## 2026-11-07: Inventory Sell asks how many units to sell

- Choosing Sell on a cargo stack now opens a quantity prompt, prefilled with the whole stack
  count. Enter any whole number from 1 to the stack size to sell that partial or full amount;
  cancelling leaves the stack unchanged. Existing prices and refinery bonus still apply.
- Files: `src/ui/menu.js`, `src/ui/screens.js`, `src/sim/economy.js`, `src/ui/README.md`,
  `tests/inventory.test.mjs`, this changelog. Save version unchanged. Run `npm run build` and `npm test`.

## 2026-11-07: Inventory grids use five narrower, shorter slots per row

- Set both inventory grids to exactly five columns, with narrower tiles and a 68px tile/row
  height. The 25-slot minimum gives five rows by default; each additional item beyond 25
  naturally adds a row. The three-row scroll viewport and independent scrolling are retained.
- Files: `src/styles.css`, `tests/inventory.test.mjs`, this changelog. Save data unchanged.
  Run `npm run build` and `npm test`.

## 2026-11-07: Inventory grids keep their size when empty, and moves no longer show status text

- Each hold now always renders a 5-by-5 slot field with a fixed three-row viewport, so empty
  slots preserve the inventory window size and scrolling can be tested even with fewer items.
  Station and ship grids scroll independently. Moving items clears/suppresses the "Moved ..."
  status message; other actions are unchanged.
- Files: `src/ui/screens.js`, `src/ui/menu.js`, `src/styles.css`, `src/ui/README.md`,
  `tests/inventory.test.mjs`, this changelog. Save version unchanged. Run `npm run build` and `npm test`.

## 2026-11-07: Station and ship item grids scroll independently after three rows

- Both inventory grids now show up to three full rows at once and scroll within their own
  window when they contain more. This keeps the station and selected ship hold independently
  browsable without changing the surrounding Inventory layout or other screens.
- Files: `src/styles.css`, `src/ui/README.md`, `tests/inventory.test.mjs`, this changelog.
  Save version unchanged. Run `npm run build` and `npm test`.

## 2026-11-07: Right-click inventory menu can sell a cargo stack

- Right-click an inventory tile to open an extensible context menu. Its first action is Sell,
  which sells that cargo type's whole stack from the station or selected ship hold using the
  existing item prices and refinery bonus. Modules show Sell disabled because they have no
  existing resale value. No inventory/save format changes.
- Files: `src/ui/screens.js`, `src/ui/menu.js`, `src/styles.css`, `src/sim/economy.js`,
  `src/ui/README.md`, `tests/inventory.test.mjs`, this changelog. Run `npm run build` and `npm test`.

## 2026-11-07: Inventory tile text restored to the more readable size

- Raised item names from 11px to 12px and volume labels from 9px to 10px, restoring their
  previous readable sizes while keeping the more compact tile layout.
- Files: `src/styles.css`, this changelog. Run `npm run build` and `npm test`.

## 2026-11-07: Inventory item tiles tightened to reduce empty space

- Reduced each tile's minimum height, padding, typography and spacing, and fit more columns
  across the panel. No inventory behavior or data changed.
- Files: `src/styles.css`, this changelog. Run `npm run build` and `npm test`.

## 2026-11-07: Inventory tiles move one item on click and a stack on Shift-click

- Removed the two small move buttons from every tile. Clicking a tile moves one item;
  Shift-clicking it moves the whole stack. Tiles are slightly shorter to fit more items.
  The inventory data and capacity rules are unchanged.
- Files: `src/ui/screens.js`, `src/ui/menu.js`, `src/styles.css`, `src/ui/README.md`,
  `tests/inventory.test.mjs`, this changelog. Save version unchanged. Run `npm run build` and `npm test`.

## Older entries (index; full text in [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md))

- 2026-11-07: Inventory contents displayed as a compact grid
- 2026-11-07: Lateral, vertical and reverse thrust increased to 60%
- 2026-11-07: Boost works from any throttle and press snaps throttle to full forward
- 2026-11-06: HANDOFF.md rewritten to match the project as it is now (docs only)
- 2026-11-06: Docs scale: old changelog entries move to an archive (docs only)
- 2026-11-06: Inventory — the station and every ship have room in m³, and you can buy more than one module
- 2026-11-06: Handoff note brought up to date (docs only)
- 2026-11-06: Repairs and missile restock moved into Outfitting
- 2026-11-06: Ship switcher above the 3D viewer; the berth count is gone
- 2026-11-06: Whole numbers in the top-left readouts; labels recoloured to match their bars
- 2026-11-06: Numbers on the shield and hull bars — and the units are "Shield HP" / "Hull HP" everywhere
- 2026-11-06: Asteroid collision damage scaled to the 10-point hull
- 2026-11-06: The hull is a module — "Basic hull", 10 hit points, no module fitted means none
- 2026-11-06: The missile launcher is a module — "Basic missiles", 8 damage, 12 cap, 4 s reload — and the beam shows its rate
- 2026-11-06: All hulls are the same ship apart from the hold — and the hold is measured in m³
- 2026-11-06: The beam bar moves under the mining hint, only while cutting — and an ore-secured chime
- 2026-11-06: Beam progress resets the moment contact is lost; beam bar in the HUD; module names in the UI
- 2026-11-06: The mining beam is a module — "Basic mining beam", one ore per 4 s of contact
- 2026-11-06: "Empty weapon slot" now covers an empty cannon slot too
- 2026-11-06: Keys 1 and 2 now cycle the primary slots; key 2 with no beam is the "Empty weapon slot"
- 2026-11-06: Pressing 2 with no mining beam fitted no longer shows a message
- 2026-11-06: Twin-linked bolts fire from the fixed nose hardpoints (one per side)
- 2026-11-06: Basic cannons fire two bolts per shot again (twin-linked barrels)
- 2026-11-06: Basic cannons are a module you can fit in either primary bay; raiders are Newbie Raiders with 10 hull
- 2026-11-06: The boost tank has numbers: 10 units, 2 a second out, 1 a second back
- 2026-11-06: Shield power made simple: a flat 2 MJ/s, and shields bleed when it is not there
- 2026-11-06: Shields cost power: 1 MJ/s up, 2 MJ/s while recharging
- 2026-11-06: Smaller shield numbers: 10 points, 1 a second, 1 damage a shot
- 2026-11-06: Shields are a module now; pirate cannons do 10 a shot
- 2026-11-06: Lighting the boost costs a flat 20 MJ; refilling the meter is free
- 2026-11-06: Thrusters use power, and a dry cell winds the speed down
- 2026-11-06: "Equip thrusters to move" warns you when a dead ship ignores the controls
- 2026-11-06: No thrusters means no movement, no turning and no boost
- 2026-11-06: Paint bays are clickable, and show an empty colour store
- 2026-11-06: Fix: the Appearance bays lost their boxes
- 2026-11-06: Basic thrusters, and every hull flies like the Wasp
- 2026-11-06: Click a bay to fit a module, or unequip one into storage
- 2026-11-06: Basic powerplant and power cell, with a power bar in flight
- 2026-11-06: Powerplant talks in MJ/s, not MW
- 2026-11-06: Appearance card under the Hull bay
- 2026-11-06: Outfitting screen with a 3D ship viewer
- 2026-11-05: The chase camera stops running away at speed
- 2026-11-05: Flight feels heavier: slower turn, weak side/reverse thrusters
- 2026-11-05: Warp lets the ship coast and unwind, instead of freezing it
- 2026-11-05: Fix: no rotation when warping
- 2026-11-05: Warp animation, warp sound, and a two-second warp
- 2026-11-05: Second sector, warp on M
- 2026-11-05: Project tidy for growth (no gameplay change)
- 2026-11-05: Pause menu and mute
- 0.2.0: Baseline
