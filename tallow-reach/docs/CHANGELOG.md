# Changelog

Newest first. Every AI session adds a short entry when it changes the project, so the
next assistant (which has no memory of earlier chats) can see what happened and why.

Entry format: date, a one-line title, then what changed, which files, and anything
the next person must know (save version, rebuild needed, known issues).

**How this file stays a useful size**

- This file holds the newest entries in full, then the **Older entries** index at the bottom:
  one line for every entry that has been moved to [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md).
  Read the entries here and the index; open the archive only when the index shows something
  relevant to the task (the archive has the full text, nothing was shortened).
- **Rule:** when this file holds more than 15 full entries, move the oldest ones to the top of
  the archive (word for word, newest first) until 10 remain, and add one index line for each
  entry moved, at the top of the index. Do this in the same change that adds the new entry.
- Never delete an entry. History is only ever moved.

---

## 2026-11-10: Keep mission objectives spoiler-safe

- Separated player-facing `objective` text from compatibility/internal `log` text. The HUD and Mission log now use only the data-defined objective, so a procedural trigger such as `wave-clear` cannot reveal a future encounter.
- The Border Signal now tells the player to **Investigate the signal in Kestrel Hollow** and later **Stay with the signal in Kestrel Hollow**, then uses discovery-oriented wording before the return home. Contract templates use data-defined objective placeholders without changing their known requirements.
- Objective text survives the existing v19 save sanitization, and fallback wording for missions without an authored objective no longer exposes internal triggers or step counts. Focused mission/UI tests pass **21/21**; rebuild the generated HTML and complete-project ZIP after this change.

---

## 2026-11-10: Show player-facing mission objectives in the flight HUD

- Removed internal `Step X of Y` numbering from the Mission log. Active missions now present a clear player-facing status, progress and **Next** instruction instead of exposing the runner's implementation steps.
- The top-right flight HUD now lists every active mission as its title plus the current `missionNextText()` objective. Updated The Border Signal's data-defined text for the Hollow patrol, signal search, beacon retrieval and return to Meridian Station; mission persistence, dialogue, rewards and scripted beacon transfer remain unchanged.
- Added UI/content regressions for hidden step numbering and objective updates across the story flow. Save version remains **19**. Focused UI/content tests pass **61/61**, full `npm test` passes **371/371**, `npm run build` produces a **736 KB** bundle, and the complete-project ZIP is refreshed. Browser validation remains pending in `TESTING-13C-SCREENS.md`.

---

## 2026-11-10: Stabilize story mission completion and scripted hand-offs

- Fixed completed story missions being treated as failed on a later sector change, timeout or death. The Border Signal now remains active and claimable after the pilot returns from Kestrel Hollow, instead of disappearing and reappearing as a fresh **Start** offer.
- Mission-tagged trigger events are now scoped to their owning mission, and scripted item transfers no longer advance when the ship or station cannot take the full amount. Added regressions for the return-home flow, trigger isolation and a blocked beacon hand-off.
- Save version remains **19**. The mission-focused tests and full suite now pass **371/371**; rebuild the generated HTML and complete-project ZIP after this change.

---

## 2026-11-10: Add pause exit and split the main menu actions

- The pause overlay now places **Exit to main menu** below **Resume**. It saves the current resume point, unpauses and emits the existing UI event path that restores the title screen and hides flight/dialogue overlays.
- The title screen now shows a disabled **Campaign** button followed by **Open World**. Open World deliberately uses the existing `intro` action, so the current open-world resume/deploy behavior is unchanged.
- Added headless menu and pause-navigation regressions, updated the Step 13c browser checklist, and kept save version **19** unchanged. Full `npm test` passes **368/368**; `npm run build` produces a **735 KB** bundle, and the complete-project ZIP is refreshed alongside it.

---

## 2026-11-10: Advance Border Signal after its mission wave

- Mission-spawned waves now emit the configured `wave-clear` trigger automatically when their last ship is destroyed. The runner also counts a reach objective when a later step begins in a place the pilot already occupies, so The Border Signal can proceed after the two Hollow raiders are defeated instead of waiting forever.
- Added regression coverage in `tests/step13b-missions.test.mjs` for the real mission-wave tag, automatic trigger and already-reached search place. Full `npm test` passes **366/366** and the rebuilt bundle is **735 KB**.

---

## 2026-11-10: Build Step 13c mission screens

- Added `src/ui/missionlog.js` with a data-driven Mission log tab for active missions, current step/progress and next-action guidance, plus a live dialogue panel with portrait slot, speaker, text, line controls and choices.
- Story missions can be started from the Mission log's data-defined story list. Dialogue advances through the shared runner and autosaves; the world keeps running unless a mission dialogue step explicitly sets `pause: true`.
- Added v19 round-trip coverage in `tests/step13c-ui.test.mjs`, the browser guide `TESTING-13C-SCREENS.md`, and rebuilt the generated game bundle. Save version remains **19** because the new presentation fields are optional within the existing mission shape.

---

## 2026-11-10: Require mining ore hand-in before contract payout

- Mining contracts now use the same station/ship hand-in path as delivery and Recover contracts. The mined ore must still be available when the reward is collected, then the exact amount is consumed before payout; missing ore keeps the completed mission unpaid and claimable.
- Added regression coverage for missing ore, mixed station/ship stock, payout and consumption.

---

## 2026-11-10: Restore Destroy contract progress readout

- Destroy contracts now show their live `done/total` progress again in both the in-flight Ship HUD and docked Contracts screen. Recover/item missions keep the concise title and reward presentation; inventory-gated reward collection is unchanged.

---

## 2026-11-10: Start Step 13b story mission runtime

- Extended the data-only mission vocabulary and runner with dialogue lines and choices, script actions (spawn wave/ship, sector state, inventory, sound and warp), trigger/timer/area waits, remembered flags with branches, parallel objectives and configured death/leave/timeout failures.
- Added `src/data/missions/story.js` with the ten-step `The Border Signal` worked example. Story progress, dialogue position, flags, timers and per-place script state survive v19 save/load; the future dialogue panel and mission-log tab remain 13c.
- Added headless reference/reachability/completion/failure coverage in `tests/step13b-missions.test.mjs`. Full `npm test` passes **361/361**; `npm run build` succeeds at **724 KB**.

---

## 2026-11-10: Simplify exact pocket route titles

- Starmap and ship HUD route headings now say `Route to Pocket` for exact pocket destinations instead of `Route to System (Pocket)`. Route rows, system destinations and all travel behavior remain unchanged.
- Updated route-display regression coverage and rebuilt the playable bundle after validation.

---

## 2026-11-10: Require salvage delivery before paying recover contracts

- Recover contracts now count only `salv` items from derelict crates. The Contract screen and flight HUD keep active mission rows concise by showing the mission title rather than an extra progress or crate-requirement line; **Collect reward** appears only when the current station/ship has enough items, otherwise the action remains **Abandon**.
- Claiming the reward requires the requested number in the current station or current ship hold; the items are consumed only when the hand-in succeeds, and an incomplete delivery leaves the mission claimable without paying. Existing saved salvage missions gain the explicit delivery item during v19 sanitization. Added headless coverage for missing stock, mixed station/ship stock, consumption and reward payout; the owner playtest checklist now covers the hand-in rule.

---

## 2026-11-10: Show every active mission in the flight HUD

- The top-right Ship HUD now renders every active mission with its individual progress, instead of only the first mission. Added compact styling for multiple mission rows and a regression in `tests/content.test.mjs`.
- The current mission framework, save format and contract behavior are unchanged. Rebuild with `npm run build`; the owner should refresh the playtest preview and check two or more accepted missions in flight.

---

## 2026-11-10: Start Step 13 mission framework with data-driven contracts

- Built Step 13a: `src/data/missions/` defines the mission vocabulary and contract templates, while `src/sim/missions.js` advances kill, mine, collect, reach, deliver and survive objectives from gameplay events. Mine, hunt and salvage contracts now run through the same one-step mission records, and several missions can be active at once without changing their wording, rewards or spawn behavior.
- Save version is **19**. `profile.missions` and `profile.flags` replace the old single active contract slot; v18 and older active contracts migrate, and the non-enumerable `profile.mission` view keeps old callers/exported character checks compatible. Dialogue/script steps and mission-log/dialogue screens remain for 13b/13c.
- Added `tests/step13-missions.test.mjs` and `TESTING-13-MISSIONS.md`. Full `npm test` passes **352/352**; `npm run build` succeeds with a **713 KB** bundle (the generated HTML is restored after validation).

---

## 2026-11-10: Simplify map markers and current-location labels

- Removed the extra orange start ring around the current galaxy system and current pocket, including station squares; current labels now add a second `(You are here)` line.
- Removed bottom starmap/pocket-map status warnings, including already-there and late travel-denied messages. Route rows in both the ship HUD and starmap now have a faint connecting line between their markers.
- Simplified destination markers to a very dark filled circle with an orange check and one dotted orange ring. Exact pocket route headings now use `Route to System (Pocket)`.
- Targeted starmap/HUD tests pass **50/50**; full `npm test` passes **347/347**; `npm run build` succeeds at **706 KB**. The refreshed preview is in `/tmp/tallow-reach-preview/game/tallow-reach.html` and returns HTTP 200 on the existing preview server.

---

## 2026-11-10: Refine destination marker rings and icon scale

- Destination icons now use a small orange tick, two orange rings and a dotted outer orange ring, matching the supplied reference more closely in route rows and galaxy/system pocket SVG maps.
- Current/start and destination route icons are about 20% smaller; intermediate markers and route behavior are unchanged.
- Targeted starmap/HUD tests pass **50/50**; full `npm test` passes **347/347**; `npm run build` succeeds at **706 KB**. The refreshed preview is in `/tmp/tallow-reach-preview/game/tallow-reach.html` and returns HTTP 200 on the existing preview server.

---

## 2026-11-10: Mark destination completion and remove HUD route scrolling

- Destination markers now include a bright tick inside the concentric amber target in both the HUD/starmap route rows and the galaxy/system pocket maps; the filled amber start marker is unchanged.
- The ship HUD renders the complete route without an inner scroll container or scroll-position restoration. Map route pagination remains unchanged.
- Added coverage for the SVG/CSS tick treatment and the non-scrolling HUD list. Targeted starmap/HUD tests pass **50/50**; full `npm test` passes **347/347**; `npm run build` succeeds at **706 KB**. The refreshed preview is in `/tmp/tallow-reach-preview/game/tallow-reach.html` and returns HTTP 200 on the existing preview server.

---

## 2026-11-10: Add route markers and instant galaxy selection

- Shared HUD and starmap route rows now use a filled amber start marker, small blue intermediate markers and a concentric amber destination marker. The same roles are drawn on route systems and route pockets, preserving the existing solid/dotted route lines.
- Selecting a system with one click in the large galaxy chart is immediate; pocket/gate double-click protection remains in place.
- Added marker and immediate-selection regressions. Full `npm test` passes **347/347**; `npm run build` succeeds at **706 KB**. The refreshed browser preview is in `/tmp/tallow-reach-preview/game/tallow-reach.html` and still needs the next live check.

---

## 2026-11-10: Clarify pocket menus, labels and exact route destinations

- Pocket-map context menus now open immediately to the right of the pointer with **Set destination** as the nearest action; existing legality checks, Warp actions, refusal notices and double-click navigation remain intact. Successful destinations in either map mode no longer add the generic bottom `Destination set. Press J for the next warp.` notice.
- `pocketLabelLayout` keeps pocket names off nearby dots and separates colliding names, drawing a connector when a name moves; the crowded Galedrift Fallowwatch label now sits to the right of its dot instead of reading as Sablewatch's.
- The shared HUD/starmap route rows append the destination pocket in a small parenthetical on the final system row only for `{ pocketId: ... }` destinations; system destinations remain system-only.
- Added menu, notice, label-layout and route-row regressions. Full `npm test` passes **347/347**; `npm run build` succeeds at **703 KB**. The refreshed browser copy is in `/tmp/tallow-reach-preview/game/tallow-reach.html`; owner live-browser confirmation is still pending.

---

## Older entries (index; full text in [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md))

- 2026-11-10: Make local route lines solid and pocket menus right-click-only
- 2026-11-10: Preserve real double-click navigation on starmap dots
- 2026-11-10: Vary station names and clarify routed gate navigation
- 2026-11-10: Refine system-map exits and separate generated station pockets
- 2026-11-10: Give every dockable station local persistent inventory
- 2026-11-10: Build Step 12 encounter templates and persistent place memory
- 2026-11-08: Wrap destination names and show local route hops
- 2026-11-08: Remember route destinations across relogs
- 2026-11-08: Remove destination diamond
- 2026-11-08: Mark the route destination and simplify the starmap list
- 2026-11-08: Add route arrows to the flight HUD
- 2026-11-08: Simplify the flight route to system names
- 2026-11-08: Set exact pocket destinations
- 2026-11-08: Clearer, sparser starmap and adaptive route list
- 2026-11-08: Straight starmap lines with attached endpoints
- 2026-11-08: Show the active route in flight
- 2026-11-08: Group route pockets by system and mark the current area
- 2026-11-08: Compact flight route with journey progress
- 2026-11-08: Plot system destinations and jump the route with J
- 2026-11-08: Remember starmap view across closing and travel
- 2026-11-08: Align newly fired cannon visuals with the interpolated hull
- 2026-11-08: Tame galaxy chart drag speed
- 2026-11-08: Step 11B starmap refinements — permanent core labels, zoom-scaled pan/cores, clickable gate neighbours (owner playtest pending)
- 2026-11-08: Step 11B system-map follow-up — free local warp and named central bodies (owner playtest pending)
- 2026-11-08: Step 11B starmap UI follow-up — zoomed system maps, right-click warp, compact overview (owner playtest pending)
- 2026-11-08: Step 11B — clickable starmap, direct-hop travel and save v16 (owner playtest pending)
- 2026-11-08: Step 11A owner playtest passed — full project backup
- 2026-11-08: Step 11A owner playtest guide and live browser preview
- 2026-11-08: Step 11A — organic starmap web, one-peer gates and editable travel rules
- 2026-11-08: Autosave every 30 seconds instead of 15
- 2026-11-08: Come back where you logged out — save v15
- 2026-11-08: Step 10 complete and ticked — owner playtest passed
- 2026-11-08: Step 10 playtest fixes — sound, start screen and loading a save
- 2026-11-08: Step 10 built — place definitions (systems and pockets), save v14
- 2026-11-08: Fix high-refresh (240 Hz) ship blur via between-tick render interpolation
- 2026-11-08: Step 9 complete and ticked — Milestone B reached
- 2026-11-08: Step 8a ticked; step 8b player records and controls
- 2026-11-08: Step 8 slices documented
- 2026-11-08: Step 8a — fixed simulation tick (playtest pending)
- 2026-11-08: Step 7d complete and ticked
- 2026-11-08: Step 7d — entity view registry cleanup
- 2026-11-08: Step 7c and step 7 complete and ticked
- 2026-11-08: Refactor step 7c — hull view and render-free simulation
- 2026-11-08: Step 7b complete and closed (docs only, no code change)
- 2026-11-08: Refactor step 7b — bullets, missiles, crates and particles become data
- 2026-11-08: Step 7a ticked (docs only, no code change)
- 2026-11-08: Refactor step 7a — a hostile becomes data; the mesh becomes a view
- 2026-11-08: Step 6 ticked in full (docs only, no code change)
- 2026-11-08: Refactor step 6b — the sim stops reading the keyboard (step 6 done)
- 2026-11-08: Refactor step 6a — the sim stops playing sounds itself
- 2026-11-07: Recorded what is and is not per-shop about shops (docs only)
- 2026-11-07: Spare modules can be sold (60% of the shop price)
- 2026-11-07: Shop fix — the cannons are listed once, as "Basic cannons"
- 2026-11-07: Refactor step 5 — shops and prices from data (plus a visible Shop change)
- 2026-11-07: Refactor step 4 — the item catalogue and one inventory per place (save v12)
- 2026-11-07: Refactor step 3 — loot tables (drops and ore mix are data)
- 2026-11-07: Refactor step 2 — seeded randomness everywhere
- 2026-11-07: Refactor step 1 — enemies are data (enemy registry, `enemy-killed` event)
- 2026-11-07: Vision, target architecture, roadmap and refactor plan (docs only, no code change)
- 2026-11-07: Inventory Sell quantity uses a game-styled popover
- 2026-11-07: Inventory Sell asks how many units to sell
- 2026-11-07: Inventory grids use five narrower, shorter slots per row
- 2026-11-07: Inventory grids keep their size when empty, and moves no longer show status text
- 2026-11-07: Station and ship item grids scroll independently after three rows
- 2026-11-07: Right-click inventory menu can sell a cargo stack
- 2026-11-07: Inventory tile text restored to the more readable size
- 2026-11-07: Inventory item tiles tightened to reduce empty space
- 2026-11-07: Inventory tiles move one item on click and a stack on Shift-click
- 2026-11-07: Inventory contents displayed as a compact grid
- 2026-11-07: Lateral, vertical and reverse thrust increased to 60%
- 2026-11-07: Boost works from any throttle and press snaps throttle to full forward
- 2026-11-06: HANDOFF.md rewritten to match the project as it is now (docs only)
- 2026-11-06: Docs scale: old changelog entries move to an archive (docs only)
- 2026-11-06: Inventory — the station and every ship have room in m³, and you can buy more than one module
- 2026-11-06: Handoff note brought up to date (docs only)
- 2026-11-06: Repairs and missile restock moved into Outfitting
- 2026-11-06: Ship switcher above the 3D viewer; the berth count is gone
- 2026-11-06: Whole numbers in the top-left readouts; labels recoloured to match their bars
- 2026-11-06: Numbers on the shield and hull bars — and the units are "Shield HP" / "Hull HP" everywhere
- 2026-11-06: Asteroid collision damage scaled to the 10-point hull
- 2026-11-06: The hull is a module — "Basic hull", 10 hit points, no module fitted means none
- 2026-11-06: The missile launcher is a module — "Basic missiles", 8 damage, 12 cap, 4 s reload — and the beam shows its rate
- 2026-11-06: All hulls are the same ship apart from the hold — and the hold is measured in m³
- 2026-11-06: The beam bar moves under the mining hint, only while cutting — and an ore-secured chime
- 2026-11-06: Beam progress resets the moment contact is lost; beam bar in the HUD; module names in the UI
- 2026-11-06: The mining beam is a module — "Basic mining beam", one ore per 4 s of contact
- 2026-11-06: "Empty weapon slot" now covers an empty cannon slot too
- 2026-11-06: Keys 1 and 2 now cycle the primary slots; key 2 with no beam is the "Empty weapon slot"
- 2026-11-06: Pressing 2 with no mining beam fitted no longer shows a message
- 2026-11-06: Twin-linked bolts fire from the fixed nose hardpoints (one per side)
- 2026-11-06: Basic cannons fire two bolts per shot again (twin-linked barrels)
- 2026-11-06: Basic cannons are a module you can fit in either primary bay; raiders are Newbie Raiders with 10 hull
- 2026-11-06: The boost tank has numbers: 10 units, 2 a second out, 1 a second back
- 2026-11-08: Step 8 ticked; step 9 split saves (v13) and per-pilot rules — playtest pending
- 2026-11-08: Step 8c owner playtest passed
- 2026-11-08: Step 8c scoped implementation complete — playtest pending
- 2026-11-08: Step 8c in progress — explicit flight, shields and damage
- 2026-11-08: Step 8c started — player-specific transforms and launches
- 2026-11-08: Step 8b complete and ticked
- 2026-11-06: Shield power made simple: a flat 2 MJ/s, and shields bleed when it is not there
- 2026-11-06: Shields cost power: 1 MJ/s up, 2 MJ/s while recharging
- 2026-11-06: Smaller shield numbers: 10 points, 1 a second, 1 damage a shot
- 2026-11-06: Shields are a module now; pirate cannons do 10 a shot
- 2026-11-06: Lighting the boost costs a flat 20 MJ; refilling the meter is free
- 2026-11-06: Thrusters use power, and a dry cell winds the speed down
- 2026-11-06: "Equip thrusters to move" warns you when a dead ship ignores the controls
- 2026-11-06: No thrusters means no movement, no turning and no boost
- 2026-11-06: Paint bays are clickable, and show an empty colour store
- 2026-11-06: Fix: the Appearance bays lost their boxes
- 2026-11-06: Basic thrusters, and every hull flies like the Wasp
- 2026-11-06: Click a bay to fit a module, or unequip one into storage
- 2026-11-06: Basic powerplant and power cell, with a power bar in flight
- 2026-11-06: Powerplant talks in MJ/s, not MW
- 2026-11-06: Appearance card under the Hull bay
- 2026-11-06: Outfitting screen with a 3D ship viewer
- 2026-11-05: The chase camera stops running away at speed
- 2026-11-05: Flight feels heavier: slower turn, weak side/reverse thrusters
- 2026-11-05: Warp lets the ship coast and unwind, instead of freezing it
- 2026-11-05: Fix: no rotation when warping
- 2026-11-05: Warp animation, warp sound, and a two-second warp
- 2026-11-05: Second sector, warp on M
- 2026-11-05: Project tidy for growth (no gameplay change)
- 2026-11-05: Pause menu and mute
- 0.2.0: Baseline
