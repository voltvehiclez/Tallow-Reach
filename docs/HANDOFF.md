# HANDOFF: read this first, then stop and pick your task

You are continuing work on **Tallow Reach**, a browser 3D space sim (three.js). The owner **cannot
code**: give complete files (or exact find-and-replace edits) with full paths, and always say what to
run and what to click. Different AI assistants work in separate chats and none remembers earlier ones.
**The docs are the memory.** Do not read every doc: read this file, then only what your task needs.

*Last checked: 2026-11-13. This file is a snapshot, not a log: rewrite it (do not append) at the end of a chat.*

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
| Ships, modules, weapons, fitting | [architecture/ship-systems.md](architecture/ship-systems.md) |
| Items, inventory, shops, loot, enemies, randomness | [architecture/content-data.md](architecture/content-data.md) |
| The tick, input, sound, rendering | [architecture/simulation-and-rendering.md](architecture/simulation-and-rendering.md) |
| Screens and menus | [architecture/ui-and-screens.md](architecture/ui-and-screens.md) |
| A numbered refactor step | [REFACTOR_PLAN.md](REFACTOR_PLAN.md), [ROADMAP.md](ROADMAP.md) |
| Saves | "Save compatibility" in [ARCHITECTURE.md](ARCHITECTURE.md) |
| What the game is meant to become | [VISION.md](VISION.md), [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md) |

## Where the game is now

- Save version: **v19**.
- **Which steps are done, built or next: see the step table in [ROADMAP.md](ROADMAP.md).** It is the only place step
  status is kept (this file, REFACTOR_PLAN and the README do not repeat it); tick steps there. A step that is "built"
  but not ticked is waiting for the owner's playtest.
- **Ask the owner at the start:** "Did the playtests marked pending in ROADMAP pass?" and tick them there if so. If they
  report a bug, fix it first, following "When the owner reports a bug" below.
- The campaign (step 15) must be built from the mission templates and pass the linter.
- Detailed notes on how the galaxy, starmap, place templates and mission runner were built are in
  [architecture/feature-notes.md](architecture/feature-notes.md). Code and tests are authoritative.

## The owner's ground rules (do not break these)

- No new npm dependencies; plain ES modules. The one planned exception is a small networking library at the
  multiplayer step (16), with the owner's approval. For anything else, stop and ask.
- Keep the folder structure and conventions. Tuning numbers live in `src/data/`. Restructuring happens only
  as a numbered refactor step, never as a side effect.
- Saves stay backward-compatible: bump `SAVE_VERSION` in `src/state/profile.js`, add a migration and an
  old-save test whenever the saved shape changes. Storage keys `tr1`, `tr_s1..tr_s3` and the `TR1:` code
  prefix never change.
- Systems talk through the event bus (`src/util/events.js`), not by importing each other.
- Do not change behaviour nobody asked about (the FLIGHT and CAMERA feel and the hold-only hull differences
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

Or double-click `game/tallow-reach.html`. If a preview blocks localStorage, open it in its own tab. Owner
playtest guides are in [../testing/](../testing/README.md): play `TESTING-BASELINE.md` plus the guide for the
step, load an old save, and back up a zip. To try the mission test missions, open the game with `?testmissions`
on the end of the address.

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
| `HOW_TO_ADD.md` | Index of 21 recipes in `recipes/`. |
| `CHANGELOG.md` / `CHANGELOG_ARCHIVE.md` | Recent changes in full, older history. Never delete entries. |
| `AI_PROMPTS.md` | Prompts the owner pastes into new chats. |
| `archive/` | Superseded text, kept word for word: old HANDOFF, finished refactor steps, old status prose. |
| `../testing/` | Owner playtest guides (current ones on top, `passed/` for finished steps). |

Each `src/` folder also has a short `README.md` listing its files and rules.
