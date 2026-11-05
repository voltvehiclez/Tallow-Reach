// Raw input. Keyboard and mouse are translated into named actions and
// published on the event bus, so game code never reads DOM events directly.
// To rebind keys, change BINDINGS. Nothing else needs to change.

import { emit } from "../util/events.js";

/** Held keys by KeyboardEvent.code, plus mouse "fire" and "sec". */
export const keys = {};

/** Steering input in -1..1, measured from the screen centre. */
export const pointer = { x: 0, y: 0 };

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
    if (e.code === "AltLeft") {
      e.preventDefault();
      emit("freecam", false);
    }
  });

  addEventListener("blur", () => emit("freecam", false));

  addEventListener("mousemove", e => {
    pointer.x = (e.clientX / innerWidth - 0.5) * 2;
    pointer.y = (e.clientY / innerHeight - 0.5) * 2;
    emit("look", { dx: e.movementX, dy: e.movementY });
  });

  addEventListener("mousedown", e => {
    if (e.button === 0) keys.fire = 1;
    if (e.button === 2) keys.sec = 1;
  });
  addEventListener("mouseup", e => {
    if (e.button === 0) keys.fire = 0;
    if (e.button === 2) keys.sec = 0;
  });
  addEventListener("contextmenu", e => e.preventDefault());

  addEventListener("wheel", e => emit("wheel", e.deltaY));
}
