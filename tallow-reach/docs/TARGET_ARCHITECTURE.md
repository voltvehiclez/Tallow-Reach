# Tallow Reach: target architecture

> **What this file is.** Where the code is *going*, so that every AI session (whichever model it is)
> builds toward the same shape. [ARCHITECTURE.md](ARCHITECTURE.md) describes the code **as it is
> now**; this file describes **what it must become** to carry the game in [VISION.md](VISION.md):
> 100+ sectors, instanced wormholes, a campaign, and host-run co-op.
> The steps that get there are in [REFACTOR_PLAN.md](REFACTOR_PLAN.md).
>
> **Rule for every AI:** whenever you add code, add it in the *target* style where that is cheap, and
> never add new code that deepens a problem listed under "Debt today". When a refactor step
> closes a debt item, delete it from that list and rewrite the matching rule in ARCHITECTURE.md.

## Why this matters now

The game is ~8,500 lines and everything works. The next features (many sectors, many enemy and item
types, missions, co-op) each multiply the amount of code that touches the same few shortcuts. The
shortcuts are cheap to fix at 8,500 lines and very expensive at 50,000. Multiplayer in particular
cannot be bolted on to a game whose world is made of 3D-scene objects and a single global player.

## The eight principles

1. **Content is data.** Enemies, items, modules, ships, loot tables, shop stock, sector templates,
   encounters and missions are entries in `src/data/` keyed by a string id. Adding one should not
   need a code change. Code looks things up by id; it never hard-codes a specific enemy or sector.
2. **The simulation is pure.** Everything under `src/sim/` runs with **no** access to the screen
   (three.js scene, DOM), the speakers, or the keyboard. It reads a plain `controls` object and
   writes plain data. When it wants a sound or an effect it emits an event; `core/` and `render/`
   listen. A pure sim can run in a unit test, on a host, or on a server.
3. **Entities are plain data with ids; meshes are views.** An enemy is
   `{ id, kind, def, pos, vel, quat, hp, ... }` in `world`. `render/` builds and updates a mesh for
   each entity it sees. Nothing in `sim/` holds a three.js object.
4. **All randomness goes through `util/rng.js`.** A sector is generated from a seed, so the same
   seed always gives the same sector. (Required for 100+ generated sectors, wormholes and co-op.)
5. **Three kinds of state, kept apart.**
   - **Profile** (the *portable* character): credits, ships owned, each ship's loadout, hull
     damage and hold, stats, campaign progress. It travels with the player into other people's worlds.
   - **World** (belongs to *one hosted world*): the galaxy seed, what each sector remembers, the
     station (its storage and upgrades), the contract board.
   - **Session** (runtime only): the entities currently flying around, the UI, who is connected.
6. **Players are a list.** No code may assume exactly one player. Today's `state.player` becomes
   "the local player" in a `players` list.
7. **Input is a command, not a key.** The sim reads each player's `controls`
   (`{ thrust, yaw, pitch, roll, fire, ... }`). `core/input.js` fills the local player's controls
   from the keyboard; the network will fill a guest's.
8. **The sim runs on a fixed time step** (for example 60 steps a second), independent of the
   screen's frame rate, so that host and guests agree and results are repeatable.

## Layers: now and target

```
NOW                                  TARGET
main.js                              main.js            boot + loop, feeds controls, runs sim steps
ui/                                  ui/                HUD, menus, starmap (reads state, calls sim actions)
render/   <--- sim imports these     render/            meshes, camera, FX. Listens to events. Views of entities.
sim/      imports render/ + core/    core/              audio (listens to events), input (writes controls)
state/                               net/ (later)       transport, snapshots, join link
data/                                sim/               PURE rules. Imports only data/, state/, util/.
core/                                state/             profile, world, session, saves
util/                                data/              content tables, registries
                                     util/              math, events, rng
```

Dependencies only point **down** the target list. `sim/` is the heart and imports nothing above it.

## The core data model (a sketch, not final code)

The AI doing each refactor step decides exact field names, but must keep these ideas. Keep the
existing short-key style (`n`, `d`, `v`) for data tables.

**Registries (all in `src/data/`, string ids).** `ITEMS`, `MODULES`, `SHIPS`, `ENEMIES`,
`LOOT_TABLES`, `FACTIONS`, `SHOPS`, `SECTOR_TEMPLATES`, `ENCOUNTERS`, `MISSIONS`. A content test
(`tests/content.test.mjs`) checks every entry is complete and every id referenced actually exists
(an enemy's loot table exists, a mission's sector exists, ...). This test is what lets people add
content without reading the engine.

**Galaxy.** A grid of sectors generated from a seed.
```
galaxy  = { seed, w, h, sectors: { "x,y": SectorRecord } }
SectorRecord = { id, x, y, template, tier, seed, discovered, visited, memory }
```
`tier` is the difficulty (from distance to Meridian plus variation). `memory` is what the world
remembers about that sector (mined-out rocks, cleared encounters, respawn timers). Meridian is a
hand-written record; every other sector comes from `template + seed + tier`.

**Sector definition** (what a sector *contains*). A list of features, each placed by data:
`station`, `asteroidField {pos, radius, ores}`, `spawner {enemy table, rules}`, `poi` (derelicts,
beacons, traders), `hazard`, `wormhole`. One generic loader turns a definition into entities. There
is no `FIELD_CENTER` constant anywhere; positions belong to the sector.

**Instance.** A temporary sector made from `(template, seed, tier)` when you enter a wormhole. It
is not in the galaxy and is discarded on exit. Same loader, different source.

**Entity.** `{ id, kind: "enemy"|"asteroid"|"crate"|"bullet"|"missile"|"ship"|..., pos, vel, quat, ... }`
held in `world.sectorState.entities`, unique ids from a counter. The sim moves them; `render/`
shows them.

**Player.** `{ id, name, shipEntityId, controls, profile }`.

**Missions.** A mission is data: `{ id, title, requires, steps: [{ objective, params }], rewards }`.
A **mission runner** in `sim/` advances steps by listening to events (`enemy-killed`, `mined`,
`sector-entered`, `item-picked`, ...). The campaign is an ordered list of mission ids plus flags;
"contracts" in the open world are *generated missions* run by the same runner. More than one mission
may be active.

**Events** (see `util/events.js`) get payloads that carry ids (`enemy-killed { enemyId, def,
faction, byPlayer }`), so missions, achievements and sound can subscribe without the sim knowing.

## Saves

- Today there is one `profile` object (save version 11) holding everything. The target splits it
  into `profile` and `world` (principle 5) inside the same save slot and export code, with a
  migration, so old saves keep working.
- **Recommended co-op rule** (open question 6/7 in VISION.md): a guest brings their own profile
  (ship, hold, credits) into the host's world; whatever they gain simply stays in their own
  profile, which they save locally on leaving. That *is* "retrieving loot into your own world",
  with no extra transfer system, and it matches "you can lose your ship in someone else's world".
- Storage keys (`tr1`, `tr_s1`..`tr_s3`) and the `TR1:` code prefix must not change.

## Multiplayer model (design now, build last)

- **Host-authoritative.** The host's browser runs the one true simulation for everyone. A guest's
  browser sends its `controls` several times a second and draws what the host sends back (positions
  and state of nearby entities), smoothing between updates. Flight with inertia hides small lag, so
  no client-side prediction at first.
- **One link to join.** The host copies a URL; the guest opens it and is in. Browsers cannot
  accept incoming connections on their own, so this needs a small *signalling* step (WebRTC with a
  free broker, or a tiny relay). That is the one place the "no npm dependencies" rule may have to be
  relaxed or a small service added. **Decide at that step, not before.**
- The host must keep the tab open and the game running (no pause in co-op).
- What this needs from the code *today*: principles 2, 3, 4, 6, 7, 8 above. Nothing else.

## Debt today (what the refactor closes)

Each item names evidence so a new AI can verify it. The step that fixes it is in brackets.

| Debt | Evidence | Step |
| --- | --- | --- |
| Shop is partly hard-coded | `SHOP_WEAPONS` in `data/weapons.js`; `buyModule` special-cased | 5 |
| `sim/` imports the screen and speakers | `sim/*.js` import `render/scene.js`, `render/models.js`, `core/audio.js`, `core/input.js` | 6 |
| Entities are three.js meshes | enemies `{ m, hp, ... }` in `sim/ai.js`; player `P.m`; crates, rocks, bullets likewise | 7 |
| Variable time step | `main.js` `dt = Math.min(0.05, ...)` per animation frame | 8 |
| One global player | `state.player` read in 14 files | 8 |
| Single mixed save | `state/profile.js` holds character, station and mission together | 9 |
| Sector geography in code | `FIELD_CENTER`, `FIELD_SECTOR` in `sim/world.js`; `launch()` in `sim/session.js` starts at the origin facing the field; `parked` rock lists in `sim/world.js` | 10 |
| Current sector not saved | `state.sector` is runtime only | 10 |
| Two sectors, cycled with M | `data/sectors.js` `SECTOR_IDS`, `nextSector()` | 11 |
| One contract at a time, three types | `profile.mission`; `generateContract()` in `sim/contracts.js` | 13 |
| `sanitizeProfile` names things by hand | base modules named in `state/profile.js` | 9 |

## Folder shape after the refactor

Keep today's folders. **Do not rename or reshuffle for its own sake.** Additions only:

```
src/data/enemies.js  loot.js  factions.js  shops.js  encounters.js  galaxy.js
src/data/sector-templates.js
src/data/campaign/   one file per mission (m01.js, m02.js, ...) + index.js listing the order
src/sim/spawner.js  loot.js  galaxy.js  instances.js  missions.js  step.js
src/render/views.js           builds and updates a mesh per entity
src/ui/starmap.js  missionlog.js
src/net/                      (multiplayer step only)
```

## What "done" looks like for the architecture

An AI can, in a fresh chat and with only the docs and the zip:

- add an enemy, item, module, ship or loot table by editing one data file, and `npm test` proves it
  is complete;
- add a sector template or an encounter without touching `sim/`;
- add a campaign mission as one new data file and one line in its index;
- run 10 minutes of the game in a unit test with no browser;
- say where a guest's input and a host's snapshot would plug in.
