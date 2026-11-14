# Refactor plan: getting the code ready for the big game

> **Who reads what.** The **owner** (who does not code) follows "How to run a step". The **AI**
> (any model) follows "Rules for the AI" and the step it was given. Status of each step is tracked
> in [ROADMAP.md](ROADMAP.md). The destination is [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md);
> the game being built is [VISION.md](VISION.md).

A refactor step **changes how the code is organised, not how the game plays.** After each step the
game should look and feel identical, only now it can grow. That is what makes it safe to do with
an AI: you can prove nothing broke.

There are **15 steps in 4 milestones**. Do them **in order**, one step (sometimes one slice of a step)
per chat.

| Milestone | After steps | What it unlocks |
| --- | --- | --- |
| **A. Content-ready** | 1 to 5 | New enemies, items, loot, modules, ships and shop stock are **data-only** additions. You can start adding content here. |
| **B. Multiplayer-shaped** | 6 to 9 | The game logic runs without a screen, entities are plain data, there is a list of players, the save is split. Co-op becomes possible later. |
| **C. World-ready** | 10 to 12 | Sectors are data, a generated 100+ sector starmap, encounters and sector memory. The open world can scale. |
| **D. Story-ready** | 13 to 15 | A mission framework, wormhole instances and the campaign scaffolding. |

Multiplayer itself is **step 16**, planned when you get there (outline at the bottom).

---

## How to run a step (for the owner)

**Once, before step 1**
1. Run `npm test` and play [testing/TESTING-BASELINE.md](../testing/TESTING-BASELINE.md) once. If anything is
   already broken, tell the AI at the start of step 1 (it is also worth fixing first).
2. Make a backup: zip the whole project folder and name it with today's date.
   Even better: put the folder in git (GitHub Desktop makes this point-and-click) so every step is one
   commit you can undo. Not required, but it is the best safety net there is.

**For every step**
1. Open a **new chat** with any AI. Attach the latest project zip. (If the AI cannot read zips,
   paste the files it asks for, starting with the docs listed in the starter prompt.)
2. Paste the **starter prompt** from [AI_PROMPTS.md](AI_PROMPTS.md), then the **step prompt**:

   ```
   Do refactor step <N> ("<title>") from docs/REFACTOR_PLAN.md.
   First read docs/VISION.md, docs/TARGET_ARCHITECTURE.md, docs/ROADMAP.md and the step itself.
   This is a refactor: the game must play exactly the same afterwards.
   Plan first, in plain language: what changes, whether to split it into slices that can each be
   played, and which of my open questions in VISION.md you need answered. Then wait for my OK.
   ```
3. Read the AI's plan. If it is too big, say **"split it into smaller slices"**: that is always
   allowed and usually wise. Answer its questions. Reply "go".
4. The AI gives you files. Copy them into your project, replacing the files with the same path.
5. Run `npm run build` and `npm test`. Then play [testing/TESTING-BASELINE.md](../testing/TESTING-BASELINE.md)
   **and** the step's own checks (the AI writes them for you). Also load an **old save** to check
   old saves still work.
6. **If it all passes:** zip the project as the new baseline (dated). Ask the AI: *"Rewrite
   docs/HANDOFF.md and tick the step in docs/ROADMAP.md"* if it has not already. Done.
7. **If something fails:** send the AI the exact error or what you saw, in the same chat. If two
   rounds do not fix it, **restore your backup** and start the step again in a fresh chat, telling
   it what went wrong last time. Never carry on to the next step on top of a broken one.

**Switching AIs between steps is fine.** The docs are the memory. Just always attach the *latest*
zip and never have two chats editing the project at once.

**Good to know**
- Some steps are big. Steps 6, 7 and 8 are the heaviest: expect several chats each. That is normal.
- You never need to understand the code. You need to run the two commands and click through the
  checklist.
- You can add content between steps once Milestone A is done (see ROADMAP.md).

---

## Rules for the AI (every refactor step)

1. **Read first:** VISION, TARGET_ARCHITECTURE, ROADMAP, this step, then the files it touches.
2. **Behaviour must not change.** The standing ground rules still apply ([HANDOFF.md](HANDOFF.md)):
   `FLIGHT` and `CAMERA` are settled, hulls identical apart from the hold, etc. The only exceptions
   are changes this step explicitly lists.
3. **The owner has approved the restructuring in this plan.** The old rule "keep the existing
   structure" is read as: *keep the folders and conventions; make the changes listed in the step.*
   Do not rename, move or reformat anything the step does not need.
4. **Plan first, then wait for the owner's OK.** Say plainly what will change. If the step is big,
   propose slices that can each be built, tested and played on their own, and do **one slice**.
5. **Ask, don't guess, on design questions.** If the step touches an open question in VISION.md
   and the owner has not decided it, use the *default* there, say so, and record it.
6. **Prove it with tests.** Keep all existing tests green; add tests for what you build. Where a
   step lists a "layer test" or content test, it is required. If you cannot run the tests or the
   build (no network is common), say so plainly and tell the owner exactly what to run.
7. **Saves:** change the save only where the step says so. Bump `SAVE_VERSION`, write a migration,
   and add a test that loads an old-shaped save. Never change storage keys.
8. **Update the docs in the same change:** `CHANGELOG.md` entry, `ARCHITECTURE.md` (rewrite the
   rule that changed, do not append a second one), `TARGET_ARCHITECTURE.md` (delete the closed debt
   row), folder `README.md`s, `HOW_TO_ADD.md` (recipes that changed), `ROADMAP.md` (tick the step),
   a `TESTING-*.md` for anything the owner will click, and `HANDOFF.md` if the chat is ending.
9. **Deliver complete files** with full paths (or a zip), never fragments, and end with the
   build/test reminder and plain-language test steps.
10. **No new npm dependencies** (until step 16 says otherwise).

---

# Completed steps (1 to 11)

Steps 1 to 11 (Milestones A, B and the first half of C) are finished. Their goal, questions, tasks and results are in
[archive/REFACTOR_PLAN_STEPS_1-11.md](archive/REFACTOR_PLAN_STEPS_1-11.md); their status is in [ROADMAP.md](ROADMAP.md).

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
  **system** that is not on the existing starmap: pockets the pilot uses like any other system's, **persistent and
  saved** like one. Its own wormhole pockets are the dynamic part (the same 20-minute timer), and if one expires while
  the pilot is inside, a new one spawns so they can still get out. The starmap opens on the wormhole system's pocket
  map, with a button to view the normal-space map and the same button to come back.
**Do.** Entering and leaving are rules in data (`exit.requires`), never code, so the owner can add criteria later. A
difficulty scalar well above the map's. A lifetime, and a data-declared outcome for running out: a **rift kills** the
pilot (and dying inside despawns the rift instantly, death rules otherwise unchanged), while a **natural wormhole
collapses** — only the way in goes, its Stable wormhole way out keeps working, and the pilot leaves whenever they like
with everything they are carrying. Both outcomes live in one registry, so a future kind can declare another. The reward
that matters is a physical **canister** that hangs in the run from the start, stays sealed until the objective is
complete and is then opened by the pilot with **R**, which moves what is inside into their own hold one unit at a
time — so neither expiry, nor quitting, nor death can hand it over, and a full hold loses nothing. That is what keeps
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
**Ask the owner first:** open question 8.
**Do.** `data/campaign/` with `index.js` (the order) and `m01.js` as a worked example (and an
`m02.js` stub); game mode `campaign` versus `free agent` in the profile; a new game starts in the
campaign; scripted sectors use the step 10 loader; a mission-select screen; replay of completed
missions in any order for a modest reward; finishing all missions flips the player to free agent and
releases the open world; a simple brief/dialogue panel for text.
**Done when.** A test completes a stub campaign and checks the transition and the replay rewards.
Adding a mission is one new file and one line in `index.js`.
**Save.** **Version 22**, migration from 21 (14b took v20 for a saved run, 14c takes v21 for saved wormhole pockets).

> **Milestone D reached.** Write the campaign.

---

# Step 16: Multiplayer (planned when you get there)

Do not start until steps 6 to 9 are done. The first chat for this step should **write its own plan**
into this file before any code. Expected shape:
1. **Pick the transport** and decide whether to relax the no-dependency rule (browser WebRTC
   needs a small signalling service). Build a tiny spike: two browser tabs exchanging a message.
2. **Host streams snapshots** of nearby entities to one guest; guest draws them.
3. **Guest controls:** the guest's `controls` drive their ship on the host.
4. **Join link:** host copies a URL; opening it joins.
5. **Guest profile in and out** using `portableProfile`/`mergeProfile` from step 9.
6. **Trading** between two players.
7. **Polish:** more than two players, disconnects, no-pause rule, latency smoothing.

---

## If a step goes wrong
- Restore your backup. Start the step again in a new chat; paste what failed.
- If the AI says a step is too big, accept the slices. A tiny step that works beats a huge one that doesn't.
- If an AI proposes changing this plan, it must say why and update this file, ROADMAP.md and
  TARGET_ARCHITECTURE.md itself, with your OK.
