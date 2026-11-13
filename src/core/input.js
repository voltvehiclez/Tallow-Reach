// STEP 16 LOCAL-ONLY: keyboard and mouse populate only the local pilot controls.
// Raw input. Keyboard and mouse are translated twice:
//
//   1. into the local pilot's own control record (`localPlayer().controls`), which is what
//      `src/sim/` reads — the sim never sees a key code or the screen;
//   2. into named actions on the event bus for one-off things (dock, warp,
//      pause, switching weapons), which `main.js` handles.
//
// This file is the ONLY place that knows which physical key does what. To rebind,
// change BINDINGS (one-off actions) or HELD (the flight and weapon controls).
// Nothing else needs to change.

import { emit } from "../util/events.js";
import { state, localPlayer } from "../state/state.js";

/**
 * What each held key contributes to the local player's controls. `axis` is the name of the
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
 * Rebuild the local player's controls from what is held right now. Called after every key or
 * mouse change, so the record is always current when the sim's frame runs.
 */
export function syncControls() {
  const c = localPlayer()?.controls || state.controls;
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
  // The chart and the flight inventory are modal control surfaces: they take the
  // flight keys while open, even though the world keeps running behind the overlay.
  if (state.ui.starmap || state.ui.cargo) {
    c.thrust = c.strafe = c.lift = c.roll = 0;
    c.stop = c.brake = c.boost = c.fire = c.sec = false;
    c.steer.x = c.steer.y = 0;
  }
}

/** Release held flight input when a modal chart opens or the window loses focus. */
export function clearControls() {
  for (const code of Object.keys(keys)) keys[code] = 0;
  pointer.x = pointer.y = 0;
  syncControls();
  emit("freecam", false);
}

// One-shot actions. Alt (free camera) is a hold action and is handled separately.
export const BINDINGS = {
  KeyF: "lock",
  Digit1: "weapon:cannon",
  Digit2: "weapon:beam",
  KeyG: "dock",
  KeyM: "starmap",
  KeyJ: "route:jump",
  KeyI: "cargo",
  KeyP: "pause",
  Escape: "pause",
};

export function installInput() {
  addEventListener("keydown", e => {
    if (e.target.tagName === "TEXTAREA" || (["INPUT", "SELECT"].includes(e.target.tagName) && !["Escape", "KeyM"].includes(e.code))) return;
    // The chart (and the flight inventory) own flight input while open. Leave
    // Space/Enter alone so their focused buttons still work as controls.
    const modal = !!(state.ui.starmap || state.ui.cargo);
    if (!modal) keys[e.code] = 1;
    syncControls();
    if (!modal && e.code === "AltLeft") {
      e.preventDefault();
      emit("freecam", true);
    }
    if (!modal && e.code === "Space") e.preventDefault();
    const name = BINDINGS[e.code];
    if (name) emit("action", { name, repeat: e.repeat, key: e.code });
  });

  addEventListener("keyup", e => {
    keys[e.code] = 0;
    syncControls();
    if (e.code === "AltLeft") {
      e.preventDefault();
      emit("freecam", false);
    }
  });

  // Losing focus must not leave a ship thrusting while the player is elsewhere.
  addEventListener("blur", clearControls);

  addEventListener("mousemove", e => {
    pointer.x = (e.clientX / innerWidth - 0.5) * 2;
    pointer.y = (e.clientY / innerHeight - 0.5) * 2;
    syncControls();
    emit("look", { dx: e.movementX, dy: e.movementY });
  });

  addEventListener("mousedown", e => {
    if (!state.ui.starmap && e.button === 0) keys.fire = 1;
    if (!state.ui.starmap && e.button === 2) keys.sec = 1;
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
