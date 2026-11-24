# Owner playtest guides

Numbered, click-by-click checklists for the owner (who does not code) to play after an AI chat finishes a step.
The AI writes one per step; the owner plays it, reports what failed, and the step is ticked in
[../docs/ROADMAP.md](../docs/ROADMAP.md) only when the owner says it passed.

**Every time:** play [TESTING-BASELINE.md](TESTING-BASELINE.md) (a 10-minute click-through of the whole game),
the guide for the step, load an **old** save, and back up a zip. `TEST-OLD-CODES.txt` holds old export codes
(A, B, ...) for the old-save checks.

## Current guides

- [16 slice 2: save v29](TESTING-16-SAVE29.md)
- [16 slice 3: the connection](TESTING-16-MULTIPLAYER.md)
- [Playtest 18: the away card, the menu, the username box](TESTING-PLAYTEST18.md)
- [Playtest 17: the join box, the card's door, Bring pilot home](TESTING-PLAYTEST17.md)
- [Playtest 16: the pilot follows you in](TESTING-PLAYTEST16.md)
- [Playtest 15: the away card, coming home, Rejoin](TESTING-PLAYTEST15.md)
- [16 slice 4: Bring my pilot, sync, Go home](TESTING-16-SLICE4.md)
- [16 slice 4: QUICK version (10 minutes)](QUICK-16-SLICE4.md)
- [15: campaign scaffolding](TESTING-15-CAMPAIGN.md)
- [14d: wormhole systems](TESTING-14D.md)

| Guide | Covers |
| --- | --- |
| [QUICK-16-SLICE4.md](QUICK-16-SLICE4.md) | The 10-minute version of the slice 4 test: get the zip, host, join, press **Bring my pilot**, note one station number, close the host, come home, check the number. |
| [TESTING-PLAYTEST17.md](TESTING-PLAYTEST17.md) | Playtest 17 (build `2026-11-23e`): the join box holds the choice (Bring my pilot / Enter the world), the away card has a Main menu, and Bring pilot home works from the card with the host closed. |
| [TESTING-PLAYTEST16.md](TESTING-PLAYTEST16.md) | Playtest 16 (build `2026-11-23d`): joining used to enter the world without ever offering **Bring my pilot**. The prompt is now a card inside the world, Open World refuses while the pilot is away, and Rejoin opens something you can see. |
| [TESTING-PLAYTEST15.md](TESTING-PLAYTEST15.md) | Playtest 15 (build `2026-11-23c`): **Bring pilot home** and **Rejoin** never worked from the title card. Get an already-stuck laptop back out, then a full round trip: join, rejoin after a refresh, come home with the lockers intact. |
| [TESTING-16-SLICE4.md](TESTING-16-SLICE4.md) | Step 16 slice 4: join a friend's world, press **Bring my pilot** (joining alone does not travel), check nothing is copied, then **Bring pilot home** from the title card with the host's browser closed. Nothing is drawn for a visiting ship yet. |
| [TESTING-16-MULTIPLAYER.md](TESTING-16-MULTIPLAYER.md) | Step 16 slice 3: turn Open Multiplayer on, copy the join link, join from a second window, chat with Enter (and type without flying the ship), and check a hosted world does not pause. Nothing a pilot owns crosses yet — **no ship is drawn for a guest** and no credits or cargo travel. |
| [TESTING-16-SAVE29.md](TESTING-16-SAVE29.md) | Step 16 slice 2: the save is v29; an existing save opens unchanged, a play session is unchanged, autosave/slot/export-import still work, the campaign is untouched, and an old save still loads (nothing to look for yet — the join flow is slice 4). |
| [TESTING-NPC-AI.md](TESTING-NPC-AI.md) | Individual flight, Guardian aggression, obstacle avoidance, difficulty and crowded-belt performance. |
| [TESTING-TARGETING.md](TESTING-TARGETING.md) | Feature batch Part 1 (items 4–7): F switching, NPC bars, missile progress and priority. |
| [TESTING-BASELINE.md](TESTING-BASELINE.md) | The whole game; play it after every step. |
| [TESTING-14-RIFTS.md](TESTING-14-RIFTS.md) | Step 14a + 14b: buying and using a rift, the anomaly and its gate, F-locks and HUD labels, the shattered sky, the canister you open with R, the 20-minute collapse, dying inside, and reloading mid-rift. |
| [TESTING-15-CAMPAIGN.md](TESTING-15-CAMPAIGN.md) | Step 15: the Campaign mode button, Auric Reach, dual-mode saves and slots, export/import, the fixed Wasp grant, Captain Dane Korr's M01 flight-school tutorial ending in the pirate ambush, hand-in, replay and mode-switch isolation. |
| [TESTING-14C-WORMHOLES.md](TESTING-14C-WORMHOLES.md) | Step 14c: simple wormholes — a pocket that spawns itself in normal space, the no-notice starmap marker, the 20-minute clock, the grey dark sphere, the three sites (smugglers/freighter, lumenite belt, guardian hive), leaving and re-entering at any time, collapse on expiry, and the save v21 round trip. |
| [TESTING-SYSTEM-SKY.md](TESTING-SYSTEM-SKY.md) | System space: every pocket of a system in a derived 3D AU layout, the star/black hole hanging in its true direction with size set by its AU size and pocket distance, sibling pockets as barely-visible dots, light per pocket from the visible body, per-system sizes, and the wormhole/rift exclusions. |

## Passed (history, in `passed/`)

[TESTING-DEATH-AND-MISSIONS.md](passed/TESTING-DEATH-AND-MISSIONS.md) (mission hand-ins, dying with a
mission-only item, contract wording and the failure notices; owner-confirmed 2026-11-14),
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

- [Part 2 and follow-up](TESTING-PART2.md) — owner playtest pending.

- [Feature batch 2](TESTING-BATCH2.md) — slice 1 flight UI playtest; remaining slice plan and acceptance criteria.
