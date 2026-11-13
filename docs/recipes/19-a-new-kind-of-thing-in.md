# Recipe 19: A new kind of thing in the world

> One of the step-by-step recipes indexed in [HOW_TO_ADD.md](../HOW_TO_ADD.md). Read the checklist there first.
> Kind of work: a new entity kind.


Everything that flies, drifts or pops in the world is a **record** (refactor steps 7a and 7b), not a
mesh: an enemy, a bullet, a missile, a crate, a spark, a rock, the player's ship. A new kind is
therefore three small pieces and no scene code in `sim/`.

1. **The record.** Give it `{ id, kind: "<kind>", pos, quat, ... }` and the fields its rules need.
   Positions and rotations are three.js maths types — that is allowed — but **no mesh, material or
   scene**: `tests/layers.test.mjs` fails if a `sim/` file's code names one.
2. **Into and out of the world.** Add it to an array in `state.world` with `addEntity(list, e)`, take
   it out with `dropEntity(list, e)`, empty a list with `clearEntities(list)` — all in
   `src/sim/entity.js`. Those are the only places that emit `entity-spawned` / `entity-removed`, and
   they hand out ids from `src/util/ids.js` (a counter, so spawning never disturbs the seeded random
   sequence). If docking or warping should clear it, add the list to `clearTransient()` or
   `clearWorldObjects()` in `src/sim/world.js`.
3. **The drawing.** Register the kind in `src/render/views.js` with `registerEntityView`:
   supply `list` (returns its current world array), `build` (returns its mesh with its initial pose),
   `update` (copies the record to the mesh each frame), and `remove` (disposes resources owned by
   that mesh; use `noCleanup` for shared resources). The registry attaches and removes the mesh
   and reconciles missed events; do not add another switch or edit the common view machinery.
   Copy from the record; never write back into it or read `matrixWorld` outside `render/`.
4. **Test it.** `tests/headless-fight.test.mjs` is the model: drive the real sim with no browser and
   assert on `state`. If the thing is drawn, add its kind to the list in `tests/layers.test.mjs`
   (the test that checks `render/views.js` knows every kind) and a mesh count to
   `tests/views.test.mjs`.
