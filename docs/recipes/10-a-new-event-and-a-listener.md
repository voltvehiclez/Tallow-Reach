# Recipe 10: A new event and a listener

> One of the step-by-step recipes indexed in [HOW_TO_ADD.md](../HOW_TO_ADD.md). Read the checklist there first.
> Kind of work: see below.


1. `emit("name", payload)` where it happens (the sim layer).
2. Add `name  payload  description` to the list at the top of `src/util/events.js`.
3. Listen with `on("name", handler)` wherever it is needed. Listeners must not import the emitter.
   A listener in `render/` is how drawing follows the sim: `render/views.js` listens for
   `enemy-spawned` / `enemy-removed` (step 7a) and for `entity-spawned` / `entity-removed`, which
   `sim/entity.js` emits for every bullet, missile, crate, spark and rock (step 7b).

`sfx` is the worked example (step 6a): the sim emits it at eleven places, and `core/audio.js`
subscribes once. Payloads should carry **ids and plain numbers**, not objects with behaviour — that
is what lets a listener (sound, a mission, a network snapshot) work without knowing the emitter.
