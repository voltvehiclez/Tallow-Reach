# Owner playtest guides

Numbered, click-by-click checklists for the owner (who does not code) to play after an AI chat finishes a step.
The AI writes one per step; the owner plays it, reports what failed, and the step is ticked in
[../docs/ROADMAP.md](../docs/ROADMAP.md) only when the owner says it passed.

**Every time:** play [TESTING-BASELINE.md](TESTING-BASELINE.md) (a 10-minute click-through of the whole game),
the guide for the step, load an **old** save, and back up a zip. `TEST-OLD-CODES.txt` holds old export codes
(A, B, ...) for the old-save checks.

## Current guides

- [16 slice 8a: the second hull appears — and both rounds of playtest 23's fixes](TESTING-16-SLICE8A.md)
- [16 slice 7: the visitor's name on the galaxy chart and the system map](TESTING-16-SLICE7.md)
- [Playtest 22: two guests on one link, and the chat's column](TESTING-22-CHAT.md)
- [Playtest 22: QUICK version (10 minutes)](QUICK-22-CHAT.md)
- [16 slice 5: crashes and reconnects](TESTING-16-SLICE5.md)
- [16 slice 5: QUICK version (10 minutes)](QUICK-16-SLICE5.md)
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
| [QUICK-22-CHAT.md](QUICK-22-CHAT.md) | The 10-minute version: three windows, one link — both guests in at once, a refresh that still gets in, then the chat (12 s, lines only when it opens by itself, one Pin in two colours, a narrow column). |
| [TESTING-16-SLICE8A.md](TESTING-16-SLICE8A.md) | Step 16 slice 8a (build `2026-11-25d`): a friend's **hull is drawn in your world** — parked at the station it arrived at, gone when it goes home and back when it rejoins; two visitors are two hulls. **Part 6 is playtest 23's retest:** the friend's ship is **selectable** (F and the N list), wears **its pilot's name**, and shows **hull/shield bars**; **leaving and rejoining the same link always works**. **Part 8** is the follow-up: the N list's **Ship** filter now lists **every** ship, a docked friend included (and the host's own ship on a guest's list). **Part 7 is the second round:** the browser that was still locked out comes back on the **same link** (the host's damaged record repairs itself), and a visiting hull is now **solid and takes damage** — collision, guns, warheads — with its destruction said in chat. It still does **not** move (8b), the guest's screen still shows its own galaxy (8c), and a destroyed visitor cannot respawn yet. Includes what to check when you see nothing. |
| [TESTING-16-SLICE7.md](TESTING-16-SLICE7.md) | Step 16 slice 7 (build `2026-11-24h`): a friend's visiting pilot is **named on the galaxy chart under its system** (no zooming needed), **under the pocket it stands in** on the system map, and in a **Visiting pilots** row at the **top** of the side panel — two visitors stack in one order, a pilot that goes home takes its row with it, and a "if you see nothing" list covers the empty-map cases (no Bring my pilot, stale build, another system). No ship in space yet (slice 8), no trading (now last). |
| [TESTING-22-CHAT.md](TESTING-22-CHAT.md) | Playtest 22 (build `2026-11-24f`): **two friends on the same join link, neither kicked**, a refresh rejoining as the same pilot, and one pilot in one window; then the chat — right-hand column only while typing, `Pin` always one word in two colours, twelve seconds including your own line, players strip capped at ten names. |
| [QUICK-16-SLICE5.md](QUICK-16-SLICE5.md) | The 10-minute version of the slice 5 test: host, join, bring the pilot, **close the host's browser**, watch the guest land on the main menu with **Lost connection to host**, dismiss it, check the pilot can still come home, rejoin with the same link, then close the guest's tab and watch the host's list drop it. |
| [TESTING-16-SLICE5.md](TESTING-16-SLICE5.md) | Step 16 slice 5 (build `2026-11-24a`): the host's game closes (or the connection drops) while the pilot is in its world — the guest is put back on the **main menu** with **Lost connection to host**, one button; rejoining keeps the copy the server already has; going into the local world instead offers **Bring pilot home**; a closed tab is a clean goodbye; a second window takes the pilot over. No visiting ship is drawn yet. |
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
