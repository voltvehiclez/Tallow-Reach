// Reusable left-side station window shared by Outfitting ("o"), Shop ("p"), and
// the Missions companion Contract board ("m").
//
// All left-side views mount into the single `#station-left` element with fixed
// positioning, dimensions, surface styling, and entrance/content-swap CSS
// animations — switching or toggling never resizes `#station-left` or `#panel`.
// Outfitting and Shop are strictly mutually exclusive toggles: at most one left
// window is ever open at a time.

import { state } from "../state/state.js";

/** Toggleable left-side station windows exposed in the station nav bar. */
export const LEFT_TOGGLE_KEYS = new Set(["o", "p"]);

/** Every view that can occupy the reusable `#station-left` container. */
export const LEFT_PANEL_KEYS = new Set(["o", "p", "m"]);

/** Right-hand station panel tabs (Missions, Inventory, Base, Saves). */
export const RIGHT_TAB_KEYS = new Set(["l", "i", "b", "s"]);

export const DEFAULT_RIGHT_TAB = "l";
export const DEFAULT_LEFT_PANEL = "m";

const VIEW_LABELS = {
  o: "Outfitting",
  p: "Shop",
  m: "Contract board",
};

/** Currently active right-panel tab key, normalized to a valid station tab. */
export function activeRightTab(ui = state.ui) {
  return ui && RIGHT_TAB_KEYS.has(ui.tab) ? ui.tab : DEFAULT_RIGHT_TAB;
}

/** Currently open left-panel view key (`"o" | "p" | "m"`), or `null` when closed. */
export function activeLeftPanel(ui = state.ui) {
  const key = ui?.leftPanel;
  return key && LEFT_PANEL_KEYS.has(key) ? key : null;
}

/** Reset docked station navigation to its default pair: Missions (right) + Contracts (left). */
export function resetStationPanels(ui = state.ui) {
  if (!ui) return;
  ui.tab = DEFAULT_RIGHT_TAB;
  ui.leftPanel = DEFAULT_LEFT_PANEL;
  ui.fit = null;
  ui.confirmReset = false;
}

/**
 * Select a right-hand station tab (`"l" | "i" | "b" | "s"`).
 *
 * Clicking `Missions` (`"l"`) opens the mission log on the right and the
 * Contract board (`"m"`) on the left simultaneously. Switching to `Inventory`,
 * `Base`, or `Saves` closes the companion Contract board while leaving an
 * explicitly toggled `Outfitting` or `Shop` window open at its fixed position.
 */
export function selectRightTab(key, ui = state.ui) {
  if (!ui) return DEFAULT_RIGHT_TAB;
  // Support programmatic callers toggling "o"/"p" through openStationTab.
  if (LEFT_TOGGLE_KEYS.has(key)) {
    toggleLeftPanel(key, ui);
    return activeRightTab(ui);
  }
  const next = RIGHT_TAB_KEYS.has(key) ? key : DEFAULT_RIGHT_TAB;
  ui.tab = next;
  ui.confirmReset = false;
  if (next === "l") {
    ui.leftPanel = "m";
    ui.fit = null;
  } else if (ui.leftPanel === "m") {
    ui.leftPanel = null;
  }
  return next;
}

/**
 * Toggle a mutually exclusive left-side station window (`"o"` Outfitting or
 * `"p"` Shop). Clicking the currently open button closes the window; clicking
 * the other swaps directly into it and automatically un-toggles the previous one.
 */
export function toggleLeftPanel(key, ui = state.ui) {
  if (!ui || !LEFT_TOGGLE_KEYS.has(key)) return activeLeftPanel(ui);
  ui.fit = null;
  ui.leftPanel = ui.leftPanel === key ? null : key;
  return ui.leftPanel;
}

/** Close whichever left-side station window is open. Returns true if one closed. */
export function closeLeftPanel(ui = state.ui) {
  const open = activeLeftPanel(ui);
  if (!open) return false;
  ui.leftPanel = null;
  ui.fit = null;
  return true;
}

/** Hide and empty the shared `#station-left` DOM container without destroying it. */
export function hideLeftPanelElement(el) {
  if (!el) return;
  el.hidden = true;
  if (el.dataset) delete el.dataset.view;
  el.classList?.remove?.("is-entering", "is-switching");
  el.innerHTML = "";
}

/**
 * Render `contentHtml` for `view` inside the shared `#station-left` container.
 * Keeps the exact same DOM node, dimensions and position across Outfitting,
 * Shop and Contracts; triggers entrance animation only when opening from closed,
 * and a gentle inner content fade only when switching between views.
 */
export function syncLeftPanelElement(el, view, contentHtml) {
  if (!el) return { opened: false, switched: false, visible: false };
  if (!view || !LEFT_PANEL_KEYS.has(view)) {
    hideLeftPanelElement(el);
    return { opened: false, switched: false, visible: false };
  }
  const prevView = el.dataset?.view || "";
  const wasHidden = Boolean(el.hidden) || !prevView;
  const switched = !wasHidden && prevView !== view;

  if (el.dataset) el.dataset.view = view;
  const label = VIEW_LABELS[view] || "Station window";
  el.setAttribute?.("aria-label", label);
  el.hidden = false;

  el.innerHTML =
    `<button type="button" class="station-left-close" data-a="closeLeft" aria-label="Close ${label}">Close</button>` +
    `<div class="station-left-body${switched ? " is-switching" : ""}">${contentHtml}</div>`;

  if (wasHidden) {
    el.scrollTop = 0;
    el.classList?.add?.("is-entering");
  } else if (switched) {
    el.scrollTop = 0;
    el.classList?.remove?.("is-entering");
  } else {
    el.classList?.remove?.("is-entering");
  }
  return { opened: wasHidden, switched, visible: true };
}
