# src/sim: gameplay rules

Rules of the game. Reads and changes `state`, talks to other systems with events. Imports `data/`, `state/`, `util/`, `core/` (sound), and `render/` only to add or remove meshes.

| File | What it does |
|---|---|
| `player.js` | Ship setup (`setShip`), flight model, hull and `hurt()` (shields absorb first, then the hull). A ship with no drive gets no thrust and no turn, and pressing a control warns "Equip thrusters to move". |
| `shield.js` | The ship's shields from the fitted module: `shieldOf` a loadout, `refreshShield` after a fit, ship change, load or dock, `updateShield` each frame (off while being hit, then `regen` a second after the `delay` lull). |
| `power.js` | Ships' power budget: `powerOf` a loadout, `refreshPower`/`refillPower` after a fit change, `updatePower` each frame, and `hasPower` to ask whether the ship can pay for a demand. Writes `state.power` for the HUD; `draw` is set by the thrusters in `sim/player.js`. |
| `drive.js` | The ship's drive: `driveOf` a loadout, `refreshDrive` after a fit, ship change or undock, `hasDrive` to ask whether the ship can move at all. Writes `state.drive = { spd, turn, draw, boost, ignite }`, which the flight model and the chase camera read; `driveDraw` works out the per-second power the pilot is asking the thrusters for, and `ignite` is the one-off slug for lighting the boost. No thruster fitted gives 0 / 0: no thrust, turn or boost. |
| `fitting.js` | Moving modules between bays and storage: `fitModule`, `unequip`, `storedFor`, `fittedAt`. The only writer of `profile.loadout`/`profile.modules`; refreshes power after every change. |
| `weapons.js` | Cannons, mining beam, missiles and lock-on. |
| `combat.js` | Bullets, hostile kills and loot drops, crates and pickups. |
| `ai.js` | Pirate raiders: spawning, movement, shooting. |
| `asteroids.js` | The asteroid field and ore types. |
| `targeting.js` | Target lock (F). |
| `economy.js` | Cargo, storage, selling, repairs, every purchase. Returns optional message text. |
| `contracts.js` | Offer board and event-driven progress tracking. |
| `session.js` | Launch, dock, die. Emits `launched`, `docked`, `died`. |
| `sectors.js` | Warping between sectors (M): swaps the scenery and the rock list. Emits `sector-changed`. |
| `effects.js` | Cosmetic explosions and exhaust. |
| `world.js` | Sector layout constants and `clearTransient()`. |

Rules:
- Use `emit`/`on` to connect systems that should not know each other.
- New rules that need numbers: put the numbers in `src/data/`.
- `docs/HOW_TO_ADD.md` recipes 3, 4, 6, 10, 11 touch this folder.
