// The control record: one plain object per pilot, holding what that pilot is
// asking the ship to do this frame. `core/input.js` fills the local player's
// copy from the keyboard and mouse; `src/sim/` reads it and knows nothing about
// keys, mice or the screen. The network will fill a guest's copy with the same
// shape (refactor step 16).
//
// This file lives in `state/` on purpose: it is a data shape, not input code, so
// that `util/`, `state/` and `sim/` can all see it without importing `core/`.
//
//   steer.x / steer.y   mouse, -1..1 from the centre of the screen (also the
//                       stick remembered when a warp starts)
//   roll                Q/E, -1..1
//   thrust              W/S, -1..1 (held; the sim ramps the throttle with it)
//   strafe              D/A, -1..1
//   lift                Space/C, -1..1
//   stop                X, held: the throttle snaps to zero
//   brake               Ctrl, held: the throttle bleeds off
//   boost               Shift, held
//   fire / sec          left / right mouse, held
//
// Held keys are booleans; the axes are numbers. Every field is always present, so
// nothing in the sim has to guard for `undefined`.

/** A pilot asking for nothing: the shape every control record starts from. */
export function neutralControls() {
  return {
    steer: { x: 0, y: 0 },
    roll: 0,
    thrust: 0,
    strafe: 0,
    lift: 0,
    stop: false,
    brake: false,
    boost: false,
    fire: false,
    sec: false,
  };
}
