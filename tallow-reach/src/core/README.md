# src/core: audio and input

| File | What it does |
|---|---|
| `audio.js` | All sound, synthesised with Web Audio. The **`SFX` table** says what each game sound is, played by the one `on("sfx", playSfx)` listener — the sim emits `sfx` events and never calls this file. `tone()`, `nz()`, `uiSound()`, `hoverSound()`, the warp pair `warpCharge()`/`warpBurst()`, `oreGained()` (a chime when a beam cycle banks an ore), per-frame `updateAudio()`, mute (`toggleMute`, `isMuted`) and `setAudioSuspended` for pause. |
| `input.js` | Keyboard and mouse. `BINDINGS` maps keys to named actions, which are emitted as `action` events and handled in `main.js`. |

Rules:
- Game code never reads DOM key or mouse events directly. Add a binding instead.
- There is deliberately no mute key. Sound is switched in the pause menu (`ui/pause.js`).
- New key or sound: `docs/HOW_TO_ADD.md` recipes 8 and 9. A game sound is **two** edits (an `SFX`
  entry plus an `emit("sfx", ...)` in the sim); `tests/layers.test.mjs` checks they agree.
- `input.js` is imported by `src/sim/` today (three files) and step 6b removes that. Nothing else
  here is imported by the sim any more.
