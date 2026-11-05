# src/render: what you see in 3D

Visual only. Reads `state` and the sim, never changes game rules.

| File | What it does |
|---|---|
| `scene.js` | three.js renderer, lights, stars, planet, the outpost. |
| `models.js` | Ship and asteroid meshes. `mkShip`, `buildPlayerShip(id)`, `rockShape`. |
| `camera.js` | Docked orbit, chase camera, free orbit (Alt), screen shake. |

Rules:
- three.js is bundled by `npm run build`. Do not add other libraries.
- A new ship needs no change here unless it has a visible add-on (`buildPlayerShip`).
