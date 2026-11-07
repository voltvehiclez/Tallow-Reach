# src/util: small shared helpers

| File | What it does |
|---|---|
| `events.js` | Publish/subscribe bus. `emit(name, payload)`, `on(name, handler)`. The list of events is at the top of the file. |
| `rng.js` | The one random source: `random()` for every gameplay roll, `setSeed(n)` to make a whole run reproducible (`setSeed(null)` to go back), and `makeRng(n)` for an independent generator that a sector or an instance can be regenerated from. Nothing in `sim/` or `data/` may call `Math.random()`; `tests/rng.test.mjs` enforces it. |
| `math.js` | Vector helpers (`V`, `fwd`, `face`), `R(a, b)` random range, `clamp`, `fmtDist`. |

Rules:
- Util files import nothing from the game layers above them.
- A new event must be added to the list at the top of `events.js`.
- Never call `Math.random()`. Use `random()` from `rng.js` (or `R(a, b)` from `math.js`), so a seeded
  run stays repeatable.
