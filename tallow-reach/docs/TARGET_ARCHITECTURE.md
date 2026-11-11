# Tallow Reach: target architecture

> **What this file is.** Where the code is *going*, so that every AI session (whichever model it is)
> builds toward the same shape. [ARCHITECTURE.md](ARCHITECTURE.md) describes the code **as it is
> now**; this file describes **what it must become** to carry the game in [VISION.md](VISION.md):
> 100+ systems of flyable pockets, instanced wormholes, a campaign, and host-run co-op.
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

1. **Content is data.** Enemies, items, modules, ships, loot tables, shop stock, place definitions,
   encounters and missions are entries in `src/data/` keyed by a string id. Adding one should not
   need a code change. Code looks things up by id; it never hard-codes a specific enemy or sector.
2. **The simulation is pure.** Everything under `src/sim/` runs with **no** access to the screen
   (three.js scene, DOM), the speakers, or the keyboard. It reads a plain `controls` object and
   writes plain data. When it wants a sound or an effect it emits an event; `core/` and `render/`
   listen. A pure sim can run in a unit test, on a host, or on a server.
3. **Entities are plain data with ids; meshes are views.** An enemy is
   `{ id, kind, def, pos, vel, quat, hp, ... }` in `world`. `render/` builds and updates a mesh for
   each entity it sees. Nothing in `sim/` holds a three.js object.
4. **All randomness goes through `util/rng.js`.** A place is generated from a seed, so the same
   seed always gives the same place. (Required for 100+ generated systems, wormholes and co-op.)
5. **Three kinds of state, kept apart.**
   - **Profile** (the *portable* character): credits, ships owned, each ship's loadout, hull
     damage and hold, stats, campaign progress. It travels with the player into other people's worlds.
   - **World** (belongs to *one hosted world*): the map seed, what each place remembers, the
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
render/                              render/            meshes, camera, FX. Listens to events. Views of entities.
sim/                                 core/              audio (listens to events), input (writes controls)
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
`LOOT_TABLES`, `FACTIONS`, `SHOPS` (done, step 5), `PLACES`, `PLACE_DEFS`, `ENCOUNTERS`, `MISSIONS`. A content test
(`tests/content.test.mjs`) checks every entry is complete and every id referenced actually exists
(an enemy's loot table exists, a mission's place exists, ...). This test is what lets people add
content without reading the engine.

**Place.** Anything the ship can fly around in is a place. A place record is
`{ id, kind: "pocket", def, parent, enter, leave }`; `def` names a definition in `PLACE_DEFS`,
`parent` is an optional place/system id, and `enter`/`leave` describe how the ship arrives and
departs (today both are warp; a pocket's `enter.pos` is its arrival point). A **system** is a
non-flyable grouping record `{ id, kind: "system", n, intraSystem, core }`; you are always in one of its
pockets, never in the system itself or its visual-only central body. The starting system is `meridian`
(shown as **Meridian System**).
Its first pockets keep the internal ids `reach` (**Meridian Station**, station + asteroid belt)
and `hollow` (**Kestrel Hollow**, empty). A system may have any number of pockets; M opens the
starmap, zooming into a system dot opens its pocket map, and clicking/right-clicking a legal pocket or gate-neighbour label offers
**Warp to** (step 11B built and owner-playtest-passed). Generic player-facing nouns live in
`data/terms.js` (`mapNode: "system"`, `flyable: "pocket"`), each changeable in one line.

**Place definition** (what a place *contains*). A list of features, each placed by data:
`station`, `asteroidField {pos, radius, height, count, ore, respawnSec, stable}`, `spawner {encounter, rules}`,
`planet` scenery and `encounter` features. Reusable generated definitions live in
`data/place-templates.js`; encounter ids come from `data/encounters.js` and are selected by the
place's derived tier. One generic loader turns a definition into entities and scenery events. There
is no `FIELD_CENTER` / `FIELD_SECTOR` / `STATION_POS` constant anywhere; positions belong to the
place definition. Meridian is a station feature inside its pocket, not a child place. The station
feature names its shop. `sim/place-memory.js` records stable rock-slot and one-shot encounter
cooldowns in `world.placeMemory`; timers use simulation seconds and `respawn-place` is the event hook
for future story overrides.

**Map (step 11).** An **organic 2D web** of systems generated from a seed: scattered positions and
explicit cross-system gate links, not a square grid. `sim/galaxy.js` resolves `{ travel, systems, pockets,
links }` through a replaceable generator registry and author overrides; `sim/travel.js` allows free
same-system hops by default, or requires internal links when a system opts into `intraSystem: "links"`.
Cross-system hops always require the exact gate link. A gate pocket has exactly one external gate peer
in a neighbouring system; each system has an ordinary hub plus any detached station pockets and one gate
pocket per neighbour. Meridian keeps `reach`/`hollow` and gains separate gate pockets. Generated gate
traders move to their own station pockets by default; explicit author station features/placement flags can
co-locate them. The map stores seed, tier and discovery/visit records,
not generated geography. `tier` is distance-from-Meridian guidance plus seeded variation; authored
content may override it and decides actual danger. The save stores the seed and compact
discovery/visit knowledge, not generated geography; tiers are derived on resolution. Visibility is a
policy (`all` today), not a hard-coded no-fog assumption. The zoomed-in system chart uses a derived,
deterministic pocket layout (`systemPocketLayout`; author `mapPos` overrides win) that is never saved.
Pockets orbit an independent seeded star (95%) / black hole (5%) core; its proper name comes from the
system and is permanently labelled with its type on a second row, but it is not warpable. Free systems omit internal chart lines;
route-only systems draw them. Gate exit stubs point toward the exact peer system and their labels are clickable travel targets.
Galaxy pan is bounded to 0.5–1 screen pixels per pointer pixel, increasing gently when zoomed out; core graphics scale with system zoom. Place memory
(mined-out rocks, cleared encounters, respawn timers) belongs to the world half of the save and is
implemented in save v18. The map is not a fixed two-level container: pockets may later have optional
child places using the same place record.

**Instance.** A temporary place made from `(definition, seed, tier)` when you enter a wormhole. It
is not on the system map and is discarded on exit. Same loader, different source. A future temporary
instanced system that needs ordered internal travel can use the existing `intraSystem: "links"` data
policy; instance creation/lifecycle itself is still step 14 work.

**Entity.** `{ id, kind: "enemy"|"asteroid"|"crate"|"bullet"|"missile"|"ship"|..., pos, vel, quat, ... }`
held in the runtime container of the place it belongs to, unique ids from a counter. The sim moves
them; `render/` shows the local player's place. Each pilot owns a current place id and warp state.

**Player.** `{ id, name, shipEntityId, controls, profile }`.

**Missions.** A mission is data: `{ id, title, requires, steps: [{ objective, params }], rewards }`.
A **mission runner** in `sim/` advances steps by listening to events (`enemy-killed`, `mined`,
`place-entered`, `item-picked`, ...). The campaign is an ordered list of mission ids plus flags;
"contracts" in the open world are *generated missions* run by the same runner. More than one mission
may be active.

**Events** (see `util/events.js`) get payloads that carry ids (`enemy-killed { enemyId, def,
faction, byPlayer }`), so missions, achievements and sound can subscribe without the sim knowing.

## Saves

- Current save version is **18** (starmap seed/knowledge, destination, place memory and optional station-local stores); v17 and older migrate on load. Legacy v18 worlds containing only `world.store` are assigned to their saved station when possible; v19 remains reserved for Step 13.
  Every save slot and `TR1:` export code stores `{ v, profile, world }` (principle 5), with automatic
  migration from flat v1..v12 and split v13 through v17 saves:
  `profile` holds the portable character (`cr`, `ship`, `ships`, `holds`, `loadout`, `hp`, `msl`,
  `pw`, `mission`, `kills`, `done`), and `world` (`state.worldState`) holds the hosted world's
  station-local storage (`stationStores[placeId:featureId]`, with the legacy home `store` alias), base upgrades (`base`), contract board (`board`), current pocket id
  (`place`, replacing v13's `sector` placeholder), saved local flight state (`resume`), route
  destination and galaxy seed/knowledge (`galaxy: { seed, knowledge }`). `placeMemory` stores only
  remaining simulation-second cooldowns for stable rock slots and cleared encounter features.
  `sim/galaxy-session.js` installs the seed before validation and recovers removed pockets safely to
  home. `portableProfile(save)` and `mergeProfile(save, profile)` extract and return a guest's
  character without touching world state.
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

## Still local-only after step 8c (assigned by owner step)

8c has no networking and does not make a complete co-op game. The headless simulation can fly
and fire two independent players, and each remaining local-only area below is assigned to the
refactor step that closes it:

| Still local-only | Current assumption / evidence | Owner step |
| --- | --- | --- |
| Saves and profiles | **Closed in step 9 (save v13, owner-playtested):** saves split into `{ v: 13, profile, world }`; each player owns an isolated `player.profile` (`portableProfile` / `mergeProfile`). | — |
| Inventory and pickups | **Closed in step 9 (owner-playtested):** `sim/inventory.js`, `sim/combat.js` and `sim/weapons.js` credit each pilot's own `profile.holds` while sharing the hosted world's `worldState.store`; crate pickup works across all active pilots even when the local pilot is docked. | — |
| Economy, outfitting and saved ammunition | **Closed in step 9 (owner-playtested):** `sim/economy.js`, `sim/fitting.js` and `sim/weapons.js` operate on the acting pilot and their `profile` (`cr`, `loadout`, `ships`, `hp`, `msl`, `pw`) against `state.worldState`. | — |
| Contracts and rewards | **Closed in step 9 (owner-playtested):** the offer board lives in `worldState.board`; `sim/contracts.js`, `sim/ai.js`, `sim/combat.js` and `sim/missile.js` track kills, mission progress, payouts and spawn policy per pilot (`profile.mission`, `profile.kills`). | — |
| Docking and launch | **Closed in step 9 (owner-playtested):** `launch` and `dock`/`tryDock` operate on an explicit pilot and profile; `clearTransient()` only sweeps the field when no other active pilot remains in space. | — |
| Warp and place ownership | **Closed in step 10 (owner-playtested):** each pilot owns `place` and `warp`; entities live in per-place containers; shared systems advance once per occupied place. Non-local presentation/input remain step 16. | — |
| Death and recovery | `sim/player.js` and `sim/session.js`: only the local player gets ship loss, recovery and docking on `player-dead`; another player is marked dead until multiplayer respawn rules exist. | 16 (multiplayer) |
| Player presentation and input | `render/views.js`, `core/input.js`: the screen draws/follows the local ship and local beam, and input only fills local controls. No guest UI, remote input or transport exists yet. | 16 (multiplayer) |

## Debt today (what the refactor closes)

Each item names evidence so a new AI can verify it. The step that fixes it is in brackets.

| Debt | Evidence | Step |
| --- | --- | --- |
| `sim/` imports the screen | **Closed in 7c:** place entry emits an event; the frame loop supplies the camera direction used for missile lock. The render-import allow-list is empty. | — |
| Entities are three.js meshes | **Closed (steps 7a and 7b):** every entity is a record with an `id` and a `kind` — an enemy, a bullet, a missile, a crate, a spark, a rock, the player's ship. `render/views.js` owns every mesh | — |
| Variable time step | **Closed in step 8 (+ between-tick render interpolation):** gameplay runs at fixed 60 Hz through `sim/step.js` (`SIM_DT = 1 / 60`, capped catch-up), and place-memory timers use those same simulation ticks; `render/views.js` + `render/camera.js` interpolate visual poses via `simClock.alpha()` for smooth high-refresh (240 Hz) rendering. Camera-sampled missile aim remains a deliberate parking-lot item. | — |
| One global player | **8c and step 9 complete and owner-playtested:** each active player has independent runtime and portable `profile` (inventory, economy, outfitting, ammo, contracts, kills, docking/launch); remaining multiplayer presentation/input items belong to step 16 above. | 10 / 16 |
| Single mixed save | **Closed in step 9 (save v13, owner-playtested):** `state/profile.js` and `state/storage.js` split `{ profile, world }` and migrate v1..v12 saves. | — |
| Sector geography in code | **Closed in step 10:** positions/features live in `PLACE_DEFS`; a generic loader builds per-place containers; launch/dock/scenery read the station and field features. | — |
| Current sector not saved | **Closed in step 10 (save v14, owner-playtested):** `world.place` stores the current pocket id; v13 `sector` migrates. | — |
| Two pockets, cycled with M | **Closed in 11B (built, owner playtest pending):** M opens `ui/starmap.js`; zooming into a system opens its pocket map and right-click direct-hop quotes replace cycling. `nextPocket()` remains only as a legacy helper for old tests/tools. | — |
| One contract at a time, three types | `profile.mission`; `generateContract()` in `sim/contracts.js` | 13 |
| `sanitizeProfile` names things by hand | **Closed in step 9:** `sanitizeWorld` walks `BASE_MODULES` (`data/station.js`) directly instead of naming base modules by hand. | — |

## Folder shape after the refactor

Keep today's folders. **Do not rename or reshuffle for its own sake.** Additions only:

```
src/data/enemies.js  loot.js  factions.js  shops.js  encounters.js  place-templates.js  places.js  terms.js  galaxy.js
src/data/campaign/   one file per mission (m01.js, m02.js, ...) + index.js listing the order
src/sim/encounters.js  place-memory.js  loot.js  places.js  asteroids.js  galaxy.js  galaxy-session.js  travel.js  instances.js  missions.js  step.js
src/render/views.js           builds and updates a mesh per entity (7a: hostiles)
src/ui/starmap.js  missionlog.js
src/net/                      (multiplayer step only)
```

## What "done" looks like for the architecture

An AI can, in a fresh chat and with only the docs and the zip:

- add an enemy, item, module, ship or loot table by editing one data file, and `npm test` proves it
  is complete;
- add a place definition or an encounter without touching `sim/`;
- add a campaign mission as one new data file and one line in its index;
- run 10 minutes of the game in a unit test with no browser;
- say where a guest's input and a host's snapshot would plug in.
