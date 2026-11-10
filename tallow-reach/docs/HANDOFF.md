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
- For simple/conversational requests, answer directly in chat; do not rebuild guides/backups unless
  asked. Check a file exists before overwriting it.

## Where things stand (2026-11-08)

- **Milestone C is underway.** Steps 0–10 are ticked. **Step 11 is in progress:** 11A is built and
  owner-playtest-passed; **11B is built and awaiting the owner playtest** in root `TESTING-STARMAP.md`.
  Do **not** tick step 11 until that pass is reported.
- **11A foundation:** `src/data/galaxy.js`, `src/sim/galaxy.js`, `src/sim/travel.js`, explicit
  `PLACE_LINKS`, and `tests/step11a-galaxy.test.mjs` (now 23 tests). Default seed `11082026` resolves
  **121 systems / 462 pockets / 511 links**: organic scatter, 1–4 neighbours, dead ends/junctions/loops,
  one ordinary empty pocket plus one empty gate pocket per neighbour, exactly one reciprocal external
  peer per gate. Meridian keeps `reach`/`hollow`; Kestrel Hollow is not a gate.
- **11B live slice (system-map follow-up built):** `src/ui/starmap.js` opens with **M** while flying. The galaxy
  web shows gate lines, current/visited/selected markers, inspect dropdown and zoom/pan/labels. Zooming
  into a selected system dot (wheel/+ past `map.systemEntryZoom`, or double-click) opens a derived
  **system pocket map** with a short zoom transition. Ordinary pockets orbit a central visual-only
  **star (95%) / black hole (5%)**; gates sit farther out with dashed stubs toward the exact neighbouring
  system. The core keeps a permanent two-line proper-name/type label (Meridian System → **Meridian** /
  **(Star)**); native hover tooltips are gone from pockets/core, while click popups remain. Core radii are
  map units so the graphic scales with system zoom; pocket dots/labels stay screen-sized. Gate pocket names
  sit inward clear of orange stubs, and neighbouring-system labels are clickable travel targets quoting the
  reciprocal gate pocket. Galaxy pan is bounded to 0.5–1 screen pixels per pointer pixel, increasing gently when zoomed out.
  `systemPocketLayout` is deterministic and never saved; author `mapPos` overrides
  win. Open-world systems allow **free warp to any local pocket** and omit internal blue lines. The data
  opt-out `intraSystem: "links"` restores internal routes/lines for future route-only instances; the main
  galaxy always keeps explicit gate routes. **Click/right-click a pocket or gate-neighbour label** (or keyboard-activate it) opens
  **Warp to …** only for a legal hop and emits the same named travel action. `main.js` calls `startWarp`,
  which requotes policy/link/cost/requirements and runs the unchanged warp animation.
  Refusals emit `travel-denied` and stay visible in the chart. The right panel is a compact overview
  (system name, current pocket, plain pocket rows) with no warp buttons, tier/description cards or scrolling.
- **Pause/input:** `isSimulationPaused()` freezes single-player flight while the chart is open;
  `state.multiplayer` is the future host flag that keeps a hosted world running. Opening the chart
  clears/zeroes flight controls, blocks free-cam start and dock/lock/weapon hotkeys, and suspends audio;
  a later user-gesture audio init does not undo that suspension. M closes the chart; Esc closes an open
  pocket popup first, then the chart; P closes the chart then pauses.
- **Save v16:** `world.galaxy` is only `{ seed, knowledge }` (compact per-system discovery/visit flags).
  Generated geography is session-only in `state.galaxy` and the live place catalog. Boot, slot load and
  import call `prepareGalaxySave(raw)` before `applySave`: resolve seed → install catalog → sanitize →
  record current visit. A removed/unknown pocket recovers to `DEFAULT_PLACE` (`reach`) with
  `resume:null`, preserving the whole profile/cargo; intro/slot/import show a safe-recovery notice.
  A failed prepare restores the previous catalog. v15 and older saves/codes still load.
- **Results:** `npm test` **312/312 pass** (11A file now 23 tests, 11B map/save file 29; both 8b oracles
  unchanged). `npm run build` succeeded: `game/tallow-reach.html` **669 KB** (684,972 bytes). Automated
  headless DOM/menu/input/audio checks passed; the owner's visual browser playtest is still pending.
  Save **v16 is unchanged** — policies, core kind/name and pocket layout are resolved, not persisted.
  Default geometry retains **121 systems / 462 pockets / 511 links** with identical ids/positions/links;
  its independent core rolls give 116 stars and 5 black holes (including Duskdrift). Meridian is a star.
- **Known limits:** generated pockets are empty placeholders; visibility is `all`; travel is free and
  non-empty route costs are refused until a handler exists; no fuel, activated/proximity gates,
  supercruise or warping to/near a central body. Temporary instanced-system lifecycle is still step 14;
  only its local route-policy opt-out is ready now.
  Place memory/respawn is step 12. Enemies do not shoot back beyond the existing raider behaviour; one
  enemy AI; contracts are still the step-3 placeholder; no mission framework yet. Later save versions
  are reserved: 12→17, 13→18, 15→19.
- **Backup:** the owner-approved 11A full project backup is published on GitHub:
  `https://github.com/voltvehiclez/Tallow-Reach/archive/8df6042c4161bd65f39d4ba0fc4b7016b02e40ae.zip`
  (verified public ZIP). Extract and open `tallow-reach/game/tallow-reach.html`. Browser-local saves
  are not in a project ZIP; export a `TR1:` code separately. Root `tallow-reach-step11a*.zip` files are
  local backups and must not be staged.

## What to do next

1. **Owner plays `TESTING-STARMAP.md`** (project root). It covers opening/closing/pause, input release,
   inspect/zoom/pan, permanent core labels and non-warpability, zoom-scaled galaxy pan/core graphics,
   clear gate labels, clickable gate neighbours, free local hops, unchanged galaxy gate routes,
   click/right-click **Warp to** travel through gates, the compact right panel, empty generated
   pockets, save/slot/export resume, old codes A/B/C, recovery notices and regression checks. Old code C is the pre-11B v15 regression fixture in
   `TEST-OLD-CODES.txt`.
2. If the owner reports **pass**, tick step 11 in `docs/ROADMAP.md` and `docs/REFACTOR_PLAN.md`, mark
   the guide passed, update this file and add a changelog entry. If they report a bug, fix that first;
   do not tick the step.
3. Then **step 12** (encounters, place templates, place memory, save v17). Ask the remaining VISION
   open questions first: respawn behaviour, faction standing, wormhole destination/exit, etc.
4. Keep the modularity rule: moving a system, deleting a pocket, promoting a pocket to a gate, adding a
   route or replacing the generator must remain data/registry edits. `tests/step11a-galaxy.test.mjs`
   and `tests/step11b-starmap.test.mjs` prove the current examples; extend them for new edit shapes.

## Build, test and play

From the project folder (`tallow-reach/`):

```sh
npm ci        # only if node_modules is missing
npm run build
npm test
node serve.mjs
```

Open `http://localhost:8080`, or double-click `game/tallow-reach.html`. The existing `serve.mjs` serves
the built `game/` folder on `0.0.0.0:8080`; it is a testing convenience, not part of the game. If the
embedded preview blocks localStorage, open it in its own tab or use the downloaded HTML for save tests.

## Map of the docs

| File | What it holds |
| --- | --- |
| `VISION.md` | The owner's intent, settled decisions and remaining open questions. Read before adding features. |
| `ROADMAP.md` | Milestones, ordered steps, current position, change log of direction. |
| `REFACTOR_PLAN.md` | The numbered steps in detail: goal, questions, do/done/save-version. |
| `TARGET_ARCHITECTURE.md` | The intended end-state design and the debt register. |
| `ARCHITECTURE.md` | How the code works **now**: layers, event flow, module responsibilities. |
| `HOW_TO_ADD.md` | Recipes for common content changes (items, ships, weapons, places, starmap edits, ...). |
| `CHANGELOG.md` / `CHANGELOG_ARCHIVE.md` | Recent changes / older history. Never delete entries. |
| `../TESTING-*.md` | Numbered owner playtest guides at the **project root**, beside `TEST-OLD-CODES.txt`. |
| `AI_PROMPTS.md` | Prompt templates for future chats. |

Each `src/` folder also has a short `README.md` listing its files and rules.
