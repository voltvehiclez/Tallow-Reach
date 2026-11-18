# src/core: audio and input

| File | What it does |
|---|---|
| `audio.js` | All sound, synthesised with Web Audio. The **`SFX` table** says what each game sound is, played by the one `on("sfx", playSfx)` listener — the sim emits `sfx` events and never calls this file. `tone()`, `nz()`, `uiSound()`, `hoverSound()`, the warp pair `warpCharge()`/`warpBurst()`, `oreGained()` (a chime when a beam cycle banks an ore), per-frame `updateAudio()`, cosmetic-only randomness, mute (`toggleMute`, `isMuted`) and `setAudioSuspended` for pause/local chart (the requested suspension survives a later user-gesture `initAudio`). `fadeToSilence(seconds)` ramps every looping voice (engine, roar, hum, drone, docked pad) to zero — the `main-menu` listener uses it, because nothing drives the loops once the simulation stops behind the title screen. |
| `input.js` | The only file that knows a key code. `HELD` + `syncControls()` fill `localPlayer().controls`; `BINDINGS` maps one-off keys to named `action` events (M is `starmap`, R is `rift`, travel actions carry `to`). The chart, the flight inventory card and a rift trade are modal surfaces (`modalSurface()`): any one of them releases and zeroes all flight input — mouse steer included — so a pilot reading cargo cannot fly into a rock, and opening one also calls `sim/pilot.js` `holdShip()` to kill the carry; Space/Enter stay with focused UI controls; `clearControls()` also runs on blur. |

Rules:
- Game code never reads DOM key or mouse events directly. Add a binding instead.
- There is deliberately no mute key. Sound is switched in the pause menu (`ui/pause.js`).
- New key or sound: `docs/HOW_TO_ADD.md` recipes 8 and 9. A game sound is **two** edits (an `SFX`
  entry plus an `emit("sfx", ...)` in the sim); `tests/layers.test.mjs` checks they agree.
- **Nothing in this folder is imported by `src/sim/` any more** (step 6 closed that): the sim emits
  `sfx` for sound and reads the player's `controls` for input. `tests/layers.test.mjs` enforces it.

Input populates only the local player's controls; remote input/transport is not implemented. See `docs/TARGET_ARCHITECTURE.md`.


Mechanical undock layers live in data/audio.js; undockSound schedules them on the audio clock with mute/suspension guards.

Left Alt emits the inverse of the authoritative freeCam.on on non-repeat keydown. Keyup does not disable orbit; clearControls still disables it on blur/modal entry. No separate input latch can get out of sync with docking/warp.

Digit1–Digit5 emit primary:1–primary:5; Digit6–Digit0 emit secondary:1–secondary:5. The HUD buttons emit these same actions.
