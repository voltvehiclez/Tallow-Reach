# src/render: what you see in 3D

Visual only. Reads `state` and the sim, never changes game rules.

| File | What it does |
|---|---|
| `scene.js` | three.js renderer, lights, stars, planet, the outpost. Each sector gets its own group: `sectorGroup(id)` to add scenery, `showSector(id)` to show one sector and hide the rest. |
| `models.js` | Ship and asteroid meshes. `mkShip`, `buildPlayerShip(id)`, `rockShape`. |
| `camera.js` | Docked orbit, chase camera, free orbit (Alt), screen shake, the FOV/roll kick during a warp. The chase distance behind the ship is the `CAMERA` table in `data/camera.js` and nothing else: the camera rides along with the ship's movement and only eases the offset. |
| `warpfx.js` | The warp streaks: additive lines hanging off the camera, driven by `state.warp.fx`. Hidden when no warp is running. |
| `shipviewer.js` | The Outfitting ship view: its own renderer, scene, lights and turntable. `setShip(id)`, `dragShip`, `zoomShip`, `resizeShipViewer`, `renderShip(dt)`. Owned by `ui/outfitting.js`. |

Rules:
- three.js is bundled by `npm run build`. Do not add other libraries.
- A new ship needs no change here unless it has a visible add-on (`buildPlayerShip`).
