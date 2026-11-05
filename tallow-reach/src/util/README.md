# src/util: small shared helpers

| File | What it does |
|---|---|
| `events.js` | Publish/subscribe bus. `emit(name, payload)`, `on(name, handler)`. The list of events is at the top of the file. |
| `rng.js` | `random()` and `setSeed(n)`. Use `random()` for gameplay randomness so runs can be seeded. |
| `math.js` | Vector helpers (`V`, `fwd`, `face`), `R(a, b)` random range, `clamp`, `fmtDist`. |

Rules:
- Util files import nothing from the game layers above them.
- A new event must be added to the list at the top of `events.js`.
