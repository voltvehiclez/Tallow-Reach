# Architecture: Simulation and rendering: the tick, dt, input, sound, views

> Part of the code-architecture docs; the index and the layers are in [ARCHITECTURE.md](../ARCHITECTURE.md).
> This describes the code **as it is now**. When a change replaces a rule, rewrite it here.

## Conventions

- **`matrixWorld` is last frame's transform.** three.js only refreshes it when the scene is
  drawn, so `object.localToWorld(v)` during the frame loop silently uses where the object was
  one frame ago — an error that grows with speed. This is what made the chase camera trail
  further the faster the ship flew, and it is why bolts used to leave from where the guns were
  last frame. Build world points from a record's `pos` and `quat` by hand when the result matters
  (`playerLocal` in `sim/pilot.js`, `chaseView` in `render/camera.js`). **No code outside
  `render/` may read `matrixWorld` at all** — `tests/layers.test.mjs` enforces it for `sim/`.
- **The sim runs at 60 ticks a second** (`sim/step.js`, `data/simulation.js`); the frame loop
  accumulates time and keeps the old 0.05-second stall cap. Pause does not advance it. Screen and
  sound randomness use a separate cosmetic stream. Between 60 Hz ticks, `render/views.js`,
  `render/camera.js` and `ui/hud.js` interpolate visual poses using `simClock.alpha()` (keeping
  previous-tick poses in a render-side `WeakMap` so simulation state stays untouched and 240 Hz
  displays see smooth per-frame motion without sawtooth jitter; teleports with `P.snap` snap
  immediately). Missile aim still samples the last rendered camera direction; stable asteroid and
  encounter cooldowns use simulation-time place memory instead of wall-clock callbacks.
- **Anything that accumulates must be multiplied by `dt`.** A constant added per frame
  (`camera.rotateZ(0.05)` every frame, say) silently depends on the frame rate: harmless on a
  60 Hz screen, a visible bug on a 240 Hz one. This bit the warp roll once. Use
  `x += rate * dt`, or steer toward a target with `1 - Math.exp(-k * dt)`.
- **The Outfitting ship has its own renderer.** The outpost panel is HTML sitting on top
  of the game canvas, so a view inside it needs its own canvas and WebGL context
  (`render/shipviewer.js`). The panel rebuilds its HTML on every click, which takes that
  canvas out of the page without destroying it; `ui/outfitting.js` puts the same canvas
  back into `#shipview` after each render. Do not create a renderer per render, and keep
  `id="shipview"` in `outfittingHtml`.
- **The sim never reads the keyboard.** `core/input.js` is the only file that knows a key code.
  It fills `localPlayer().controls` (one plain record per pilot, shape in `src/state/controls.js`)
  and the sim reads that. Step 8c gives each player independent flight, power, drive, shield,
  hull, equipped weapons, cooldowns and locks; `state.player`, `state.flight`, `state.power` and
  related names alias the local record for existing UI and local-only systems. The sim advances
  every active player; shared projectiles and enemies advance once, with AI selecting the nearest.
  The remaining local-only assumptions are listed in `TARGET_ARCHITECTURE.md` for step 9.
  Do not rename fields without saying so there: `steer {x,y}`, `roll`, `thrust`, `strafe`, `lift`,
  `stop`, `brake`, `boost`, `fire`, `sec`. Step 8b puts it on each player; step 16 will fill a
  guest's copy from the network. `tests/layers.test.mjs` fails if a `sim/` file mentions
  `keys`/`pointer`, or if `HELD` sets a field the record does not have.
- **The sim never plays a sound itself.** It emits `sfx { name, ...rest }` at the moment the
  sound belongs to, and `core/audio.js` plays the matching entry of its `SFX` table (one entry per
  sound, holding the exact `tone()`/`nz()` numbers). `tests/layers.test.mjs` fails if a `sim/` file
  imports `core/audio.js`, and also if the sim emits a name with no `SFX` entry (or the table holds
  one nothing emits). To add a sound: an `SFX` entry plus an `emit` — see HOW_TO_ADD.md recipe 9.
  Mute and pause are handled inside `tone()`/`nz()` as before. UI sounds go through `uiSound()`
  and `hoverSound()`, which the screens call directly (they are not game sounds).
