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

**Death and missions.** Death is punishment enough: the ship and its hold are already lost. So **dying does not fail a
mission by default.** A mission fails on death in only two cases, and both show a "Mission failed: <mission>" notice in
the HUD (and on the docked screen) saying why:
1. **The mission asks for it.** Its data declares `fails: { on: ["player-dead"], action: "abandon", message: "..." }`
   (for example the Ambush run test mission). Do this only when failing on death is part of the story.
2. **A mission-only item was aboard.** An item of category `mission` (a parcel, a beacon) cannot be found again once the hold
   is lost, so the framework fails the mission itself, with the message "Your ship was destroyed and the X it carried was
   lost." Authors declare nothing for this. A mission item that is still in a crate in space, or in the station, is not lost
   and the mission carries on. Ordinary goods (ore, salvage) can be mined again, so those missions also carry on.

Every failure (death, `left-sector`, `timeout`) always carries a message. Only the pilot abandoning a mission shows no notice.

## Tools

- **Templates** (`src/data/missions/templates.js`): `briefing`, `radio`, `travelTo`, `loadCargo`,
  `handOver`, `ambush`, `mineOre`, `sequence`, `mission`. They already follow the rules, so build
  missions from them and only write a raw `script` step when no template fits.
- **Linter** (`src/data/missions/validate.js`, run by `tests/mission-lint.test.mjs` over every mission):
  catches missing `next`/objective/situation, numeric step targets (write `next: "end"`), unreachable
  steps, dead ends and loops, spawns too close or while docked, collected mission items nobody drops,
  `take-item` with no earlier source, a wave wait with no wave, the unimplemented `deliver` step,
  and missing failure messages.
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
