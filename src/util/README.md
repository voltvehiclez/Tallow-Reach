# src/util: small shared helpers

| File | What it does |
|---|---|
| `events.js` | Publish/subscribe bus. `emit(name, payload)`, `on(name, handler)`. The list of events is at the top of the file, including `place-entered` for scenery changes, player-bearing `hurt` / `player-dead` events, and `travel-denied` for a refused starmap hop. |
| `rng.js` | The gameplay random source: `random()` for every gameplay roll, `setSeed(n)` to make a whole run reproducible (`setSeed(null)` to go back), and `makeRng(n)` for an independent generator that a sector or an instance can be regenerated from. `cosmeticRandom()` is separate for screen and sound, so their frame rate does not consume the seeded gameplay stream. Nothing in `sim/` or `data/` may call `Math.random()`; `tests/rng.test.mjs` enforces it. |
| `ids.js` | Unique numeric ids for world entities other than enemies (bullets, missiles, crates, particles). A plain counter that never touches `rng.js`; `render/views.js` keys a mesh on an entity's id. |
| `math.js` | Vector helpers (`V`, `fwd`, `face`), `R(a, b)` random range, `clamp`, `fmtDist`. |

Rules:
- Util files import nothing from the game layers above them.
- A new event must be added to the list at the top of `events.js`.
- Never call `Math.random()`. Use `random()` from `rng.js` (or `R(a, b)` from `math.js`) for gameplay; use
  `cosmeticRandom()` for screen and sound only, so a seeded run stays repeatable.
