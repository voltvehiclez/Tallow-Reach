# Recipe 13: Tuning only

> One of the step-by-step recipes indexed in [HOW_TO_ADD.md](../HOW_TO_ADD.md). Read the checklist there first.
> Kind of work: see below.


Change numbers in `src/data/`. Run `npm test`, rebuild, and play for a minute.

**Top speed and turn rate** belong to the thrusters, in `src/data/modules.js`
(`thruster_basic` today: `spd: 150`, `turn: 1.2`). `sim/drive.js` turns the fitted module into
`state.drive`, and the flight model and the chase camera read only that. To make a ship
faster, fit a different thruster module and do not put a raw speed in `sim/player.js`.

There is **no hull speed any more**: `SHIPS` has no `spd`/`turn` fields, and a ship whose
thruster bay is empty cannot move or turn at all (`driveOf()` gives 0 / 0 and
`hasDrive(state.drive)` is false). Keep it that way — the bays are what make a ship fly, and
`npm test` fails if a hull grows a speed of its own again. When hulls should handle
differently, add a multiplier in `sim/drive.js` on top of the thruster's numbers.

**Flight feel** is in the `FLIGHT` table at the top of `src/data/ships.js`:

| Field | What it does | Today |
| --- | --- | --- |
| `turn` | multiplier on the drive's turn rate | `0.7` (30% slower than the raw stat) |
| `strafe` | A/D speed, as a fraction of the drive's `spd` | `0.3` |
| `lift` | Space/C speed, as a fraction of the drive's `spd` | `0.3` |
| `reverse` | S (throttle below zero), as a fraction of the drive's `spd` | `0.3` |

**Camera position** is in `src/data/camera.js`, and is the only thing that decides how far
behind the ship the view sits:

| Field | What it does | Today |
| --- | --- | --- |
| `base` | distance behind the ship when it is standing still | `11` |
| `fast` | distance at full forward speed (throttle 1 plus boost) | `17` |
| `reverse` | distance at maximum reverse thrust | `10.5` |

The distance is linear in speed between those three points and is hard-capped at both ends, so
a faster ship cannot push the camera further back. The speed the trail compares against is the
fitted drive's `spd`, so it stays right when you change thrusters. Want the view tighter overall? Lower all
three. Want it to pull back more under boost? Raise `fast`. `npm test` checks that
`reverse < base < fast` and that the trail never doubles back.

Forward thrust and the Shift boost are **not** in this table: they are the drive's `spd` and
`2 x spd`, and they are the only directions that reach full speed. To make turning heavier
still, lower `turn` (0.6 = 40% slower). To give the ship stronger manoeuvring thrusters, raise
`strafe` / `lift` / `reverse` toward `1`.
