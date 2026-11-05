# src/sim: gameplay rules

Rules of the game. Reads and changes `state`, talks to other systems with events. Imports `data/`, `state/`, `util/`, `core/` (sound), and `render/` only to add or remove meshes.

| File | What it does |
|---|---|
| `player.js` | Ship setup (`setShip`), flight model, shields and hull, `hurt()`. |
| `weapons.js` | Cannons, mining beam, missiles and lock-on. |
| `combat.js` | Bullets, hostile kills and loot drops, crates and pickups. |
| `ai.js` | Pirate raiders: spawning, movement, shooting. |
| `asteroids.js` | The asteroid field and ore types. |
| `targeting.js` | Target lock (F). |
| `economy.js` | Cargo, storage, selling, repairs, every purchase. Returns optional message text. |
| `contracts.js` | Offer board and event-driven progress tracking. |
| `session.js` | Launch, dock, die. Emits `launched`, `docked`, `died`. |
| `effects.js` | Cosmetic explosions and exhaust. |
| `world.js` | Sector layout constants and `clearTransient()`. |

Rules:
- Use `emit`/`on` to connect systems that should not know each other.
- New rules that need numbers: put the numbers in `src/data/`.
- `docs/HOW_TO_ADD.md` recipes 3, 4, 6, 10, 11 touch this folder.
