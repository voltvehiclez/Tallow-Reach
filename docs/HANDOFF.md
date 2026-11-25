# HANDOFF: read this first, then stop and pick your task

You are continuing work on **Tallow Reach**, a browser 3D space sim (three.js). The owner **cannot
code**: give complete files (or exact find-and-replace edits) with full paths, and always say what to
run and what to click. Different AI assistants work in separate chats and none remembers earlier ones.
**The docs are the memory.** Do not read every doc: read this file, then only what your task needs.

*Last checked: 2026-11-25 (build `2026-11-25b`). This file is a snapshot, not a log: rewrite it (do not append) at the end of a chat.*

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

- Save version: **v29** (v29 adds the `away` marker beside the profile — a pilot visiting another
  world — and the host side, `world.worldId` + `world.guests`; v28 added the seven filter presets).
- **Which steps are done, built or next: the step table in [ROADMAP.md](ROADMAP.md).** It is the only place step status is kept (this file, REFACTOR_PLAN and the README do
  not repeat it); tick steps there.
- **Ask the owner at the start:** "Did the pending playtests in ROADMAP pass?" Tick them if so; fix a reported bug first.
- **Step 15 campaign (built, owner-approved 2026-11-21; v28):** a separate mode with its own pilot and a fixed galaxy (`240515`), dual-mode save envelope; First Sortie is a flight-school tutorial for Dane Korr. Act's words: [FIRST-SORTIE-DIALOGUE.md](FIRST-SORTIE-DIALOGUE.md); rules: [MISSION_RULES.md](MISSION_RULES.md); guide: [../testing/TESTING-15-CAMPAIGN.md](../testing/TESTING-15-CAMPAIGN.md); full build notes archived in [archive/HANDOFF_PLAYTEST_HISTORY_2026-11-19.md](archive/HANDOFF_PLAYTEST_HISTORY_2026-11-19.md).
- **Step 16 multiplayer — eight slices; 1–5, 7 and 8a PLAYTEST-CONFIRMED (to 2026-11-25; 8a passed on `d`), **8b built (`e`) awaiting playtest**, 6 (trading) last:** [REFACTOR_PLAN.md](REFACTOR_PLAN.md), rules in [architecture/multiplayer.md](architecture/multiplayer.md). **Slice 1:** `data/multiplayer.js` says what travels, `net/custody.js` packs it. **Slice 2, save v29:** `save.away`, `world.guests`. **Slice 3:** `net/transport.js` names `trystero@0.27.0` (the one library); `net/session.js` a session, `net/protocol.js` the messages, `net/paste.js` the `TRJOIN:` codes; one screen, `ui/multiplayer.js` (host: switch → link → codes; join: one box). **Enter** opens chat; **a hosted world never pauses**; no campaign row. TURN relays are dead; the game carries its own (`ICE.turn`). Opening your own world ends a visit. **Slice 4:** **Join** only looks around — **Bring my pilot** freezes the pilot at home and sends it. `carry`/`suitcase` are capped at `NET.suitcaseMaxBytes` 256 KB and **refused in words, never truncated**; `epoch`/`rev` ride beside; `cleanCarry` never strips unknown ids (L16). The host keeps a **`tokenHash`, never the token**; the visitor is a real docked ship (`sim/multiplayer.js`). **Bring pilot home** works offline from the suitcase; the away card is raised by **every Open World press** and takes **the copy that world holds** — L33/L34/L35/L36 (holds, lockers, `forgetPeer`). **Slice 5 (`a`): a lost host (closed browser, or `NET.lastSeenSec` of silence) returns the guest to the **menu** with **"Lost connection to host"** and one door; a rejoin keeps the server's copy. **The copy is kept current** (read every `NET.snapshotSec`); **`compare` decides, never arrival order**; **`bye`** = a final copy; **one window per pilot**. **Playtest 22:** identity is **the browser's own** (`tr_mp.pilotToken`), not the link's, so **two friends can use one link** (L47). Chat: **12 s** unless pinned, lines-only when self-opened (L45/L46). **Slice 7 (`h`):** a visitor is a blip under its system and a row in the panel. **Slice 8a (`b`): the second hull, and playtest 23's two fixes.** The host sends `SHIP_FIELDS` for every pilot at `SHIP_STREAM.hz` **24 Hz** as a `ships` message, capped (`LIMITS.ships` 24 per packet, batched). A guest draws them as **views only** (`render/shipstream.js`: 100 ms behind, interpolated, held — never guessed); **the host needs no wire**: `render/views.js` draws each visiting record from `state.players`. Same pocket only. No save change. **Playtest 23 (`b`) fixed two bugs, both tested: (1) a friend is a ship like any other** — `render/views.js` publishes `state.otherPilots` (a guest's only friend) and `sim/targeting.js` offers it to **F** as lock kind **`"p"`**, with **the pilot's own name** and **hull/shield bars**; the N list has it as a **Ship** row and `SHIP_FIELDS` gained **`shield`** (`sim/pilot-stats.js` owns both fractions). **(2) A pilot can always come back** — the host's write-back and `left` mark edit a record **without** the guest's secret, and `guestRecord` had re-hashed `undefined` over the stored `tokenHash`, locking a pilot out of its own link for ever; **an edit that carries no secret never changes the hash** (`custody.recordTokenHash`). **Second round (`c`):** a record holding the hash of *nothing* **cannot refuse anybody** (`handshake` admits it and `putGuest` writes the real hash), so the damaged browser rejoins on the same link; a **`carry` never rewrites an existing record's hash**; a refusal **ends the attempt**. **A pilot's hull is a body:** ships collide (`pilotHullRadius`), bolts and warheads stop on it shields-first, and a destroyed visitor is announced (`mp-guest-destroyed`); recovery is 8d's debt. **Third round (`d`):** the N list's **Ship** filter carries every ship — a **docked** pilot is a row too. **8b (`e`): the guest flies.** A `controls` kind (clamped; **the peer is the identity**) goes out at `CONTROLS.hz` **30** from **`state.localInput`** — one new state, one writer (`core/input.js`) — and `applyGuestControls` writes it into that visitor's `controls` + `aimDirection`; a docked visitor **launches on its first asking**, and silence quiets it after `staleMs` **400**. No prediction (**8d**), no pocket-follow (**8c**); a launched visitor cannot dock again yet. Guide: [../testing/TESTING-16-SLICE8B.md](../testing/TESTING-16-SLICE8B.md) (8a: [SLICE8A](../testing/TESTING-16-SLICE8A.md)). Earlier: [slice 5](../testing/TESTING-16-SLICE5.md), [slice 7](../testing/TESTING-16-SLICE7.md). **Step 17 (dedicated servers) planned, not built** — headless server, one world, Minecraft-style port forwarding, optional auth (Supabase).
- **Shared flight model (2026-11-21):** every ship flies `sim/flight-model.js` from data stats; NPCs via `sim/npc-pilot.js` (`flight` block in `data/enemies.js`). N presets gate floating labels.
- **Earlier playtest history:** PRs #37–#61: [archive/HANDOFF_PLAYTEST_HISTORY_2026-11-19.md](archive/HANDOFF_PLAYTEST_HISTORY_2026-11-19.md).
- **Scenery:** Meridian only — sun-facing C opening, 1000 m arrival; other fields 2.5× wider (`sceneryFeatures`).
- **Stock camera:** `BASE_HFOV = 85`, chase 14.9 / 23.1 / 14.3. Do not change unasked.
- **System space (2026-11-16, playtest passed):** every pocket has a derived 3D AU position and the **system sky layer** (`render/systemsky.js`). Detail: [architecture/world-and-map.md](architecture/world-and-map.md).
- **Models & collision (2026-11-16):** a drop-in `.glb` per drawn thing, collided with the drawn mesh; **everything solid hurts** ([GLB_MODELS.md](GLB_MODELS.md)).
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

Or double-click `game/tallow-reach.html`. If a preview blocks localStorage, open it in its own tab. Guides: [../testing/](../testing/README.md) — `TESTING-BASELINE.md` plus the step's guide. To try the mission test missions, open the game with `?testmissions` on the end of the address.

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