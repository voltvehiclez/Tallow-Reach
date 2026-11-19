import { setHomeStation } from "../sim/session.js";
// The outpost panel: renders the current screen and runs the actions behind
// its buttons. Buttons carry a data-a action name and an optional data-b argument.

import { on, emit } from "../util/events.js";
import { notify, showNotice, hideNotice, setupNotices } from "./notice.js";
import { initAudio, uiSound, hoverSound } from "../core/audio.js";
import { state, currentSave, applySave, resetPlaces } from "../state/state.js";
import { saveAutosave, readSlot, writeSlot, deleteSlot, decodeSave, encodeSave } from "../state/storage.js";
import { newSave } from "../state/profile.js";
import { setShip } from "../sim/player.js";
import { launch, resumeFromSave } from "../sim/session.js";
import { prepareGalaxySave } from "../sim/galaxy-session.js";
import { refillPower } from "../sim/power.js";
import { refreshDrive } from "../sim/drive.js";
import { refreshShield } from "../sim/shield.js";
import { refreshHull } from "../sim/hull.js";
import { refreshGuns } from "../sim/guns.js";
import * as fitting from "../sim/fitting.js";
import { toggleModulePicker, togglePaintPicker } from "./picker.js";
import * as eco from "../sim/economy.js";
import * as contracts from "../sim/contracts.js";
import * as inv from "../sim/inventory.js";
import { canSell, canDiscard, itemName } from "../data/items.js";
import { storyMission } from "../data/missions/index.js";
import { introHtml, outpostHtml, shipDetailsHtml, shipSellConfirmHtml, shopBuyHtml, viewedShip } from "./screens.js";
import { mountOutfitting } from "./outfitting.js";
import { closeStarmap } from "./starmap.js";
import { openDiscardPopover } from "./discard.js";
import {
  cancelHeldStack,
  clickInventorySlot,
  hasHeldStack,
  openTakeAmountPopover,
  rightClickInventorySlot,
  runStackAll,
} from "./inventory-ui.js";

const $ = id => document.getElementById(id);
let panel;
let beforeStart = null;
let starting = false;

export function setupMenu(options = {}) {
  beforeStart = options.beforeStart || null;
  panel = $("panel");
  setupNotices();
  panel.addEventListener("click", onClick);
  panel.addEventListener("dblclick", onDblClick);
  panel.addEventListener("contextmenu", onInventoryContextMenu);
  panel.addEventListener("mouseover", e => {
    if (e.target.closest("button:not(:disabled)")) hoverSound();
  });

  // While the start screen is up it owns the panel: booting a save prepares the
  // ship (docked or flying) but must not replace or hide the start screen.
  on("docked", ({ player } = {}) => {
    if (player && player !== state.player) return;
    if (state.ui.intro) return;
    hideNotice();
    render();
  });
  on("launched", ({ player } = {}) => {
    if (player && player !== state.player) return;
    if (state.ui.intro) return;
    panel.hidden = true;
  });
  on("died", text => {
    cancelHeldStack();
    showNotice(text);
    state.ui.tab = "h";
    render();
  });
  on("main-menu", () => {
    cancelHeldStack();
    state.ui.intro = true;
    state.ui.tab = "m";
    hideNotice();
    render();
  });
  // A mission changed while a docked screen is open — the last dialogue line
  // closed, a dock-side script finished, a hand-in or an abandon went through.
  // The panel is a snapshot, so redraw it; otherwise the Mission log keeps
  // showing the old state (an Abandon button on a mission ready to hand in).
  on("mission-ui-refresh", () => {
    if (state.ui.intro || panel.hidden) return;
    render();
  });
  // Tick this station's contract refresh countdown live once a second while the
  // Contracts tab is open, and unlock the Refresh button the moment it finishes.
  on("board-timer-changed", ({ placeId } = {}) => {
    if (state.ui.intro || panel.hidden || state.ui.tab !== "m") return;
    if (placeId && placeId !== state.place) return;
    render();
  });

  contracts.ensureBoard();
  render();
}

/**
 * Show a docked tab from a key binding (I in a station opens the Inventory tab).
 * Does nothing on the title screen.
 */
export function openStationTab(name) {
  if (state.ui.intro || !panel) return false;
  state.ui.tab = name;
  state.ui.confirmReset = false;
  state.ui.fit = null;
  render();
  return true;
}

export function render() {
  panel.hidden = false;
  // Outfitting gives the panel the whole screen so the ship has room around it.
  panel.classList.toggle("wide", !state.ui.intro && state.ui.tab === "o");
  panel.innerHTML = state.ui.intro ? introHtml() : outpostHtml(state.ui);
  if (!state.ui.intro && state.ui.tab === "o") mountOutfitting();
}

function save() {
  saveAutosave(currentSave());
}

/**
 * The one way an action's reply reaches the pilot. Routine confirmations are
 * silent; refusals and warnings go to the fixed notice (ui/notice.js), so the
 * panel never grows a line and never shifts.
 */
function toast(text) {
  notify(text);
}

/** Let pending mission hand-offs retry after the player changes cargo. */
function inventoryChanged() {
  emit("mission-inventory-changed", { profile: state.profile, player: state.player });
}

/** Consume a safe-recovery notice once, without hiding the load/import result. */
function recoveryNotice() {
  if (!state.galaxyRecovery) return "";
  const to = state.galaxyRecovery.to;
  state.galaxyRecovery = null;
  const place = state.galaxy?.pocketsById?.[to];
  return `That pocket no longer exists. Returned to ${place?.n || "Meridian Station"}; your character and cargo are safe.`;
}

function loadedMessage(text) {
  const notice = recoveryNotice();
  return notice ? `${text} ${notice}` : text;
}

const ACTIONS = {
  home: () => toast(setHomeStation()),
  // "Open World": leave the start screen and deploy the pilot where the save put
  // them — docked at a station, or flying at that pocket's arrival point. The
  // existing `intro` action is deliberately kept as the Open World button's
  // implementation.
  intro() {
    state.ui.intro = false;
    state.ui.tab = "m";
    initAudio();
    resumeFromSave();
    emit("mission-ui-refresh", {});
    const notice = recoveryNotice();
    if (notice) showNotice(notice);
  },
  tab(name) {
    cancelHeldStack();
    state.ui.tab = name;
    hideNotice();
    closePanelPopovers();
    state.ui.confirmReset = false;
    state.ui.fit = null;
  },
  go() {
    cancelHeldStack();
    closePanelPopovers();
    state.ui.fit = null;
    launch();
  },

  // Contracts
  acc(i) {
    toast(contracts.acceptContract(+i));
  },
  ref() {
    // Only this station's board reshuffles, gated by its own 10-minute cooldown.
    const msgText = contracts.refreshBoard(state.worldState, state.place);
    if (msgText) toast(msgText);
  },
  drop(i) {
    // Abandon used to be silent; keep that contract-board behavior while the
    // generic runner removes the selected active mission. The button carries a
    // mission id (the panel lists only this station's missions, so a position
    // would address the wrong record).
    contracts.abandonContract(i);
  },
  done(i) {
    toast(contracts.completeContract(i));
  },
  story(id) {
    const definition = storyMission(id);
    if (!definition) {
      toast("That story mission is not available.");
      return;
    }
    // Story missions belong to the station that gives them out; the log only
    // lists them there, and the rule is enforced here too.
    if (contracts.missionOfferStation(definition) !== state.place) {
      toast("That story mission is not offered here.");
      return;
    }
    if (contracts.activeMissions().some(mission => mission.id === definition.id)) {
      toast("That story mission is already active.");
      return;
    }
    toast(contracts.acceptMission(definition) ? "Story mission accepted." : "Could not start that story mission.");
  },

  // Hangar
  sel(id) {
    const msgText = eco.selectShip(id);
    if (msgText) toast(msgText);
    inventoryChanged();
  },
  buy(id) {
    eco.buyShip(id);
  },
  rp(id) {
    const msgText = eco.repairShip(id);
    if (msgText) toast(msgText);
  },

  // Shop: expand/collapse compact one-line groups & subgroups, or direct purchase.
  shopGroup(key) {
    if (!key) return;
    const open = state.ui.shopOpen || (state.ui.shopOpen = {});
    if (open[key]) delete open[key];
    else open[key] = true;
  },
  wb(arg) {
    const parts = String(arg || "").split(":");
    const [shop, kind, id] = parts.length >= 3 ? parts : [parts[0], null, parts[1]];
    const msgText = eco.buyItem(shop, id, 1, state.player, state.profile, state.worldState, kind);
    if (msgText) toast(msgText);
    inventoryChanged();
  },
  wr() {
    toast(eco.restockMissiles());
  },

  // The arrows above the 3D viewer in Outfitting: cycle through the ships in the
  // hangar (same selection as the Hangar's Fly button).
  shipPrev() {
    cycleShip(-1);
  },
  shipNext() {
    cycleShip(1);
  },

  // Inventory: switch between Storage & Hold and My Assets, step through local ships'
  // holds, pick up/place/swap/split stacks, or consolidate stacks with Stack all.
  invView(view) {
    cancelHeldStack();
    state.ui.invView = view === "assets" ? "assets" : "inv";
  },
  assetStation(placeId) {
    if (!placeId) return;
    const open = state.ui.assetsOpen || (state.ui.assetsOpen = {});
    if (open[placeId]) delete open[placeId];
    else open[placeId] = true;
  },
  invPrev() {
    cancelHeldStack();
    cycleInvShip(-1);
  },
  invNext() {
    cancelHeldStack();
    cycleInvShip(1);
  },
  invReturn() {
    if (cancelHeldStack()) inventoryChanged();
  },
  stackAll(where) {
    const target = where || inv.STATION;
    const res = runStackAll(target);
    if (res.message) toast(res.message);
    if (res.changed) inventoryChanged();
  },
  mv(arg) {
    // Legacy compatibility helper for direct programmatic transfers.
    const [, id, dir, n] = String(arg || "").split(":");
    const ship = viewedShip();
    const [from, to] = dir === "s" ? [inv.STATION, ship] : [ship, inv.STATION];
    const count = n === "all" ? Infinity : Math.max(1, +n || 1);
    inv.moveItem(from, to, id, count);
    inventoryChanged();
  },


  // Outfitting
  slot(arg) {
    // data-b is "group:bay". Clicking the open bay again closes the picker.
    const [g, i] = String(arg || "").split(":");
    state.ui.fit = toggleModulePicker(state.ui.fit, g, +i);
  },
  paint(k) {
    // Paint bays behave like module bays: one picker, click again to close.
    state.ui.fit = togglePaintPicker(state.ui.fit, k);
  },
  fit(id) {
    const open = state.ui.fit;
    if (!open || open.kind !== "module") return;
    const text = fitting.fitModule(open.g, open.i, id);
    if (text) toast(text);
    inventoryChanged();
  },
  unfit() {
    const open = state.ui.fit;
    if (!open || open.kind !== "module") return;
    const text = fitting.unequip(open.g, open.i);
    if (text) toast(text);
    inventoryChanged();
  },

  // Base
  dep() {
    toast(eco.storeHold());
    inventoryChanged();
  },
  wd() {
    eco.withdrawStored();
    inventoryChanged();
  },
  sellh() {
    toast(eco.sellHold());
    inventoryChanged();
  },
  sells() {
    toast(eco.sellStored());
    inventoryChanged();
  },
  up(mod) {
    eco.upgradeBase(mod);
  },

  // Saves
  sv(i) {
    toast(writeSlot(+i, currentSave()) ? "Saved to slot " + i : "Could not save in this browser.");
  },
  ld(i) {
    const raw = readSlot(+i);
    if (!raw) return;
    let save;
    try {
      save = prepareGalaxySave(raw);
    } catch (e) {
      toast("That slot could not be read.");
      return;
    }
    applySave(save);
    afterSaveChange();
    toast(loadedMessage("Loaded slot " + i));
    render();
  },
  dl(i) {
    deleteSlot(+i);
    toast("Deleted slot " + i);
  },
  rs1() {
    state.ui.confirmReset = true;
  },
  rs0() {
    state.ui.confirmReset = false;
  },
  rs2() {
    applySave(prepareGalaxySave(newSave()));
    afterSaveChange();
    state.ui.confirmReset = false;
    toast(loadedMessage("Progress reset."));
  },
  xp() {
    state.ui.xcode = encodeSave(currentSave());
    try {
      navigator.clipboard.writeText(state.ui.xcode).catch(() => {});
    } catch (e) {
      // clipboard not available; the code is still shown in the box
    }
    toast("Your save code is in the box below. It was also copied if your browser allows it.");
  },
  im() {
    const text = ($("xt") || {}).value || "";
    state.ui.xcode = text;
    let save;
    try {
      save = decodeSave(text, prepareGalaxySave);
    } catch (e) {
      toast("That code is not a valid save.");
      return;
    }
    state.ui.xcode = "";
    applySave(save);
    afterSaveChange();
    toast(loadedMessage("Save imported."));
    render();
  },
};

/** Step the flown ship through this station's hangar. The arrows do nothing with one ship. */
function cycleShip(dir) {
  const S = state.profile,
    owned = eco.localShips(S, state.worldState);
  if (!owned || owned.length < 2) return;
  const i = owned.indexOf(S.ship);
  const next = owned[(Math.max(0, i) + dir + owned.length) % owned.length];
  const msgText = eco.selectShip(next);
  if (msgText) toast(msgText);
  inventoryChanged();
}

/** Step the Inventory tab through this station's ships without changing the ship being flown. */
function cycleInvShip(dir) {
  const owned = eco.localShips(state.profile, state.worldState);
  if (!owned || owned.length < 2) return;
  const i = owned.indexOf(viewedShip());
  state.ui.invShip = owned[(Math.max(0, i) + dir + owned.length) % owned.length];
}

/** Common work after the whole save is replaced (load, import, reset). */
function afterSaveChange() {
  cancelHeldStack();
  closeStarmap();
  const placeId = state.worldState.place;
  resetPlaces();
  state.place = placeId;
  setShip(state.profile.ship);
  refillPower();
  refreshDrive();
  refreshShield();
  refreshHull();
  refreshGuns();
  state.shops = {};
  state.ui.fit = null;
  state.ui.invShip = null;
  state.ui.invView = "inv";
  state.ui.cargoView = "hold";
  state.ui.assetsOpen = {};
  state.ui.shopOpen = {};
  contracts.ensureBoard();
  state.flight.lock = null;
  state.flight.missileLock = { target: null, t: 0, locked: false };
  resumeFromSave();
}

/** The popover's anchor: the horizontal spot the user right-clicked, vertically
 * derived from the menu entry that was clicked — but with a fixed offset, not
 * "centred on the click line" (owner, 2026-11-14: the Discard popover's old
 * placement, opening at the right-click line so its buttons sat ~23px above
 * the mouse, was perfect; the Sell button sat slightly below it). The Discard
 * entry centres 43.75px below the menu's right-click line (menu pad 4 + entry
 * height ~26.5 + half entry); popover top = clicked-entry centre minus the
 * head-row half-height (~21px) minus those 43.75px would restore Discard
 * exactly, so both flows now share one rule: popover top = entry centre − 44.
 * For Discard that equals the old right-click line (discard entry centre − 44
 * ≈ menu top); for Sell, whose entry sits one row higher, the whole popover
 * rides up by one row, so its buttons land ~23px above the mouse — the same
 * relation Discard had, for both. The head row is ~22px tall and the popover
 * pads 10px on top, hence the -21 half-height folded into the constant. */
function popoverAnchorFor(panel, button, fallbackContext) {
  const rect = panel.getBoundingClientRect();
  const entry = button.getBoundingClientRect();
  const entryCenter = entry.top - rect.top + panel.scrollTop + entry.height / 2;
  const context = fallbackContext || button.closest(".inv-context");
  return {
    left: Number(context?.dataset.anchorLeft || 0),
    top: Math.max(panel.scrollTop, entryCenter - 44),
    width: Number(context?.dataset.anchorWidth || 0),
  };
}

function openInventorySell(button) {
  const [kind, id, dir, stack] = String(button.dataset.b || "").split(":");
  if (!canSell(id)) return;
  const source = dir === "s" ? inv.STATION : viewedShip();
  const slotIdx = Number.isInteger(Number(button.dataset.slot)) ? Number(button.dataset.slot) : -1;
  const available = inv.countOf(source, id);
  if (!(available > 0)) return;

  const anchor = popoverAnchorFor(panel, button);
  closePanelPopovers();

  const popover = document.createElement("div");
  popover.className = "inv-sell-popover";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", "Sell item");
  popover.dataset.source = `${kind}:${id}:${dir}`;
  popover.dataset.slot = String(slotIdx);
  popover.innerHTML =
    `<div class="inv-sell-head"><strong>Sell ${itemName(id)}</strong>` +
    `<div class="inv-sell-actions"><button type="button" data-a="invSellConfirm">Sell</button><button type="button" data-a="invSellCancel">Cancel</button></div></div>` +
    `<label>Amount <span>(1–${available})</span><input class="inv-sell-amount" type="number" min="1" max="${available}" step="1" value="${Math.min(available, Math.max(1, Number(stack) || available))}"></label>` +
    `<div class="inv-sell-error" aria-live="polite"></div>`;

  const scrollLeft = panel.scrollLeft, scrollTop = panel.scrollTop;
  const preferredLeft = anchor.left + anchor.width + 8;
  const left = preferredLeft + 240 <= panel.clientWidth + scrollLeft
    ? preferredLeft
    : Math.max(scrollLeft, anchor.left - 240 - 8);
  const maxTop = Math.max(scrollTop, scrollTop + panel.clientHeight - 170);
  const top = Math.max(scrollTop, Math.min(anchor.top, maxTop));
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
  panel.append(popover);
  const input = popover.querySelector(".inv-sell-amount");
  input.focus();
  input.select();
}

function confirmInventorySell(button) {
  const popover = button.closest(".inv-sell-popover");
  if (!popover) return;
  const [kind, id, dir] = String(popover.dataset.source || "").split(":");
  const source = dir === "s" ? inv.STATION : viewedShip();
  const available = inv.countOf(source, id);
  const input = popover.querySelector(".inv-sell-amount");
  const amount = Number(input.value);
  if (!Number.isInteger(amount) || amount < 1 || amount > available) {
    popover.querySelector(".inv-sell-error").textContent = `Enter a whole number from 1 to ${available}.`;
    input.focus();
    return;
  }
  const slotIdx = Number(popover.dataset.slot);
  const text = eco.sellInventoryItem(
    id,
    source,
    amount,
    state.profile,
    state.worldState,
    Number.isInteger(slotIdx) ? slotIdx : -1
  );
  if (text) toast(text);
  inventoryChanged();
  uiSound("confirm");
  save();
  render();
}

/** Right-click -> Take amount: pick up an exact number from one slot onto the cursor. */
function openInventoryTakeAmount(button) {
  const id = button.dataset.b;
  const where = button.dataset.where || inv.STATION;
  const slot = Number(button.dataset.slot);
  if (!Number.isInteger(slot) || slot < 0) return;
  const entry = inv.slotAt(where, slot);
  if (!entry || entry.id !== id || !(entry.n > 0)) return;

  const anchor = popoverAnchorFor(panel, button);
  closePanelPopovers();

  openTakeAmountPopover({
    host: panel,
    anchor,
    where,
    slot,
    id,
    count: entry.n,
    onTake: () => {
      uiSound("click");
      render();
    },
  });
}

/**
 * Discard, step one: ask how many in a popover beside the tile (the sell box's
 * number field), then step two asks "Are you sure ...?" — see ui/discard.js.
 */
function openInventoryDiscard(button) {
  const id = button.dataset.b;
  const where = button.dataset.where || inv.STATION;
  const slotIdx = Number(button.dataset.slot);
  if (!canDiscard(id)) return;
  const slotEntry = Number.isInteger(slotIdx) && slotIdx >= 0 ? inv.slotAt(where, slotIdx) : null;
  const count = slotEntry && slotEntry.id === id ? slotEntry.n : inv.countOf(where, id);
  if (!(count > 0)) return;

  const anchor = popoverAnchorFor(panel, button);
  closePanelPopovers();

  openDiscardPopover({
    host: panel,
    anchor,
    where,
    id,
    count,
    onDiscard: (place, item, amount) => {
      toast(inv.discardItem(
        place,
        item,
        amount,
        state.profile,
        state.worldState,
        Number.isInteger(slotIdx) ? slotIdx : -1
      ));
      inventoryChanged();
      uiSound("confirm");
      save();
      render();
    },
  });
}

const POPOVER_SELECTOR =
  ".inv-context, .inv-sell-popover, .inv-take-popover, .inv-discard-popover, .shop-buy-popover, .ship-info-popover, .ship-sell-popover";

/** Close any open docked context menu or popover (and optionally return a held stack). */
export function closePanelPopovers({ returnHeld = false } = {}) {
  let closed = false;
  if (panel) {
    const open = panel.querySelectorAll(POPOVER_SELECTOR);
    if (open.length) {
      open.forEach(node => node.remove());
      closed = true;
    }
  }
  if (!closed && returnHeld && cancelHeldStack()) {
    inventoryChanged();
    save();
    if (panel && !panel.hidden) render();
    closed = true;
  }
  return closed;
}

/** Clamp a floating popover of rough `(w, h)` inside the visible scroll window of `panel`. */
function placePanelPopover(popover, x, y, w = 248, h = 175) {
  const scrollLeft = panel.scrollLeft || 0, scrollTop = panel.scrollTop || 0;
  const maxLeft = Math.max(scrollLeft, scrollLeft + (panel.clientWidth || 0) - w - 8);
  const maxTop = Math.max(scrollTop, scrollTop + (panel.clientHeight || 0) - h - 8);
  popover.style.left = `${Math.max(scrollLeft + 8, Math.min(x, maxLeft))}px`;
  popover.style.top = `${Math.max(scrollTop + 8, Math.min(y, maxTop))}px`;
}

/**
 * Position an already-mounted `popover` inside `panel` so that the centre of
 * `targetBtn` (the popup's own Buy button) lands directly over `(localX,
 * localY)` in panel scroll coordinates — matching Inventory Sell's low-travel
 * layout while staying clamped inside the visible panel bounds. Near the bottom
 * edge of the panel, flips the header row to the bottom so Buy still lands
 * straight under the cursor.
 */
function placePopoverButtonOverCursor(popover, targetBtn, localX, localY, opts = {}) {
  const scrollLeft = panel.scrollLeft || 0;
  const scrollTop = panel.scrollTop || 0;
  const panelW = panel.clientWidth || 0;
  const panelH = panel.clientHeight || 0;
  const fallbackW = opts.w || 248;
  const fallbackH = opts.h || 158;
  const defaultBtnX = opts.defaultBtnX ?? fallbackW - 34;
  const defaultBtnY = opts.defaultBtnY ?? 46;

  const measure = () => {
    const popRect = popover.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
    const btnRect = targetBtn?.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
    const popW = popRect.width > 0 && popRect.width < panelW ? popRect.width : fallbackW;
    const popH = popRect.height > 0 && popRect.height < panelH ? popRect.height : fallbackH;
    const realBtn =
      btnRect.width > 0 &&
      btnRect.height > 0 &&
      btnRect.width < popW &&
      btnRect.height < popH;
    const offX = realBtn ? btnRect.left - popRect.left + btnRect.width / 2 : defaultBtnX;
    const offY = realBtn ? btnRect.top - popRect.top + btnRect.height / 2 : defaultBtnY;
    return { popW, popH, offX, offY, realBtn };
  };

  popover.style.left = `${scrollLeft}px`;
  popover.style.top = `${scrollTop}px`;
  let m = measure();

  if (opts.allowFlipUp && panelH > 0 && localY - m.offY + m.popH > scrollTop + panelH - 4) {
    popover.classList.add("flip-up");
    m = measure();
    if (!m.realBtn) m.offY = Math.max(24, m.popH - 24);
  }

  const minLeft = scrollLeft + 4;
  const maxLeft = Math.max(minLeft, scrollLeft + panelW - m.popW - 4);
  const minTop = scrollTop + 4;
  const maxTop = Math.max(minTop, scrollTop + panelH - m.popH - 4);
  const left = Math.round(Math.max(minLeft, Math.min(localX - m.offX, maxLeft)));
  const top = Math.round(Math.max(minTop, Math.min(localY - m.offY, maxTop)));
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

/** Open the compact Shop's "Buy amount" popover with its Buy button directly over the cursor. */
function openShopBuy(button, clickEvent = null) {
  const parts = String(button.dataset.b || "").split(":");
  const [shopId, rawKind, id] = parts.length >= 3 ? parts : [parts[0], null, parts[1]];
  const kind = rawKind === "ship" || rawKind === "item" ? rawKind : null;
  const row = eco.shopList(shopId).find(r => r.id === id && (!kind || r.kind === kind));
  if (!row) return;
  const maxBuy = eco.shopMaxBuy(shopId, id, state.profile, state.worldState, row.kind);
  if (!(maxBuy > 0)) return;

  const rect = panel.getBoundingClientRect();
  const btnRect = button.getBoundingClientRect();
  const scrollLeft = panel.scrollLeft || 0, scrollTop = panel.scrollTop || 0;
  const hasPointer =
    clickEvent &&
    Number.isFinite(clickEvent.clientX) &&
    Number.isFinite(clickEvent.clientY) &&
    (clickEvent.clientX !== 0 || clickEvent.clientY !== 0);
  const cursorX = (hasPointer ? clickEvent.clientX : btnRect.left + btnRect.width / 2)
    - rect.left - (panel.clientLeft || 0) + scrollLeft;
  const cursorY = (hasPointer ? clickEvent.clientY : btnRect.top + btnRect.height / 2)
    - rect.top - (panel.clientTop || 0) + scrollTop;
  closePanelPopovers();

  const popover = document.createElement("div");
  popover.className = "inv-sell-popover shop-buy-popover";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", `Buy ${row.n}`);
  popover.dataset.shop = shopId;
  popover.dataset.kind = row.kind;
  popover.dataset.id = row.id;
  popover.dataset.price = String(row.price);
  popover.innerHTML = shopBuyHtml(row, maxBuy, 1);

  const input = popover.querySelector(".inv-sell-amount");
  const totalEl = popover.querySelector("[data-buy-total]");
  input?.addEventListener("input", () => {
    const liveMax = Math.max(1, eco.shopMaxBuy(shopId, id, state.profile, state.worldState, row.kind));
    const n = Number(input.value);
    if (totalEl && Number.isInteger(n) && n >= 1 && n <= liveMax) {
      totalEl.textContent = `${n * row.price} cr`;
    }
    const err = popover.querySelector(".inv-sell-error");
    if (err) err.textContent = "";
  });
  popover.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();
      popover.remove();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      confirmShopBuy(popover);
    }
  });

  panel.append(popover);
  const confirmBtn = popover.querySelector('button[data-a="shopBuyConfirm"]');
  placePopoverButtonOverCursor(popover, confirmBtn, cursorX, cursorY, {
    w: 248,
    h: 158,
    defaultBtnX: 214,
    defaultBtnY: 46,
    allowFlipUp: true,
  });
  if (input) {
    try { input.focus({ preventScroll: true }); } catch { input.focus?.(); }
    input.select?.();
  }
}

function confirmShopBuy(node) {
  const popover = node?.classList?.contains("shop-buy-popover")
    ? node
    : node?.closest?.(".shop-buy-popover");
  if (!popover) return;
  const { shop, kind, id } = popover.dataset;
  const maxBuy = eco.shopMaxBuy(shop, id, state.profile, state.worldState, kind || null);
  const input = popover.querySelector(".inv-sell-amount");
  const amount = Number(input?.value);
  if (!(maxBuy > 0)) {
    popover.remove();
    render();
    return;
  }
  if (!Number.isInteger(amount) || amount < 1 || amount > maxBuy) {
    const error = popover.querySelector(".inv-sell-error");
    if (error) error.textContent = `Enter a whole number from 1 to ${maxBuy}.`;
    input?.focus?.();
    return;
  }
  const text = eco.buyItem(shop, id, amount, state.player, state.profile, state.worldState, kind || null);
  if (text) toast(text);
  inventoryChanged();
  uiSound("confirm");
  save();
  render();
}

/** Open the right-click Ship details card for a ship in the Shop, Outfitting, or Hangar. */
function openShipDetails(shipType, clientX, clientY, localPos = null) {
  const html = shipDetailsHtml(shipType);
  if (!html) return false;
  const stats = eco.shipBaseStats(shipType);
  const rect = localPos ? null : panel.getBoundingClientRect();
  closePanelPopovers();

  const popover = document.createElement("div");
  popover.className = "inv-sell-popover ship-info-popover";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", `${stats.name} details`);
  popover.dataset.shipType = stats.type;
  popover.innerHTML = html;

  const x = localPos ? localPos.left : clientX - rect.left + (panel.scrollLeft || 0) + 6;
  const y = localPos ? localPos.top : clientY - rect.top + (panel.scrollTop || 0) + 6;
  placePanelPopover(popover, x, y, 256, 195);

  popover.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();
      popover.remove();
    }
  });

  panel.append(popover);
  uiSound();
  return true;
}

/** Open the Hangar stored-ship right-click menu: Show info, Fly ship, Sell. */
function openHangarShipContext(row, clientX, clientY) {
  const shipId = row.dataset.hangarShip;
  if (!shipId) return false;
  closePanelPopovers();

  const menu = document.createElement("div");
  menu.className = "inv-context hangar-context";
  menu.setAttribute("role", "menu");

  const info = document.createElement("button");
  info.type = "button";
  info.dataset.a = "hangarInfo";
  info.dataset.b = shipId;
  info.setAttribute("role", "menuitem");
  info.textContent = "Show info";
  menu.append(info);

  const fly = document.createElement("button");
  fly.type = "button";
  fly.dataset.a = "hangarFly";
  fly.dataset.b = shipId;
  fly.setAttribute("role", "menuitem");
  fly.textContent = "Fly ship";
  if (shipId === state.profile.ship) {
    fly.disabled = true;
    fly.title = "Already flying this ship.";
  }
  menu.append(fly);

  const sellCheck = eco.canSellShip(shipId);
  const sell = document.createElement("button");
  sell.type = "button";
  sell.dataset.a = "hangarSellOpen";
  sell.dataset.b = shipId;
  sell.setAttribute("role", "menuitem");
  sell.textContent = "Sell";
  if (!sellCheck.ok) {
    sell.disabled = true;
    sell.title = sellCheck.reason;
  } else {
    sell.title = `Sell ${sellCheck.label} for ${sellCheck.price} cr.`;
  }
  menu.append(sell);

  const rect = panel.getBoundingClientRect();
  const scrollLeft = panel.scrollLeft || 0, scrollTop = panel.scrollTop || 0;
  const x = Math.min(scrollLeft + (panel.clientWidth || 0) - 136, Math.max(scrollLeft, clientX - rect.left + scrollLeft));
  const y = Math.min(scrollTop + (panel.clientHeight || 0) - 104, Math.max(scrollTop, clientY - rect.top + scrollTop));
  menu.dataset.anchorLeft = String(x);
  menu.dataset.anchorTop = String(y);
  menu.dataset.anchorWidth = "0";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  panel.append(menu);
  return true;
}

/** Open the confirmation popover before permanently selling a stored ship. */
function openHangarShipSell(button) {
  const shipId = button.dataset.b;
  const check = eco.canSellShip(shipId);
  if (!check.ok) {
    closePanelPopovers();
    if (check.reason) toast(check.reason);
    return;
  }
  const anchor = popoverAnchorFor(panel, button);
  closePanelPopovers();

  const popover = document.createElement("div");
  popover.className = "inv-sell-popover ship-sell-popover";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", `Sell ${check.label}`);
  popover.dataset.shipId = shipId;
  popover.innerHTML = shipSellConfirmHtml(check);
  placePanelPopover(popover, anchor.left, anchor.top, 248, 145);

  popover.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();
      popover.remove();
    } else if (event.key === "Enter") {
      event.stopPropagation();
      event.preventDefault();
      confirmHangarShipSell(popover);
    }
  });

  panel.append(popover);
  popover.querySelector('button[data-a="shipSellConfirm"]')?.focus?.();
}

function confirmHangarShipSell(target) {
  const popover = target.classList?.contains("ship-sell-popover")
    ? target
    : target.closest(".ship-sell-popover");
  if (!popover) return;
  const shipId = popover.dataset.shipId;
  closePanelPopovers();
  const text = eco.sellShip(shipId);
  if (text) toast(text);
  inventoryChanged();
  uiSound("confirm");
  save();
  render();
}

function onInventoryContextMenu(e) {
  // While holding a stack, right-clicking ANY slot places 1 item into it (Minecraft style).
  const slotBtn = e.target.closest("button[data-a='invSlot']");
  if (slotBtn && hasHeldStack()) {
    e.preventDefault();
    closePanelPopovers();
    const res = rightClickInventorySlot({
      where: slotBtn.dataset.where,
      slot: Number(slotBtn.dataset.slot),
      clientX: e.clientX,
      clientY: e.clientY,
    });
    if (res?.message) toast(res.message);
    if (res?.changed) {
      inventoryChanged();
      uiSound("click");
      save();
      render();
    }
    return;
  }

  if (hasHeldStack()) {
    e.preventDefault();
    return;
  }

  const tile = e.target.closest("button.inv-item[data-kind]");
  if (!tile) {
    const hangarRow = e.target.closest("[data-hangar-ship]");
    if (hangarRow && hangarRow.dataset.hangarShip) {
      e.preventDefault();
      openHangarShipContext(hangarRow, e.clientX, e.clientY);
      return;
    }
    const shipEl = e.target.closest("[data-ship-type]");
    if (shipEl && shipEl.dataset.shipType) {
      e.preventDefault();
      openShipDetails(shipEl.dataset.shipType, e.clientX, e.clientY);
    }
    return;
  }
  e.preventDefault();
  closePanelPopovers();

  const menu = document.createElement("div");
  menu.className = "inv-context";
  menu.setAttribute("role", "menu");

  const take = document.createElement("button");
  take.type = "button";
  take.dataset.a = "invTakeOpen";
  take.dataset.b = tile.dataset.id;
  take.dataset.where = tile.dataset.where || "";
  take.dataset.slot = tile.dataset.slot || "0";
  take.setAttribute("role", "menuitem");
  take.textContent = "Take amount";
  take.title = "Pick up a chosen number of items onto the cursor.";
  menu.append(take);

  const sell = document.createElement("button");
  sell.type = "button";
  sell.dataset.a = "invSellOpen";
  sell.dataset.b = `${tile.dataset.kind}:${tile.dataset.id}:${tile.dataset.dir}:${tile.dataset.count}`;
  sell.dataset.slot = tile.dataset.slot || "0";
  sell.setAttribute("role", "menuitem");
  sell.textContent = "Sell";
  // Goods and spare modules both have a sell value, so both can be sold here; a
  // part fitted in a bay is in no place and never gets a tile.
  if (!canSell(tile.dataset.id)) {
    sell.disabled = true;
    sell.title = "This cannot be sold.";
  }
  menu.append(sell);

  // Discard trashes from the clicked stack, here and in flight (ui/cargo.js).
  const discard = document.createElement("button");
  discard.type = "button";
  discard.dataset.a = "discard";
  discard.dataset.b = tile.dataset.id;
  discard.dataset.where = tile.dataset.where || "";
  discard.dataset.slot = tile.dataset.slot || "0";
  discard.setAttribute("role", "menuitem");
  discard.textContent = `Discard \u00d7${tile.dataset.count}`;
  if (!canDiscard(tile.dataset.id)) {
    discard.disabled = true;
    discard.title = "A mission item: hand it in, do not trash it.";
  } else {
    discard.title = "Throw this stack away. It cannot be recovered.";
  }
  menu.append(discard);

  const rect = panel.getBoundingClientRect();
  const x = Math.min(panel.scrollLeft + panel.clientWidth - 136, Math.max(panel.scrollLeft, e.clientX - rect.left + panel.scrollLeft));
  const y = Math.min(panel.scrollTop + panel.clientHeight - 104, Math.max(panel.scrollTop, e.clientY - rect.top + panel.scrollTop));
  menu.dataset.anchorLeft = String(x);
  menu.dataset.anchorTop = String(y);
  menu.dataset.anchorWidth = "0";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  panel.append(menu);
}

function onDblClick(e) {
  const hangarRow = e.target.closest("[data-hangar-ship]");
  if (!hangarRow || !hangarRow.dataset.hangarShip) return;
  const shipId = hangarRow.dataset.hangarShip;
  closePanelPopovers();
  if (shipId === state.profile.ship) return;
  ACTIONS.sel(shipId);
  uiSound("click");
  save();
  render();
}

async function onClick(e) {
  const btn = e.target.closest("button[data-a]");
  if (!btn) {
    if (e.target.closest(".inv-sell-popover") || e.target.closest(".inv-take-popover") || e.target.closest(".inv-discard-popover")) return;
    closePanelPopovers();
    return;
  }
  if (btn.disabled) return;
  const name = btn.dataset.a;
  if (name === "intro" && beforeStart) {
    if (starting) return;
    starting = true;
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = "Loading models…";
    initAudio(); // retain the user gesture before awaiting background work
    try {
      await beforeStart();
    } catch (err) {
      showNotice(`Could not prepare models. Please try again. ${err.message || err}`);
      return;
    } finally {
      starting = false;
      btn.disabled = false;
      btn.textContent = label;
    }
  }
  if (name === "wb") {
    openShopBuy(btn, e);
    uiSound();
    return;
  }
  if (name === "shopBuyConfirm") {
    confirmShopBuy(btn);
    return;
  }
  if (name === "shopBuyCancel" || name === "shipInfoClose" || name === "shipSellCancel") {
    closePanelPopovers();
    return;
  }
  if (name === "hangarInfo") {
    const ctx = btn.closest(".inv-context");
    const localPos = ctx
      ? { left: Number(ctx.dataset.anchorLeft || 0), top: Number(ctx.dataset.anchorTop || 0) }
      : null;
    openShipDetails(btn.dataset.b, 0, 0, localPos);
    return;
  }
  if (name === "hangarFly") {
    closePanelPopovers();
    ACTIONS.sel(btn.dataset.b);
    uiSound("click");
    save();
    render();
    return;
  }
  if (name === "hangarSellOpen") {
    openHangarShipSell(btn);
    uiSound();
    return;
  }
  if (name === "shipSellConfirm") {
    confirmHangarShipSell(btn);
    return;
  }
  if (name === "shopGroup") {
    closePanelPopovers();
    ACTIONS.shopGroup(btn.dataset.b);
    uiSound("click");
    render();
    return;
  }
  if (name === "invSlot") {
    closePanelPopovers();
    const where = btn.dataset.where;
    const ship = viewedShip();
    const otherWhere = where === inv.STATION ? ship : inv.STATION;
    const res = clickInventorySlot({
      where,
      slot: Number(btn.dataset.slot),
      otherWhere,
      shiftKey: Boolean(e.shiftKey),
      clientX: e.clientX,
      clientY: e.clientY,
    });
    if (res.message) toast(res.message);
    if (res.changed) {
      if (!res.picked) inventoryChanged();
      uiSound("click");
      save();
      render();
    }
    return;
  }
  if (name === "invTakeOpen") {
    openInventoryTakeAmount(btn);
    uiSound();
    return;
  }
  if (name === "invSellOpen") {
    openInventorySell(btn);
    uiSound();
    return;
  }
  if (name === "discard") {
    openInventoryDiscard(btn);
    uiSound();
    return;
  }
  if (name === "invSellCancel") {
    closePanelPopovers();
    return;
  }
  if (name === "invSellConfirm") {
    confirmInventorySell(btn);
    return;
  }
  const fn = ACTIONS[name];
  if (!fn) return;

  let arg = btn.dataset.b;
  // Inventory tile: a normal click moves one, Shift-click moves the whole stack.
  if (name === "mv" && e.shiftKey) arg = String(arg || "").replace(/:[^:]+$/, ":all");
  fn(arg);
  uiSound(name === "go" ? "go" : ["buy", "up", "done", "sellh", "sells", "wb", "wr", "rp"].includes(name) ? "confirm" : "click");
  save();
  if (name !== "go") {
    if (!state.player || state.player.docked) render();
    else panel.hidden = true;   // the action put the pilot back out in space
  }
}
