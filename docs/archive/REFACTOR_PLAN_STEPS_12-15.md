# Refactor plan archive: steps 12 to 15

Moved verbatim out of [../REFACTOR_PLAN.md](../REFACTOR_PLAN.md) on 2026-11-22 to keep that file under its
size limit. Word for word; the steps are finished and ticked in [../ROADMAP.md](../ROADMAP.md).

---

# Milestone C (continued): World-ready

## Step 12: Encounters, place templates and place memory
**Goal.** The open world's content is data you can pile onto.
**Do.** `data/encounters.js` and `data/place-templates.js`. Ship at least **three templates** and
**four encounter kinds** as proof (for example a hostile patrol, a friendly trader using `SHOPS`, a
derelict with loot, a resource cache). Templates pull encounters by tier. A generic spawner replaces
the raider special cases in `sim/ai.js` (hunt-contract behaviour stays the same). Places remember
what you did (mined-out rocks, cleared encounters) with slow simulation-time respawn timers and event overrides (owner decision recorded in VISION.md). Every dockable station also resolves a stable `${placeId}:${featureId}` storage key; trader stations reuse Meridian's `SHOPS` definitions but never share stock.
**Done when.** Adding an encounter is a data entry; the content test checks every reference; flying
into a few generated pockets shows different things and station-local inventory survives switching and reload.
**Save.** **Version 18**, migration from 17 (the destination follow-up used v17); station-local stores are an optional v18 extension so Step 13 remains v19.
**Status:** see the step table in [ROADMAP.md](ROADMAP.md).

> **Milestone C reached.** The open world can scale to 100+ systems of pocket content.

---

# Milestone D: Story-ready

## Step 13: Mission framework (contracts and long story missions, one system)
**Step 13d hardening (done before step 14):** `docs/MISSION_RULES.md`, the mission linter, templates and
the invariant tests. Step 15 (the campaign) must be written from the templates and pass the linter.
**Goal.** One system runs both short open-world contracts and long, scripted, dialogue-heavy campaign
missions. It must be designed for the long kind from the start; contracts are just the simplest use.
**Ask the owner first:** "Will the story have choices that change later missions (for example who you
side with)?" If unsure, answer "maybe": the framework will support remembered flags and simple
choices in dialogue, and you can ignore them.
**Do.** Build it in three slices, each playable.
- **13a, runner and objectives.** `data/missions/` and `sim/missions.js`. A mission is data:
  `{ id, title, kind: "contract" | "story", requires, steps, rewards, fails }`. A runner advances the
  current step by listening to events. Objective steps to start: kill (enemy def or faction, count),
  mine, collect, reach a sector, deliver, survive. **Rebuild today's three contract types on it with
  identical wording, rewards and behaviour.** Several missions can be active at once.
- **13b, the steps a story needs.** Add step kinds that contracts never use: **dialogue** (speaker, lines,
  optional choices), **script** actions (spawn a wave or a ship in a sector feature, set a sector
  state, give or take an item, play a sound, warp the player), **wait** (for a trigger, a timer or the
  player entering an area), **flags** (set, test, and branch on remembered facts), and **parallel**
  (do these objectives in any order). A mission can fail (ship lost, left the sector, timer ran out)
  and says what happens when it does.
- **13c, the screens.** A **dialogue panel** (portrait slot, speaker, text, choices; it pauses
  nothing in the world unless the mission says so) and a **mission log** tab (active missions, current
  step, what to do next).
**Data rules.** All story text lives in the mission data, not in code. A mission file never imports
engine code; it only names things by id (enemies, items, sectors, flags).
**Done when.**
- Contracts play exactly as before.
- A test mission of about ten mixed steps (dialogue with a choice, a spawned wave, a kill objective,
  a flag check, a reach-sector objective, a reward) is completed in a headless test by firing events,
  and the choice changes which step comes next.
- The content test checks every mission: each id it names exists, every step is reachable, and the
  mission can be completed.
- A mission survives save and load in the middle of a step; abandoning or dying mid-mission does what
  the mission's `fails` says.
**Save.** **Version 19**: `mission` becomes `missions` (progress per active mission: current step,
counters) plus `flags`, with migration.
**Status:** see the step table in [ROADMAP.md](ROADMAP.md). Test coverage: `tests/step13b-missions.test.mjs` (13b), `tests/step13c-ui.test.mjs` (13c), `tests/mission-lint.test.mjs` and `tests/mission-invariants.test.mjs` (13d).

The eight architecture principles applied to missions (enforcement, and the limits of what validation can prove) are in
[architecture/mission-principles.md](architecture/mission-principles.md).

## Step 14: Instanced places and wormholes (rifts)
**Goal.** Temporary, generated, harder places reached through wormholes. One the player spawns is a **rift**.
**Ask the owner first:** open question 5 — **answered 2026-11-14** and recorded in [VISION.md](VISION.md)
("Step 14: rifts, instances and how you may leave one"). Read that decision before building; it overrides the
"instances are not saved" line this step used to carry.
**Slices** (owner-chosen 2026-11-14; build one per chat, each playable and testable on its own):
- **14a — the Basic rift.** `data/instances.js` (templates, spawn clearance, lifetime, difficulty scalar, exit
  requirements, expiry outcome), `sim/instances.js` (`createInstance(template, seed, tier)`, enter/leave, expiry),
  `sim/consumables.js` (`useItem` plus a `USE_ACTIONS` registry), the `rift_basic` item and its 10 cr shop row, the
  rift entity and its view, the **R** binding, the locked loot cache and at least two instance templates.
  Session-only in this slice: an instance is not saved yet, so quitting inside returns the pilot to the pocket the
  rift was opened from. **Save stays v19.** (Superseded by 14b, and by the owner's playtest of 14a on 2026-11-14:
  the door and the way out are one shimmering anomaly, both F-lockable and labelled in the HUD; the prize is a
  canister opened with **R**; a run has a shattered sky of its own and no planet in it.)
- **14b — a run survives a quit.** Save the run the local pilot is inside and rebuild it on load. What is saved is
  only what a rebuild cannot work out: template, seed, tier, remaining lifetime, whether the warning was shown,
  whether the objective is met, the canister's remaining stock and open flag, the entry spot and the pilot's own
  spot (`world.instances` plus `world.resume`). Everything else — rocks, wave, prize roll, scenery and sky — comes
  out of the template and the seed, so a saved run is **rebuilt, never deserialised**. `world.place` may then be an
  instance id, so the save validator, the galaxy loader and the resume path must learn about instances. The wave
  comes back at full strength (a save carries the run, not each guardian's damage) and an emptied canister stays
  empty, so reloading can never farm a prize twice. **Save version 20**, migration from 19, old-save test.
- **14c — simple wormholes.** A wormhole pocket that **spawns by itself in normal space**: it appears on the map, is
  warpable like any pocket while it lasts, and holds the wormhole object the pilot enters with **R**. Its 20 minutes
  run from the moment the pocket **spawns**, not from entry. Running out fires the `collapse` outcome: the wormhole
  object fades, the pocket stays on the map until the pilot warps off and then despawns. The way out inside is a
  **Stable wormhole** with no clock of its own, so nobody is ever forced out or killed by it, and leaving after the
  collapse returns the pilot to that now-empty pocket. The pocket appears as **a new pocket inside an existing system**
  (owner, 2026-11-14), warpable like its siblings; spawned wormhole pockets **are saved with their remaining time**, so
  14c takes the save version after the one 14b uses; and a wormhole **may be re-entered until its timer ends**, which
  makes its objective and locked cache strictly one-time per wormhole. Objectives beyond a fight (mining a special ore,
  say) are new `OBJECTIVE_KINDS` entries, and the spawn rule (which system, how often, how many alive at once) is data.
- **14d — wormhole systems (uncharted space).** Entered exactly like a simple wormhole, but the far side is a
  **system** with a stable S-number name (S0001, S0002, …), used for its pockets and core like regular system names. It is not on the existing starmap: pockets the pilot uses like any other system's, **persistent and
  saved** like one. Its own wormhole pockets are the dynamic part (the same 20-minute timer), and if one expires while
  the pilot is inside, a new one spawns so they can still get out. Its replacement connects to a newly spawned wormhole at a random location in regular space, not a fixed return to the original entrance. The starmap opens on the wormhole system's pocket
  map, with a button to view the normal-space map and the same button to come back.
**Do.** Entering and leaving are rules in data (`exit.requires`), never code, so the owner can add criteria later. A
difficulty scalar well above the map's. A lifetime, and a data-declared outcome for running out: a **rift kills** the
pilot (and dying inside despawns the rift instantly, death rules otherwise unchanged), while a **natural wormhole
collapses** — only the way in goes, its Stable wormhole way out keeps working, and the pilot leaves whenever they like
with everything they are carrying. Both outcomes live in one registry, so a future kind can declare another. The reward
that matters is a physical **canister** that hangs in the run from the start, stays sealed until the objective is
complete and is then opened by the pilot with **R**, which puts their hold and the canister side by side so clicks
move cargo between them, one unit or a whole stack, in either direction — so neither expiry, nor quitting, nor death
can hand it over, and a full hold loses nothing. That is what keeps
the saved run from being an exploit.
**Done when.** You can buy and spawn a rift, enter the generated instance, fight, loot, and leave with the loot only
when the instance's exit rules allow it; the same seed gives the same instance (tested); a quit inside restores the run
exactly (14b); a wormhole pocket spawns itself in normal space, expires by collapsing its entry, and can always be left
through the Stable wormhole (14c); a wormhole system is reachable, persistent, has its own dynamic pockets and a map
button back to normal space (14d).
**Save.** **Version 20** in slice 14b (a run in progress is saved); v19 and older migrate. 14c takes **v21** and
step 15 becomes **v22** (owner, 2026-11-14).

## Step 15: Campaign scaffolding
**Goal.** The campaign can be *written*, one data file per mission.
**Question 8 — answered by the owner (2026-11-19):** the story gives the pilot a **fixed ship per
campaign mission**. The first mission is a tutorial: the cadet graduates into a starter **Wasp**,
guided by **Captain Dane Korr**, a rugged veteran who teaches the basics; a solo short course and
practice drones, then a pirate ambush, and defeating the ambush completes M01.
**Owner decisions (2026-11-19, binding):** campaign and open world are **completely separate
modes** — own saves, own progress, **shared pilot** (fleet, credits, cargo, loadout), and no
physical connection between the worlds (play either order whenever). The campaign galaxy is a
fixed-seed, ~6–8 system world (built: **7 systems, seed `240515`**). Campaign completion
transition/reward is **"nothing yet"** — no free-agent flip, no unlock, no completion reward;
replay of completed missions stays framework-only, nothing wired.
**Do (as built).** `data/campaign/` with `galaxy.js` (the fixed seed and home pocket), `m01.js`
(`campaign.m01-first-sortie`, worked example) and `index.js` (the order); `campaign` versus
`open` mode in the profile with a dual-mode `{v, mode, open, campaign}` envelope; shared-pilot
sync between the halves; a Campaign button and offer flow in the menu/mission log; fixed-ship
grant and selection on accepting a campaign story mission; a campaign completion hook
(`campaign-mission-completed`) before the reward; scripted sectors use the step 10/13 Mission
framework unchanged; a simple brief/dialogue panel via the existing mission log UI. Not done
(deliberately): `m02.js` stub (no agreed content yet), a separate mission-select screen,
finish-all-missions transition, replay rewards.
**Done when.** A test can complete the tutorial and check the agreed v26 transition/replay
behaviour — `tests/campaign.test.mjs` plays M01 from acceptance to hand-in, checks the shared
pilot, the fixed Wasp grant, campaign progress on completion and save round-trips.
**Save.** **Version 26**, migration from older saves on read (14b took v20, 14c took v21, 14d
took v25; the envelope itself is the v26 change). Adding a mission is one new file and one line in
`index.js`.

> **Milestone D reached.** Write the campaign.

---
