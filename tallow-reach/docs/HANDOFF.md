# HANDOFF: read this first

You are continuing work on **Tallow Reach**, a browser space mining/combat game. The owner cannot
code. Give them complete files or exact find-and-replace edits with full file paths, and always say
what to run and what to click. These docs are the project's memory across chats: read the relevant
ones before changing anything, and update them when decisions or state change.

## Ground rules from the owner (do not break these)

- No new npm dependencies. Plain ES modules only. The sole planned exception is a small networking
  library at the multiplayer step (16); if anything else needs a library, stop and ask first.
- Keep the existing folder structure and conventions. Tuning numbers live in `src/data/`.
  Restructuring happens only as a numbered refactor step, never as a side effect.
- Saves stay backward-compatible: bump `SAVE_VERSION` in `src/state/profile.js`, add a migration and
  an old-save test whenever the saved shape changes. Storage keys `tr1`, `tr_s1..tr_s3` and code
  prefix `TR1:` never change.
- Systems talk through `src/util/events.js`, not by importing each other.
- Do not change behaviour nobody asked about. The settled FLIGHT/CAMERA feel and hulls' hold-only
  differences are intentional.
- Run the tests and the build, or state plainly what could not run. Never guess results.
- `game/tallow-reach.html` is generated. Never edit it by hand; rebuild with `npm run build`.
- Add a short top entry to `docs/CHANGELOG.md` for every change and include it in the delivery. If
  that file holds more than 15 full entries, move the oldest verbatim into `docs/CHANGELOG_ARCHIVE.md`
  until 10 remain, add index lines, and deliver both files. Never delete history.
- Refactors follow `docs/REFACTOR_PLAN.md`: plan in plain language, ask the open questions, wait for
  the owner's OK, build one slice, deliver a numbered playtest guide, tick the step only after the
  owner says the playtest passed.
- At the end of a long chat, rewrite this file and update `docs/ROADMAP.md`. Record decisions in
  `docs/VISION.md`.

## Where things stand (2026-11-08)

- **Milestone C is underway.** Steps 0 to 10 are ticked (step 10 owner playtest passed after three
  found bugs were fixed). **Step 11 is in progress:** slice **11A** is built and the owner playtest passed on 2026-11-08; slice **11B** is next.
- **Step 11A added** `src/data/galaxy.js`, `src/sim/galaxy.js`, `src/sim/travel.js`, explicit
  `PLACE_LINKS` in `src/data/places.js`, and `tests/step11a-galaxy.test.mjs` (19 tests). It resolves an
  organic 2D web of 121 systems by default, one ordinary empty pocket plus one empty gate pocket per
  neighbouring system, one external gate peer per gate, author move/delete/promote/route overrides,
  configurable visibility, advisory distance tiers and free direct-hop travel quotes.
- **No live gameplay or save change in 11A.** The new modules are not imported by `main.js`; M still
  cycles the current system's pockets. Saves remain **version 15** (`{ v: 15, profile, world }`,
  `world.place`, `world.resume`, `world.galaxy: null`). Step 11B will wire the M starmap/pocket chooser
  and migrate to **v16** (seed + compact discovery/visit records, not generated geography).
- **Owner's step-11 decisions (VISION.md):** organic web, not a square grid; travel only to a directly
  connected pocket, free for now; Meridian keeps `reach`/`hollow` unchanged and gains separate new gate
  pockets; Kestrel Hollow is not a gate; generated systems are empty placeholders; whole map visible
  through a configurable policy; difficulty is distance guidance with seeded variation while actual
  content decides danger; construction must stay modular (move/delete/promote/generator edits, not
  rewrites). Future fuel, activated gates and supercruise are not implemented yet.
- **Results:** `npm ci` succeeded; `npm test` **279/279 pass** (260 baseline + 19 new; both 8b oracles
  unchanged); `npm run build` succeeded.
- **Known limits:** no starmap screen yet; no pocket memory/respawn; enemies do not shoot back; one
  enemy AI; no mission framework; contracts are still the step-3 placeholder. Later save versions are
  reserved: 11→16, 12→17, 13→18, 15→19 (v15 is already used by the resume point).

## What to do next

0. **11A owner playtest passed on 2026-11-08.** The owner reported a pass using `TESTING-11A.md`
   (project root); no bugs were reported. This confirms the invisible 11A slice, not the whole of
   step 11. A full project backup is delivered as `tallow-reach-step11a-passed-backup.zip` outside
   the project folder. It excludes dependencies, Git internals and browser-local saves; export a
   `TR1:` code separately to back up game progress. Step 11B has not been started in this backup.
1. **Step 11B** (owner-approved slice, not yet started): `src/ui/starmap.js` opened with **M**; show the
   organic system web, current location, gate connections and a selected system's pocket list; only
   legal direct destinations may start the existing warp sequence. Migrate save v15→v16 storing the
   galaxy seed and compact discovery/visit records; removed-pocket fallback to a safe home station
   without losing character/cargo. Add map interaction tests and `docs/TESTING-STARMAP.md`. Do not
   tick step 11 until the owner playtest passes.
2. Then **step 12** (encounters, place templates, place memory, save v17), asking the remaining VISION
   open questions (respawn behaviour, faction standing, wormhole destination, etc.) first.
3. Keep the modularity rule: moving a system, deleting a pocket, promoting a pocket to a gate, adding a
   route or replacing the generator must remain data/registry edits. `tests/step11a-galaxy.test.mjs`
   proves the current examples; extend it when adding new edit shapes.

## Map of the docs

| File | What it holds |
| --- | --- |
| `VISION.md` | The owner's intent, settled decisions and remaining open questions. Read before adding features. |
| `ROADMAP.md` | Milestones, ordered steps, current position, change log of direction. |
| `REFACTOR_PLAN.md` | The numbered steps in detail: goal, questions, do/done/save-version. |
| `TARGET_ARCHITECTURE.md` | The intended end-state design and the debt register that tracks what is still hardcoded. |
| `ARCHITECTURE.md` | How the code works **now**: layers, event flow, module responsibilities. |
| `HOW_TO_ADD.md` | Recipes for common content changes (items, ships, weapons, places, starmap edits, ...). |
| `CHANGELOG.md` / `CHANGELOG_ARCHIVE.md` | Recent changes / older history. Never delete entries. |
| `TESTING-*.md` | Numbered owner playtest guides per feature. `TESTING-BASELINE.md` checks nothing regressed. |
| `AI_PROMPTS.md` | Prompt templates for future chats. |

Each `src/` folder also has a short `README.md` listing its files and rules.
