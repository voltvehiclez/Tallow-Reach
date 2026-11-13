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
