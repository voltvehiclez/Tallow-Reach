# HANDOFF: read this first, then stop and pick your task

You are continuing work on **Tallow Reach**, a browser 3D space sim (three.js). The owner **cannot
code**: give complete files (or exact find-and-replace edits) with full paths, and always say what to
run and what to click. Different AI assistants work in separate chats and none remembers earlier ones.
**The docs are the memory.** Do not read every doc: read this file, then only what your task needs.

*Last checked: 2026-11-24. This file is a snapshot, not a log: rewrite it (do not append) at the end of a chat.*

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
| **Rifts, instances, wormholes, consumables** | "Step 14" in [VISION.md](VISION.md), [recipes/22](recipes/22-a-new-rift-or-instance.md), **a new sky: [recipes/24](recipes/24-a-new-skybox.md) (`tools/skybox/`)**, `src/data/instances.js` and `src/sim/instances.js` (both documented at the top) |
| Ships, modules, weapons, fitting | [architecture/ship-systems.md](architecture/ship-systems.md) |
| Items, inventory, shops, loot, enemies, randomness | [architecture/content-data.md](architecture/content-data.md) |
| The tick, input, sound, rendering | [architecture/simulation-and-rendering.md](architecture/simulation-and-rendering.md) |
| `.glb` models, collision | [GLB_MODELS.md](GLB_MODELS.md) |
| Screens and menus | [architecture/ui-and-screens.md](architecture/ui-and-screens.md) |
| A numbered refactor step | [REFACTOR_PLAN.md](REFACTOR_PLAN.md), [ROADMAP.md](ROADMAP.md) |
| Saves | "Save compatibility" in [ARCHITECTURE.md](ARCHITECTURE.md) |
| What the game is meant to become | [VISION.md](VISION.md), [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md) |

## Where the game is now

- Save version: **v29** (v29 adds the `away` marker beside the profile — a pilot visiting another
  world — and the host side, `world.worldId` + `world.guests`; v28 added the seven filter presets).
- **Which steps are done, built or next: the step table in [ROADMAP.md](ROADMAP.md).** It is the only place step status is kept (this file, REFACTOR_PLAN and the README do
  not repeat it); tick steps there.
- **Ask the owner at the start:** "Did the pending playtests in ROADMAP pass?" Tick them if so; fix a reported bug first.
- **Step 15 campaign (built, owner-approved 2026-11-21; v28):** a separate mode with its own pilot and a fixed galaxy (`240515`), dual-mode save envelope; three-column chapter boxes, an act ending on a MISSION ACCOMPLISHED card; First Sortie plays as a flight-school tutorial for Captain Dane Korr. Act's words: [FIRST-SORTIE-DIALOGUE.md](FIRST-SORTIE-DIALOGUE.md); rules: [MISSION_RULES.md](MISSION_RULES.md); guide: [../testing/TESTING-15-CAMPAIGN.md](../testing/TESTING-15-CAMPAIGN.md); full build notes archived in [archive/HANDOFF_PLAYTEST_HISTORY_2026-11-19.md](archive/HANDOFF_PLAYTEST_HISTORY_2026-11-19.md).
- **Step 16 multiplayer — eight slices; 1–3 PLAYTEST-CONFIRMED (2026-11-22), 4 in playtest, 5 playtested 2026-11-24 (fixes to `2026-11-24f`), 6 next, 7–8 agreed:** [REFACTOR_PLAN.md](REFACTOR_PLAN.md), rules in [architecture/multiplayer.md](architecture/multiplayer.md). **Slice 1:** `data/multiplayer.js` says what travels, `net/custody.js` packs it. **Slice 2, save v29:** `save.away`, `world.guests`. **Slice 3:** `net/transport.js` names `trystero@0.27.0` (the one library); `net/session.js` runs a session, `net/protocol.js` carries the messages, `net/paste.js` the `TRJOIN:` codes; one screen, `ui/multiplayer.js` (host: switch → link → codes; join: one box). **Enter** opens chat; **a hosted world never pauses**; **no multiplayer row in the campaign**. The free TURN servers are dead, so the game carries its own relay (`ICE.turn`), a player's server first; one-link join is proven across networks. Opening your own world ends a visit. **Slice 4, the pilot crosses:** **Join** only looks around — **Bring my pilot** freezes it at home and sends it. Two wire kinds, `carry` and `suitcase`, capped at `NET.suitcaseMaxBytes` 256 KB and **refused in words, never truncated**; `epoch`/`rev` ride beside it; `cleanCarry` never strips unknown ids (L16). The host keeps a **`tokenHash`, never the token**; a visitor becomes a real docked ship (`sim/multiplayer.js`, via the bus). **Bring pilot home** works with the host offline, from the suitcase, via **one rule**. **The away card is raised by every Open World press while the pilot is away**, and nothing is compared: **Bring pilot home always takes the copy that world holds** (owner, `2026-11-24c`: *"even small things like pilot position can change"*) — both comparisons are deleted: the travelling half is a photograph, not a rival. Buttons: **Bring pilot home + Main menu**. Playtest 20 made the **chat hide itself after `CHAT.autoHideSec`** unless pinned (L45). **L33** (`hostProfile` wiped holds) and **L34** (coming home doubled lockers; a guest's save goes through `saveKit.install`). **Playtest 14 (L35/L36):** `forgetPeer` is the one rule for a departing guest (row, chat, presence, `left` record, which a fresh link re-admits); `bringPilotHomeAtMenu` unpacks the STORED mode save. **Slice 5 (`2026-11-24a`):** a lost host (browser closed, or silence for `NET.lastSeenSec`) returns the guest to the **menu** with **"Lost connection to host"** and one door, *Main menu*; the pilot's save is untouched, and rejoining keeps the copy the server has. **Bring my pilot enters the world** (`2026-11-24d`): the stand-in is your own galaxy holding the pilot's copy, said in a notice — the friend's world on your screen is slice 7. **The copy is kept current:** `writeBack` had no caller before slice 5, so a guest came home from the copy it arrived with — the host reads the live profile every `NET.snapshotSec`. **`compare` decides, never arrival order** (an older save loses to a newer suitcase; a `left` record hands over its own save). **`bye`** (tab close / Go home) = final copy, then out. **One window per pilot:** a newer connection retires the older in words, without marking it `left`. **Not drawn yet: a visiting ship** (7–8) — the pilot is real and simulated, one hull drawn. **Playtest 22 (`2026-11-24f`):** a guest's identity is **its own browser's** (`tr_mp.pilotToken`), not the link's shared secret, so **two friends can use one link**; before, the second visitor retired the first and the retired browser could never rejoin (L47). **No player cap:** `NET.maxGuests` (100) is a valve, the host's machine decides. Chat: **12 s** (`CHAT.autoHideSec`; your own line counts); a self-opened chat is **lines only** (**Pin** and the players column show only while the field is open); **Pin** is one word in two colours (L46). Guide: [../testing/TESTING-22-CHAT.md](../testing/TESTING-22-CHAT.md). Guides: [../testing/TESTING-16-SLICE5.md](../testing/TESTING-16-SLICE5.md), [../testing/TESTING-16-SLICE4.md](../testing/TESTING-16-SLICE4.md). **Step 17 (dedicated servers) planned, not built** — headless server, one world, Minecraft-style port forwarding, optional auth (Supabase).
- **Shared flight model (2026-11-21):** every ship flies `sim/flight-model.js` from data stats; NPCs via `sim/npc-pilot.js` (`flight` block in `data/enemies.js`). N presets gate floating labels.
- **Earlier playtest history:** PRs #37–#61: [archive/HANDOFF_PLAYTEST_HISTORY_2026-11-19.md](archive/HANDOFF_PLAYTEST_HISTORY_2026-11-19.md).
- **Scenery:** Meridian only — sun-facing C opening, 1000 m arrival; 16% radial strays, 25% vertical fringe; other fields 2.5× wider (`sceneryFeatures`).
- **Stock camera:** `BASE_HFOV = 85` (`data/camera.js`), vertical FOV from aspect, chase 14.9 / 23.1 / 14.3. Settled: do not change unasked.
- **System space (2026-11-16, playtest passed):** every pocket has a derived 3D AU position and wears the **system sky layer** (`render/systemsky.js`) — the star/black hole as a real sphere, siblings as faint dots — with the one `DirectionalLight` re-aimed per pocket. Guide: [../testing/TESTING-SYSTEM-SKY.md](../testing/TESTING-SYSTEM-SKY.md); detail in [architecture/world-and-map.md](architecture/world-and-map.md).
- **Models & collision (playtested 2026-11-16):** a drop-in `.glb` per drawn thing; ships, enemies and weapons collide with the drawn mesh (`sweepColliders`); **everything solid hurts**. See [GLB_MODELS.md](GLB_MODELS.md).
- **Earlier confirmed (2026-11-16):** Test Ship (1 cr, `testship`, 1000 Hull, 10× damage); 14c wormholes (ordinary systems, 75 standing, ≤3 per system, 20-minute clock, save v21→v25); cube-map skies (`STARFIELD.enabled = false`, panoramas kept but not drawn, `render/cubemap.js`).

## The owner's ground rules (do not break these)

- No new npm dependencies; plain ES modules. The one planned exception is a small networking library at the
  multiplayer step (16), with the owner's approval. For anything else, stop and ask.
- Keep the folder structure and conventions. Tuning numbers live in `src/data/`. Restructuring happens only
  as a numbered refactor step, never as a side effect.
- Saves stay backward-compatible: bump `SAVE_VERSION` in `src/state/profile.js`, add a migration and an
  old-save test whenever the saved shape changes. Storage keys `tr1`, `tr_s1..tr_s3` and the `TR1:` code
  prefix never change.
- Systems talk through the event bus (`src/util/events.js`), not by importing each other.
- Do not change behaviour nobody asked about (the FLIGHT and CAMERA feel and authored hull bonuses/holds
  are intentional).
- Run `npm test` and `npm run build`, or say plainly what could not run. Never guess results. End every reply
  that changes `src/` by telling the owner to run `npm run build` and `npm test`.
- `game/tallow-reach.html` is generated. Never edit it by hand.
- Add a short top entry to [CHANGELOG.md](CHANGELOG.md) for every change and include it in the delivery.
  **It holds at most 10 full entries:** after adding yours, if there are more than 10, move the oldest ones verbatim to the
  top of `CHANGELOG_ARCHIVE.md` and add one index line each, so exactly 10 remain. Never delete history.
- Refactors follow [REFACTOR_PLAN.md](REFACTOR_PLAN.md): plan in plain language, ask the open questions, wait for
  the owner's OK, build one slice, deliver a playtest guide, tick the step only after the owner says it passed.
- **Missions must behave like real life** ([MISSION_RULES.md](MISSION_RULES.md)): items only enter the hold by a
  real pickup or hand-over, dialogue buttons never change the world, nothing spawns in the pilot's face, and a
  mission is never stuck or silently failed. Build missions from the templates; the linter and invariant tests
  must pass.
- For simple or conversational requests, answer in chat; do not rebuild guides or backups unless asked. Check a
  file exists before overwriting it.

## Keeping the game scalable (the owner plans to make it much bigger)

1. **Content is data.** A new enemy, item, ship, module, loot table, shop, place, encounter or mission is an
   entry in `src/data/` plus a recipe. If adding plain content seems to need a change in `src/sim/`, stop: the
   framework is missing a feature. Extend the framework first (its own change, with tests) and tell the owner.
2. **The eight architecture principles** in [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md) hold for every change:
   the sim is pure (no screen, sound or keyboard), entities are data and meshes are views, all randomness goes
   through `util/rng.js`, profile/world/session state stay apart, players are a list, input is a command, the
   sim runs on a fixed step. Never deepen a listed "debt".
3. **Do not hard-code ids** of a specific enemy, place or mission in code. Look things up by id from data.
4. **Every new system ships with:** a data table, an event, a test, and an entry in the matching recipe or area
   doc. A mission or content type without a linter or test is unfinished.
5. **Keep the docs small.** Add a new recipe as its own file in `docs/recipes/` (next number) and a row in
   [HOW_TO_ADD.md](HOW_TO_ADD.md); add area facts to the matching file in `docs/architecture/`. Do not grow this
   file or `ARCHITECTURE.md`. `npm test` fails if a doc grows past its size limit or a link breaks.

## Before you end a chat (checklist)

1. `docs/CHANGELOG.md`: new top entry added, at most 10 full entries left (oldest moved to the archive, with index lines).
2. `docs/ROADMAP.md`: step status ticked or updated (only if the owner confirmed a playtest passed).
3. This file: rewrite "Where the game is now" if it changed (the save version must match `SAVE_VERSION`).
4. Docs you verified against the code: update their "Last checked" date. New or changed `src/` file: update that folder's
   `README.md` and, for a new recipe or area fact, the index or area file.
5. Tell the owner to run `npm run build` and `npm test`, and to zip the project as the next chat's baseline.

## When the owner reports a bug

1. Reproduce it as a failing test first when you can.
2. Find the **root cause** and fix the whole **class** of bug, not only the one case.
3. Add or extend a regression test (for missions, an invariant in `tests/mission-invariants.test.mjs`).
4. Add or update an entry in [LESSONS.md](LESSONS.md): what the owner saw, the general cause, the rule, the
   test that enforces it. If it is a repeat of an existing lesson, say so there and strengthen the test.
5. Mention it in the CHANGELOG entry. Do not tick the affected step until the owner re-plays it.

The owner's report usually has three parts: *what I did, what I expected, what happened.* If one is missing,
ask for it.

## Build, test and play

From the project folder:

```sh
npm install        # first time only
npm run build
npm test
node serve.mjs     # optional: serves game/ on http://localhost:8080
```

Or double-click `game/tallow-reach.html`. If a preview blocks localStorage, open it in its own tab. Owner playtest guides are in [../testing/](../testing/README.md): play `TESTING-BASELINE.md` plus the guide for the step. To try the mission test missions, open the game with `?testmissions` on the end of the address.

## Map of the docs

| File or folder | What it holds |
| --- | --- |
| `LESSONS.md` | Classes of bug earlier chats hit, the rule that prevents each, and the test that enforces it. |
| `MISSION_RULES.md` | How missions must behave; the linter, templates, invariant tests and test missions. |
| `VISION.md` | The owner's intent, settled decisions, open questions. |
| `ROADMAP.md` | Step status (the only place), content you can add now, the parking lot, the log. |
| `REFACTOR_PLAN.md` | The refactor steps still to do, with prompts. Finished steps are in `archive/`. |
| `TARGET_ARCHITECTURE.md` | The end-state design, the eight principles, the debt register. |
| `ARCHITECTURE.md` | How the code works **now**: layers, events, state, saves. Area details in `architecture/`. |
| `HOW_TO_ADD.md` | Index of 22 recipes in `recipes/`. |
| `CHANGELOG.md` / `CHANGELOG_ARCHIVE.md` | Recent changes in full, older history. Never delete entries. |
| `AI_PROMPTS.md` | Prompts the owner pastes into new chats. |
| `archive/` | Superseded text, kept word for word: old HANDOFF, finished refactor steps, old status prose. |
| `../testing/` | Owner playtest guides (current ones on top, `passed/` for finished steps). Each `src/` folder also has a short `README.md` listing its files and rules. |