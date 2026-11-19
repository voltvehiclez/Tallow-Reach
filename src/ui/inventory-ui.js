// Shared Minecraft-style inventory slot interactions used by all three inventory
// surfaces: docked Station Inventory (`ui/menu.js`), in-flight Ship Inventory `I`
// (`ui/cargo.js`), and in-flight Rift Cache trade `R` (`ui/cache.js`).
//
// Rules:
//   - Left-click a filled slot (empty cursor): pick up the whole stack onto the cursor.
//   - Left-click any slot (holding a stack): drop into empty slot, merge into same item,
//     or swap with a different item (works inside the same inventory or across open ones).
//   - Right-click any slot (holding a stack): place 1 item into an empty or matching slot.
//   - Right-click a filled slot (empty cursor): open context menu including `Take amount`.
//   - Shift+left-click a filled slot: transfer the entire stack to the other open inventory.
//   - `Stack all` button on each inventory header: merge split stacks and compact gaps.
//   - Escape / tab change / closing an inventory returns any held stack safely to its origin.

import { state, localPlayer } from "../state/state.js";
import { setDestination } from "../state/destination.js";
import { isModule, itemName, itemUse, itemVol } from "../data/items.js";
import { findDestinationRoute } from "../sim/travel.js";
import { stationAt } from "../sim/places.js";
import {
  CACHE,
  pickupSlot,
  placeHeldStack,
  returnHeldStack,
  shiftMoveSlot,
  stackAll,
  takeFromSlot,
} from "../sim/inventory.js";
import { notifyCacheMove } from "../sim/instances.js";

let ghostEl = null;
let trackingMove = false;
let lastPointer = { x: 0, y: 0, known: false };

function esc(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function heldKindBadge(id) {
  if (isModule(id)) return "MOD";
  return itemUse(id) ? "USE" : "ORE";
}

function updateGhostPosition(x, y) {
  if (!ghostEl) return;
  ghostEl.style.left = `${Math.round(x + 12)}px`;
  ghostEl.style.top = `${Math.round(y + 12)}px`;
}

function onPointerMove(event) {
  if (typeof event?.clientX !== "number" || typeof event?.clientY !== "number") return;
  lastPointer = { x: event.clientX, y: event.clientY, known: true };
  if (ghostEl && !ghostEl.hidden) updateGhostPosition(event.clientX, event.clientY);
}

function syncPointerListener(active) {
  if (typeof document === "undefined" || typeof document.addEventListener !== "function") return;
  if (active && !trackingMove) {
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("mousemove", onPointerMove, true);
    trackingMove = true;
  } else if (!active && trackingMove) {
    document.removeEventListener("pointermove", onPointerMove, true);
    document.removeEventListener("mousemove", onPointerMove, true);
    trackingMove = false;
  }
}

/** Remove the floating cursor-held item card completely so no empty box can linger. */
export function clearHeldGhost() {
  if (ghostEl) {
    ghostEl.hidden = true;
    ghostEl.innerHTML = "";
    ghostEl.remove?.();
    ghostEl = null;
  }
  if (typeof document !== "undefined" && typeof document.getElementById === "function") {
    const stray = document.getElementById("inv-held-ghost");
    if (stray) {
      stray.hidden = true;
      stray.innerHTML = "";
      stray.remove?.();
    }
  }
  syncPointerListener(false);
}

function syncHeldGhost(clientX, clientY) {
  const held = state.ui.invHeld;
  if (typeof clientX === "number" && typeof clientY === "number" && (clientX !== 0 || clientY !== 0)) {
    lastPointer = { x: clientX, y: clientY, known: true };
  }
  if (!held || !(held.n > 0)) {
    clearHeldGhost();
    return;
  }
  if (typeof document === "undefined" || !document.body || typeof document.createElement !== "function") {
    return;
  }
  if (!ghostEl || ghostEl.isConnected === false) {
    ghostEl = document.createElement("div");
    ghostEl.id = "inv-held-ghost";
    ghostEl.className = "inv-held-ghost";
    ghostEl.setAttribute("aria-hidden", "true");
    document.body.append(ghostEl);
  }
  ghostEl.innerHTML =
    `<span class="inv-item-top"><span class="inv-kind">${heldKindBadge(held.id)}</span>` +
    `<span class="inv-n">&times;${held.n}</span></span>` +
    `<span class="inv-item-name">${esc(itemName(held.id))}</span>` +
    `<span class="inv-item-meta">${itemVol(held.id)} m³ each</span>`;
  ghostEl.hidden = false;
  if (lastPointer.known) updateGhostPosition(lastPointer.x, lastPointer.y);
  syncPointerListener(true);
}

/** Stack currently held on the cursor (`{ where, slot, id, n, ... }` or `null`). */
export function getHeldStack() {
  const held = state.ui.invHeld;
  return held && held.n > 0 ? held : null;
}

/** True while a stack is currently held on the cursor. */
export const hasHeldStack = () => Boolean(getHeldStack());

/** Put any cursor-held stack back into its source slot/container. Returns true if anything was held. */
export function cancelHeldStack(profile = state.profile, world = state.worldState) {
  const held = getHeldStack();
  if (!held) {
    syncHeldGhost();
    return false;
  }
  state.ui.invHeld = null;
  returnHeldStack(held, profile, world);
  syncHeldGhost();
  return true;
}

function reportCacheDelta(prevHeld, targetWhere, res) {
  if (!res?.ok || !(res.moved > 0)) return;
  const fromCache = prevHeld?.where === CACHE;
  const toCache = targetWhere === CACHE;
  const stillHoldingCache = res.held?.where === CACHE;
  if (fromCache && !toCache) {
    notifyCacheMove("take", prevHeld.id, res.moved, { heldFromCache: stillHoldingCache });
    if (res.swapped && res.taken) {
      // Swapped a cache item onto a ship item: the ship item stays on the cursor for now.
    }
  } else if (!fromCache && toCache) {
    notifyCacheMove("stow", prevHeld.id, res.moved, { heldFromCache: stillHoldingCache });
  }
}

/**
 * Handle a left-click (or Shift+left-click) on any inventory slot button.
 * Returns `{ changed, message, picked, moved }` so the host panel can re-render and save.
 */
export function clickInventorySlot({
  where,
  slot,
  otherWhere = null,
  shiftKey = false,
  clientX = 0,
  clientY = 0,
  profile = state.profile,
  world = state.worldState,
}) {
  const idx = Math.floor(+slot);
  if (!where || !Number.isInteger(idx) || idx < 0) {
    return { changed: false, message: "", picked: false, moved: 0 };
  }

  // Shift+left-click transfers the whole stack straight to the other open inventory.
  if (shiftKey) {
    if (!otherWhere || otherWhere === where) {
      return { changed: false, message: "", picked: false, moved: 0 };
    }
    const res = shiftMoveSlot(where, idx, otherWhere, profile, world);
    if (res.ok && res.moved > 0 && (where === CACHE || otherWhere === CACHE)) {
      const held = getHeldStack();
      notifyCacheMove(where === CACHE ? "take" : "stow", res.id, res.moved, {
        heldFromCache: held?.where === CACHE,
      });
    }
    return { changed: res.ok, message: res.message || "", picked: false, moved: res.moved || 0 };
  }

  // Holding a stack: drop into empty slot, merge into same item, or swap with another item.
  const held = getHeldStack();
  if (held) {
    const res = placeHeldStack(held, where, idx, { one: false }, profile, world);
    state.ui.invHeld = res.held || null;
    syncHeldGhost(clientX, clientY);
    reportCacheDelta(held, where, res);
    return { changed: res.ok, message: res.message || "", picked: false, moved: res.moved || 0 };
  }

  // Empty cursor: pick up the stack in this slot (clicking an empty slot is a no-op).
  const picked = pickupSlot(where, idx, profile, world);
  if (!picked) return { changed: false, message: "", picked: false, moved: 0 };
  state.ui.invHeld = picked;
  syncHeldGhost(clientX, clientY);
  return { changed: true, message: "", picked: true, moved: 0 };
}

/**
 * Handle a right-click on any inventory slot while holding a stack: places 1
 * item into an empty or matching slot. Returns `null` when the cursor is empty
 * so the caller opens its normal right-click context menu instead.
 */
export function rightClickInventorySlot({
  where,
  slot,
  clientX = 0,
  clientY = 0,
  profile = state.profile,
  world = state.worldState,
}) {
  const held = getHeldStack();
  if (!held) return null;
  const idx = Math.floor(+slot);
  if (!where || !Number.isInteger(idx) || idx < 0) {
    return { handled: true, changed: false, message: "" };
  }
  const res = placeHeldStack(held, where, idx, { one: true }, profile, world);
  state.ui.invHeld = res.held || null;
  syncHeldGhost(clientX, clientY);
  reportCacheDelta(held, where, res);
  return { handled: true, changed: res.ok, message: res.message || "" };
}

/** Pick up an exact `amount` from `(where, slot)` onto the cursor. */
export function pickupSlotAmount({
  where,
  slot,
  amount,
  clientX = 0,
  clientY = 0,
  profile = state.profile,
  world = state.worldState,
}) {
  if (hasHeldStack()) cancelHeldStack(profile, world);
  const res = takeFromSlot(where, Math.floor(+slot), amount, profile, world);
  if (!res.ok || !res.held) return res;
  state.ui.invHeld = res.held;
  syncHeldGhost(clientX, clientY);
  return res;
}

/**
 * Consolidate all split stacks and empty gaps in `where` (`Stack all` button).
 * If a stack taken from `where` is currently on the cursor, returns it first so
 * it merges cleanly with the rest.
 */
export function runStackAll(where, profile = state.profile, world = state.worldState) {
  const held = getHeldStack();
  let returned = false;
  if (held && held.where === where) {
    cancelHeldStack(profile, world);
    returned = true;
  }
  const res = stackAll(where, profile, world);
  return {
    changed: returned || res.changed,
    message: returned && !res.changed ? `Stacked all items in ${where}.` : res.message,
  };
}

/** Markup for the right-click `Take amount` popover (matches Sell / Discard). */
export function takeAmountHtml(id, available, amount = Math.max(1, Math.ceil(available / 2))) {
  const safe = Math.max(1, Math.min(available, Math.floor(+amount || 1)));
  return (
    `<div class="inv-sell-head"><strong>Take ${esc(itemName(id))}</strong>` +
    `<div class="inv-sell-actions"><button type="button" data-a="takeConfirm">Take</button>` +
    `<button type="button" data-a="takeCancel">Cancel</button></div></div>` +
    `<label>Amount <span>(1–${available})</span>` +
    `<input class="inv-sell-amount" type="number" min="1" max="${available}" step="1" value="${safe}"></label>` +
    `<div class="inv-sell-error" aria-live="polite"></div>`
  );
}

/**
 * Open the `Take amount` popover inside `host` (docked panel, flight card or
 * cache card), anchored right at the right-click menu just like Sell & Discard.
 * Calls `onTake({ where, slot, id, amount, clientX, clientY })` on confirm.
 */
export function openTakeAmountPopover({ host, anchor, where, slot, id, count, onTake }) {
  if (!host || !(count > 0)) return null;
  host.querySelector(".inv-take-popover")?.remove();

  const popover = document.createElement("div");
  popover.className = "inv-sell-popover inv-take-popover";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", `Take ${itemName(id)}`);
  popover.dataset.where = where;
  popover.dataset.slot = String(slot);
  popover.dataset.id = id;
  popover.dataset.available = String(count);
  const initial = count > 1 ? Math.ceil(count / 2) : 1;
  popover.innerHTML = takeAmountHtml(id, count, initial);

  const scrollLeft = host.scrollLeft || 0, scrollTop = host.scrollTop || 0;
  const preferredLeft = anchor.left + (anchor.width || 0) + 8;
  const hostW = host.clientWidth || 0, hostH = host.clientHeight || 0;
  const left = hostW <= 0 || preferredLeft + 240 <= hostW + scrollLeft
    ? preferredLeft
    : Math.max(scrollLeft, anchor.left - 240 - 8);
  const maxTop = hostH > 0 ? Math.max(scrollTop, scrollTop + hostH - 170) : anchor.top;
  popover.style.left = `${left}px`;
  popover.style.top = `${Math.max(scrollTop, Math.min(anchor.top, maxTop))}px`;

  const input = popover.querySelector(".inv-sell-amount");
  const commit = (clientX = 0, clientY = 0) => {
    const available = Number(popover.dataset.available) || 0;
    const amount = Number(input?.value);
    if (!Number.isInteger(amount) || amount < 1 || amount > available) {
      const err = popover.querySelector(".inv-sell-error");
      if (err) err.textContent = `Enter a whole number from 1 to ${available}.`;
      input?.focus?.();
      return;
    }
    const res = pickupSlotAmount({ where, slot: Number(slot), amount, clientX, clientY });
    if (!res.ok) {
      const err = popover.querySelector(".inv-sell-error");
      if (err) err.textContent = res.message || "Could not take that amount.";
      input?.focus?.();
      return;
    }
    popover.remove();
    onTake?.({ where, slot: Number(slot), id, amount, held: res.held });
  };

  popover.addEventListener("click", event => {
    event.stopPropagation();
    const button = event.target.closest("button[data-a]");
    if (!button || button.disabled) return;
    if (button.dataset.a === "takeConfirm") commit(event.clientX, event.clientY);
    else if (button.dataset.a === "takeCancel") popover.remove();
  });

  popover.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();
      popover.remove();
    } else if (event.key === "Enter") {
      event.stopPropagation();
      event.preventDefault();
      commit(lastPointer.x, lastPointer.y);
    }
  });

  host.append(popover);
  input?.focus?.();
  input?.select?.();
  return popover;
}

/** Check whether a station pocket in My Assets is or can become the saved destination. */
export function stationDestinationStatus(placeId) {
  const player = localPlayer();
  const from = player?.place || state.place;
  const galaxy = state.galaxy;
  const pocket = galaxy?.pocketsById?.[placeId];
  const st = stationAt(placeId);
  const name = st?.n || pocket?.n || String(placeId || "station");
  const cur = state.ui.destination;
  const isSet = Boolean(
    placeId &&
    cur &&
    typeof cur === "object" &&
    cur.pocketId === placeId
  );
  if (!placeId) {
    return { placeId: "", name, isCurrent: false, isSet: false, canSet: false, reason: "Unknown station." };
  }
  if (placeId === from) {
    return { placeId, name, isCurrent: true, isSet, canSet: false, reason: "Already at this station." };
  }
  if (isSet) {
    return { placeId, name, isCurrent: false, isSet: true, canSet: false, reason: "Already set as destination." };
  }
  if (!galaxy) {
    return { placeId, name, isCurrent: false, isSet: false, canSet: false, reason: "No route available." };
  }
  const route = findDestinationRoute(galaxy, from, { pocketId: placeId }, {
    player,
    profile: state.profile,
    world: state.worldState,
  });
  if (!route || route.length < 2) {
    return { placeId, name, isCurrent: false, isSet: false, canSet: false, reason: "No route to this station." };
  }
  return { placeId, name, isCurrent: false, isSet: false, canSet: true, reason: "", hops: route.length - 1 };
}

/** Set a My Assets station pocket as the active navigation destination. */
export function setAssetStationDestination(placeId) {
  const status = stationDestinationStatus(placeId);
  if (!status.canSet) {
    return { ok: false, message: status.reason || "No route to this station." };
  }
  setDestination({ pocketId: status.placeId });
  return { ok: true, message: "" };
}

/** Clear the active navigation destination when cleared from a My Assets station menu. */
export function clearAssetStationDestination() {
  if (!state.ui.destination) return { ok: false, message: "" };
  setDestination(null);
  return { ok: true, message: "" };
}

/** Build the right-click context menu for a station header inside My Assets. */
export function buildAssetStationContextMenu(doc, placeId) {
  const status = stationDestinationStatus(placeId);
  const menu = doc.createElement("div");
  menu.className = "inv-context assets-context";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", status.name);

  const setBtn = doc.createElement("button");
  setBtn.type = "button";
  setBtn.dataset.a = "assetSetDest";
  setBtn.dataset.b = status.placeId;
  setBtn.setAttribute("role", "menuitem");
  setBtn.textContent = "Set destination";
  if (!status.canSet) {
    setBtn.disabled = true;
    if (status.reason) setBtn.title = status.reason;
  } else {
    setBtn.title = `Set navigation destination to ${status.name}.`;
  }
  menu.append(setBtn);

  if (status.isSet) {
    const clearBtn = doc.createElement("button");
    clearBtn.type = "button";
    clearBtn.dataset.a = "assetClearDest";
    clearBtn.dataset.b = status.placeId;
    clearBtn.setAttribute("role", "menuitem");
    clearBtn.textContent = "Clear destination";
    clearBtn.title = `Clear destination to ${status.name}.`;
    menu.append(clearBtn);
  }
  return menu;
}
