// The warp overlay: a tunnel vignette that fades in with the drive, and a
// white-out at the moment the sector changes. Two full-screen gradients, held in
// one element, updated once a frame from the warp clock so the picture can never
// drift from the simulation. The motion of the tunnel comes from the 3D streaks
// in render/warpfx.js; this file only tints and flashes.
//
// Nothing here reads the game rules: it follows state.warp, which sim/sectors.js
// fills in, and the numbers come from WARP in data/sectors.js.

import { state } from "../state/state.js";

let root, flash;

export function setupWarpFlash() {
  root = document.createElement("div");
  root.id = "warpfx";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `<div class="v"></div><div class="f"></div>`;
  document.body.appendChild(root);
  flash = root.querySelector(".f");
}

/** Call every frame. Draws nothing at all when no warp is running. */
export function updateWarpFlash() {
  const w = state.warp;
  root.style.opacity = w ? w.fx.toFixed(3) : 0;
  flash.style.opacity = w ? w.flash.toFixed(3) : 0;
}
