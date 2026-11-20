// The ship's own inventory, read in flight (press I in space).
//
// The station panel already has an Inventory tab, but a pilot in space has no
// station to open. This is the same tile layout in a wider card, read-only: the
// hold of the ship being flown, with no moves and no selling, because there is
// nowhere out here to move cargo to. It is a modal surface like the starmap —
// flight input is released while it is open, but the world keeps running.

import { state, localPlayer, currentSave, saveCurrentGame } from "../state/state.js";
import { on, emit } from "../util/events.js";
import { assetsResultsHtml, cargoHtml, shipDetailsHtml } from "./screens.js";
import { discardItem, countOf, slotAt } from "../sim/inventory.js";
import { useItem, canUse } from "../sim/consumables.js";
import { holdShip } from "../sim/pilot.js";
import { canDiscard, isModule, itemName } from "../data/items.js";
import { notify } from "./notice.js";
import { openDiscardPopover } from "./discard.js";
import {
  buildAssetStationContextMenu,
  buildModuleContextMenu,
  cancelHeldStack,
  clearAssetStationDestination,
  clearHeldGhost,
  clickInventorySlot,
  hasHeldStack,
  measureSlotSquare,
  openModuleInfoPopover,
  openTakeAmountPopover,
  rightClickInventorySlot,
  runStackAll,
  setAssetStationDestination,
} from "./inventory-ui.js";
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

function saveQuietly() {
  try {
    saveCurrentGame();
  } catch {
    // An autosave that cannot be written must not interrupt inventory actions.
  }
}

function closeContextMenu() {
  if (menu) menu.remove();
  menu = null;
  const card = root && root.querySelector(".cargo-card");
  if (card?.querySelectorAll) {
    card.querySelectorAll(".inv-discard-popover, .inv-take-popover, .ship-info-popover, .mod-info-popover").forEach(n => n.remove());
  } else {
    card?.querySelector?.(".inv-discard-popover")?.remove?.();
    card?.querySelector?.(".inv-take-popover")?.remove?.();
    card?.querySelector?.(".ship-info-popover")?.remove?.();
    card?.querySelector?.(".mod-info-popover")?.remove?.();
  }
}

/** Close any open cargo popover or return a cursor-held stack before closing the card itself. */
export function dismissCargoLayer() {
  if (!isCargoOpen()) return false;
  const card = root && root.querySelector(".cargo-card");
  const open = card?.querySelectorAll(".inv-context, .inv-discard-popover, .inv-take-popover, .ship-info-popover, .mod-info-popover");
  if (open && open.length) {
    closeContextMenu();
    return true;
  }
  if (cancelHeldStack()) {
    saveQuietly();
    renderCargo();
    return true;
  }
  return false;
}

function openCargoShipDetails(type, event, card) {
  const html = shipDetailsHtml(type);
  if (!html) return;
  closeContextMenu();
  const pop = document.createElement("div");
  pop.className = "inv-sell-popover ship-info-popover";
  pop.setAttribute("role", "dialog");
  pop.innerHTML = html;
  const rect = card.getBoundingClientRect();
  pop.style.left = `${Math.max(8, event.clientX - rect.left + (card.scrollLeft || 0))}px`;
  pop.style.top = `${Math.max(8, event.clientY - rect.top + (card.scrollTop || 0))}px`;
  card.append(pop);
  uiSound();
}

function onCargoContextMenu(event) {
  const card = root && root.querySelector(".cargo-card");
  if (!card) return;

  // While holding a stack, right-clicking any slot places 1 item into it.
  const slotBtn = event.target.closest("button[data-a='invSlot']");
  if (slotBtn && hasHeldStack()) {
    event.preventDefault();
    closeContextMenu();
    const res = rightClickInventorySlot({
      where: slotBtn.dataset.where,
      slot: Number(slotBtn.dataset.slot),
      clientX: event.clientX,
      clientY: event.clientY,
    });
    if (res?.message) notify(res.message);
    if (res?.changed) {
      uiSound("click");
      saveQuietly();
      renderCargo();
    }
    return;
  }

  if (hasHeldStack()) {
    event.preventDefault();
    return;
  }

  const stationBtn = event.target.closest("[data-asset-station]");
  if (stationBtn && stationBtn.dataset.assetStation) {
    event.preventDefault();
    closeContextMenu();
    menu = buildAssetStationContextMenu(document, stationBtn.dataset.assetStation);
    const rect = card.getBoundingClientRect();
    menu.style.left = `${Math.max(4, event.clientX - rect.left + (card.scrollLeft || 0))}px`;
    menu.style.top = `${Math.max(4, event.clientY - rect.top + (card.scrollTop || 0))}px`;
    card.append(menu);
    uiSound();
    return;
  }

  const modRow = event.target.closest("[data-module-id]");
  if (modRow && modRow.dataset.moduleId && isModule(modRow.dataset.moduleId)) {
    event.preventDefault();
    closeContextMenu();
    menu = buildModuleContextMenu(document, modRow.dataset.moduleId, "cargoModInfo");
    if (menu) {
      const rect = card.getBoundingClientRect();
      menu.style.left = `${Math.max(4, event.clientX - rect.left + (card.scrollLeft || 0))}px`;
      menu.style.top = `${Math.max(4, event.clientY - rect.top + (card.scrollTop || 0))}px`;
      card.append(menu);
      uiSound();
    }
    return;
  }

  const shipRow = event.target.closest("[data-ship-type]");
  if (shipRow && shipRow.dataset.shipType) {
    event.preventDefault();
    openCargoShipDetails(shipRow.dataset.shipType, event, card);
    return;
  }

  const tile = event.target.closest("[data-kind][data-where]");
  if (!tile) return;
  event.preventDefault();
  closeContextMenu();

  menu = document.createElement("div");
  menu.className = "inv-context";
  menu.setAttribute("role", "menu");

  if (isModule(tile.dataset.id)) {
    const info = document.createElement("button");
    info.type = "button";
    info.dataset.a = "cargoModInfo";
    info.dataset.b = tile.dataset.id;
    info.setAttribute("role", "menuitem");
    info.textContent = "Show info";
    menu.append(info);
  }

  const take = document.createElement("button");
  take.type = "button";
  take.dataset.a = "cargoTakeOpen";
  take.dataset.b = tile.dataset.id;
  take.dataset.where = tile.dataset.where;
  take.dataset.slot = tile.dataset.slot || "0";
  take.setAttribute("role", "menuitem");
  take.textContent = "Take amount";
  take.title = "Pick up a chosen number of items onto the cursor.";
  menu.append(take);

  // Step 14: anything with a `use` field in data/items.js gets a **Use** entry beside Discard.
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
  discard.dataset.slot = tile.dataset.slot || "0";
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

function menuAnchorIn(card) {
  const hostRect = card.getBoundingClientRect();
  const menuRect = menu ? menu.getBoundingClientRect() : hostRect;
  return {
    left: menuRect.left - hostRect.left + (card.scrollLeft || 0),
    top: menuRect.top - hostRect.top + (card.scrollTop || 0),
    width: 0,
  };
}

function openCargoTakeAmount(entry) {
  const id = entry.dataset.b;
  const where = entry.dataset.where || state.profile.ship;
  const slot = Number(entry.dataset.slot);
  if (!Number.isInteger(slot) || slot < 0) return;
  const item = slotAt(where, slot);
  if (!item || item.id !== id || !(item.n > 0)) return;
  const card = root && root.querySelector(".cargo-card");
  if (!card) return;
  const anchor = menuAnchorIn(card);
  closeContextMenu();
  openTakeAmountPopover({
    host: card,
    anchor,
    where,
    slot,
    id,
    count: item.n,
    onTake: () => {
      uiSound("click");
      renderCargo();
    },
  });
  uiSound();
}

/** Discard, both steps, in the flight card — ui/discard.js, as the station does it. */
function openCargoDiscard(entry) {
  const id = entry.dataset.b;
  const where = entry.dataset.where || state.profile.ship;
  const slotIdx = Number(entry.dataset.slot);
  if (!canDiscard(id)) return;
  const item = Number.isInteger(slotIdx) && slotIdx >= 0 ? slotAt(where, slotIdx) : null;
  const count = item && item.id === id ? item.n : countOf(where, id);
  if (!(count > 0)) return;
  const card = root && root.querySelector(".cargo-card");
  if (!card) return;

  const anchor = menuAnchorIn(card);
  closeContextMenu();

  openDiscardPopover({
    host: card,
    anchor,
    where,
    id,
    count,
    onDiscard: (place, itemId, amount) => {
      notify(discardItem(
        place,
        itemId,
        amount,
        state.profile,
        state.worldState,
        Number.isInteger(slotIdx) ? slotIdx : -1
      ));
      uiSound("confirm");
      emit("mission-inventory-changed", { profile: state.profile, player: state.player });
      saveQuietly();
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
    saveCurrentGame();
  } catch {
    // An autosave that cannot be written must not eat the use itself.
  }
  // Using something happens out in the world, so the world is what the pilot should see next.
  closeCargo();
}

function onCargoClick(event) {
  const subtab = event.target.closest("button[data-a='cargoView']");
  if (subtab) {
    cancelHeldStack();
    state.ui.cargoView = subtab.dataset.b === "assets" ? "assets" : "hold";
    uiSound("click");
    saveQuietly();
    renderCargo();
    return;
  }
  const assetBtn = event.target.closest("button[data-a='assetStation']");
  if (assetBtn) {
    const placeId = assetBtn.dataset.b;
    const open = state.ui.assetsOpen || (state.ui.assetsOpen = {});
    if (open[placeId]) delete open[placeId];
    else open[placeId] = true;
    uiSound("click");
    renderCargo();
    return;
  }
  const assetShipBtn = event.target.closest("button[data-a='assetShip']");
  if (assetShipBtn) {
    const shipKey = assetShipBtn.dataset.b;
    if (shipKey) {
      const open = state.ui.assetShipsOpen || (state.ui.assetShipsOpen = {});
      if (open[shipKey]) delete open[shipKey];
      else open[shipKey] = true;
      uiSound("click");
      renderCargo();
    }
    return;
  }
  const searchToggle = event.target.closest("button[data-a='assetSearchToggle']");
  if (searchToggle) {
    state.ui.assetsSearchOpen = !state.ui.assetsSearchOpen;
    if (!state.ui.assetsSearchOpen) state.ui.assetsQuery = "";
    uiSound("click");
    renderCargo();
    if (state.ui.assetsSearchOpen) root?.querySelector?.("[data-asset-search]")?.focus?.();
    return;
  }
  const searchClear = event.target.closest("button[data-a='assetSearchClear']");
  if (searchClear) {
    state.ui.assetsQuery = "";
    uiSound("click");
    const input = root?.querySelector?.("[data-asset-search]");
    if (input) {
      input.value = "";
      refreshCargoAssetResults();
      input.focus?.();
    } else {
      renderCargo();
    }
    return;
  }
  const slotBtn = event.target.closest("button[data-a='invSlot']");
  if (slotBtn) {
    closeContextMenu();
    const slotSize = slotBtn.classList?.contains?.("inv-item") ? measureSlotSquare(slotBtn) : undefined;
    const res = clickInventorySlot({
      where: slotBtn.dataset.where,
      slot: Number(slotBtn.dataset.slot),
      otherWhere: null,
      shiftKey: Boolean(event.shiftKey),
      clientX: event.clientX,
      clientY: event.clientY,
      slotSize,
    });
    if (res.message) notify(res.message);
    if (res.changed) {
      uiSound("click");
      saveQuietly();
      renderCargo();
    }
    return;
  }
  const stackBtn = event.target.closest("button[data-a='stackAll']");
  if (stackBtn && !stackBtn.disabled) {
    closeContextMenu();
    const res = runStackAll(stackBtn.dataset.where || state.profile.ship);
    if (res.message) notify(res.message);
    uiSound("click");
    saveQuietly();
    renderCargo();
    return;
  }
  const setDestBtn = event.target.closest("button[data-a='assetSetDest']");
  if (setDestBtn && !setDestBtn.disabled) {
    closeContextMenu();
    const res = setAssetStationDestination(setDestBtn.dataset.b);
    if (res.message) notify(res.message);
    uiSound(res.ok ? "confirm" : "click");
    renderCargo();
    return;
  }
  const clearDestBtn = event.target.closest("button[data-a='assetClearDest']");
  if (clearDestBtn && !clearDestBtn.disabled) {
    closeContextMenu();
    clearAssetStationDestination();
    uiSound("click");
    renderCargo();
    return;
  }
  if (event.target.closest("button[data-a='shipInfoClose'], button[data-a='modInfoClose']")) {
    closeContextMenu();
    return;
  }
  const modInfo = event.target.closest("[data-a='cargoModInfo']");
  if (modInfo && !modInfo.disabled) {
    const card = root && root.querySelector(".cargo-card");
    const anchor = card ? menuAnchorIn(card) : null;
    const modId = modInfo.dataset.b;
    closeContextMenu();
    if (card && openModuleInfoPopover({ host: card, moduleId: modId, anchor, clientX: event.clientX, clientY: event.clientY })) {
      uiSound();
    }
    return;
  }
  const take = event.target.closest("[data-a='cargoTakeOpen']");
  if (take && !take.disabled) {
    openCargoTakeAmount(take);
    return;
  }
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
  if (event.target.closest(".inv-discard-popover, .inv-take-popover, .ship-info-popover, .mod-info-popover")) return;
  if (event.target.closest("[data-cargo-close]") || event.target === root) closeCargo();
  else if (!event.target.closest(".inv-context")) closeContextMenu();
}

function refreshCargoAssetResults() {
  const results = root?.querySelector?.("[data-assets-results]");
  if (results) {
    results.innerHTML = assetsResultsHtml(state.profile, state.worldState, {
      docked: false,
      openMap: state.ui.assetsOpen,
      shipOpenMap: state.ui.assetShipsOpen,
      query: state.ui.assetsQuery,
      searchOpen: state.ui.assetsSearchOpen,
    });
  }
  const clearBtn = root?.querySelector?.("button[data-a='assetSearchClear']");
  if (clearBtn) clearBtn.hidden = !state.ui.assetsQuery;
}

function onCargoInput(event) {
  const input = event.target?.closest?.("[data-asset-search]");
  if (!input) return;
  state.ui.assetsSearchOpen = true;
  state.ui.assetsQuery = String(input.value || "");
  refreshCargoAssetResults();
}

/** Install the overlay once. It sits outside the docked panel and never moves it. */
export function setupCargo() {
  root = document.createElement("section");
  root.id = "cargo";
  root.className = "cargo-overlay";
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
  root.addEventListener("input", onCargoInput);
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
  clearControls();          // release what is held (core/input.js gates the card as modal)
  holdShip();               // and kill the carry: a loot inventory is read beside a still ship
  uiSound();
  return true;
}

/** Close it and hand the controls and sound back to the flight the pilot left. */
export function closeCargo({ silent = false } = {}) {
  if (!isCargoOpen()) return false;
  if (cancelHeldStack()) saveQuietly();
  clearHeldGhost();
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
