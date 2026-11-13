# Owner playtest guides

Numbered, click-by-click checklists for the owner (who does not code) to play after an AI chat finishes a step.
The AI writes one per step; the owner plays it, reports what failed, and the step is ticked in
[../docs/ROADMAP.md](../docs/ROADMAP.md) only when the owner says it passed.

**Every time:** play [TESTING-BASELINE.md](TESTING-BASELINE.md) (a 10-minute click-through of the whole game),
the guide for the step, load an **old** save, and back up a zip. `TEST-OLD-CODES.txt` holds old export codes
(A, B, ...) for the old-save checks.

## Current guides

| Guide | Covers |
| --- | --- |
| [TESTING-BASELINE.md](TESTING-BASELINE.md) | The whole game; play it after every step. |
| [TESTING-DEATH-AND-MISSIONS.md](TESTING-DEATH-AND-MISSIONS.md) | Mission hand-ins (a mission is only accomplished when its items are handed in), dying with a mission-only item, contract wording and the "Contract failed" / "Mission failed" notice. |

## Passed (history, in `passed/`)

[TESTING-12-PLACES.md](passed/TESTING-12-PLACES.md) (step 12),
[TESTING-11A.md](passed/TESTING-11A.md), [TESTING-STARMAP.md](passed/TESTING-STARMAP.md) (step 11),
[TESTING-PLACES.md](passed/TESTING-PLACES.md) (step 10), [TESTING-INVENTORY.md](passed/TESTING-INVENTORY.md),
[TESTING-SHOPS.md](passed/TESTING-SHOPS.md), [TESTING-SELLING.md](passed/TESTING-SELLING.md),
[TESTING-LOOT.md](passed/TESTING-LOOT.md), [TESTING-ENEMIES.md](passed/TESTING-ENEMIES.md),
[TESTING-OUTFITTING.md](passed/TESTING-OUTFITTING.md), and step 13 (missions): [13a contracts](passed/TESTING-13-MISSIONS.md),
[13b story runtime](passed/TESTING-13B-MISSIONS.md), [13c screens](passed/TESTING-13C-SCREENS.md),
[13d mission rules and test missions](passed/TESTING-13D-MISSION-RULES.md).

When a step passes, move its guide into `passed/` and update this table. Changelog entries from before 2026-11-13 name
the guides without a folder; they were all in the project root then.

## When you write a new guide

Number it after the step (`TESTING-14-WORMHOLES.md`), write each check as a checkbox the owner can tick, say exactly what
to click and what to expect, and add a row above. For missions, include the awkward cases in
[../docs/MISSION_RULES.md](../docs/MISSION_RULES.md) (undock early, warp away, full hold, die, reload).
