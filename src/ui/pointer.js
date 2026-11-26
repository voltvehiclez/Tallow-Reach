// **One pointer at a time** (owner, playtest 25).
//
// Two cursors live on the same screen: the system cursor, and the HUD's own orange circle
// (`#cur`, drawn by `ui/hud.js`). While the pilot steers, the orange circle *is* the pointer, so
// the system one must not appear anywhere under the mouse — and the pinned chat proved it did:
// its box takes the mouse (`pointer-events: auto`) and inherits the page's default cursor, so the
// white arrow sat inside the orange ring. The owner's rule is the general one:
//
//   *"In the ship UI your orange circle cursor should always be prioritised if you are steering.
//    So UIs [that] decouple the steering like chat, inventory etc — it's ok there to show the
//    white windows cursor."*
//
// So this module answers one question — **is the stick live?** — and puts the answer on the page
// as `body.pilot-pointer`. `styles.css` then does both halves of the rule with it: no system
// cursor anywhere while it is on, and the orange circle hidden while it is off, so a pilot never
// sees two pointers at once. Left Alt's free camera is *not* a decoupling: it changes the
// viewpoint, not who flies the ship, so the orange circle stays (owner, playtest 25).
//
// A surface counts as decoupling when it takes the flight keys for itself. That decision is
// `core/input.js`'s (`modalSurface()` plus the N list), and `paused`/`docked` hide the flight HUD
// altogether — the list below is the same one, kept here so this file can be read on its own. It
// is written as a function of `state` with no DOM in it, so the rule itself is tested directly.

import { state } from "../state/state.js";

/** Surfaces that take the stick, and so the mouse, for themselves. */
export function pointerTaken(s = state) {
  const ui = s?.ui || {};
  return !!(ui.chat || ui.cargo || ui.cache || ui.starmap || ui.multiplayer || ui.navigation || ui.campaignEnd);
}

/**
 * Is the orange circle the pointer right now?
 *
 * The pilot must be **flying**: in a ship (docked is a station screen, a mouse UI), on a screen
 * that draws the flight HUD (not the title screen), with the world running (pause is a card), and
 * with no surface that has taken the stick.
 */
export function pilotPointer(s = state) {
  if (!s) return false;
  const ui = s.ui || {};
  const P = s.player;
  if (ui.intro) return false;          // the title screen has no ship to steer
  if (!P || P.docked) return false;    // a station is a mouse screen
  if (s.paused) return false;          // the pause card has the mouse
  return !pointerTaken(s);
}

/** The body class `styles.css` keys the rule on. */
export const POINTER_CLASS = "pilot-pointer";

// What the page currently says, so a frame that changes nothing touches no DOM (`null` = unknown,
// and the next sync writes).
let shown = null;

/**
 * Put the rule on the page. Called once a frame from `main.js` — it is a comparison and, at most,
 * one `classList.toggle`; it never reads layout, so it costs nothing on the frames that do not
 * change the answer.
 */
export function syncPointer(doc = globalThis.document, s = state) {
  const on = pilotPointer(s);
  if (on === shown) return on;
  shown = on;
  doc?.body?.classList?.toggle(POINTER_CLASS, on);
  return on;
}

/** Forget what the page says (a fresh shell, a test): the next sync writes the class again. */
export function resetPointer() {
  shown = null;
}
