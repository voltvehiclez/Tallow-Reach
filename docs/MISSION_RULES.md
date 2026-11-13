# MISSION RULES: read before writing or changing any mission, dialogue or trigger

*Last checked: 2026-11-13.*

Missions are a story the player is living in. Every beat must pass one test:

> **If a real pilot were in this situation, would it make physical and logical sense, and could
> they ever get stuck or cheated?**

If not, it is a bug, even if the code does what it was written to do. These rules are enforced by
tools (the linter and the invariant tests below), not just by good intentions, so a new mission is
checked the moment it is added.

## The realism rule (overrides everything below)

- **Things exist somewhere.** A mission item, person, ship or reward is in a specific place. If the
  pilot is not there, they do not have it. Items enter the hold, the wallet or the ship **only** when
  the player physically picks up, buys, loads or is handed them. Never as a side effect of a timer, a
  state change, or space freeing up. If the hold is full, the item stays where it is (a crate in space,
  cargo at the dock) until the player comes back with room, and the objective says so.
- **Nothing happens by itself.** Nothing is delivered, completed, spawned or abandoned because a number
  changed or a timer ran out. It happens because the player, or someone in the world, did something.
- **Requirements are real.** No cargo space, no money, no ship that can fly: the mission waits and says
  what is needed. It never assumes the best case and never fails because of it.
- **Time and distance are real.** Ships take time to arrive and come from somewhere. A conversation
  needs the right situation: face to face (docked) or on the radio (flying).
- **Nobody is punished for what they could not know.** A surprise is fine when the story intends it,
  but the player must be able to see why, afterwards.

## The rules, and how each is enforced

| # | Rule | Enforced by |
|---|------|-------------|
| 1 | The player is always somewhere, doing something. Before anything happens, check where and in what mode (docked, flying, warping, combat, dead, loading). Never act on where the player was when it was planned. | `stepSituationReady` in `sim/missions.js`; linter requires each dialogue and script to declare its situation |
| 2 | Surprises are deliberate and set up by what the player does in the world (arriving, passing a point, a radio warning). Nothing spawns in the pilot's face. | Linter: every spawn needs `spawnDist: [min, max]` with min >= `MISSION_RULES.minSpawnDistance` and must run while flying; invariant test measures the real distance |
| 3 | **Dialogue and the world are separate.** Pressing continue, accept or next only moves the conversation. It never spawns, moves, gives or takes anything. World events listen to world state, never to dialogue buttons. | Invariant test snapshots the world around every dialogue click |
| 4 | Each beat declares the situation it needs, individually: `requiresDock: true` (station, face to face) or `false` (radio). One beat needing a dock never blocks the rest. | Linter (`requiresDock` is mandatory on every dialogue; a script needs exactly one of `requiresDock` / `requiresFlying`) |
| 5 | The player is never stuck and never silently punished. There is always a way forward and the objective says what it is. Failure comes only from a clear cause, with a message. | Linter (objective on every step, no dead ends or loops, `fails.message`); invariant tests (never stuck, never failed or abandoned unless a declared rule fired) |
| 6 | The mission adapts to the player's resources. A full hold makes a step wait; it does not skip, fail or abandon. | Invariant test fills the hold at every step; `blockedScriptText` and the "Dock at a station and make room" hint |
| 7 | Everything can be interrupted and resumes: undock, warp, die, quit, reload. Replaying starts clean. | Invariant tests: wander, save and load at every step, die at every step then replay |
| 8 | Think of the odd cases before building (see the checklist). | Your plan |
| 9 | **Objectives done is not mission accomplished.** A mission that collects or mines an item is only accomplished when the station hand-in consumes it and pays. Until then its guidance names what is still owed, and it never says complete, accomplished or finished. | Runner (`missionObjectivesDone` vs `completeMission`); linter rejects completion words in `objective`/`handIn.objective`; invariant test |
| 10 | A mission says what it is: a **contract** says "Contract complete" / "Contract failed", a story mission says "Mission ...". | Runner (`missionKindWord`); linter rejects "mission" in contract guidance |
| 11 | **One hand-in station.** Every mission is handed in at exactly one named station: the one that gave it out, unless its data sends the pilot somewhere specific (`handIn.station`). The reward is paid nowhere else, and the guidance always names that station — never "a station", never the one the pilot happens to be docked at. | Runner (`missionHandInStation`, `completeMission`, `handInNextText`); the docked screens disable the hand-in away from the station; linter checks `handIn.station` is a pocket with a station |

**Hand-in (`handIn.objective`).** An item-bearing mission must say what the pilot still owes after the last step:
`handIn: { objective: "Deliver {count} {item} to {station}." }`. The runner shows it — never "complete" — while the goods
are owed, adds "You have 2 of 3." when they are short, and the station button reads **Hand in cargo**. The linter requires
the sentence for any `collect`/`mine`/`deliver` objective with an item. Contracts supply their own wording in
`data/missions/contracts.js` (`{station}` is filled in with the mission's hand-in station); Border Signal supplies
`"Return to {station} with the beacon."` and names its station (`handIn.station: "reach"`).
Never hand those same goods over with a `take-item` script as well: the station hand-in is already that transfer, and
`loadCargo`/`handOver` are for cargo that is not an objective item (as in the Parcel run).

**Where the hand-in happens.** Every mission and contract is handed in at **one station**. The default is the station
that gave the mission out: `acceptMission` records it on the mission (`handIn.station`) the moment it is taken, so it
survives a save and cannot drift as the pilot travels. A mission that should be handed in somewhere else names the pocket
in its data — `handIn: { station: "reach", objective: "Return to {station} with the beacon." }` — and that station wins
over the giving one. `completeMission` refuses anywhere else ("Hand this in at Meridian Station."), takes nothing and pays
nothing. The mission itself stays with the pilot: an accepted mission is listed in the Mission log and the Contracts tab
at **every** station, with its progress and next objective, so a job taken at Meridian can be watched from Galereach.
Only the hand-in is station-bound — elsewhere the card names the station and disables the button, and at the station that
takes it the card reads **Hand in cargo** — and Abandon works wherever the pilot is, so a mission is never stuck behind a
counter. **Offers** are station-specific: a story mission is offered only at the station that gives it out (`offeredAt`,
checked by the linter), and contract offers are per station (`boardAt`), so one counter's board is never read or accepted
at another. Guidance always says where: use `{station}` in `handIn.objective` and in any objective that mentions
delivery, so the sentence follows the data instead of a hard-coded name (the linter warns when a hand-in sentence cannot
name its station). Two more cases resolve to something sensible and can never make a mission impossible: a mission saved
before the field existed uses its `origin` (the station it was taken from), and one whose station no longer exists uses the
home station.

**Where the mission is offered.** Missions are specific to one station by default: `missionOfferStation()` resolves
`offeredAt` from the mission's data, else the station it is handed in at, else the home station, and the Mission log
offers it only at that station. A story mission that should be given out elsewhere names the pocket
(`offeredAt: "some-station-pocket"`, linted like `handIn.station`); contract offers are per station anyway (`boardAt`).
There is no "offered at every station" form, and a name that does not resolve offers the mission **nowhere** rather than
silently moving it to Meridian — a typo must fail loudly, not turn one station's job into everyone's.

**Station conversations happen at their station.** A dialogue step that needs docking (`requiresDock: true`) is a
counter conversation, so it is played only while docked at the station that gives the mission out
(`missionAtItsStation`): docked elsewhere the card is read-only and says "Return to Meridian Station to continue
talking.", and the runner refuses the click. In-field dialogue (`requiresDock: false`, such as the beacon hand-off)
stays playable wherever the pilot is.

**Death and missions.** Death is punishment enough: the ship and its hold are already lost. So **dying does not fail a
mission by default.** A mission fails on death in only two cases, and both show a "Mission failed" (or "Contract failed")
notice in the HUD (and on the docked screen) saying why:
1. **The mission asks for it.** Its data declares `fails: { on: ["player-dead"], action: "abandon", message: "..." }`
   (for example the Ambush run test mission). Do this only when failing on death is part of the story.
2. **A mission-only item was aboard.** An item of category `mission` (a parcel, a beacon) cannot be found again once the hold
   is lost, so the framework fails the mission itself, with the message "Your ship was destroyed and the X it carried was
   lost." This includes a mission whose objectives are finished but whose hand-in has not happened: the beacon is gone, so
   the mission can never be accomplished. Authors declare nothing for this. A mission item that is still in a crate in
   space, or in the station, is not lost and the mission carries on. Ordinary goods (ore, salvage) can be mined again, so
   those missions also carry on — as does a mission-only item that exists nowhere else (the runner fails it as
   "lost-item" instead of leaving it waiting forever).

Every failure (death, `left-sector`, `timeout`, `lost-item`) always carries a message. Only the pilot abandoning a mission shows no notice.

## Tools

- **Templates** (`src/data/missions/templates.js`): `briefing`, `radio`, `travelTo`, `loadCargo`,
  `handOver`, `ambush`, `mineOre`, `sequence`, `mission`. They already follow the rules, so build
  missions from them and only write a raw `script` step when no template fits.
- **Linter** (`src/data/missions/validate.js`, run by `tests/mission-lint.test.mjs` over every mission):
  catches missing `next`/objective/situation, numeric step targets (write `next: "end"`), unreachable
  steps, dead ends and loops, spawns too close or while docked, collected mission items nobody drops,
  `take-item` with no earlier source, a wave wait with no wave, the unimplemented `deliver` step,
  missing failure messages, an item-bearing mission with no `handIn.objective`, guidance that claims
  the mission is complete, and a contract that calls itself a mission.
- **Invariant tests** (`tests/mission-invariants.test.mjs`, helper `tests/mission-driver.mjs`): play
  every mission in `STORY_MISSIONS` and `TEST_MISSIONS` through the situations real players create.
  A new mission is covered automatically; **add it to the data folder and run `npm test`.**
- **Test missions** (`src/data/missions/test-missions.js`): small missions that exercise each shape
  (cargo delivery, radio-only with a choice, mine N, fail and replay). They are not offered to normal
  players. Open the game with `?testmissions` on the end of the address to start them from the Mission log.

## Checklist when writing a mission

1. Which shape is it? Use the matching template.
2. For every dialogue: station (`briefing`) or radio (`radio`)? Does anything in the world change when
   the player presses Continue? It must not.
3. For every spawn: where is the pilot, how far away does it appear, what warns them?
4. For every item: where is it physically, who has it, what happens if the hold is full, what if the ship
   is destroyed?
5. What if the player: undocks early, warps away, takes another route, dies, quits and reloads, is in
   combat, is full, is broke, is already at the destination?
6. Put the mission in the data folder, run `npm run build` and `npm test`. Fix every linter error and
   every failed invariant at the framework level, not only in this mission.
7. Play it once normally and once awkwardly (the situations in item 5).

## Known gaps (do not work around them silently)

- The `deliver` step kind exists in the vocabulary but nothing emits "delivered". Use `loadCargo` and
  `handOver` (a `take-item` script at the destination) for deliveries.
- Spawns anchored on a map feature (`feature`) can appear next to the pilot; the linter warns on them.
- A mission timeout fails silently unless the player can see the clock; the linter warns on it.
- Escort and protect-a-ship objectives are not supported yet. Do not fake them; extend the framework first.
- Station storage is per station and there is no way to move cargo between stations yet. A mission handed in at station B
  counts only B's storage and the ship's hold, so goods left at station A do not count; the mission waits and says how many
  are still owed. Add a transfer feature rather than making a mission pay from another station's stock.
