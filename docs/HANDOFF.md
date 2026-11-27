# HANDOFF: read this first, then stop and pick your task

You are continuing work on **Tallow Reach**, a browser 3D space sim (three.js). The owner **cannot
code**: give complete files (or exact find-and-replace edits) with full paths, and always say what to
run and what to click. Different AI assistants work in separate chats and none remembers earlier ones.
**The docs are the memory.** Do not read every doc: read this file, then only what your task needs.

*Last checked: 2026-11-27 (build `2026-11-27e`). This file is a snapshot, not a log: rewrite it (do not append) at the end of a chat.*

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
- **Step 16 multiplayer — eight slices; 1–5, 7, 8a/8b PLAYTEST-CONFIRMED, 8c + guest sync + live playtest fixes BUILT (`2026-11-27e`, awaiting retest), 6 (trading) last:** [REFACTOR_PLAN.md](REFACTOR_PLAN.md), rules in [architecture/multiplayer.md](architecture/multiplayer.md). **Slice 1–5, 7, 8a/8b:** `data/multiplayer.js` travel list, `net/custody.js` packs, `save.away`, `world.guests`, `net/{transport,session,protocol,paste,ships}.js` (`RELAYS.relayUrls` curated 10 + `warnOnRelayFailure: false`), `ui/multiplayer.js` (**Enter** chat, hosted world never pauses, browser identity L47, chat 12 s L46), ship snapshots (`SHIP_FIELDS`, `shipstream.js` 100 ms), `pilotHullRadius` solid hulls, `p` locks (`state.otherPilots`), guest `controls` 30 Hz + `aim` (`applyGuestControls`, stale 400 ms). **8c + Guest Sync (`2026-11-27b`–`e`):** host runs guest world + `guest-actions.js` (`act`/`visit`, `mission.owner` isolation), host background keepalive (`blob:`/`data:` Worker + zero-gain `AudioWorkletNode`), `flight()` remote-pocket collisions (`placeWorld(P.place)`), `sayForPlayer` guest hints, mining beam/HUD/rock parity (`beamT`/`pwr`/`pwrDraw`/`enFrac`/`hint` + `syncPocketRocks`), `dockStreamCaughtUp` launch/dock gating + mid-flight power preservation, `visitState` persistence across relogs, and `${kind}:${id}` view isolation (`views.js`). Remaining: client-side prediction (**8d**) and trading (**6**). `SAVE_VERSION = 29`. Guides: [8C](../testing/TESTING-16-SLICE8C.md), [8B-FIXES](../testing/TESTING-16-SLICE8B-FIXES.md), [8B](../testing/TESTING-16-SLICE8B.md), [8A](../testing/TESTING-16-SLICE8A.md). **Step 17 (dedicated servers) planned, not built.**
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
