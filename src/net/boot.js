// Joining from a link, at boot (refactor step 16, slice 3).
//
// The owner's design is that a link *is* the join: the guest opens what the host sent and
// is in. Two things make that safe to do at boot:
//
//  1. **Nothing happens silently.** The title screen still comes up, and the game asks
//     first ("Join Ada's world?"). A link pasted into the wrong chat, or opened a week
//     late, must not move a pilot or change a save on its own.
//  2. **The link is used once.** `forgetLink` clears it from the address bar, so a
//     reload does not re-offer a join the player has already answered.
//
// This module is the only place that reads the browser's address for a join. It talks to
// `net/session.js` like any screen does; there is no second path into a connection.

import { state } from "../state/state.js";
import { emit } from "../util/events.js";
import { linkFromLocation, forgetLink } from "./join-link.js";
import { readSettings } from "./settings.js";

/**
 * Look for a join link in the address bar and offer it.
 *
 * `confirm` is the browser's own dialog rather than a new screen: a one-line question
 * that the player answers once is exactly what a modal is for, and a stray link is
 * answered with Cancel before anything of theirs moves. A build with no `confirm`
 * (a test, or a locked-down frame) simply ignores the link.
 */
export function installJoinLink({ search, hash, ask } = {}) {
  const found = linkFromLocation(search, hash);
  if (!found) return null;
  forgetLink();

  const settings = readSettings();
  if (state.mode === "campaign") {
    // A campaign act is single player (owner, 2026-11-21). Say so instead of ignoring it.
    notice("That is a multiplayer link, but the campaign is single player. Return to the open world to join.");
    return null;
  }
  if (!settings.name) {
    // There is no name to join under yet: keep the link, and send the pilot to the panel
    // that asks for one. `pendingJoin` is held here until the panel's Join is pressed.
    state.ui.pendingJoin = found;
    notice("That link is waiting. Press Join Multiplayer World on the title, set a username, then press Join.");
    return found;
  }

  const question = "Join a multiplayer world with this link?\n\nYour pilot stays where it is for now.";
  const accepts = typeof ask === "function" ? ask : (typeof globalThis.confirm === "function" ? globalThis.confirm : null);
  if (!accepts) return null;
  let yes = false;
  try {
    yes = accepts(question) === true;
  } catch (e) {
    yes = false;
  }
  if (!yes) return found;

  // The join itself belongs to the session; the screen that shows it is the pause card.
  state.ui.pendingJoin = found;
  notice("Joining…");
  emit("mp-join-request", found);
  return found;
}

/** Say something on the bus; a screen that is listening decides how the player sees it. */
function notice(text) {
  try {
    emit("mp-notice", text);
  } catch (e) { /* a broken screen must not break a join */ }
}

/** The link a boot found but could not use yet (no username), or null. */
export const pendingJoin = () => state.ui.pendingJoin || null;

/** Forget a pending link once it has been used or refused. */
export function clearPendingJoin() {
  state.ui.pendingJoin = null;
}
