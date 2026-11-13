# Recipe 9: A new sound

> One of the step-by-step recipes indexed in [HOW_TO_ADD.md](../HOW_TO_ADD.md). Read the checklist there first.
> Kind of work: data + two lines.


The sim never plays a sound. It says **what happened**; `src/core/audio.js` decides what that
sounds like. Two steps, always both:

1. **`src/core/audio.js`**: add an entry to `SFX`, named however you like
   (`"cannon"`, `"ore-gained"`). Build it from `tone(f1, f2, duration, volume, wave)` and
   `nz(duration, filterFreq, volume)`. An entry is `rest => { ... }`, so a sound can depend on the
   moment: `explosion: ({ count }) => { if (count > 10) nz(1.2, 500, 0.5); }` only rumbles for big
   bursts, and `"warp-charge": ({ dur }) => warpCharge(dur)` follows the warp's own length.
2. **Where it happens, in `src/sim/`**: `emit("sfx", { name: "cannon" })`, plus any extra fields the
   entry reads (`{ name: "explosion", count }`). Sound is in the sim's vocabulary, not its imports.

`tests/layers.test.mjs` checks both directions: a sound the sim emits must have an `SFX` entry, and
an `SFX` entry must be emitted somewhere. It also fails if a `src/sim/` file imports
`core/audio.js`, so never call `tone()`/`nz()` from the sim.

Mute and pause are handled inside `tone()`/`nz()`. Sound is switched on and off only from the pause
menu. Sounds a *screen* makes (buttons, hovers) are not game sounds: they call `uiSound()` /
`hoverSound()` directly from `ui/`.
