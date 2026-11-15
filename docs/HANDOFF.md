# HANDOFF: read this first, then stop and pick your task

You are continuing work on **Tallow Reach**, a browser 3D space sim (three.js). The owner **cannot
code**: give complete files (or exact find-and-replace edits) with full paths, and always say what to
run and what to click. Different AI assistants work in separate chats and none remembers earlier ones.
**The docs are the memory.** Do not read every doc: read this file, then only what your task needs.

*Last checked: 2026-11-14. This file is a snapshot, not a log: rewrite it (do not append) at the end of a chat.*

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
| **Rifts, instances, wormholes, consumables** | "Step 14" in [VISION.md](VISION.md), [recipes/22](recipes/22-a-new-rift-or-instance.md), `src/data/instances.js` and `src/sim/instances.js` (both documented at the top) |
| Ships, modules, weapons, fitting | [architecture/ship-systems.md](architecture/ship-systems.md) |
| Items, inventory, shops, loot, enemies, randomness | [architecture/content-data.md](architecture/content-data.md) |
| The tick, input, sound, rendering | [architecture/simulation-and-rendering.md](architecture/simulation-and-rendering.md) |
| `.glb` models, collision | [GLB_MODELS.md](GLB_MODELS.md) |
| Screens and menus | [architecture/ui-and-screens.md](architecture/ui-and-screens.md) |
| A numbered refactor step | [REFACTOR_PLAN.md](REFACTOR_PLAN.md), [ROADMAP.md](ROADMAP.md) |
| Saves | "Save compatibility" in [ARCHITECTURE.md](ARCHITECTURE.md) |
| What the game is meant to become | [VISION.md](VISION.md), [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md) |

## Where the game is now

- Save version: **v21**.
- **Which steps are done, built or next: see the step table in [ROADMAP.md](ROADMAP.md).** It is the only place step
  status is kept (this file, REFACTOR_PLAN and the README do not repeat it); tick steps there. A step that is "built"
  but not ticked is waiting for the owner's playtest.
- **Ask the owner at the start:** "Did the playtests marked pending in ROADMAP pass?" (tick them there if so). If they report a bug, fix it first, following "When the owner reports a bug" below.
- **Models & collision (2026-11-14, awaiting playtest):** drop-in `.glb` per drawn thing (rebuild inlines; built-in fallback kept); collision fitted to the drawn mesh — rocks, station ring/hub, planets, missiles; `noclip` the only mesh opt-out, `collide: false`/`collideDmg` the only data ones. Enemies are solid (ram both ways; raider rams deal/take damage). Any kill settles kill/hunt/wave-clear objectives for every holder; only hunt habitat gates hunts. Save **v21**. See [GLB_MODELS.md](GLB_MODELS.md).
- **Bug round (2026-11-14, built, awaiting the owner's re-play):** with Alt held the free camera rolls with the hull (E/Q spins the ship in a still frame), keys **1/2 select primary bay 1/2 and only the selected bay's weapon fires** (save `pw` stores `"1"`/`"2"`; legacy `cannon`/`beam` migrate to the bay holding that kind of module — v21 saves load cleanly), and world-space markers hide with the HUD, so nothing floats over the main menu.
- **Test Ship (2026-11-15, awaiting playtest):** 1-cr Hangar hull `testship` — 100× Hull HP, 10× damage, Wasp's hold/layout/stock fit, owner's 13 MB `heavyfighter.glb` inlined. Buy in Hangar: arrives fully fitted, 1000 Hull HP. See [GLB_MODELS.md](GLB_MODELS.md).
- **Bug round two (2026-11-14, built, awaiting the owner's re-play):** the Sell/Discard confirm buttons sit in the popover's title row; both flows anchor with one rule (clicked-entry centre − 44px) so Discard keeps the placement the owner approved and Sell matches it — the confirm rides just above the mouse. A hunt contract is scoped to the pocket it was accepted in (kills elsewhere don't count; the objective names the area). Rebuilt on `arena/22587946-tallow-reach` after Continue reset the branch.
- **14c simple wormholes built, waiting on the owner's playtest:** a pocket spawns itself in an ordinary system,
  appears on that system's map as a "Simple Wormhole" with no notice — **20 minutes from spawn, kept in `world.wormholes`**.
  Always **75** in the universe, never more than **3 per system**; clocks stagger on a fresh universe, and replacements
  pop up with the full 20 minutes. The pocket shows the system's own starfield; a grey dark sphere you can lock hangs at
  its centre. Every instance interior is the owner's panorama now (dark-grey nebula for a wormhole site, teal maelstrom
  for a rift, near-black for a deep rift). The far side is a site (smugglers and a freighter to destroy, a lumenite belt
  to mine, a guardian hive), is **less hardcore than a rift — leave at any time** — and is re-enterable until the pocket
  expires; objectives and rewards are one-time. Collapse fades the way in; the **Stable wormhole** out always works, no
  clock, no `kill` outcome. v20 → **v21**; step 15 is **v22** (guide:
  [../testing/TESTING-14C-WORMHOLES.md](../testing/TESTING-14C-WORMHOLES.md)). Next: **14d**, then step 15. A run saves as
  template, seed, clock, objective, prize (half-traded) and entry spot (`world.instances`); a standing simple wormhole
  saves as id, parent, seed, mapPos, spawn time, template and remaining clock (`world.wormholes`). Campaign = step 15 (v22): mission templates + linter green, see [architecture/feature-notes.md](architecture/feature-notes.md).
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