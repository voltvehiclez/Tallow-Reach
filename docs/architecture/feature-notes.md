# Architecture: feature notes (steps 10 to 13)

> Part of the architecture docs; index in [ARCHITECTURE.md](../ARCHITECTURE.md). These notes were moved word for word
> out of `HANDOFF.md` on 2026-11-13 and describe the galaxy, starmap, place templates and mission runner as built on
> 2026-11-10. **Code and tests are authoritative.** Statements about playtests "pending" are out of date: the step status
> lives only in [ROADMAP.md](../ROADMAP.md).

## As of 2026-11-10


- **Milestone C is built and Milestone D has started.** Steps 0–10 are ticked. **Step 11 is ticked**
  because the owner passed the 11B playtest. **Step 12 is built; its owner playtest is not recorded** (guide: `testing/TESTING-12-PLACES.md`). **Step 13 is ticked** (owner playtested it
  2026-11-13; guides in `testing/passed/`). The Step 13b runtime is covered headlessly in `tests/step13b-missions.test.mjs`.
- **11A foundation:** `src/data/galaxy.js`, `src/sim/galaxy.js`, `src/sim/travel.js`, explicit
  `PLACE_LINKS`, and `tests/step11a-galaxy.test.mjs` (now 23 tests). Default seed `11082026` resolves
  **121 systems / 445 pockets / 444 links**: organic scatter, 1–4 neighbours, a sparse tree with dead ends and junctions,
  an ordinary hub plus any detached station pockets and one gate pocket per neighbour, exactly one reciprocal
  external peer per gate. Generated gate traders are moved to `${gateId}-station` pockets with an internal
  link and deterministic varied names from `GALAXY.stationNameStyles`; explicit `allowStation`,
  `stationPlacement: "gate"` or feature records can still co-locate a station deliberately. V2 orders nodes
  radially and favours depth; default outer 80% radius systems need at least 10 gate crossings (11+ in tested
  seeds). 500 seeds checked; custom tuning can change this.
  Meridian keeps `reach`/`hollow`; Kestrel Hollow is not a gate.
- **11B live slice (system-map follow-up built):** `src/ui/starmap.js` opens with **M** while flying. The galaxy
  web shows straight gate lines and a derived chart-only node layout nudging dots away from unrelated lines, current/selected markers, inspect dropdown and zoom/pan/labels. Visited knowledge remains saved but has no separate light-blue presentation; orange is current. In unusually crowded views, only obstructing unrelated dots mask their individual line; connected endpoints are not masked. Zooming
  into a selected system dot (wheel/+ past `map.systemEntryZoom`, or double-click) opens a derived
  **system pocket map** with a short zoom transition. Ordinary pockets orbit a central visual-only
  **star (95%) / black hole (5%)**; gates sit farther out with blue dashed stubs and blue remote endpoint dots toward
  the exact neighbouring system. Double-clicking a gate pocket or its remote-system label switches directly
  to that peer's system map. The core keeps a permanent two-line proper-name/type label (Meridian System →
  **Meridian** / **(Star)**); native hover tooltips are gone from pockets/core, while click popups remain.
  Station pockets use square map icons and varied generated station names; core radii are map units so the
  graphic scales with system zoom; pocket dots/labels stay screen-sized. Gate pocket names
  sit inward clear of orange stubs, and neighbouring-system labels are clickable travel targets quoting the
  reciprocal gate pocket. Galaxy system clicks select immediately; pocket/gate first clicks still wait briefly before
  rendering their single-click menu so a browser double-click reaches the original SVG target. Double-clicking
  Galereach or a gate exit opens the peer system map. Galaxy pan is bounded to 0.5–1 screen pixels per pointer pixel, increasing gently when zoomed out.
  `systemPocketLayout` is deterministic and never saved; author `mapPos` overrides
  win. Open-world systems allow **free warp to any local pocket** and omit internal blue lines. The data
  opt-out `intraSystem: "links"` restores internal routes/lines for future route-only instances; the main
  galaxy always keeps explicit gate routes. Active destinations draw solid orange overlays with small arrows
  on galaxy links and local pocket hops; the outward/incoming cross-system gate exits remain orange dashed.
  **Right-click a pocket or gate-neighbour label** (or keyboard-activate it) opens **Warp to …** only for a
  legal hop and emits the same named travel action; left-clicking a pocket-map pocket is inert. `main.js` calls
  `startWarp`, which requotes policy/link/cost/requirements and runs the unchanged warp animation.
  Refusals emit `travel-denied` and stay visible in the chart. The right panel is a compact overview
  (system name, current pocket, plain pocket rows) with no warp buttons, tier/description cards or scrolling.
- **Destination navigation:** right-click a galaxy node for **Set destination** and, if currently at
  its directly connected gate, **Warp to**. `findRouteToSystem` searches minimum executable warp hops
  to any pocket in a destination system (normally the arrival gate), respecting policies, enabled links, modes,
  requirements and currently unsupported costs. The galaxy highlights the route; a shared route-marker list
  below pocket rows shows all remaining stops that fit, adding page arrows only when needed. Pocket popups also offer
  **Set destination**; `findRouteToPocket` plans to that exact pocket, and entering its system does not
  clear it before reaching the pocket. `J` in flight starts one
  ordinary hop at a time via `jumpRoute` -> `startWarp` and requotes; no destination shows **No destination
  set**. Route recomputes from current location, clears on arrival or Clear, and its destination persists in the saved world. The owner passed the map/J follow-up playtest.
- **Map view memory:** closing the chart keeps its session-only galaxy/system mode, selection, zoom,
  pan and labels; reopening clears popup state. Map charts have no bottom status/refusal notice. On local cross-system travel a remembered pocket view
  follows the new system and resets its pocket framing; a galaxy view remains a galaxy view. Same-system
  travel keeps framing, other pilots cannot change local memory, and loading a save resets it. No save
  schema changes; this follow-up was included in the passed Step 11B playtest.
- **Pause/input:** `isSimulationPaused()` freezes single-player flight while the chart is open;
  `state.multiplayer` is the future host flag that keeps a hosted world running. Opening the chart
  clears/zeroes flight controls, blocks free-cam start and dock/lock/weapon hotkeys, and suspends audio;
  a later user-gesture audio init does not undo that suspension. M closes the chart; Esc closes an open
  pocket popup first, then the chart; P closes the chart then pauses.
- **Save v19:** `world.destination` stores the local system or exact pocket target and
  `world.placeMemory` stores only positive remaining simulation-second cooldowns for mined rock slots
  and cleared one-shot encounters. `world.stationStores` keeps one stock per stable
  `${placeId}:${featureId}` station key; `world.store` remains the enumerable home-station alias.
  `profile.missions` stores several active data missions with current step/counters, and `profile.flags`
  stores remembered story values. Legacy v18 and older `profile.mission` contracts migrate to the
  one-step mission shape; a non-enumerable singular view remains for old callers. The v16
  `world.galaxy` is only `{ seed, knowledge }` (compact per-system discovery/visit flags); generated
  geography, templates and layout remain session-only in `state.galaxy` and the live place catalog.
  Boot, slot load and import call `prepareGalaxySave(raw)` before `applySave`: resolve seed → install
  catalog → sanitize → record current visit. A removed v1 generated gate recovers to an ordinary pocket
  in the same system; other unknown pockets recover to `DEFAULT_PLACE` (`reach`). Recovery clears
  `resume` and preserves profile/cargo; intro/slot/import show a safe-recovery notice naming the new
  pocket. A failed prepare restores the previous catalog. v15 and older saves/codes still load.
- **13a/13b mission framework:** `src/data/missions/index.js` defines the extensible vocabulary;
  `contracts.js` keeps the three contract generators data-only and `story.js` contains the ten-step
  `The Border Signal` worked example. A mission's last step only makes it `missionObjectivesDone`: it is accomplished
  when `completeMission` consumes its hand-in (`missionHandIn`) and pays, guided meanwhile by `handIn.objective`
  ("Deliver 2 derelict crates to Meridian Station. You have 1 of 2."), and a lost mission-only hand-in fails it.
  `sim/missions.js` listens for contract events plus story
  triggers/dialogue actions, and now runs dialogue lines/choices, scripts (wave/ship requests, saved
  place state, inventory, sound and warp), waits, flags/branches, parallel objectives and configured
  death/leave/timeout failures. Recover contracts still filter collection to `salv`, while the
  Border Signal uses its dedicated `beacon` item named **Beacon**; ordinary salvage loot stays `salv`.
  Every item-bearing `collect`, `deliver` and `mine` objective consumes its exact required quantity from
  current station stock first and then the ship hold only when its reward is claimed. `sim/contracts.js`
  remains the contract-board facade; `sim/ai.js` handles mission spawn scripts. Story progress, flags,
  timers and `world.missionState` survive v19 save/load. Authored Border Signal loot is now a physical,
  mission-tagged persistent crate saved with its item and position; it restores once on pocket load,
  requires a successful non-docked pickup, and is removed on abandonment/reward. Completed missions remain
  claimable through later sector changes, timeouts or death; mission-scoped triggers cannot wake another
  mission, and scripted item hand-offs wait until the full amount fits. Existing authored Border Signal
  `salv` drop records migrate to `beacon`. The current contract screen lists several active missions
  and retains Accept, Refresh, Abandon and inventory-gated Collect reward actions; Destroy mission rows
  show their live progress again, while Recover/mining item rows keep the concise mission title and
  reward without an extra item-requirement line. Mission-spawned waves now emit `wave-clear` when their
  last hostile dies, and a later reach objective recognizes the pilot's current place. Step 13c now
  adds the data-driven Mission log tab and live dialogue panel; the story offer list can start
  `The Border Signal`, and dialogue choices save through the existing v19 mission shape without
  pausing flight by default. The pause overlay now offers **Exit to main menu** below **Resume**;
  it saves the current resume point and returns to a title screen with disabled **Campaign** first and
  **Open World** second, while Open World retains the existing `intro` action.
- **Cannon visual follow-up:** a newly spawned local shot now interpolates from the previous rendered
  hull-local muzzle to its current simulated position for its first tick. This addresses a likely
  moving/turning muzzle offset without changing projectile velocity, aim or collision rules. Shots still
  inherit ship velocity, so drift after leaving the muzzle is expected. The owner confirmed this works.
- **Save v19** persists
  destination, place memory, station-local stocks, story-script place state and portable mission progress;
  policies, core kind/name, pocket templates and layout are resolved, not persisted. Default geometry is
  **121 systems / 445 pockets / 444 links** (including detached station pockets); system ids/names/positions
  stay stable, gate connections change; independent core rolls give 116 stars and 5 black holes (including
  Duskdrift). Meridian is a star.
- **Known limits:** generated pockets now resolve the `frontier`, `trade_lane` and `salvage_yard`
  templates, with four encounter kinds; derelicts/caches are represented by crates and trader stations
  reuse Meridian's `SHOPS` definitions with independent station-local storage. Visibility is `all`; travel is free and non-empty route costs are
  refused until a handler exists; no fuel, activated/proximity gates, supercruise or warping to/near a
  central body. Temporary instanced-system lifecycle is still step 14. Stable asteroid slots and cleared
  one-shot encounters use pause-safe simulation-time memory with a 420-second default and a
  `respawn-place` event hook. Enemies keep the existing chase behaviour. Mission 13a supports the
  three legacy contract types plus generic objective events; 13b adds data-only story dialogue,
  scripts, waits, flags/branching, parallel work and failure outcomes, with `The Border Signal` as a
  worked example. Step 13c provides the Mission log tab and live dialogue panel. Later save version 20 remains reserved for Step 15.
- **Backup:** the owner-approved 11A full project backup is published on GitHub:
  `https://github.com/voltvehiclez/Tallow-Reach/archive/8df6042c4161bd65f39d4ba0fc4b7016b02e40ae.zip`
  (verified public ZIP). Extract and open `tallow-reach/game/tallow-reach.html`. Browser-local saves
  are not in a project ZIP; export a `TR1:` code separately. Root `tallow-reach-step11a*.zip` files are
  local backups and must not be staged.
