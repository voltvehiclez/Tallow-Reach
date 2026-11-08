# src/render: what you see in 3D

Visual only. Reads `state` and the sim, never changes game rules. Visual random choices use
`cosmeticRandom` so render frame rate does not consume seeded gameplay rolls.

| File | What it does |
|---|---|
| `scene.js` | three.js renderer, lights, stars, planet, the outpost. Each sector gets its own group: `sectorGroup(id)` to add scenery, `showSector(id)` to show one sector and hide the rest. |
| `models.js` | Ship and asteroid meshes. `mkShip`, `buildPlayerShip(id)`, `rockShapeAt(k)` (`ROCK_SHAPE_COUNT` shapes; a rock's record says which: `shape`). |
| `views.js` | **Every mesh in the world except the scenery.** One mesh per entity, kept in step with the sim's plain data: `installEnemyViews()` at boot, `updateEnemyViews()` once a frame. Since step 7a a hostile is data (`enemy-spawned` / `enemy-removed`); since 7b so is everything else — bullets, missiles, crates, explosion sparks, rocks, and the player's own ship (built from `profile.ship`, hidden while docked). `PlayerShipView` owns the local player hull, selected by `localPlayer()`, and exposes the same named mount data the sim uses. It also draws the mining beam from `state.flight.beamStart` / `beamEnd`. `registerEntityView(kind, { list, build, update, remove })` registers a kind; one live-view map holds all kinds, with separate enemy/entity ID namespaces. `entityViewCount()` and `enemyViewCount()` count the respective views. Builds a mesh on `entity-spawned`, removes it on `entity-removed`, and sweeps the lists every frame so nothing is ever left behind. |
| `camera.js` | Docked orbit, chase camera, free orbit (Alt), screen shake, the FOV/roll kick during a warp. The chase distance behind the ship is the `CAMERA` table in `data/camera.js` and nothing else: the camera rides along with the ship's movement and only eases the offset. |
| `warpfx.js` | The warp streaks: additive lines hanging off the camera, driven by `state.warp.fx`. Hidden when no warp is running. |
| `shipviewer.js` | The Outfitting ship view: its own renderer, scene, lights and turntable. `setShip(id)`, `dragShip`, `zoomShip`, `resizeShipViewer`, `renderShip(dt)`. Owned by `ui/outfitting.js`. |

Rules:
- three.js is bundled by `npm run build`. Do not add other libraries.
- A new ship needs no change here unless it has a visible add-on (`buildPlayerShip`).
- **A new entity kind is drawn here, never in `sim/`.** Give it a `kind` in its record and register its list, mesh builder, per-frame updater and
  cleanup in `views.js` (see recipe 19 in `docs/HOW_TO_ADD.md`); `tests/layers.test.mjs` fails if a `sim/` file's code names a mesh, a material
  or the scene, and `tests/views.test.mjs` counts the meshes.

The current player hull and beam views follow the **local** player only; see the still-local-only table in `docs/TARGET_ARCHITECTURE.md`.
