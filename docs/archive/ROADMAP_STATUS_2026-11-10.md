# Archived ROADMAP status prose (as of 2026-11-10)

> Moved word for word out of [ROADMAP.md](../ROADMAP.md) when the status was rewritten shortly. History only.

**Current position:** **Milestone C is built and Milestone D has started.** **Steps 0 to 11 are ticked**
(11B owner playtest passed, as recorded in VISION.md). **Step 12 is built and awaiting the owner
playtest** in `TESTING-12-PLACES.md`. Step **13a** is built and awaiting the owner playtest in
`TESTING-13-MISSIONS.md`; 13b's story runtime and 13c's dialogue/Mission log screens are built, with
browser checks pending in `TESTING-13C-SCREENS.md`. Saves are version **19**: `world.destination`,
place memory and story-script place state remain in the world half, while `profile.missions` and
`profile.flags` replace the single contract slot. v18 and older active contracts migrate into the
one-step mission runner. Generated pockets are filled immediately by three data templates
(`frontier`, `trade_lane`, `salvage_yard`) with tier-selected encounters: hostile patrols, a dockable
trader reusing Meridian's `SHOPS`, derelicts and resource caches. The generic spawner preserves
hunt-contract selection. Timers do not advance while the simulation is paused, and `respawn-place` can
force a future event-driven respawn. `npm test` and the build are the local checks for this slice; the
owner visual playtests are still pending.

**Already ticked:** steps 0 to 5 (steps 4 and 5 on 2026-11-08, after the owner played
`TESTING-INVENTORY.md` and `TESTING-SHOPS.md`): the item catalogue with one inventory per place
(save v12), and shops and prices from data. **Step 6, ticked in full (2026-11-08):** 6a, the sim
no longer plays sounds (it emits `sfx`, `core/audio.js` plays them; the owner confirmed every sound
by ear) and 6b, the sim reads `state.controls` instead of the keyboard and the mouse and the missile
lock ring is sized in `ui/hud.js` (the owner played `TESTING-BASELINE.md` sections A and B and found
no problems). So **no `src/sim/` file imports `core/` at all**. The owner's earlier answers stand:
found modules do **not** get random stats, so a stock stays a plain count per item; Meridian sells
the six standard parts for 1 cr each (beam 900, missile pod 1500); shop stock can be limited (`max`)
but no row uses it yet, and `setShopStock()` is still the unused restock hook. Data-only content
(rows 1 to 8 of "Content you can add now") can go ahead in parallel.

---

## Appended 2026-11-25, moved out of ROADMAP.md word for word (step 16 slice 8a)

**Slices 14a and 14b are built, playtested and ticked: the owner's four playtest bugs are fixed and confirmed, their "works well" round's two notes — odd lines in the painted sky, and a ship that still flew while a loot card was open — shipped 2026-11-14**
([../testing/TESTING-14-RIFTS.md](../testing/TESTING-14-RIFTS.md)): the Basic rift is on Meridian's shelf; using it
opens a **shimmering dark-orange anomaly** in clear space; **R** goes in and out; **F** locks the door, the way out and
the canister; the run is generated from a template and a seed under a **shattered sky of its own**; its guardians are
hardened; the prize is a **canister opened with R** once the objective is done; the way out stays sealed until then; the
20-minute clock kills the pilot still inside; and a run is **saved** (`world.instances`), so logging out mid-rift comes
back mid-rift. `npm test` is green and the build is measured per build.
