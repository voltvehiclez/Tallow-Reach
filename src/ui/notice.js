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
// Where the notice sits: just under the flight message line (`#msg`) — the
// centred line at 14% of the screen that says "Empty weapon slot" when a weapon
// switch finds nothing fitted, or names the warp — and never on top of it. With
// the HUD away (docked, title screen) that line is worked out from the viewport
// height instead, so a notice lands in the same band on every screen.
const ANCHOR_ID = "msg";
const MESSAGE_TOP = 0.14;   // #msg's own top, as a share of the viewport height
const MESSAGE_LINE = 26;    // one line of #msg at 18px
const GAP = 12;             // px between the message line and the notice

let root = null;
let timer = 0;
let current = "";

function viewportHeight() {
  if (typeof window !== "undefined" && window.innerHeight) return window.innerHeight;
  const doc = typeof document === "undefined" ? null : document;
  return doc?.documentElement?.clientHeight || 800;
}

/**
 * Put the notice just below the message line. Measured every time it is shown:
 * the line is empty most of the time, and a wrapped warp message makes it
 * taller — the notice must clear it either way.
 */
function placeNotice() {
  if (!root || !root.style) return;
  const doc = typeof document === "undefined" ? null : document;
  const anchor = doc && typeof doc.getElementById === "function" ? doc.getElementById(ANCHOR_ID) : null;
  const rect = anchor && typeof anchor.getBoundingClientRect === "function" ? anchor.getBoundingClientRect() : null;
  // A hidden HUD measures nothing, so the same band is derived from the viewport.
  const messageTop = rect && rect.top > 0 ? rect.top : Math.round(viewportHeight() * MESSAGE_TOP);
  const messageHeight = rect && rect.height > 0 ? rect.height : MESSAGE_LINE;
  root.style.top = `${Math.round(messageTop + messageHeight + GAP)}px`;
}

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
  // A resized window moves the HUD block: keep a notice on screen under it.
  if (typeof addEventListener === "function") {
    addEventListener("resize", () => { if (root && !root.hidden) placeNotice(); });
  }
  return root;
}

/** Show a message the pilot must read. Never changes the panel's layout. */
export function showNotice(text) {
  if (!text) return;
  if (!root) setupNotices();
  current = String(text);
  root.textContent = current;
  placeNotice();
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
