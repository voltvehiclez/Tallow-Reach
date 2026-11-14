// The ship's own inventory, read in flight (press I in space).
//
// The station panel already has an Inventory tab, but a pilot in space has no
// station to open. This is the same tile layout in a wider card, read-only: the
// hold of the ship being flown, with no moves and no selling, because there is
// nowhere out here to move cargo to. It is a modal surface like the starmap —
// flight input is released while it is open, but the world keeps running.

import { state, localPlayer, currentSave } from "../state/state.js";
import { saveAutosave } from "../state/storage.js";
import { on, emit } from "../util/events.js";
import { cargoHtml } from "./screens.js";
import { discardItem, countOf } from "../sim/inventory.js";
import { useItem, canUse } from "../sim/consumables.js";
import { canDiscard, itemName } from "../data/items.js";
import { notify } from "./notice.js";
import { openDiscardPopover } from "./discard.js";
import { clearControls, syncControls } from "../core/input.js";
import { setAudioSuspended, uiSound } from "../core/audio.js";

let root = null;
let menu = null;

/** May the flight inventory open? Space only: a docked pilot has the panel. */
export function canOpenCargo(P = localPlayer(), ui = state.ui) {
  if (!P || ui.intro || state.paused || ui.starmap) return false;
  if (P.docked || P.dead || P.loading || state.loading) return false;
  if (state.warp || P.warp) return false;
  return true;
}

export const isCargoOpen = () => !!state.ui.cargo;

function renderCargo() {
  closeContextMenu();
  const body = root && root.querySelector("#cargo-body");
  if (body) body.innerHTML = cargoHtml();
}

function closeContextMenu() {
  if (menu) menu.remove();
  menu = null;
  const card = root && root.querySelector(".cargo-card");
  card?.querySelector(".inv-discard-popover")?.remove();
}

/**
 * Right-click a tile for the only thing there is to do with cargo in space:
 * throw the stack away. Nothing can be moved out here, so Discard is the whole
 * menu — the station panel's menu (ui/menu.js) offers the same entry next to Sell.
 */
function onCargoContextMenu(event) {
  const tile = event.target.closest("[data-kind][data-where]");
  const card = root && root.querySelector(".cargo-card");
  if (!tile || !card) return;
  event.preventDefault();
  closeContextMenu();

  menu = document.createElement("div");
  menu.className = "inv-context";
  menu.setAttribute("role", "menu");

  // Step 14: anything with a `use` field in data/items.js gets a **Use** entry beside Discard. What
  // using it does is data (`USE_ACTIONS` in sim/consumables.js), so this menu never grows a second
  // special case for the next consumable.
  if (canUse(tile.dataset.id)) {
    const use = document.createElement("button");
    use.type = "button";
    use.dataset.a = "cargoUse";
    use.dataset.b = tile.dataset.id;
    use.dataset.where = tile.dataset.where;
    use.setAttribute("role", "menuitem");
    use.textContent = "Use";
    use.title = `Use one ${itemName(tile.dataset.id)}.`;
    menu.append(use);
  }

  const discard = document.createElement("button");
  discard.type = "button";
  discard.dataset.a = "cargoDiscard";
  discard.dataset.b = tile.dataset.id;
  discard.dataset.where = tile.dataset.where;
  discard.setAttribute("role", "menuitem");
  discard.textContent = `Discard \u00d7${tile.dataset.count}`;
  if (!canDiscard(tile.dataset.id)) {
    discard.disabled = true;
    discard.title = "A mission item: hand it in, do not trash it.";
  } else {
    discard.title = "Throw this whole stack away. It cannot be recovered.";
  }
  menu.append(discard);

  const rect = card.getBoundingClientRect();
  menu.style.left = `${event.clientX - rect.left + card.scrollLeft}px`;
  menu.style.top = `${event.clientY - rect.top + card.scrollTop}px`;
  card.append(menu);
  uiSound();
}

/** Discard, both steps, in the flight card — ui/discard.js, as the station does it. */
function openCargoDiscard(entry) {
  const id = entry.dataset.b;
  const where = entry.dataset.where || state.profile.ship;
  if (!canDiscard(id)) return;
  const count = countOf(where, id);
  if (!(count > 0)) return;
  const card = root && root.querySelector(".cargo-card");
  if (!card) return;

  // Place the popover where the context menu was.
  const hostRect = card.getBoundingClientRect();
  const menuRect = menu ? menu.getBoundingClientRect() : hostRect;
  const anchor = {
    left: menuRect.left - hostRect.left + (card.scrollLeft || 0),
    top: menuRect.top - hostRect.top + (card.scrollTop || 0),
    width: 0,
  };
  closeContextMenu();

  openDiscardPopover({
    host: card,
    anchor,
    where,
    id,
    count,
    onDiscard: (place, item, amount) => {
      // The same message the station's Discard shows, and the same save.
      notify(discardItem(place, item, amount));
      uiSound("confirm");
      // Mission hand-offs waiting on a change of cargo get their retry.
      emit("mission-inventory-changed", { profile: state.profile, player: state.player });
      try {
        saveAutosave(currentSave());
      } catch {
        // An autosave that cannot be written must not eat the discard itself.
      }
      renderCargo();
    },
  });
  uiSound();
}

/** Use one of the item: say what happened, and only close the card if it was actually spent. */
function useConsumable(entry) {
  const id = entry.dataset.b;
  const where = entry.dataset.where || state.profile.ship;
  if (!canUse(id)) return;
  closeContextMenu();
  const before = countOf(where, id);
  notify(useItem(id, where));
  uiSound("confirm");
  if (!(countOf(where, id) < before)) {
    // Refused — nothing was spent, so the card stays exactly as the pilot left it.
    renderCargo();
    return;
  }
  // The hold changed, so anything waiting on cargo gets its retry, and the run is saved.
  emit("mission-inventory-changed", { profile: state.profile, player: state.player });
  try {
    saveAutosave(currentSave());
  } catch {
    // An autosave that cannot be written must not eat the use itself.
  }
  // Using something happens out in the world, so the world is what the pilot should see next.
  closeCargo();
}

function onCargoClick(event) {
  const use = event.target.closest("[data-a='cargoUse']");
  if (use && !use.disabled) {
    useConsumable(use);
    return;
  }
  const discard = event.target.closest("[data-a='cargoDiscard']");
  if (discard && !discard.disabled) {
    openCargoDiscard(discard);
    return;
  }
  if (event.target.closest(".inv-discard-popover")) return;
  if (event.target.closest("[data-cargo-close]") || event.target === root) closeCargo();
  else if (!event.target.closest(".inv-context")) closeContextMenu();
}

/** Install the overlay once. It sits outside the docked panel and never moves it. */
export function setupCargo() {
  root = document.createElement("section");
  root.id = "cargo";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Ship inventory");
  root.innerHTML =
    `<div class="cargo-card">` +
    `<button class="cargo-close" type="button" data-cargo-close aria-label="Close ship inventory">Close</button>` +
    `<div id="cargo-body"></div>` +
    `</div>`;
  root.addEventListener("click", onCargoClick);
  root.addEventListener("contextmenu", onCargoContextMenu);
  document.body.appendChild(root);
  // A station, the title screen or death ends the flight view.
  on("docked", () => closeCargo({ silent: true }));
  on("main-menu", () => closeCargo({ silent: true }));
  on("died", () => closeCargo({ silent: true }));
  return root;
}

/** Open the flight inventory. Returns false when the rule says this is not the time. */
export function openCargo() {
  if (!root || isCargoOpen() || !canOpenCargo()) return false;
  state.ui.cargo = { open: true };
  renderCargo();
  root.hidden = false;
  clearControls();
  uiSound();
  return true;
}

/** Close it and hand the controls and sound back to the flight the pilot left. */
export function closeCargo({ silent = false } = {}) {
  if (!isCargoOpen()) return false;
  state.ui.cargo = null;
  closeContextMenu();
  if (root) root.hidden = true;
  syncControls();
  setAudioSuspended(state.paused);
  if (!silent) uiSound();
  return true;
}

export function toggleCargo() {
  return isCargoOpen() ? closeCargo() : openCargo();
}
