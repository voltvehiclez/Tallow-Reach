# Recipe 8: A new key binding, a new control, or an in-flight action

> One of the step-by-step recipes indexed in [HOW_TO_ADD.md](../HOW_TO_ADD.md). Read the checklist there first.
> Kind of work: see below.


There are two kinds of input, and they are added differently.

**a) A one-off press** (dock, warp, pause, switch weapon):

1. `src/core/input.js`: add `KeyX: "actionName"` to `BINDINGS`.
2. `src/main.js`: add `case "actionName":` in the `on("action", ...)` handler. `playing` is true only while flying and not paused.
3. Mention the key in the hint in `src/index.html` and the controls text in `src/ui/screens.js`.

**b) A control held while flying** (throttle, strafe, fire, boost, brake...): this is the sim's
input, so it goes through the control record and **never through a key code in `src/sim/`**.

1. `src/state/controls.js`: add the field to `neutralControls()` (an axis starts at 0, a held flag
   at `false`) and describe it in the comment at the top of the file. **If you add an axis, the
   sim reads the number; do not read `keys` in `sim/`.** Renaming or removing a field is a change
   to the co-op contract — say so in `docs/REFACTOR_PLAN.md` step 6/8 as well.
2. `src/core/input.js`: add the key to `HELD`, pointing at that field
   (`KeyR: { axis: "lift", amount: 1 }`, or `{ flag: "boost" }`). `syncControls()` fills the record
   from the held keys after every change, so there is no other wiring.
3. `src/sim/…`: read the acting player's `controls.<field>` where the rule lives. Until
   step 8c is complete, `state.player` / `state.controls` are compatibility aliases for the local
   player, not independent global records.
4. `tests/layers.test.mjs` will fail if a `sim/` file mentions `keys`/`pointer`, or if `HELD` sets a
   field the record does not have — that is the check, not an obstacle.
