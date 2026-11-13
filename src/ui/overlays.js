// Which full-screen overlays may open right now, and the pause overlay's markup.
//
// The open world is every state except the title screen: a pilot docked at a
// station can still pause the game and read the starmap (plotting a route while
// docked is useful; warping still needs a launch). Only the title screen, an
// open chat/menu that already owns the screen, a dead pilot or a warp in
// progress keeps them shut. `main.js` asks these, so the answer lives in one
// place instead of being a `!docked` condition copied into every key handler.

import { state, localPlayer } from "../state/state.js";

/** Can the pause overlay open? Everywhere in the open world, docked or flying. */
export const canPause = (ui = state.ui) => !ui.intro;

/**
 * Can the starmap open? Also everywhere in the open world. A pilot docked at a
 * station may look at the map; the warp it proposes still needs a launch.
 */
export function canOpenStarmap(P = localPlayer(), ui = state.ui, galaxy = state.galaxy) {
  return !ui.intro && !state.paused && !!galaxy && !!P && !P.dead && !P.warp;
}

/**
 * The pause overlay's markup. Resume is the first control and Exit to main menu
 * the last, so the two things a paused pilot actually wants (carry on, quit) sit
 * at the top and the bottom of the card with the settings between them.
 */
export function pauseOverlayHtml() {
  return (
    `<div>` +
    `<h1>Paused</h1>` +
    `<p>P or Esc to resume</p>` +
    `<button id="pz-resume">Resume</button>` +
    `<button class="sw" id="pz-sound" role="switch"><i></i><span></span></button>` +
    `<button id="pz-main-menu">Exit to main menu</button>` +
    `</div>`
  );
}
