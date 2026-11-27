# HANDOFF: read this first, then stop and pick your task

You are continuing work on **Tallow Reach**, a browser 3D space sim (three.js). The owner **cannot
code**: give complete files (or exact find-and-replace edits) with full paths, and always say what to
run and what to click. Different AI assistants work in separate chats and none remembers earlier ones.
**The docs are the memory.** Do not read every doc: read this file, then only what your task needs.

*Last checked: 2026-11-26 (build `2026-11-26b`). This file is a snapshot, not a log: rewrite it (do not append) at the end of a chat.*

## Start here (every chat)

1. Read this file.
2. Read [LESSONS.md](LESSONS.md): the mistakes earlier chats made, so you do not repeat them.
3. Find your task in the table below and read only those docs, plus the `README.md` of each `src/`
   folder you will touch.
4. Look at the newest entries in [CHANGELOG.md](CHANGELOG.md) (older history is a one-line index there).

| If your task is about | Read |
| --- | --- |
| **Missions, dialogue, triggers, contracts** | [MISSION_RULES.md](MISSION_RULES.md) (mandatory), [recipes/11](recipes/11-story-and-scripted-missions.md), [recipes/03](recipes/03-a-new-contract-type.md) |
| Adding content (ship, item, enemy, module, place, shop, loot) | [HOW_TO_ADD.md](HOW_TO_ADD.md), then the one recipe in `docs/recipes/` |
| The starmap, places, travel | [architecture/world-and-map.md](architecture/world-and-map.md), [recipes/14](recipes/14-a-new-pocket-or-system.md), [recipes/20](recipes/20-edit-the-starmap-web-and-travel.md), [recipes/21](recipes/21-add-a-place-template-encounter.md) |
| **Rifts, instances, wormholes, consumables** | "Step 14" in [VISION.md](VISION.md), [recipes/22](recipes/22-a-new-rift-or-instance.md), **a new sky: [recipes/24](recipes/24-a-new-skybox.md) (`tools/skybox/`)**, `src/data/instances.js`, `src/sim/instances.js` |
| Ships, modules, weapons, fitting | [architecture/ship-systems.md](architecture/ship-systems.md) |
| Items, inventory, shops, loot, enemies, randomness | [architecture/content-data.md](architecture/content-data.md) |
| The tick, input, sound, rendering | [architecture/simulation-and-rendering.md](architecture/simulation-and-rendering.md) |
| `.glb` models, collision | [GLB_MODELS.md](GLB_MODELS.md) |
| Screens and menus | [architecture/ui-and-screens.md](architecture/ui-and-screens.md) |
| A numbered refactor step | [REFACTOR_PLAN.md](REFACTOR_PLAN.md), [ROADMAP.md](ROADMAP.md) |
| Saves | "Save compatibility" in [ARCHITECTURE.md](ARCHITECTURE.md) |
| What the game is meant to become | [VISION.md](VISION.md), [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md) |

## Where the game is now

- Save version: **v29** (v29 adds `away` beside profile — a pilot visiting another world — and host side `world.worldId` + `world.guests`; v28 added seven filter presets).
- **Which steps are done, built or next: the step table in [ROADMAP.md](ROADMAP.md).** Only place step status is kept; tick steps there.
- **Ask the owner at start:** "Did the pending playtests in ROADMAP pass?" Tick them if so; fix a reported bug first.
- **Step 15 campaign (built, owner-approved 2026-11-21; v28):** separate mode, own pilot, fixed galaxy `240515`, dual-mode envelope; First Sortie flight-school for Dane Korr. Words: [FIRST-SORTIE-DIALOGUE.md](FIRST-SORTIE-DIALOGUE.md); rules: [MISSION_RULES.md](MISSION_RULES.md); guide: [../testing/TESTING-15-CAMPAIGN.md](../testing/TESTING-15-CAMPAIGN.md).
- **Step 16 multiplayer — eight slices; 1–5, 7, 8a/8b PLAYTEST-CONFIRMED, 8c BUILT (awaiting playtest), 6 (trading) last:** [REFACTOR_PLAN.md](REFACTOR_PLAN.md), rules in [architecture/multiplayer.md](architecture/multiplayer.md). **Slice 1:** `data/multiplayer.js` travel list, `net/custody.js` packs. **2, v29:** `save.away`, `world.guests`. **3:** `net/transport.js` `trystero@0.27.0` only file naming it; `net/session.js` session, `net/protocol.js` messages, `net/paste.js` `TRJOIN:`; one screen `ui/multiplayer.js`; **Enter** chat; **hosted world never pauses**; no campaign row; `ICE.turn` fallback. **4:** Join looks only — **Bring my pilot** freezes home pilot & sends suitcase (`carry`/`suitcase` capped 256 KB, `epoch`/`rev` beside, `tokenHash` only). **Bring pilot home** offline; away card on every Open World press. **5:** lost host → menu; `compare` wins, `bye` final copy, one window per pilot; browser identity L47, chat 12 s L46. **7:** blip & panel row. **8a:** host `SHIP_FIELDS` 24 Hz `ships`, `LIMITS.ships` batched; guest **views only** (`shipstream` 100 ms, interpolated, held); host draws visitors from `state.players`; same pocket only. **Playtest 23 fixes:** friend is selectable (`p` lock, own name, hull/shield via `pilot-stats.js`, `shield` in `SHIP_FIELDS`), always rejoinable (`recordTokenHash`, `carry` never rewrites hash, refusal ends attempt), hull is solid (`pilotHullRadius`), N-Ship lists docked too. **Playtest 24:** fresh `carry` beats stale `rev`, visitor blur removed, chat selectable. **Playtest 25:** one pointer (`ui/pointer.js`), lead pip for any moving lock including pilots. **8b:** guest `controls` 30 Hz from `state.localInput` (`core/input.js` only writer) + `aim`, `applyGuestControls`; docked launches on first ask, stale 400 ms. **8c (new `2026-11-26b`, six playtest-26 fixes, not yet playtested):** guest screen is host world — `state.place`/scenery follow snapshot's own-ship place (`mp-self-ship`, `sim/places.enterPlace`), guest sim skipped (`sim/step.isGuest()` early return), pilot record driven by snapshots, own galaxy stashed in `state.guestHome` (runtime only per choice A) restored on Go home/host-lost; guests can **warp/dock freely** via `warp`/`dock` requests (host re-checks, new `protocol.js` kinds, `mp-guest-warp/dock`); HUD is guest's ship; cut on host warp (owner ok); rifts host-only; **26b also:** `boost`/`shake` on `SHIP_FIELDS` (own boost shakes the guest's camera), `mp-guest-dock` is a dock↔launch toggle (Launch asks the host, no local teleport), the guest's screen emits `docked`/`launched` from the snapshot flip (station card opens, own suitcase's hangar/inventory), docked hulls not drawn anywhere, guest death recovers docked at home with fee/cargo loss, a per-pocket 24 Hz `entities` stream draws host bullets/missiles/crates/fx, hidden-tab host keeps the sim stepping via dt-driven catch-up. **2026-11-27 (fundamental rule — all weapon effects on the guest):** no slice 8e (owner). `SHIP_FIELDS` gained the weapon-effects block — `beamOn`/`beamStart`/`beamEnd`/`mineFrac` (+ `cone`/`lockT`/`lockLocked`/`lockTarget`) — applied to the guest's own `state.flight`, so the beam draws, the beam bar fills and the lock ring animates as single-player; monotonic event counters (`shots`/`missiles`/`locks`/`ore`/`hits`/`boosts`, u16) replay the matching sfx on the own screen, and the pocket `entities` packet gained `booms` (the local explosion gate) so guests hear kills and missile detonations. All host-confirmed, never guest-predicted. **2026-11-27 (enemies on the guest, owner):** the pocket `entities` packet gained `enemies` (nine fields: id, def, friendly, boost, pos, quat, v, hp, mx — capped at the same 32); the guest syncs them into the pocket's `W.enemies` as `_net` records, so views, F-lock, the N list and the lead pip are the local mechanics verbatim, and enemy bullets already hurt a visiting hull (host-side `hurt`). The guest re-emits `hurt` on its own screen so the wound flash shows. The host is the only writer of every wound/kill. Remaining: client-side prediction (8d) only. No save change. Guides: [8C](../testing/TESTING-16-SLICE8C.md), [8B-FIXES](../testing/TESTING-16-SLICE8B-FIXES.md), [8B](../testing/TESTING-16-SLICE8B.md), [8A](../testing/TESTING-16-SLICE8A.md). **Step 17 (dedicated servers) planned, not built.**
- **Shared flight model (2026-11-21):** `sim/flight-model.js`; NPCs `sim/npc-pilot.js`.
- **Earlier playtest history:** PRs #37–#61: [archive/HANDOFF_PLAYTEST_HISTORY_2026-11-19.md](archive/HANDOFF_PLAYTEST_HISTORY_2026-11-19.md).
- **Scenery:** Meridian C opening, 1000 m arrival; other fields 2.5× wider.
- **Stock camera:** `BASE_HFOV=85`, chase 14.9/23.1/14.3. Do not change unasked.
- **System space (2026-11-16, passed):** derived 3D AU + system sky layer. Detail: [architecture/world-and-map.md](architecture/world-and-map.md).
- **Models & collision (2026-11-16):** drop-in `.glb` collided with mesh; everything solid hurts ([GLB_MODELS.md](GLB_MODELS.md)).
- **Earlier confirmed:** Test Ship (1 cr, `testship`), 14c wormholes (75 standing, ≤3/system, 20 min, v21→v25), cube skies (`STARFIELD.enabled=false`).

## The owner's ground rules (do not break these)

- No new npm dependencies; plain ES modules. One exception: small networking library at step 16 with approval.
- Keep folder structure/conventions. Tuning numbers in `src/data/`. Restructuring only as numbered refactor step.
- Saves backward-compatible: bump `SAVE_VERSION` in `src/state/profile.js`, add migration + old-save test. Storage keys `tr1`, `tr_s1..tr_s3`, `TR1:` prefix never change.
- Systems talk via event bus (`src/util/events.js`), not by importing each other.
- Do not change behaviour nobody asked about (FLIGHT/CAMERA feel, hull bonuses/holds intentional).
- Run `npm test` and `npm run build`, or say plainly what could not run. Never guess. End every `src/` change by telling owner to run both.
- `game/tallow-reach.html` is generated. Never edit by hand.
- Add short top entry to [CHANGELOG.md](CHANGELOG.md) for every change. It holds at most 10 full entries; move oldest verbatim to archive with index lines if over. Never delete history.
- Refactors follow [REFACTOR_PLAN.md](REFACTOR_PLAN.md): plan in plain language, ask open questions, wait for OK, build one slice, deliver guide, tick only after owner says passed.
- **Missions must behave like real life** ([MISSION_RULES.md](MISSION_RULES.md)): items enter hold only by real pickup/hand-over, dialogue never changes world, nothing spawns in face, never stuck/silent fail. Build from templates; linter/invariants must pass.
- For simple/conversational requests, answer in chat; do not rebuild guides/backups unless asked. Check file exists before overwriting.

## Keeping the game scalable (the owner plans to make it much bigger)

1. **Content is data.** New enemy/item/ship/module/loot/shop/place/encounter/mission is `src/data/` entry + recipe. If plain content seems to need `src/sim/` change, framework missing feature — extend framework first (its own change, tests) and tell owner.
2. **Eight architecture principles** in [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md) hold: sim pure, entities data/meshes views, randomness via `util/rng.js`, profile/world/session apart, players list, input is command, sim on fixed step. Never deepen listed debt.
3. Do not hard-code ids of enemy/place/mission in code. Look up by id from data.
4. Every new system ships with: data table, event, test, and entry in matching recipe/area doc. Mission/content type without linter/test unfinished.
5. Keep docs small. New recipe as own file in `docs/recipes/` (next number) and row in [HOW_TO_ADD.md](HOW_TO_ADD.md); area facts to matching `docs/architecture/` file. Do not grow this file or `ARCHITECTURE.md`. `npm test` fails if doc over size limit or link breaks.

## Before you end a chat (checklist)

1. `docs/CHANGELOG.md`: new top entry added, at most 10 full entries left (oldest moved to archive with index lines).
2. `docs/ROADMAP.md`: step status ticked/updated (only if owner confirmed playtest passed).
3. This file: rewrite "Where the game is now" if it changed (save version must match `SAVE_VERSION`).
4. Docs verified against code: update "Last checked" date. New/changed `src/` file: update folder `README.md` and, for new recipe/area fact, index/area file.
5. Tell owner to run `npm run build` and `npm test`, and zip project as next chat's baseline.

## When the owner reports a bug

1. Reproduce as failing test first when you can.
2. Find root cause and fix whole class, not only one case.
3. Add/extend regression test (missions: invariant in `tests/mission-invariants.test.mjs`).
4. Add/update [LESSONS.md](LESSONS.md): what owner saw, general cause, rule, test that enforces. If repeat, strengthen test.
5. Mention in CHANGELOG entry. Do not tick affected step until owner re-plays.

Owner report usually: *what I did, what I expected, what happened.* If missing, ask.

## Build, test and play

```sh
npm install        # first time only
npm run build
npm test
node serve.mjs     # optional: serves game/ on http://localhost:8080
```

Or double-click `game/tallow-reach.html`. If preview blocks localStorage, open in own tab. Guides: [../testing/](../testing/README.md) — `TESTING-BASELINE.md` plus step's guide. To try test missions, open game with `?testmissions`.

## Map of the docs

| File or folder | What it holds |
| --- | --- |
| `LESSONS.md` | Classes of bug earlier chats hit, rule that prevents each, test that enforces it. |
| `MISSION_RULES.md` | How missions must behave; linter, templates, invariant tests and test missions. |
| `VISION.md` | Owner's intent, settled decisions, open questions. |
| `ROADMAP.md` | Step status (only place), content you can add now, parking lot, log. |
| `REFACTOR_PLAN.md` | Refactor steps still to do, with prompts. Finished steps in `archive/`. |
| `TARGET_ARCHITECTURE.md` | End-state design, eight principles, debt register. |
| `ARCHITECTURE.md` | How code works **now**: layers, events, state, saves. Area details in `architecture/`. |
| `HOW_TO_ADD.md` | Index of 22 recipes in `recipes/`. |
| `CHANGELOG.md` / `CHANGELOG_ARCHIVE.md` | Recent changes in full, older history. Never delete entries. |
| `AI_PROMPTS.md` | Prompts owner pastes into new chats. |
| `archive/` | Superseded text word for word: old HANDOFF, finished refactor steps, old status prose. |
| `../testing/` | Owner playtest guides (current on top, `passed/` finished steps). Each `src/` folder also has short `README.md` listing files/rules. |
