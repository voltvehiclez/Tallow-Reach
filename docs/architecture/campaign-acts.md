# Campaign acts: scenes, not sandboxes

Last checked: 2026-11-20.

The campaign (step 15) is a separate mode with its own fixed galaxy, its own saved
pilot and its own mission list (`src/data/campaign/`). Nothing here changes how an
open-world story or contract behaves; every field below is opt-in.

## Structure

- `data/campaign/chapters.js`: `CAMPAIGN_CHAPTERS` (chapters, each a list of acts)
  and the flat `CAMPAIGN_ACTS`. An act names one mission id.
- The campaign screen lists chapters → acts. There is no offer, no Accept and no
  Abandon: clicking an act starts it (`sim/campaign-act.js` `startCampaignAct`),
  clicking a running act resumes it, and finishing it shows the MISSION
  ACCOMPLISHED card before returning to the screen.
- An act's world is thrown away when it starts, except for the campaign pilot's
  own credits, fleet and fit. The two modes never share a pilot (save v27).

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
    metres: 350, during: "lesson", bonus: 100,
    objective: "Keep within 350 m of Captain Dane Korr through the control lesson." },
]
```

- `bonus` is added to the mission reward only when the optional is done
  (`missionBonus`); it can never fail an act.
- `during` is a step id or a `group` shared by several steps. A 350 m limit and a
  1 km reset are different numbers on purpose: the bonus can be lost while the
  objective is simply redone.
- Progress lives in `optionalProgress` on the saved mission (`{ done, failed }`),
  so a bonus already thrown away stays gone across a reload.

## Control lessons and chases

- `control` step: `control` names an id from `MISSION_CONTROLS`
  (`data/missions/rules.js`), `hold` is the seconds the pilot must keep it. The
  sim reads the pilot's control record (`controlHeld`), never a key code, and
  emits `mission-control` when the hold is long enough.
- `chase` step: `follow` names the story ship, `course`/`coursePhase` name a
  `FLIGHT_COURSES` entry (`data/flight-courses.js`), `distance` is how far along
  that course finishes the objective and `maxGap` is the reset distance. Courses
  are absolute points in the pocket, so "back to the beginning" is always the
  same point in space.

## Story actors

- A step may name `actor` (an enemy id) and `actorRole`:
  `lead` (fly the course), `observe` (circle the pilot at a distance) or
  `guard` (fight the act's other hostiles).
- A friendly def may set `lockable: true` (selectable with F), `foe: false`
  (Wasp scheme and blue engine glow) and `engages: "hostiles"` with `dmg: 0`,
  so it fires at raiders and damages nothing.
- `spawn-ship` actions with `respawn: true, story: true` are re-armed by
  `sim/campaign-flight.js` whenever the ship is missing (reload, re-entry, a
  bug), and `rearmWaves` still only tops up kill objectives.
