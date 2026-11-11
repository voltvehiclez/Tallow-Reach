# HANDOFF: read this first

You are continuing work on **Tallow Reach**, a browser space mining/combat game. The owner cannot
code. Give them complete files or exact find-and-replace edits with full file paths, and always say
what to run and what to click. These docs are the project's memory across chats: read the relevant
ones before changing anything, and update them when decisions or state change.

Flight HUD route: “Route to” shows the destination and count of systems still to enter, followed
by remaining system names with amber arrows; the current system is blue and the destination is bold amber
(current stays blue when both). A blocked route shows no count. The starmap route list
also shows only remaining systems and arrows, with measured pagination; exact pocket destinations
remain in its wrapping title. System pocket maps show directed orange overlays for each planned local hop. Destinations persist across relogs and future routes are replanned. The owner passed the Step 11B starmap playtest; the Step 12 place-content playtest is pending in `TESTING-12-PLACES.md`.

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

## Where things stand (2026-11-10)

- **Milestone C is underway.** Steps 0–10 are ticked. **Step 11 is ticked** because the owner passed
  the 11B playtest. **Step 12 is built but awaiting the owner playtest** in root
  `TESTING-12-PLACES.md`; do not tick Step 12 until that pass is reported.
- **11A foundation:** `src/data/galaxy.js`, `src/sim/galaxy.js`, `src/sim/travel.js`, explicit
  `PLACE_LINKS`, and `tests/step11a-galaxy.test.mjs` (now 23 tests). Default seed `11082026` resolves
  **121 systems / 445 pockets / 444 links**: organic scatter, 1–4 neighbours, a sparse tree with dead ends and junctions,
  an ordinary hub plus any detached station pockets and one gate pocket per neighbour, exactly one reciprocal
  external peer per gate. Generated gate traders are moved to `${gateId}-station` pockets with an internal
  link; explicit `allowStation`, `stationPlacement: "gate"` or feature records can still co-locate a
  station deliberately. V2 orders nodes radially and favours depth; default outer 80% radius systems need at
  least 10 gate crossings (11+ in tested seeds). 500 seeds checked; custom tuning can change this.
  Meridian keeps `reach`/`hollow`; Kestrel Hollow is not a gate.
- **11B live slice (system-map follow-up built):** `src/ui/starmap.js` opens with **M** while flying. The galaxy
  web shows straight gate lines and a derived chart-only node layout nudging dots away from unrelated lines, current/selected markers, inspect dropdown and zoom/pan/labels. Visited knowledge remains saved but has no separate light-blue presentation; orange is current. In unusually crowded views, only obstructing unrelated dots mask their individual line; connected endpoints are not masked. Zooming
  into a selected system dot (wheel/+ past `map.systemEntryZoom`, or double-click) opens a derived
  **system pocket map** with a short zoom transition. Ordinary pockets orbit a central visual-only
  **star (95%) / black hole (5%)**; gates sit farther out with blue dashed stubs and blue remote endpoint dots toward
  the exact neighbouring system. Double-clicking a gate/remote-system label switches directly to that peer's
  system map. The core keeps a permanent two-line proper-name/type label (Meridian System → **Meridian** /
  **(Star)**); native hover tooltips are gone from pockets/core, while click popups remain. Station pockets use
  square map icons; core radii are
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
- **Destination navigation:** right-click a galaxy node for **Set destination** and, if currently at
  its directly connected gate, **Warp to**. `findRouteToSystem` searches minimum executable warp hops
  to any pocket in a destination system (normally the arrival gate), respecting policies, enabled links, modes,
  requirements and currently unsupported costs. The galaxy highlights the route; an adaptive arrow list
  below pocket rows shows all remaining stops that fit, adding page arrows only when needed. Pocket popups also offer
  **Set destination**; `findRouteToPocket` plans to that exact pocket, and entering its system does not
  clear it before reaching the pocket. `J` in flight starts one
  ordinary hop at a time via `jumpRoute` -> `startWarp` and requotes; no destination shows **No destination
  set**. Route recomputes from current location, clears on arrival or Clear, and its destination persists in the saved world. The owner passed the map/J follow-up playtest.
- **Map view memory:** closing the chart keeps its session-only galaxy/system mode, selection, zoom,
  pan and labels; reopening clears popup/notice. On local cross-system travel a remembered pocket view
  follows the new system and resets its pocket framing; a galaxy view remains a galaxy view. Same-system
  travel keeps framing, other pilots cannot change local memory, and loading a save resets it. No save
  schema changes; this follow-up was included in the passed Step 11B playtest.
- **Pause/input:** `isSimulationPaused()` freezes single-player flight while the chart is open;
  `state.multiplayer` is the future host flag that keeps a hosted world running. Opening the chart
  clears/zeroes flight controls, blocks free-cam start and dock/lock/weapon hotkeys, and suspends audio;
  a later user-gesture audio init does not undo that suspension. M closes the chart; Esc closes an open
  pocket popup first, then the chart; P closes the chart then pauses.
- **Save v18:** `world.destination` stores the local system or exact pocket target and
  `world.placeMemory` stores only positive remaining simulation-second cooldowns for mined rock slots
  and cleared one-shot encounters. `world.stationStores` keeps one stock per stable
  `${placeId}:${featureId}` station key; `world.store` remains the enumerable home-station alias.
  Legacy v18 saves without `stationStores` migrate their stock to the saved station when possible.
  This optional v18 extension keeps the reserved Step 13 v19 and Step 15 v20 slots intact.
  It autosaves immediately when changed; validation drops invalid or already-reached destinations and
  sanitizes memory. Older saves default to no place memory. The v16 `world.galaxy` is only
  `{ seed, knowledge }` (compact per-system discovery/visit flags); generated geography, templates and
  layout remain session-only in `state.galaxy` and the live place catalog. Boot, slot load and import
  call `prepareGalaxySave(raw)` before `applySave`: resolve seed → install catalog → sanitize → record
  current visit. A removed v1 generated gate recovers to an ordinary pocket in the same system; other
  unknown pockets recover to `DEFAULT_PLACE` (`reach`). Recovery clears `resume` and preserves
  profile/cargo; intro/slot/import show a safe-recovery notice naming the new pocket. A failed prepare
  restores the previous catalog. v15 and older saves/codes still load.
- **Cannon visual follow-up:** a newly spawned local shot now interpolates from the previous rendered
  hull-local muzzle to its current simulated position for its first tick. This addresses a likely
  moving/turning muzzle offset without changing projectile velocity, aim or collision rules. Shots still
  inherit ship velocity, so drift after leaving the muzzle is expected. The owner confirmed this works.
- **Results:** `npm test` **345/345 pass** (including the generated station-local inventory and starmap/station-separation tests;
  existing 8B/11B and Step 12 oracles remain green). `npm run build` succeeded: the generated bundle is
  **698 KB** (the tracked HTML must be restored after validation and is not part of this source patch).
  The owner passed the Step 11B visual playtest; the Step 12 visual playtest is still pending. Save
  **v18** persists destination, place memory and station-local stocks; policies, core kind/name, pocket
  templates and layout are resolved, not persisted. Default geometry is **121 systems / 445 pockets / 444 links**
  (including detached station pockets); system ids/names/positions stay stable, gate connections change; independent core rolls
  give 116 stars and 5 black holes (including Duskdrift). Meridian is a star.
- **Known limits:** generated pockets now resolve the `frontier`, `trade_lane` and `salvage_yard`
  templates, with four encounter kinds; derelicts/caches are represented by crates and trader stations
  reuse Meridian's `SHOPS` definitions with independent station-local storage. Visibility is `all`; travel is free and non-empty route costs are
  refused until a handler exists; no fuel, activated/proximity gates, supercruise or warping to/near a
  central body. Temporary instanced-system lifecycle is still step 14. Stable asteroid slots and cleared
  one-shot encounters use pause-safe simulation-time memory with a 420-second default and a
  `respawn-place` event hook. Enemies keep the existing chase behaviour; no mission framework yet.
  Later save versions are reserved: 12→18, 13→19, 15→20.
- **Backup:** the owner-approved 11A full project backup is published on GitHub:
  `https://github.com/voltvehiclez/Tallow-Reach/archive/8df6042c4161bd65f39d4ba0fc4b7016b02e40ae.zip`
  (verified public ZIP). Extract and open `tallow-reach/game/tallow-reach.html`. Browser-local saves
  are not in a project ZIP; export a `TR1:` code separately. Root `tallow-reach-step11a*.zip` files are
  local backups and must not be staged.

## What to do next

1. **Owner plays `TESTING-12-PLACES.md`** (project root). It covers build/test, generated templates,
   varied asteroid fields, mining and pause-safe simulation timers, save/reload memory, static loot,
   trader docking/Shop/launch, generic patrols and hunt-contract regression, old-save migration and
   baseline checks. Export a current `TR1:` code before starting.
2. If the owner reports **pass**, tick Step 12 in `docs/ROADMAP.md` and `docs/REFACTOR_PLAN.md`, mark
   the guide passed, update this file and add a changelog entry. If they report a bug, fix that first;
   do not tick the step.
3. Keep the modularity rule: adding an encounter or template must remain a data/registry edit.
   `tests/content.test.mjs` and `tests/step12-places.test.mjs` prove the current references and runtime
   behavior; extend them for new content. The earlier `TESTING-STARMAP.md` remains the Step 11 record.

## Build, test and play

From the project folder (`tallow-reach/`):

```sh
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
