// Docked-panel notices.
//
// The panel used to print the last action's message as a line at the top of the
// screen, which pushed every row down and moved the whole menu — the owner
// reported that as annoying ("contract accepted. launch when ready.", "sold x
// items for x cr", "basic power plant moved to storage"). Those confirmations
// said nothing the panel does not already show, so they are silent now, and
// anything the pilot must read appears in a **fixed** notice that cannot move
// the panel — the same idea as the "mission failed" alert (which is unchanged
// and lives in `ui/missionlog.js`).
//
// A new success message from `sim/` is silent only if it is added to ROUTINE
// below; anything unrecognised is shown, so a refusal can never be swallowed.

/** Replies that only confirm what the redrawn panel already shows. */
const ROUTINE = [
  /^Contract accepted\. Launch when ready\.$/,
  /^Story mission accepted\.$/,
  /^Paid \d+ cr\.$/,
  /^Sold \d+ .+ for \d+ cr\.$/,
  /^Moved \d+ .+ to .+\.$/,
  /^Fitted .+\.$/,
  /^.+ moved to storage\.$/,
  /^.+ repaired for \d+ cr\.$/,
  /^Restocked \d+ missiles\.$/,
  / in the station inventory\./,            // bought into storage, with its hints
  /^Saved to slot \d+$/,
  /^Deleted slot \d+$/,
  /^Loaded slot \d+$/,
  /^Progress reset\.$/,
  /^Save imported\.$/,
  /^Your save code is in the box below\./,
];

/**
 * Is this reply just a confirmation the panel shows anyway? Anchored patterns:
 * a routine message that had something important appended (a galaxy-recovery
 * notice, say) is no longer routine and is shown.
 */
export function isRoutineReply(text) {
  const message = String(text ?? "").trim();
  if (!message) return true;
  return ROUTINE.some(pattern => pattern.test(message));
}

const SECONDS = 7;
let root = null;
let timer = 0;
let current = "";

/** Create the notice element: fixed to the viewport, outside the panel. */
export function setupNotices() {
  if (root) return root;
  root = document.createElement("div");
  root.id = "panel-notice";
  root.hidden = true;
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  root.addEventListener("click", hideNotice);
  document.body.appendChild(root);
  return root;
}

/** Show a message the pilot must read. Never changes the panel's layout. */
export function showNotice(text) {
  if (!text) return;
  if (!root) setupNotices();
  current = String(text);
  root.textContent = current;
  root.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(hideNotice, SECONDS * 1000);
}

export function hideNotice() {
  clearTimeout(timer);
  timer = 0;
  current = "";
  if (!root) return;
  root.hidden = true;
  root.textContent = "";
}

/** The message on screen right now ("" when none) — for tests and other UI. */
export const shownNotice = () => current;

/** Report an action's reply: silent when it only restates the panel. */
export function notify(text) {
  if (isRoutineReply(text)) return;
  showNotice(text);
}
