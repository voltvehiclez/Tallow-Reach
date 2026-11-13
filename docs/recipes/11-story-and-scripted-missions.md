# Recipe 11: Story and scripted missions

> One of the step-by-step recipes indexed in [HOW_TO_ADD.md](../HOW_TO_ADD.md). Read the checklist there first.
> Kind of work: see below.


**Read `docs/MISSION_RULES.md` first.** Build the mission from the templates in
`src/data/missions/templates.js` (`briefing`, `radio`, `travelTo`, `loadCargo`, `handOver`, `ambush`,
`mineOre`, `mission`), add it to `STORY_MISSIONS` (or `TEST_MISSIONS` for a framework test), and run
`npm test`: the linter (`tests/mission-lint.test.mjs`) and the invariant tests
(`tests/mission-invariants.test.mjs`) cover every mission in those lists automatically. Every step needs an
`objective` and a named `next` (`"end"` for the last one); every dialogue says `requiresDock` true (station)
or false (radio); every spawn needs a `spawnDist` of at least `MISSION_RULES.minSpawnDistance`.

Step 13a/13b provides the shared foundation. A mission file under `src/data/missions/` is plain data
with `{ id, title, kind: "contract" | "story", requires, steps, rewards, fails }`; it names ids but
never imports simulation or rendering code. Active records live in `profile.missions`, and
`sim/missions.js` advances the current step from events. The runner supports contract objectives
`kill`, `mine`, `collect`, `reach`, `deliver` and `survive`, plus story `dialogue`, `script`, `wait`,
`flags` and `parallel` steps. Dialogue choices can set remembered `profile.flags` and jump to a named
step; scripts can request a wave/ship, set saved per-place state, give/take an item, play a sound or
warp a pilot. A `spawn-wave`/`spawn-ship` action may also define `dropOnDefeat: { item, count, scatter }`;
the authored drop is a physical mission crate, while ordinary enemy loot remains additive. Persistent
mission crates are saved in the world half with their place, item and position, restored on pocket load,
and collected only from a successful non-docked pickup. Item-bearing `collect`, `deliver` and `mine`
objectives are handed in through the same station-first/ship-hold inventory path; the exact quantity is
consumed only when the reward succeeds, so a completed mission with missing stock remains claimable.
The old singular `profile.mission` property is
only a non-enumerable compatibility view of the first active mission; do not build new code around it.
An item-bearing mission is **not accomplished by its last step**: it is paid when `completeMission` consumes the hand-in.
Give it `handIn: { objective: "Deliver {count} {item} to {station}." }` (the linter requires it), and never write
"complete", "completed" or "accomplished" in an `objective` — the HUD shows the hand-in sentence until the goods are paid.
A lost mission-only hand-in fails the mission with a message rather than waiting forever.
A mission is handed in at **one station**: by default the one that gave it out, recorded when the pilot starts it. To send
the pilot somewhere specific, name the pocket — `handIn: { station: "reach", objective: "Return to {station} with the beacon." }`
— and use `{station}` in the sentence so it always names the right station. The reward is refused anywhere else and the
Mission log disables the hand-in button there, so never write a second file or screen that pays a mission.

To add a contract, edit `src/data/missions/contracts.js`: add its type, generator, one-line wording,
and a template step, then expose it through the contract board facade in `src/sim/contracts.js`.
Preserve compact compatibility fields if old saves or UI callers need them. To add a story mission,
add a data record with `kind: "story"`; use named step ids for `next`/`then`/`else`/choice targets,
keep all story text, portrait ids, spoiler-safe `objective` guidance, compatibility `log` text and action ids
in the data file, and declare `fails.on` plus an outcome for death, sector departure or timeout when needed.
The `objective` is what the HUD and Mission log show: hint at the player's next action without revealing
encounters or scripted reveals that have not happened yet. The runner never displays `log` text. `The Border Signal` in
`src/data/missions/story.js` is the worked example. Add headless event tests beside
`tests/step13b-missions.test.mjs`, a screen test beside `tests/step13c-ui.test.mjs`, plus a save test if
the shape changes. The generic 13c presentation lives in `src/ui/missionlog.js`; do not put mission
names, dialogue or branch text in that UI module.
