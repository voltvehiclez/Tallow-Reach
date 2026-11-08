// Raw input. Keyboard and mouse are translated twice:
//
//   1. into the local pilot's control record (`state.controls`), which is what
//      `src/sim/` reads — the sim never sees a key code or the screen;
//   2. into named actions on the event bus for one-off things (dock, warp,
//      pause, switching weapons), which `main.js` handles.
//
// This file is the ONLY place that knows which physical key does what. To rebind,
// change BINDINGS (one-off actions) or HELD (the flight and weapon controls).
// Nothing else needs to change.

import { emit } from "../util/events.js";
import { state } from "../state/state.js";

/**
 * What each held key contributes to `state.controls`. `axis` is the name of the
 * field it adds `amount` to (-1..1), so two keys can pull the same axis both ways.
 * Any key not listed here still has its own `keys[code]` flag, for code that
 * wants a raw key without a control of its own.
 */
export const HELD = {
  KeyW: { axis: "thrust", amount: 1 },
  KeyS: { axis: "thrust", amount: -1 },
  KeyD: { axis: "strafe", amount: 1 },
  KeyA: { axis: "strafe", amount: -1 },
  Space: { axis: "lift", amount: 1 },
  KeyC: { axis: "lift", amount: -1 },
  KeyQ: { axis: "roll", amount: 1 },
  KeyE: { axis: "roll", amount: -1 },
  KeyX: { flag: "stop" },
  ControlLeft: { flag: "brake" },
  ControlRight: { flag: "brake" },
  ShiftLeft: { flag: "boost" },
  ShiftRight: { flag: "boost" },
};

/** Held keys by KeyboardEvent.code, plus mouse "fire" and "sec". */
export const keys = {};

/** Steering input in -1..1, measured from the screen centre. */
export const pointer = { x: 0, y: 0 };

/**
 * Rebuild `state.controls` from what is held right now. Called after every key or
 * mouse change, so the record is always current when the sim's frame runs.
 */
export function syncControls() {
  const c = state.controls;
  c.thrust = c.strafe = c.lift = c.roll = 0;
  c.stop = c.brake = c.boost = false;
  for (const code of Object.keys(HELD)) {
    if (!keys[code]) continue;
    const h = HELD[code];
    if (h.axis) c[h.axis] += h.amount;
    else if (h.flag) c[h.flag] = true;
  }
  c.steer.x = pointer.x;
  c.steer.y = pointer.y;
  c.fire = !!keys.fire;
  c.sec = !!keys.sec;
}

// One-shot actions. Alt (free camera) is a hold action and is handled separately.
export const BINDINGS = {
  KeyF: "lock",
  Digit1: "weapon:cannon",
  Digit2: "weapon:beam",
  KeyG: "dock",
  KeyM: "warp",
  KeyP: "pause",
  Escape: "pause",
};

export function installInput() {
  addEventListener("keydown", e => {
    if (e.target.tagName === "TEXTAREA") return;
    keys[e.code] = 1;
    syncControls();
    if (e.code === "AltLeft") {
      e.preventDefault();
      emit("freecam", true);
    }
    if (e.code === "Space") e.preventDefault();
    const name = BINDINGS[e.code];
    if (name) emit("action", { name, repeat: e.repeat });
  });

  addEventListener("keyup", e => {
    keys[e.code] = 0;
    syncControls();
    if (e.code === "AltLeft") {
      e.preventDefault();
      emit("freecam", false);
    }
  });

  addEventListener("blur", () => {
    // Losing focus must not leave a control held: clear the held keys too, or a
    // ship keeps thrusting while the player is in another window.
    for (const code of Object.keys(keys)) keys[code] = 0;
    syncControls();
    emit("freecam", false);
  });

  addEventListener("mousemove", e => {
    pointer.x = (e.clientX / innerWidth - 0.5) * 2;
    pointer.y = (e.clientY / innerHeight - 0.5) * 2;
    syncControls();
    emit("look", { dx: e.movementX, dy: e.movementY });
  });

  addEventListener("mousedown", e => {
    if (e.button === 0) keys.fire = 1;
    if (e.button === 2) keys.sec = 1;
    syncControls();
  });
  addEventListener("mouseup", e => {
    if (e.button === 0) keys.fire = 0;
    if (e.button === 2) keys.sec = 0;
    syncControls();
  });
  addEventListener("contextmenu", e => e.preventDefault());

  addEventListener("wheel", e => emit("wheel", e.deltaY));
}
