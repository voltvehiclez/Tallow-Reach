# Campaign acts: scenes, not sandboxes

Last checked: 2026-11-20.

The campaign (step 15) is a separate mode with its own fixed galaxy, its own saved
pilot and its own mission list (`src/data/campaign/`). Nothing here changes how an
open-world story or contract behaves; every field below is opt-in.

## Structure

- `data/campaign/chapters.js`: `CAMPAIGN_CHAPTERS` (chapters, each a list of acts)
  and the flat `CAMPAIGN_ACTS`. An act names one mission id; an act without one is
  `planned` and only ever drawn as a locked box.
- The campaign screen is the title's **big left window**: one box per chapter in a
  fixed three-column grid (`campaignMenuHtml`), locked future chapters included.
  Clicking a chapter opens its act boxes; `← All chapters` goes back. The right
  panel holds the header and Back, so the screen opens on chapters only.
- Unwritten content is redacted, not named: a planned chapter or act draws
  "Coming soon" over a blurred placeholder, and opening a locked chapter says
  "This chapter is not written yet." The authored names stay in the data for the
  day the act is written, but the screen never advertises a story that does not
  exist. There is no offer,
  no Accept and no Abandon: clicking an act starts it (`sim/campaign-act.js`
  `startCampaignAct`), clicking a running act resumes it, and finishing it shows
  the MISSION ACCOMPLISHED card before returning to the screen.
- Planned boxes are scenery for the menu, never order: `CAMPAIGN_ACTS` filters to
  acts with a `mission`, so a planned box cannot be started, saved or counted.
- The end card is a full-screen overlay. Any return to the title (`main-menu`)
  hides it — a card left behind reads as a blank menu with no UI.
- An act's world is thrown away when it starts, except for the campaign pilot's
  own credits, fleet and fit. The two modes never share a pilot (save v27).

## Ending on a dock

First Sortie ends with a `dock` step: Dane's report is a radio call in space, and
the act is accomplished only when the pilot actually docks at Korr Flight Academy
(`dock-at-academy`). Docking anywhere else settles nothing. The academy glows
for that objective; a friendly story ship (Dane) glows **only** while a `chase`
step makes forming up on him the objective — never during control lessons,
briefings or drills, and a wave's targets light up only when the kill step
itself is current, not while a briefing is talking about them.

## Failure and checkpoints

- A failed critical objective shows the MISSION FAILED card and stops the
  simulation (`state.ui.campaignEnd`), with "Start from the beginning" and, when
  the act reached one, "Start from last checkpoint".
- A failed mission stays on the record with `failed`, `failure` and
  `failureMessage`; `isMissionFailed` keeps it from advancing.
- Any step may set `checkpoint: true`. Entering it stores its id on the mission
  record, and `resumeMissionAtCheckpoint` puts a fresh copy of the act back on
  that step with every counter cleared.
- First Sortie has no checkpoints on purpose.

## Natural resets

A `chase` step (or any step with `actor` and `maxGap`) never fails the act when
the pilot falls behind: the contact says the step's `resetLine`, the story ship
returns to the fixed start of its course and the same objective is flown again.
`mission-reset` clears that objective's counter only.

## Optional objectives (bonus credits)

```js
optional: [
  { id: "stay-with-korr", kind: "stay-within", actor: "captain_korr",
    metres: 500, during: "chase", bonus: 100,
    objective: "Stay within 500 m of Captain Dane Korr through the ten-kilometre run." },
]
```

- `bonus` is added to the mission reward only when the optional is done
  (`missionBonus`); it can never fail an act.
- A run's bonus is judged only while the course is actually running: the pilot
  is not punished for being far away during the form-up (see `gather` below).
- `during` is a step id or a `group` shared by several steps. A 500 m limit and a
  1 km reset are different numbers on purpose: the bonus can be lost while the
  objective is simply redone.
- While the window is open and winnable, `missionBonusStatus(mission, metres)` feeds
  the HUD line under the objective (`Bonus: within 500 m · now 312 m`, red once it
  is over). `sim/campaign-flight.js` publishes the run as `state.ui.chaseRun`
  (`gathering`, `gap`, `gather`, `maxGap`) and the distance as
  `state.ui.followDistance` on every running chase tick.
- Progress lives in `optionalProgress` on the saved mission (`{ done, failed }`),
  so a bonus already thrown away stays gone across a reload.

## Control lessons and chases

- `control` step: `control` names an id from `MISSION_CONTROLS`
  (`data/missions/rules.js`), `hold` is the seconds the pilot must keep it
  (default one second; every First Sortie lesson authors `1`). The sim reads the
  pilot's control record (`controlHeld`), never a key code, and emits
  `mission-control` when the hold is long enough. The live hold is published as
  `state.ui.controlHold` (`fraction`, `percent`, the control's `label`), and
  `ui/mission-hud.js` `holdBarHtml` draws it as a percentage bar under the act's
  objective (top right, with every other active mission): a full bar is 100% and
  a learned control. That markup needs its own selectors
  (`#tr .hud-mission small.hud-hold`, which out-rank `#tr .hud-mission small`) —
  the generic `display: block; white-space: nowrap` rule for objective sub-lines
  silently beat the old bar and left an empty track behind, which is why the bar
  looked broken after the objective moved to the top right. Keep the bar's CSS a
  grid so the track can take the remaining width.
  First Sortie teaches W, then Ctrl (the brake), then S, mouse, strafe, lift,
  roll and boost — a new pilot can always stop the ship before anything that can
  drift them off the range.
- `chase` step: `follow` names the story ship, `course`/`coursePhase` name a
  `FLIGHT_COURSES` entry (`data/flight-courses.js`), `distance` is how far along
  that course finishes the objective and `maxGap` is the reset distance. Courses
  are absolute points in the pocket, so "back to the beginning" is always the
  same point in space.
- `gather` (metres) makes the course wait: the story ship flies to the fixed
  start and holds there until the pilot is that close, so a pilot who drifted
  during the lesson is never asked to catch a ship already at speed. The HUD
  says "Close to within 300 m of Dane to start the run." until it starts, then
  "Stay within 1 km of Dane for the whole course to pass." The first chase leg is
  deliberately slow (95 m/s) so the run can be joined from a standing start. A
  reset returns him to the start and the same form-up applies again. All of these
  lines, and every other word First Sortie says, are collected in
  [../FIRST-SORTIE-DIALOGUE.md](../FIRST-SORTIE-DIALOGUE.md).

## Scenery along a course

The school pocket dresses the ten-kilometre run with eight `chase-rocks-*`
`asteroidField` scatter clusters (`data/places.js`), 146 ferrite rocks in varied
sizes with a few giants. Two rules keep the run readable and Dane safe:

- each cluster sits about a kilometre off the flown line, and its radius leaves at
  least 300 m of clear air to any course segment (`tests/campaign-fixes.test.mjs`);
- `coreRadius` equal to `radius` opts a cluster out of the pocket-wide
  diffuse-wing scaling in `data/scenery.js`, so the authored radius, count and
  clearance are exactly what the sim places.

Moving the course means moving the clusters: they are authored from the course
points, not generated.

## Story actors

- A step may name `actor` (an enemy id) and `actorRole`:
  `lead` (fly the course), `observe` (circle the pilot at a distance) or
  `guard` (fight the act's other hostiles).
- A friendly def may set `lockable: true` (selectable with F), `foe: false`
  (Wasp scheme and blue engine glow) and `engages: "hostiles"` with `dmg: 0`.
  `sim/ai.js` fires only when the actor is **`role: "guard"`** as well as
  `engages: "hostiles"`, so a story ship on `observe` (First Sortie's gunnery
  pass) watches and never touches the pilot's targets; he opens fire in the
  ambush, where the step names him `guard`.
- A round is drawn in the colour of the module that fired it (`BULLET_COLOURS` in
  `data/weapons.js`): his basic cannons are orange, like the pilot's, and only
  hostile repeaters are red. There is no separate "friendly" colour rule.
- The colour has to be on the record **before the mesh is built**: `addEntity`
  emits `entity-spawned` synchronously, so `sim/combat.js` `fire()` takes a
  trailing `extra` object and assigns it before `addEntity`. Setting a field on
  the shot after `fire()` returns is too late — that was the bug that made his
  rounds red.
- `spawn-ship` actions with `respawn: true, story: true` are re-armed by
  `sim/campaign-flight.js` whenever the ship is missing (reload, re-entry, a
  bug), and `rearmWaves` still only tops up kill objectives.
