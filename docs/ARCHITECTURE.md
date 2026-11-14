# Tallow Reach: code architecture

*Last checked: 2026-11-13.*

**Where to start:** read [HANDOFF.md](HANDOFF.md) first (it has a table of which docs to read for which task), then
[LESSONS.md](LESSONS.md). This file is the **index and the overview** of the code *as it is now*: layers, where things
live, the universal conventions, events, state and saves. The details per area are in `docs/architecture/` (see "Area
files" below), and the recipes for adding things are in [HOW_TO_ADD.md](HOW_TO_ADD.md). Where the code must go is in
[TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md). See "Keeping the docs scalable" at the end of this file.

## Running it

```
npm install          # once
npm run build        # writes game/tallow-reach.html (single file, works offline)
npm run watch        # rebuilds on every save
npm test             # unit tests: data and save layers, plus content checks
```

`tests/headless.mjs` runs gameplay code (`src/sim/`) in a test with the screen and the
speakers stubbed out, so a test can spawn an enemy and read the result without a browser.
It bundles with esbuild (already a dev dependency) and adds no package.

`game/tallow-reach.html` is **generated** from `src/`. Never edit it by hand. It only
changes when someone runs `npm run build`, so every change to `src/` should end with
a reminder to rebuild. It is self-contained (three.js is bundled in), so it still
runs when opened from disk.

## Layers

Dependencies only point downward. Lower layers never import higher ones.

> **Layer boundary:** steps 6 and 7c removed sim imports of core, UI and render. Sector
> scenery follows `sector-entered`, and `main.js` supplies the previous rendered camera direction
> for missile lock. `tests/layers.test.mjs` enforces empty allow-lists. Hull mounts are shared data
> (`data/mounts.js`), used by `sim/pilot.js` and the `PlayerShipView` in `render/views.js`.
> The full list of debts and the target shape are in [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md).

```
main.js                 boot + frame loop
ui/                     HUD, outpost menus, pause overlay       (reads state, calls sim actions)
render/                 three.js scene, models, camera          (reads state, never changes game rules)
sim/                    gameplay rules: flight, combat, economy, contracts, lifecycle
state/                  runtime state, persistent profile, save storage
data/                   static tuning: ships, items, weapons, station, contract templates
core/                   audio synth, keyboard/mouse input
util/                   math helpers, event bus, seedable RNG
```

Sideways imports inside a layer are fine when they are one-directional (for example
`sim/session.js` uses `sim/world.js`). To connect two systems that should not know
about each other, use the event bus instead.

## Where things live

| You want to...                       | Edit                                           |
|--------------------------------------|------------------------------------------------|
| Add or rebalance a ship              | `data/ships.js`                                |
| Add an item (ore, salvage, trade good) or change prices | `data/items.js` (`ITEMS`); see HOW_TO_ADD.md recipe 2 |
| Tune the basic cannon                 | `data/modules.js` (`cannon_basic`: `dmg`, `rate`, `bspd`, `draw`) |
| Tune the mining beam                  | `data/modules.js` (`beam_basic`: `period`, `range`, `draw`)  |
| Tune the missile (flight, lock, ammo price) | `data/weapons.js` (`MISSILE`)            |
| Add a shop row, change a price, or make a row run out | `data/shops.js` (`SHOPS`); see HOW_TO_ADD.md recipe 4 |
| Add a second trader or station shop  | `data/shops.js` (a new `SHOPS` entry) and point the counter at it (`OUTPOST_SHOP` today); see HOW_TO_ADD.md recipe 17 |
| Change base module costs             | `data/station.js`                              |
| Add a contract type                  | `data/missions/contracts.js` (list, generator, wording and mission template), plus the generic listener in `sim/missions.js` |
| Add an authored pocket/system | `data/places.js` and `data/terms.js`; see HOW_TO_ADD.md recipe 14 |
| Change starmap generation, visibility, tiers, chart look or travel costs | `data/galaxy.js`; resolved by `sim/galaxy.js`, installed by `sim/galaxy-session.js`, quoted by `sim/travel.js`, drawn by `ui/starmap.js` |
| Move a system, delete/promote a pocket, add a route | `GALAXY_OVERRIDES` in `data/galaxy.js` or `PLACE_LINKS` in `data/places.js`; see HOW_TO_ADD.md recipe 20 |
| Change the warp timing or its lockout | `WARP` in `data/sectors.js` (the look itself follows those numbers) |
| Add an enemy, or change one's numbers, colour or size | `data/enemies.js` (`ENEMIES`); see HOW_TO_ADD.md recipe 6 |
| Change what an enemy drops, or the ore mix of rocks | `data/loot.js` (`LOOT_TABLES`); see HOW_TO_ADD.md recipe 18 |
| Change how a hostile flies or shoots | `sim/ai.js` (`AI_BEHAVIOURS`, chosen by the def's `ai` field) |
| Add or rename a faction              | `data/factions.js` (`FACTIONS`)                |
| Change flight feel                   | `sim/player.js` (`flight`)                     |
| Rebind keys                          | `BINDINGS` (one-off actions) and `HELD` (flight and weapons) in `core/input.js` |
| Add an outpost screen (tab)          | `ui/screens.js` (`TABS`, `SCREENS`, a HTML function) and `ui/menu.js` (`ACTIONS`) |
| Add a module                         | `data/modules.js` (`MODULES`, `STOCK_FIT`); see HOW_TO_ADD.md recipe 16 |
| Swap modules between ship and storage| `sim/fitting.js` (`fitModule`, `unequip`, `storedFor`); picker in `ui/screens.js`, actions in `ui/menu.js` |
| Change how a bay opens or closes    | `ui/picker.js` (one picker at a time, pure and tested) |
| Change how much an item takes up, or how big a hold or the station store is | item `vol` in `data/items.js` (a module's `vol` is in `data/modules.js`), hull `cargo` in `data/ships.js`, `STORAGE_PER_LEVEL` in `data/station.js` |
| Move things between the station and a ship, or buy one into storage | `sim/inventory.js` (`moveItem`, `addItem`, `takeItem`, `buyItem`); the Inventory tab is `inventoryHtml()` in `ui/screens.js`, its buttons are `mv`/`invPrev`/`invNext` in `ui/menu.js` |
| Give a hull its own bays             | `data/outfitting.js` (`SHIP_LAYOUTS`)           |
| Change what power does in flight      | `sim/power.js` (`powerOf`, `hasPower`, `setDraw`, `updatePower`) and `state.power`; who draws what is `sim/drive.js` + `sim/player.js` (drive), `sim/shield.js` (shields) and `sim/weapons.js` (guns) |
| Change how a ship flies               | the thruster module in `data/modules.js`; `sim/drive.js` turns it into `state.drive` |
| Change what shields do in flight      | `sim/shield.js` (`shieldOf`, `refreshShield`, `updateShield`) and `state.shield`; the numbers are on the shield module |
| Change what the guns do in flight     | `sim/guns.js` (which guns are fitted, `state.guns`) and `sim/weapons.js` (`updatePrimary`); the numbers are on the `cannon_basic` module |
| Add or reorder outfitting bay groups | `data/outfitting.js` (`MODULE_GROUPS`)          |
| Add a paint bay to Appearance        | `data/outfitting.js` (`APPEARANCE_SLOTS`), drawn by `appearanceHtml()` in `ui/screens.js` |
| Change the ship in the Outfitting view| `render/shipviewer.js` (camera, lights, framing); `ui/outfitting.js` (page, input) |
| Change the pause menu                | `ui/pause.js`, styles under "Pause overlay" in `styles.css` |
| Change colours or layout of any UI   | `styles.css` (sections are labelled)           |
| Add a sound                          | `core/audio.js` (`SFX` entry; the sim only emits `sfx`) — see HOW_TO_ADD.md recipe 9 |
| Change what gets saved               | `state/profile.js` (`newProfile` / `newWorld`, `sanitizeProfile` / `sanitizeWorld`, bump `SAVE_VERSION`, add a migration in `sanitizeSave`) |
| Change the in-flight power readout   | `ui/hud.js` (the power block) and `#pw` in `src/index.html`, styles under "Flight HUD" |
| Change randomness, or make a run reproducible | `util/rng.js` (`random`, `setSeed`, `makeRng`) |
| Add tests                            | `tests/` (`*.test.mjs`, run by `npm test`)     |

## File map

Each `src/` folder has a `README.md` that lists every file in it with its rules: that is the authoritative file list.
This is the shape only.

```
src/main.js            boot, action handling (lock, weapon, dock, starmap, travel, pause), frame loop
src/index.html         page shell: HUD elements, outpost panel, hint text
src/styles.css         all styling, in labelled sections
src/data/              tuning numbers and content tables: ships, items, modules, weapons, enemies, factions, loot, shops,
                       station, places, place-templates, encounters, galaxy, terms, camera, outfitting, and missions/
                       (contracts, story, templates, rules, validate, test-missions)
src/util/              events.js (bus), rng.js (seedable random), math.js (vectors, helpers), ids.js (entity ids)
src/core/              audio.js (synth + mute), input.js (keys -> local player controls + named actions)
src/state/             state.js (runtime), profile.js (saved data), storage.js (slots, codes), controls.js (control record),
                       destination.js (route target)
src/sim/               the rules, no screen: player, pilot, power, drive, shield, hull, fitting, inventory, economy,
                       weapons, guns, missile, combat, targeting, ai, enemy, entity, effects, loot, asteroids, encounters,
                       places, place-memory, galaxy, galaxy-session, sectors, travel, navigation, missions, contracts,
                       session, world, step (the fixed tick)
src/render/            scene.js, models.js, camera.js, warpfx.js, shipviewer.js (Outfitting), views.js (a mesh per entity)
src/ui/                hud.js, menu.js, screens.js, outfitting.js, picker.js, pause.js, starmap.js, chart-lines.js,
                       route-display.js, missionlog.js (Mission log tab and dialogue panel), warpflash.js
tests/                 one *.test.mjs per area (run by `npm test`); headless.mjs and mission-driver.mjs are helpers;
                       fixtures/ and saves/ hold recorded data (old saves for migration tests)
docs/                  the docs; start at HANDOFF.md. testing/ holds the owner's playtest guides.
```

Each `src/` folder also has its own short `README.md`.

## Conventions

The rules that apply everywhere are here. The rules for one area (ship systems, content data, and so on) live in
`docs/architecture/`, one file per area, listed in "Area files" below.

- **Data tables use short keys.** Ships: `n` name, `d` description, `cargo`, `dmg`,
  `mine`, `sc`, `price`, `col` (Hull HP come from the fitted hull module). Items: `n`, `cat`, `v`,
  `vol`, `st`.
  Contracts: `n` count, `r` reward, `o` ore, `p` progress. Keep the short keys when adding entries.
- **Tuning numbers go in `src/data/`.** Constants private to one system (ranges, timers)
  may sit at the top of that file with a comment.
- **Text shown to the player** is written inline in the screen or action that shows it.
- **Save changes** follow the rules in "Save compatibility" below.

## Area files

Read the one that matches the work. Each holds that area's conventions and known gaps, moved here word for word.

| File | What it holds |
| --- | --- |
| [architecture/content-data.md](architecture/content-data.md) | Content and data: randomness, shops, loot, items, enemies, entities |
| [architecture/ship-systems.md](architecture/ship-systems.md) | Ship systems: drive, shield, hull, guns, mining beam, missiles, fitting |
| [architecture/simulation-and-rendering.md](architecture/simulation-and-rendering.md) | Simulation and rendering: the tick, dt, input, sound, views |
| [architecture/ui-and-screens.md](architecture/ui-and-screens.md) | UI and screens: outpost actions, screens, mission screens |
| [architecture/mission-principles.md](architecture/mission-principles.md) | How the eight architecture principles apply to the mission framework, and the limits of validation |
| [architecture/world-and-map.md](architecture/world-and-map.md) | World and map: places, the starmap, travel, place memory, where you log out |
| [architecture/feature-notes.md](architecture/feature-notes.md) | Detailed notes on features built in steps 10 to 13 (galaxy, starmap, place templates, missions), moved out of HANDOFF |
| [MISSION_RULES.md](MISSION_RULES.md) | How missions must behave, the linter and the invariant tests |

## Events

Systems talk through `util/events.js` instead of importing each other. The
current events and their payloads are listed at the top of that file. To react
to gameplay from a new feature, subscribe with `on(name, handler)`. For example:

```js
import { on } from "../util/events.js";
on("enemy-killed", ({ def, faction, id }) => { /* achievements, faction reputation, ... */ });
```

If you add an event, add it to the list at the top of `util/events.js` in the same change.

## State

- Saved state is split in two since step 9, carries the current pocket since step 10, the compact galaxy record since step 11B and the temporary runs a pilot is inside since step 14b (`SAVE_VERSION = 20`, `{ v: 20, profile, world }`):
  - `state.profile` is the local pilot's **portable character**: credits (`cr`), flown hull (`ship`), owned hulls (`ships`), per-ship holds (`holds`), per-hull loadouts (`loadout`), hull fractions (`hp`), missile stock (`msl`), selected primary slot (`pw`), active data missions (`missions`), remembered story flags (`flags`), kills (`kills`) and completed contracts (`done`). `profile.mission` remains a non-enumerable compact compatibility view of the first active mission. Every player in `state.players` carries its own `player.profile` (`profileOf(player)`).
  - `state.worldState` is the **hosted world**: station-local storage (`stationStores[placeId:featureId]`), the legacy enumerable home alias (`store`), base facility levels (`base`), the station's contract offer board (`board`, aliased by `state.ui.board`), the current pocket id (`place`), the local pilot's resume point (`resume`: null while docked, else `{ pos, quat, sh, en }`), `destination` (the local system or exact pocket target), `instances` (the runs in progress: template, seed, tier, remaining lifetime, objective, canister stock and entry spot — see step 14b in [ROADMAP.md](ROADMAP.md)) and `galaxy: { seed, knowledge }`. `place` may name a runtime instance while a run is live, so a load rebuilds it before the pilot is put back in it. Knowledge is compact per-system discovery/visit flags; generated systems/pockets/links are never saved. Legacy v18 and older saves migrate their active contract and station/world data into the v19 shape, and v19 saves simply have no runs.
  - `currentSave()` and `applySave(save)` join and apply both halves; `portableProfile(save)` and `mergeProfile(save, profile)` extract a guest's character and merge it back into their own save without altering their home world.
  - Both halves are written together on dock, on successful local warp arrival, on every outpost menu action, when the tab is hidden or closed, and every `AUTOSAVE_SECONDS` while playing. `currentSave()` captures the live pilot position first, so every save path records where you actually are.
- Everything else in `state/state.js` (`players`, `places`, `world`, `place`, `time`, `shops`, `ui`, `galaxy`, `galaxyRecovery`, `multiplayer`, `instances`, `deathNotice`) is transient session runtime, rebuilt when the game loads. `state.instances` maps an instance id to its live run record (step 14: a rift, later a wormhole); it is not saved in slice 14a — `captureResume()` sends a save made inside one back to the pocket and the spot the pilot entered at — and `state.deathNotice` holds one authored sentence for the next death notice. `ui.destination` mirrors saved `world.destination`, is replanned to a reachable system entry or exact pocket, and clears on arrival or Clear; destination changes autosave immediately. The sparse v2 graph changes gate links but preserves seeded system names/positions; removed legacy generated gate saves recover to an ordinary pocket in their old system. `ui.starmap` is the open chart view; `ui.starmapMemory` holds session-only chart presentation across closures, resets on save replacement and follows local cross-system travel in pocket mode; `multiplayer` is the future host flag that keeps the world running while a local chart is open. `state.place`/`state.world` alias the local pilot's pocket; each pilot owns `player.place` and `player.warp`.
- Systems read `state.*` or explicit `(player, profile, world)` parameters directly. There is no hidden global, so tests can build a state object and call a system.

## Replayability hooks

- `util/rng.js`: `random()` is the one random source for the whole game — spawns, loot, asteroid
  ore, the contract board and the audio noise buffers all draw from it. `setSeed(n)` makes a run
  reproducible; `makeRng(n)` gives an independent stream for anything that must be regenerated from
  its own seed.
- `data/missions/contracts.js`: contract generators take a random source, so board rolls can be seeded; the same file turns each offer into the data mission shape consumed by `sim/missions.js`.

## Save compatibility

Storage keys (`tr1` for the autosave, `tr_s1`..`tr_s3` for slots) and the `TR1:` code prefix are unchanged from the prototype, so existing saves load. `sanitizeSave` emits current `{ v: 19, profile, world }` objects, migrating v18 saves (including active `profile.mission` and worlds without `stationStores`), v17 saves (missing `placeMemory` defaults to `{}`), v16 saves, v15 saves (`galaxy:null` becomes the default seed plus home knowledge), v14 saves (no `resume`, so they keep the old dock-or-arrival behaviour), v13 split saves (`world.sector` migrates to `world.place`) and flat v1..v12 saves. Boot, slot load and import call `prepareGalaxySave` first: it installs the saved seed's catalog, validates pocket/knowledge ids against it, and recovers a removed/unknown pocket to the home station with `resume:null` while preserving the whole profile. A failed prepare restores the previous catalog. `profile.missions` stores data mission definitions plus step/counter progress; `profile.flags` stores simple remembered values for later story choices. `world.stationStores` is world state, not portable profile state; its keys are stable `${placeId}:${featureId}` values and its stocks are cleaned through `sanitizeWorld`. `world.placeMemory` stores only positive, finite remaining simulation seconds under each place's `rocks` and `encounters` buckets; it is world state, not portable profile state.

When you change what is saved:

1. Add the field with a default in `newProfile()` (portable character) or `newWorld()` (hosted world).
2. Make `sanitizeProfile()` or `sanitizeWorld()` validate it (clamp numbers, drop unknown ids).
3. Raise `SAVE_VERSION` and add a line to the "Version history" comment in `state/profile.js`, unless the owner has explicitly reserved the next version and the field can be added as an optional backward-compatible extension with a documented migration (as `world.stationStores` does in v18).
4. If an old save needs converting rather than just defaulting, convert it in `sanitizeSave()` / `sanitizeProfile()` / `sanitizeWorld()`.
5. Add a test in `tests/` that loads an old-shaped save.

## Known gaps

The structural gaps (fixed contract count, place memory) are tracked with their fixing step in the "Debt today" table of
[TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md). The gameplay-level gaps live in the area file they belong to
(look for the "Known gaps" heading in each file under `docs/architecture/`).

## Keeping the docs scalable

The docs are the project's only memory, so they must stay small enough to read **selectively**. A fresh assistant reads
`HANDOFF.md`, `LESSONS.md`, and only the docs its task needs (HANDOFF has the table). `npm test` enforces the limits below
(`tests/docs.test.mjs`), so an oversized or broken doc fails loudly.

- **`CHANGELOG.md` is the memory of what happened, and it keeps its history.** It holds the newest entries in full and an
  "Older entries" index with one line per older entry. It holds at most 10 full entries: when an addition makes it 11, move the oldest to the top
  of `CHANGELOG_ARCHIVE.md`, word for word, and add an index line for each. Never delete or shorten history.
- **Write changelog entries so the index line is enough on its own.** The title says what changed and the first bullet says
  why. Put rules that must stay true in the docs as well, not only in an entry, because entries get archived.
- **Bugs go in `LESSONS.md`** as a class (what was seen, the cause, the rule, the test that enforces it), not only in the
  changelog.
- **These files state how things are now, not how they got there.** When a change replaces an old rule, rewrite the rule
  instead of adding a second one beside it; the story belongs in the changelog. Remove "Known gaps" that have been closed.
- **One home per fact.** Step status lives only in `ROADMAP.md`. Tuning numbers live in `src/data/` and the folder READMEs.
  Do not repeat either in several docs.
- **Do not grow one file forever.** Add a new recipe as its own file in `docs/recipes/` (next number) and a row in
  `HOW_TO_ADD.md`. Add area facts to the matching file in `docs/architecture/`; if a file passes its size limit, split it by
  topic in its own change with no gameplay changes, leave a table of contents, and move text word for word.
- **Archive, never delete.** Finished plans, superseded status text and old guides move to `docs/archive/` or
  `testing/passed/` unchanged.
- **`HANDOFF.md` is a snapshot, not a log.** Rewrite it (do not append to it) when a chat ends: where the game is, the
  standing rules, and what to do next. Keep it under about 150 lines.
- **Every doc that states facts carries a "Last checked" date.** Update it when you verify the doc against the code.
