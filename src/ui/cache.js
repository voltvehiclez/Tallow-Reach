// A rift's canister, traded with in flight (press R beside it).
//
// The prize of a run used to be taken in one press: R moved everything that fitted into the hold and
// said what would not. That is a transfer, and a transfer is not a choice — the owner asked for the
// trade it should have been (2026-11-14: "when you open a rift cache you see your inventory ui +
// cache inventory ui and clicking and shift clicking moves items in between exactly like ship inv
// and station inv", with the ship's own hold on the left and the canister off to the right).
//
// So this is the station's Inventory tab, in flight, between a pilot and a canister: the same tiles,
// the same click moves one and Shift-click moves the whole stack, the same right-click menu — and it
// works in both directions, because a canister out in a collapsed pocket is the one place a pilot can
// leave cargo behind. It is a modal surface like the starmap and the flight inventory card: flight
// input is released while it is open, but the run keeps running, clock and all.

import { state, localPlayer, currentSave, saveCurrentGame } from "../state/state.js";
import { on, emit } from "../util/events.js";
import { cacheHtml } from "./screens.js";
import { CACHE, countOf, discardItem, slotAt } from "../sim/inventory.js";
import { cacheTradeRecord, closeCacheTrade } from "../sim/instances.js";
import { holdShip } from "../sim/pilot.js";
import { useItem, canUse } from "../sim/consumables.js";
import { canDiscard, isModule, itemName } from "../data/items.js";
import { notify } from "./notice.js";
import { openDiscardPopover } from "./discard.js";
import {
  cancelHeldStack,
  clearHeldGhost,
  clickInventorySlot,
  hasHeldStack,
  measureSlotSquare,
  openModuleInfoPopover,
  openTakeAmountPopover,
  rightClickInventorySlot,
  runStackAll,
} from "./inventory-ui.js";
import { clearControls, syncControls } from "../core/input.js";
import { setAudioSuspended, uiSound } from "../core/audio.js";

let root = null;
let menu = null;

/**
 * May the trade open? In a run, beside a canister the sim has just offered, and with no other modal
 * surface on screen. The canister itself is the sim's business (`cacheTradeRecord`): this only asks
 * whether the pilot is in a state to look at a panel.
 */
export function canOpenCache(P = localPlayer(), ui = state.ui) {
  if (!P || ui.intro || state.paused || ui.starmap || ui.cargo) return false;
  if (P.docked || P.dead || P.loading || state.loading) return false;
  if (state.warp || P.warp) return false;
  return !!cacheTradeRecord();
}

export const isCacheOpen = () => !!state.ui.cache;

function renderCache() {
  closeContextMenu();
  const body = root && root.querySelector("#cache-body");
  if (body) body.innerHTML = cacheHtml();
}

function saveQuietly() {
  try {
    saveCurrentGame();
  } catch {
    // An autosave that cannot be written must not eat the move itself.
  }
}

function closeContextMenu() {
  if (menu) menu.remove();
  menu = null;
  const card = root && root.querySelector(".cache-card");
  if (card?.querySelectorAll) {
    card.querySelectorAll(".inv-discard-popover, .inv-take-popover, .mod-info-popover").forEach(n => n.remove());
  } else {
    card?.querySelector?.(".inv-discard-popover")?.remove?.();
    card?.querySelector?.(".inv-take-popover")?.remove?.();
    card?.querySelector?.(".mod-info-popover")?.remove?.();
  }
}

/** Dismiss an open cache context menu/popover or return a held stack before closing the trade. */
export function dismissCacheLayer() {
  if (!isCacheOpen()) return false;
  const card = root && root.querySelector(".cache-card");
  const open = card?.querySelectorAll(".inv-context, .inv-discard-popover, .inv-take-popover, .mod-info-popover");
  if (open && open.length) {
    closeContextMenu();
    return true;
  }
  if (cancelHeldStack()) {
    saveQuietly();
    renderCache();
    return true;
  }
  return false;
}

function transferCacheSlot(where, slot) {
  const otherWhere = where === CACHE ? state.profile.ship : CACHE;
  const res = clickInventorySlot({ where, slot, otherWhere, shiftKey: true });
  if (!res.changed && res.message) notify(res.message);
  emit("mission-inventory-changed", { profile: state.profile, player: state.player });
  saveQuietly();
  renderCache();
}

function onCacheContextMenu(event) {
  const card = root && root.querySelector(".cache-card");
  if (!card) return;

  // Right-click while holding places 1 item into an empty or matching slot.
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
      emit("mission-inventory-changed", { profile: state.profile, player: state.player });
      uiSound("click");
      saveQuietly();
      renderCache();
    }
    return;
  }

  if (hasHeldStack()) {
    event.preventDefault();
    return;
  }

  const tile = event.target.closest("[data-kind][data-where]");
  if (!tile) return;
  event.preventDefault();
  closeContextMenu();

  const inCache = tile.dataset.where === CACHE;
  menu = document.createElement("div");
  menu.className = "inv-context";
  menu.setAttribute("role", "menu");

  const entry = (action, label, title, disabled = false) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.a = action;
    btn.dataset.b = tile.dataset.id;
    btn.dataset.dir = tile.dataset.dir;
    btn.dataset.where = tile.dataset.where;
    btn.dataset.slot = tile.dataset.slot || "0";
    btn.setAttribute("role", "menuitem");
    btn.textContent = label;
    btn.title = title;
    if (disabled) btn.disabled = true;
    menu.append(btn);
    return btn;
  };

  if (isModule(tile.dataset.id)) {
    entry("cacheModInfo", "Show info", `Inspect ${itemName(tile.dataset.id)} stats.`);
  }
  entry("cacheTakeOpen", "Take amount", "Pick up a chosen number of items onto the cursor.");

  if (inCache) {
    entry("cacheTake", `Take all \u00d7${tile.dataset.count}`,
      `Move the whole stack of ${itemName(tile.dataset.id)} into your hold.`);
  } else {
    if (canUse(tile.dataset.id)) {
      entry("cacheUse", "Use", `Use one ${itemName(tile.dataset.id)}.`);
    }
    entry("cacheStow", `Stow all \u00d7${tile.dataset.count}`,
      `Move the whole stack of ${itemName(tile.dataset.id)} into the canister.`);
    const discard = entry("cacheDiscard", `Discard \u00d7${tile.dataset.count}`,
      canDiscard(tile.dataset.id)
        ? "Throw this stack away. It cannot be recovered."
        : "A mission item: hand it in, do not trash it.",
      !canDiscard(tile.dataset.id));
    if (discard.disabled) discard.title = "A mission item: hand it in, do not trash it.";
  }

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

function openCacheTakeAmount(entry) {
  const id = entry.dataset.b;
  const where = entry.dataset.where || state.profile.ship;
  const slot = Number(entry.dataset.slot);
  if (!Number.isInteger(slot) || slot < 0) return;
  const item = slotAt(where, slot);
  if (!item || item.id !== id || !(item.n > 0)) return;
  const card = root && root.querySelector(".cache-card");
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
      renderCache();
    },
  });
  uiSound();
}

/** Discard, both steps, in the trade card — ui/discard.js, as the station and the flight card do it. */
function openCacheDiscard(entry) {
  const id = entry.dataset.b;
  const where = entry.dataset.where || state.profile.ship;
  const slotIdx = Number(entry.dataset.slot);
  if (!canDiscard(id)) return;
  const item = Number.isInteger(slotIdx) && slotIdx >= 0 ? slotAt(where, slotIdx) : null;
  const count = item && item.id === id ? item.n : countOf(where, id);
  if (!(count > 0)) return;
  const card = root && root.querySelector(".cache-card");
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
      renderCache();
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
    renderCache();
    return;
  }
  // The hold changed, so anything waiting on cargo gets its retry, and the run is saved.
  emit("mission-inventory-changed", { profile: state.profile, player: state.player });
  try {
    saveCurrentGame();
  } catch {
    // An autosave that cannot be written must not eat the use itself.
  }
  // Using something happens out in the world, so the world is what the pilot should see next — and
  // the canister is still there, still open, and one press of R away.
  closeCache();
}

function onCacheClick(event) {
  const slotBtn = event.target.closest("button[data-a='invSlot']");
  if (slotBtn) {
    closeContextMenu();
    const where = slotBtn.dataset.where;
    const otherWhere = where === CACHE ? state.profile.ship : CACHE;
    const slotSize = slotBtn.classList?.contains?.("inv-item") ? measureSlotSquare(slotBtn) : undefined;
    const res = clickInventorySlot({
      where,
      slot: Number(slotBtn.dataset.slot),
      otherWhere,
      shiftKey: Boolean(event.shiftKey),
      clientX: event.clientX,
      clientY: event.clientY,
      slotSize,
    });
    if (res.message) notify(res.message);
    if (res.changed) {
      if (!res.picked) emit("mission-inventory-changed", { profile: state.profile, player: state.player });
      uiSound("click");
      saveQuietly();
      renderCache();
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
    renderCache();
    return;
  }
  if (event.target.closest("button[data-a='modInfoClose']")) {
    closeContextMenu();
    return;
  }
  const modInfo = event.target.closest("[data-a='cacheModInfo']");
  if (modInfo && !modInfo.disabled) {
    const card = root && root.querySelector(".cache-card");
    const anchor = card ? menuAnchorIn(card) : null;
    const modId = modInfo.dataset.b;
    closeContextMenu();
    if (card && openModuleInfoPopover({ host: card, moduleId: modId, anchor, clientX: event.clientX, clientY: event.clientY })) {
      uiSound();
    }
    return;
  }
  const takeAmt = event.target.closest("[data-a='cacheTakeOpen']");
  if (takeAmt && !takeAmt.disabled) {
    openCacheTakeAmount(takeAmt);
    return;
  }
  const take = event.target.closest("[data-a='cacheTake']");
  if (take && !take.disabled) {
    closeContextMenu();
    transferCacheSlot(CACHE, Number(take.dataset.slot));
    uiSound("confirm");
    return;
  }
  const stow = event.target.closest("[data-a='cacheStow']");
  if (stow && !stow.disabled) {
    closeContextMenu();
    transferCacheSlot(stow.dataset.where || state.profile.ship, Number(stow.dataset.slot));
    uiSound("confirm");
    return;
  }
  const use = event.target.closest("[data-a='cacheUse']");
  if (use && !use.disabled) {
    cancelHeldStack();
    useConsumable(use);
    return;
  }
  const discard = event.target.closest("[data-a='cacheDiscard']");
  if (discard && !discard.disabled) {
    openCacheDiscard(discard);
    return;
  }
  if (event.target.closest(".inv-discard-popover, .inv-take-popover, .mod-info-popover")) return;
  if (event.target.closest("[data-cache-close]") || event.target === root) closeCache();
  else if (!event.target.closest(".inv-context")) closeContextMenu();
}

/** Install the overlay once. It sits outside the docked panel and never moves it. */
export function setupCache() {
  root = document.createElement("section");
  root.id = "cache";
  root.className = "cargo-overlay";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Rift cache");
  root.innerHTML =
    `<div class="cargo-card cache-card">` +
    `<button class="cargo-close" type="button" data-cache-close aria-label="Close the cache">Close</button>` +
    `<div id="cache-body"></div>` +
    `</div>`;
  root.addEventListener("click", onCacheClick);
  root.addEventListener("contextmenu", onCacheContextMenu);
  document.body.appendChild(root);

  // The sim offers the trade when R is pressed beside an open canister; this is the panel that shows.
  on("instance-cache-open", () => openCache());
  // Anything that ends the run, or ends the flight, ends the trade: a station, the title screen,
  // death, the way out, or the collapse of the pocket the canister was hanging in.
  on("docked", () => closeCache({ silent: true }));
  on("main-menu", () => closeCache({ silent: true }));
  on("died", () => closeCache({ silent: true }));
  on("rift-left", () => closeCache({ silent: true }));
  on("instance-closed", () => closeCache({ silent: true }));
  return root;
}

/** Open the trade. Returns false when the rule says this is not the time. */
export function openCache() {
  if (!root || isCacheOpen() || !canOpenCache()) return false;
  const record = cacheTradeRecord();
  state.ui.cache = { open: true, id: record.id };
  renderCache();
  root.hidden = false;
  clearControls();          // release what is held (core/input.js also gates the panel as modal)
  holdShip();               // and kill the carry: the trade is read beside a still ship
  uiSound();
  return true;
}

/** Close it and hand the controls and sound back to the flight the pilot left. */
export function closeCache({ silent = false } = {}) {
  if (!isCacheOpen()) return false;
  if (cancelHeldStack()) saveQuietly();
  clearHeldGhost();
  state.ui.cache = null;
  closeContextMenu();
  if (root) root.hidden = true;
  // The sim keeps the canister exactly as the pilot left it, and says so on the bus.
  closeCacheTrade();
  syncControls();
  setAudioSuspended(state.paused);
  if (!silent) uiSound();
  return true;
}

export function toggleCache() {
  return isCacheOpen() ? closeCache() : openCache();
}
