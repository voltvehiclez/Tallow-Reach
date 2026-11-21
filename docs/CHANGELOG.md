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
- **Rule:** this file holds **at most 10 full entries**. When adding an entry leaves more than 10, move the
  oldest ones to the top of the archive (word for word, newest first) so exactly 10 remain, and add one index
  line for each entry moved, at the top of the index. Do this in the same change that adds the new entry.
  `tests/docs.test.mjs` fails if there are more than 10, or if the index and the archive disagree.
- Never delete an entry. History is only ever moved.

---

## 2026-11-20: Playtest round 3: Dane's guns, the hold bar, the dialogue in one doc

The owner's third pass over the campaign build, plus four follow-up polish items.

- **Dane does not shoot the training drones, and the ambushers warp in to circle first.** `sim/ai.js`
  requires `def.engages === "hostiles"` **and** `e.role === "guard"` before a story ship fires. In First
  Sortie, `spawn-ambush` now runs as `ambush-warning` starts (`warpIn: true, role: "prowl"`): the two
  attackers streak in out of warp and circle around Dane and the pilot (`flyProwl` in `sim/enemy-flight.js`)
  without firing while Dane stays on `observe` and holds his fire. When `ambush-taunt` finishes and
  `defeat-ambush` begins, Dane switches to `guard` and opens fire, and the attackers switch out of `prowl`
  into their aggressive AI (`flyFighter`). Shooting either attacker mid-dialogue (`hitHostile`) breaks the
  parley early and turns the wave aggressive at once.
- **Shorter control prompts.** Each control call in `m01.js` is now one concise line so the pilot spends
  the lesson flying instead of waiting on radio lines; the steering line keeps *"the Wasp is quicker than
  anything you flew at the school."*
- **Weapon slots are keyboard-only (`1`–`5`, `6`–`0`) and top-middle alerts dismiss with R.** Turning down
  with the mouse in flight no longer clicks `#weapon-slots` (`pointer-events: none`, click listener removed
  from `ui/hud.js`), and `#mission-alert` says *Press R to dismiss* and closes on `KeyR`.
- **His rounds were still red for a real reason.** `fire()` → `addEntity` emits `entity-spawned`
  synchronously, and the bullet mesh is built from that record, so assigning `shot.colour` after
  `fire()` returned changed nothing. `sim/combat.js` `fire()` takes a trailing `extra` object and
  assigns it *before* `addEntity`; `sim/ai.js` passes `{ colour: BULLET_COLOURS.cannon }` (orange).
  No new colour abstraction.
- **"The sortie is over" is gone.** `m01.fails.message` is now just "Your Wasp was destroyed."; both
  the MISSION FAILED card and the small alert popup read that one string.
- **The hold bar works again.** The objective's generic sub-line rule (`#tr .hud-mission small`:
  `display: block; white-space: nowrap`) out-rank the old bar's selectors, so the grid never applied
  and the track had no width. The bar's markup moved to a pure, testable `ui/mission-hud.js`
  (`holdBarHtml`, `chaseLinesHtml`, `campaignDetailHtml`) with selectors that win, a grid layout
  (label over track+percent) and an explicit `width: 100%` track. `tests/campaign-fixes.test.mjs`
  now asserts the percentage, the 1 km / 500 m lines and the gathering rule.
- **All First Sortie dialogue in one document:** `docs/FIRST-SORTIE-DIALOGUE.md` — briefing, every
  control call and its objective/hold label, the run's orders and both reset lines, the gunnery pass,
  the ambush, the final report, the failure sentence and the card buttons, with the file to edit for
  each.

Tests 801/801, build 3232 KB. Nothing merged: the owner tests the zip first.

## 2026-11-20: Playtest round 2: objectives back top-right, run form-up, quieter menu

The owner's second pass over the campaign build. Eight corrections.

- **Dane's fire is just cannon fire.** No "ally colour": a round is drawn in the colour of the module that
  fired it. `BULLET_COLOURS.cannon` (`data/weapons.js`, orange) is stamped on his shots in `sim/ai.js`, and the
  renderer colours a bullet by that field (else the pilot's own orange, else hostile red). Damage is still 0.
- **The title is quiet.** The low drone was created at gain 0.08 and nothing lowers it on a screen that never
  runs `updateAudio()`, so it hummed under the campaign menu; it now starts at 0 and only the flight loop raises it.
- **Smaller chapter boxes, redacted future content.** `.campaign-boxes` is a fixed three-column grid (~1/3
  smaller: three chapters fit where two did). Unwritten chapters and acts show no names at all: a blurred
  placeholder reads "Coming soon" with a number, and opening a locked chapter says "This chapter is not
  written yet."
- **Objectives are back in the top right**, in the same block as contracts and story missions; the top-left
  campaign tracker is gone. Under a campaign objective the HUD adds: the control hold bar (percentage) while a
  lesson runs, the run's rule ("Stay within 1 km of Dane for the whole course to pass."), and the still-live
  bonus ("Bonus: within 500 m · now 312 m").
- **Q and E were swapped** in the roll lesson: `MISSION_CONTROLS` read `roll-left` as negative while `KeyQ`
  produces +1, so Q completed E's objective. The signs now match the input record.
- **The run waits for a form-up.** The chase step is `gather: 300`: Dane flies to the fixed start, waits, and
  only starts the ten-kilometre course when the pilot is within 300 m (the course's own gate, now per step).
  His call says "come to my wing — close, within 300 m", the first leg is a slow 95 m/s warm-up, and the
  500 m bonus is not judged while he is waiting (no `mission-near` until the course runs).
- **Clicking Back on the campaign screen no longer blanks the title.** The action had already drawn the title,
  and the panel click handler's tail then hid `#panel` because the pilot was still in space; a title screen now
  keeps the panel regardless of where the pilot is.

Files: `src/data/{weapons,places}.js`, `src/data/campaign/m01.js`, `src/data/flight-courses.js`,
`src/data/missions/rules.js`, `src/sim/{ai,combat,enemy-flight,campaign-flight}.js`, `src/render/views.js`,
`src/core/audio.js`, `src/ui/{campaign,menu,hud}.js`, `src/state/state.js`, `src/index.html`, `src/styles.css`,
tests, docs. No save change (stays **27**). Rebuild `game/tallow-reach.html`; `npm test` **800 pass / 0 fail**.

## 2026-11-20: Playtest fixes: friendly fire, one-second lessons, chapter boxes, ambush reveal

Eight fixes from the owner's first playthrough of the campaign build.

- **Dane's guns are orange.** Wingman rounds carry `ally: true` (set in `sim/ai.js`) and
  `friendlyShot()` (`sim/combat.js`) decides the colour, so only hostile fire is red. His
  damage is still zero.
- **Control lessons are one second, with a bar.** `learn()` in `m01.js` holds for `1`
  (`control` steps default to one second now). `sim/campaign-flight.js` publishes the live
  hold as `state.ui.controlHold` (fraction + percent), and the HUD draws it as a percentage
  bar under the act's objective in the top-left tracker; a full bar is a learned control.
- **Order: W then Ctrl (brake).** `MISSION_CONTROLS.brake` (`flag: "brake"`) is taught
  second, with two short lines ("a pilot who cannot stop is not flying"), then S, mouse,
  strafe, lift, roll, boost.
- **The bonus is a 500 m run bonus.** The optional `stay-with-korr` now reads
  `metres: 500`, `during: "chase"`, and shows as a live chip in the top-right HUD
  (`missionBonusStatus` in `sim/missions.js` + `state.ui.followDistance`). Over 500 m turns
  it red; the run's own 1 km reset is unchanged and separate.
- **Ferrite scenery along the course.** Eight `chase-rocks-*` scatter fields line the
  `m01-range` chase (146 rocks, sizes 10–72 m, some giants). `coreRadius` equal to `radius`
  opts them out of the pocket's diffuse-wing scaling, and each cluster sits ~950 m off the
  flown line (≥ 300 m of clear air), so the run reads as a canyon without putting rock in
  Dane's lap.
- **The ambush strangers reveal themselves.** Dane only says the hulls are not school drones
  and that he does not recognise them; a new `ambush-taunt` line from "Unmarked pilot" makes
  the threat, and no objective or line says "raider" any more ("Defeat both attackers.").
- **Blank menu after Act 1 fixed.** The end card is a full-screen overlay; leaving the act
  by any route other than its own button (pause → Exit to main menu) now hides it on
  `main-menu`, and the pause exit clears the campaign screen flags.
- **Chapter boxes instead of headings.** The campaign screen moved to the big left window:
  one large box per chapter (locked future chapters included), a chapter opens into its act
  boxes, and planned acts render locked ("Planned · not written yet"). `chapters.js` gained
  chapters 2–4 and five planned acts in chapter 1; only acts with a `mission` enter
  `CAMPAIGN_ACTS`, so planned boxes can never be started or saved.

Files: `src/data/campaign/{chapters,m01}.js`, `src/data/places.js`, `src/data/missions/rules.js`,
`src/sim/{ai,combat,campaign-flight,missions}.js`, `src/render/views.js`, `src/ui/{campaign,menu,hud,pause}.js`,
`src/state/state.js`, `src/styles.css`, `src/index.html`, `tests/campaign-fixes.test.mjs`, campaign tests.
No save change (stays **27**). Rebuild `game/tallow-reach.html` and run `npm test` (**799 pass / 0 fail**).

## 2026-11-20: Campaign slices: acts, boundaries, dialogue pacing, failure/bonus framework, Dane, First Sortie

The campaign is now a campaign: the title's Campaign screen lists chapters → acts, clicking an act starts it
(fresh act world, campaign-only pilot), finishing it shows a MISSION ACCOMPLISHED card and returns to the menu,
and a failed critical objective stops the world on a MISSION FAILED card with "Start from the beginning" (and
"Start from last checkpoint" where a step sets `checkpoint: true`; First Sortie has none).

Act boundaries: warping out needs `allowTravel` ("You do not have permission to leave this pocket."), docking is
refused while a destroy objective is live, undocking is blocked while a station dialogue is unfinished, and a
dock no longer clears the act. Dialogue advances itself on a text-scaled clock (`1.5 s + 1 s per 12 characters`);
station Continue is still clickable, space lines have no button.

Framework (data-driven, opt-in): `optional` bonus objectives (`stay-within`, `missionBonus`, saved
`optionalProgress`), `control` steps (hold a control for `hold` seconds; `MISSION_CONTROLS`), `chase` steps
(follow a ship along a `FLIGHT_COURSES` course; `maxGap` behind says `resetLine` and resets only that objective —
never the act), natural resets (`mission-reset`), and story actors (`actor` + `actorRole` lead/observe/guard).

Dane Korr: Wasp hull colour with the blue boost glow, selectable with F, fires at raiders for 0 damage, flies his
own course (no longer anchored to the player), and is re-created from his authored `spawn-ship` if he vanishes.

First Sortie: station briefing → launch → ten controls learned by doing them (W, S, mouse, A, D, Space, C, Q, E,
Shift) → ten-kilometre chase → drone pass with Dane watching → raider ambush with Dane covering you, plus a
350 m optional bonus through the lesson and a believable ambush line.

Files: `src/data/campaign/` (`chapters.js`, `m01.js`), `src/data/flight-courses.js`, `src/data/missions/rules.js`,
`src/data/missions/validate.js`, `src/sim/campaign.js`, `campaign-act.js`, `campaign-flight.js`, `flight-course.js`,
`missions.js`, `ai.js`, `enemy-flight.js`, `targeting.js`, `session.js`, `sectors.js`, `src/ui/campaign.js`,
`missionlog.js`, `screens.js`, `menu.js`, `src/state/profile.js`, `src/state/state.js`, `src/render/views.js`,
`src/data/enemies.js`, `src/data/enemy-ai.js`, `src/data/shops.js`, `src/styles.css`, tests.
Save **v27** (per-mode pilot; the campaign no longer shares the open world's ships or credits). Docs:
[architecture/campaign-acts.md](architecture/campaign-acts.md). Rebuild the game and run `npm test`.

2026-11-19: Campaign tutorial waves re-arm after a pocket reload

A quit made mid-sortie could strand the pilot behind an unfinishable kill objective: enemy waves are runtime
objects and a save never carries them, so the interrupted spawn step would not fire again on reload. Spawn script
actions may now opt in with `respawn: true`; on pocket entry and on undock the runner compares the kill objective
still owed (current step, counters as saved, parallel-aware) with the `mission:<id>`-tagged enemies still alive in
the pocket and emits only the deficit — living members keep their health and are never duplicated, nothing happens
while docked, dead, warping or loading, and a full wave never re-spawns. All three practice-drone/raider waves in
`src/data/campaign/m01.js` are tagged. `sanitizeSave` now keeps the `respawn` action key so the flag survives a
save round trip (no `SAVE_VERSION` change; it stays **26**). New test boots a mid-M01 campaign save through
`currentRootSave()` → `prepareGalaxySave` → `resumeFromSave`, re-arms the missing drone, finishes the objective and
the mission, and asserts exactly one completion is recorded. Files: `src/sim/missions.js`, `src/state/profile.js`,
`src/data/campaign/m01.js`, `tests/campaign.test.mjs`, `testing/TESTING-15-CAMPAIGN.md`,
`docs/{MISSION_RULES,recipes/11-story-and-scripted-missions}.md`. `game/tallow-reach.html` rebuilt;
`npm test` **782 pass / 0 fail**. ROADMAP step 15 still unticked (owner playtest pending).

## 2026-11-19: Step 15 — campaign scaffolding, dual-mode saves and the Dane Korr tutorial

The campaign is now its own saved mode and its own fixed-seed seven-system galaxy (seed `240515`,
Auric Reach at its heart, pockets like `auric_flight_school`), sharing the browser pilot's fleet,
credits, cargo and loadout but none of the open world's place, missions, flags or progress. Save
**v26** stores a `{v, mode, open, campaign}` envelope; legacy nested saves migrate on read and
write back as roots, and `prepareGalaxySave`/`applySave`/`resetCurrentModeSave` keep the inactive
half in sync. `data/campaign/` holds the galaxy, `m01-first-sortie` (Dane Korr, fixed Wasp grant,
tutorial flight school ending in a pirate ambush) and the `index.js` order; accepting a campaign
story mission grants and selects its fixed hull (after the already-active check, so a duplicate
accept cannot re-select it), completion notes `profile.campaign.completed` and emits
`campaign-mission-completed` before the reward. The campaign menu and offer flow are wired; the
finish transition is deliberately **nothing yet** (no free-agent flip, no unlock, no reward); replay
rewards stay framework-only. Practice drones are no longer `friendly` (they are shootable targets);
Captain Korr stays `friendly`+`invulnerable`. Export/import codes carry the record they are given
(the game exports the dual-mode root), while browser autosave/slots normalise to the root; slot
summaries show the active mode. Storage migration tests and `tests/campaign.test.mjs` cover the
envelope, mode switching, shared pilot, fixed-ship grant and a full M01 play-through.
**Not ticked in ROADMAP: owner playtest pending.** Files: `src/state/{profile,state,storage}.js`,
`src/sim/{campaign,galaxy-session,missions,ai,weapons,missile,targeting}.js`, `src/data/{enemies,campaign/*}.js`,
`src/ui/{menu,screens,missionlog}.js`, `tests/campaign.test.mjs`, migration-test updates.
`game/tallow-reach.html` rebuilt; `npm test` **781 pass / 0 fail**.

## 2026-11-19: One HUD label per nearby belt group

Nearby asteroid fields now share the first field’s floating label, including chained outer sections. Distant fields keep separate markers. No changes to scenery, targeting, counts or saves.

## 2026-11-19: Shared natural wormhole environments

Simple sites and named wormhole systems use one environment definition: 80% black holes, double black-hole radius, grey sky and neutral ambient fill. Rifts and entrance pockets retain their own environment. No save change.

## 2026-11-19: Larger, more common black holes in wormhole systems

S-systems roll 80% black holes and render them at twice the usual physical radius. Regular systems, rifts and simple wormholes keep their existing cores. Derived from the world seed; no save migration.

## 2026-11-19: Multiple wormhole routes and grey system skies

Off-chart systems support up to four live paired doors, balancing S-to-S routes with regular-space exits. All S-system pockets now use the grey wormhole cube and neutral ambient fill. Existing v25 clocks and original endpoints are preserved; extra routes derive from the saved seed and generation.

## 2026-11-19: Start with 30 wormhole systems

Raised `WORMHOLE_SYSTEMS.count` from 5 to 30. Existing v25 saves keep their first five connections; the additional systems start on load. Simple wormhole population unchanged.

## Older entries (index; full text in [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md))

- 2026-11-19: Step 14d — persistent wormhole systems
- 2026-11-19: Uncharted Space HUD label and 14d exit decision
- 2026-11-18: Station UI rework, reusable left window, Inventory ship list and My Assets destination
- 2026-11-18: Roadmap slice 3 — My Assets, Minecraft-style inventory slots, Mining beams subgroup and 0 MJ power fix
- 2026-11-18: Roadmap slice 2 — compact Shop, Hangar stored-ship list & context menu, Ship details/bonuses and unblurred cargo overlays
- 2026-11-18: Roadmap slice 1 — true moving-collider speed, live Mission log item counts and 10-minute per-station contract timers
- 2026-11-18: Nebula fill 0.175, unified label/lock colours and N-tab lock-square icons
- 2026-11-18: Ore asteroids use natural shaded surface colours with no self-glow
- 2026-11-18: Fix N panel closing, selected-row outline, row separators and HUD transparency
- 2026-11-16: Compact selectable pocket list and aligned lower HUD
- 2026-11-16: Repair N action, stabilise lead and align status bottoms
- 2026-11-16: Batch slice 2 — navigation, lead and actual speed
- 2026-11-16: Missile icon and lower interaction prompts
- 2026-11-16: Remove duplicate weapon-selection messages
- 2026-11-16: Signed throttle and final HUD alignment tweaks
- 2026-11-16: Framed status columns and integrated throttle/speed
- 2026-11-16: Square weapon boxes and slot-height divider
- 2026-11-16: Monochrome weapon strip and top-left location
- 2026-11-16: Compact weapon strip between the HUD columns
- 2026-11-16: Paid boost ignition and ten-slot weapon hotbar
- 2026-11-16: HUD pool units
- 2026-11-16: Tight HUD readings, pool percentages and throttle fill
- 2026-11-16: Mirrored vertical HUD pairs
- 2026-11-16: Feature batch 2 slice 1 — compact flight meters and toggle camera
- 2026-11-16: Nebula fill intensity increased 25%
- 2026-11-16: Subtle sky-tinted ambient fill trial
- 2026-11-16: Exact F picking for all objects; stationary outfitting preview
- 2026-11-16: Part 2 restored, precise asteroid selection and recovery/UI follow-ups
- 2026-11-16: Feature batch Part 1 — targeting and missile UI (items 4–7)
- 2026-11-16: Individual fighter pilots and per-enemy AI personalities
- 2026-11-16: Wider 4 km belts, restored Meridian, quieter planets and circular sky markers
- 2026-11-16: Flatter, lighter belts with naturally thinning edges
- 2026-11-16: C-shaped belts, central arrivals and non-intersecting asteroids
- 2026-11-16: Denser pockets, close warp-ins and massive asteroids
- 2026-11-16: The generated universe rework — vast EVE-like pockets, seeded planets, dedicated belts, four station classes
- 2026-11-16: The edge-compression lens is removed
- 2026-11-16: The frame edges are gently stretched — the edge-compression lens (owner's panel 2)
- 2026-11-16: The system sky passed its playtest
- 2026-11-16: System space — AUs, a true 3D position for every pocket, and a sky that shows the system you're in

- 2026-11-15: Hitting the station hurts again — solid means collision damage, by default

- 2026-11-15: Big moving parts are solid, and a wormhole pocket is really there after a reload

- 2026-11-15: Every weapon stops on a collider — shots no longer pass through the station

- 2026-11-15: The skies are cube maps — six 2048 faces each, no distortion and no seams

- 2026-11-15: Every sky is a generated skybox now — normal space, rifts and wormholes, and the starfield is gone
- 2026-11-15: Kept for later — a black-and-teal sky, installed but worn by no place yet
- 2026-11-15: A skybox generator, so every new instance can have a dark, realistic 4K sky
- 2026-11-15: The Test Ship — a 1-credit hull with 100× Hull HP and 10× damage, flown with the owner's GLB
- 2026-11-14: Models and collision are real models now — drop-in `.glb` files, hulls flush with the drawing
- 2026-11-14: Two owner bugs, part two — the Sell/Discard confirm sits with the cursor, and hunt contracts clear the area they were taken in
- 2026-11-14: Three owner-reported bugs — the Alt camera locks to the hull, one primary fires at a time, no tags over the menu
- 2026-11-14: The rift wears real space too — the deep rift its own sky
- 2026-11-14: Real space inside a simple wormhole — the pocket wears the system's sky
- 2026-11-14: Slice 14c built — simple wormholes spawn themselves, and save v21
- 2026-11-14: The sky loses its lines, and opening a loot card leaves the ship still
- 2026-11-14: Rift revisions after the playtest — the cache is a trade, every run is 20 minutes, and the sky has no stars
- 2026-11-14: Step 14 owner playtest — four bugs, four fixes (the run you quit is the run you come back to)
- 2026-11-14: Enemies are solid — rams damage both ships, rocks kill hostiles, and one falsy detour is fixed
- 2026-11-14: Step 14a feedback built — a rift you can see, lock and open — and slice 14b, a run that survives a quit
- 2026-11-14: Step 14a built — a rift you carry, an instance you fly into, and a cache that stays locked
- 2026-11-14: Step 14 groundwork — instance templates as data, and the owner's wormhole model recorded
- 2026-11-14: VISION records the owner's step 14 rift decisions; open question 5 is closed
- 2026-11-14: The owner confirmed the pending mission playtests; nothing is waiting now
- 2026-11-13: A recovery contract recovers its own crates, and the space is left clean

- 2026-11-13: Contract guidance says where the cargo goes, not how much is aboard
- 2026-11-13: Notices hang just below the flight message line
- 2026-11-13: Right-click Discard everywhere — how many, then "are you sure?"
- 2026-11-13: Press I in space to read the ship's inventory, and the chart no longer stops the clock
- 2026-11-13: Your missions follow you; only the offers and the hand-in stay at a station
- 2026-11-13: No message line that moves the menu, and no "filed at another station" note
- 2026-11-13: A story mission is offered at one station, and only there
- 2026-11-13: Missions belong to the station that filed them, and the docked panel redraws itself
- 2026-11-13: Overlays everywhere in the open world, a quiet exit to the menu, and a cinematic title view
- 2026-11-13: Every mission and contract is handed in at one named station
- 2026-11-13: Dying hands you a complete spare Wasp that can be fitted again
- 2026-11-13: A mission is accomplished by its hand-in, not by its last step; contract wording and colours
- 2026-11-13: Dying no longer fails missions by default; "Mission failed" notice in the HUD
- 2026-11-13: Docs consistency pass for multi-AI handoffs, changelog capped at 10 entries
- 2026-11-13: Docs restructure, LESSONS.md, docs check test, duplicate-mission guard
- 2026-11-13: Step 13d: mission rules, linter, templates and invariant tests
- 2026-11-10: Name the Border Signal object and consume story hand-ins
- 2026-11-10: Make Border Signal's beacon a persistent physical drop
- 2026-11-10: Make Border Signal handoffs resource-safe
- 2026-11-10: Clean up abandoned mission content and gate dialogue
- 2026-11-10: Remove unexplained mission progress counters
- 2026-11-10: Keep mission objectives spoiler-safe
- 2026-11-10: Show player-facing mission objectives in the flight HUD
- 2026-11-10: Stabilize story mission completion and scripted hand-offs
- 2026-11-10: Add pause exit and split the main menu actions
- 2026-11-10: Advance Border Signal after its mission wave
- 2026-11-10: Build Step 13c mission screens
- 2026-11-10: Require mining ore hand-in before contract payout
- 2026-11-10: Restore Destroy contract progress readout
- 2026-11-10: Start Step 13b story mission runtime
- 2026-11-10: Simplify exact pocket route titles
- 2026-11-10: Require salvage delivery before paying recover contracts
- 2026-11-10: Show every active mission in the flight HUD
- 2026-11-10: Start Step 13 mission framework with data-driven contracts
- 2026-11-10: Simplify map markers and current-location labels
- 2026-11-10: Refine destination marker rings and icon scale
- 2026-11-10: Mark destination completion and remove HUD route scrolling
- 2026-11-10: Add route markers and instant galaxy selection
- 2026-11-10: Clarify pocket menus, labels and exact route destinations
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
