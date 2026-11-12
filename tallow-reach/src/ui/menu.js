// The outpost panel: renders the current screen and runs the actions behind
// its buttons. Buttons carry a data-a action name and an optional data-b argument.

import { on, emit } from "../util/events.js";
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
import { canSell, itemName } from "../data/items.js";
import { storyMission } from "../data/missions/index.js";
import { introHtml, outpostHtml, viewedShip } from "./screens.js";
import { mountOutfitting } from "./outfitting.js";
import { closeStarmap } from "./starmap.js";

const $ = id => document.getElementById(id);
let panel;

export function setupMenu() {
  panel = $("panel");
  panel.addEventListener("click", onClick);
  panel.addEventListener("contextmenu", onInventoryContextMenu);
  panel.addEventListener("mouseover", e => {
    if (e.target.closest("button:not(:disabled)")) hoverSound();
  });

  // While the start screen is up it owns the panel: booting a save prepares the
  // ship (docked or flying) but must not replace or hide the start screen.
  on("docked", ({ player } = {}) => {
    if (player && player !== state.player) return;
    if (state.ui.intro) return;
    state.ui.toast = "";
    render();
  });
  on("launched", ({ player } = {}) => {
    if (player && player !== state.player) return;
    if (state.ui.intro) return;
    panel.hidden = true;
  });
  on("died", text => {
    state.ui.toast = text;
    state.ui.tab = "h";
    render();
  });

  contracts.ensureBoard();
  render();
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

function toast(text) {
  state.ui.toast = text;
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
  // "Enter game": leave the start screen and deploy the pilot where the save put
  // them — docked at a station, or flying at that pocket's arrival point.
  intro() {
    state.ui.intro = false;
    state.ui.tab = "m";
    initAudio();
    resumeFromSave();
    emit("mission-ui-refresh", {});
    const notice = recoveryNotice();
    if (notice) {
      state.ui.toast = notice;
      render();
    }
  },
  tab(name) {
    state.ui.tab = name;
    state.ui.toast = "";
    state.ui.confirmReset = false;
    state.ui.fit = null;
  },
  go() {
    state.ui.fit = null;
    launch();
  },

  // Contracts
  acc(i) {
    toast(contracts.acceptContract(+i));
  },
  ref() {
    contracts.rerollBoard();
  },
  drop(i) {
    // Abandon used to be silent; keep that contract-board behavior while the
    // generic runner removes the selected active mission.
    contracts.abandonContract(i === undefined ? undefined : +i);
  },
  done(i) {
    toast(contracts.completeContract(i === undefined ? undefined : +i));
  },
  story(id) {
    const definition = storyMission(id);
    if (!definition) {
      toast("That story mission is not available.");
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
  },
  buy(id) {
    eco.buyShip(id);
  },
  rp(id) {
    const msgText = eco.repairShip(id);
    if (msgText) toast(msgText);
  },

  // Shop. data-b is "shopId:itemId" — the shop is data (data/shops.js), so the
  // same action serves every counter.
  wb(arg) {
    const [shop, id] = String(arg || "").split(":");
    const msgText = eco.buyItem(shop, id);
    if (msgText) toast(msgText);
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

  // Inventory: step through the ships' holds (this only changes which hold is shown,
  // not which ship you fly), and move things between the station and that hold.
  invPrev() {
    cycleInvShip(-1);
  },
  invNext() {
    cycleInvShip(1);
  },
  mv(arg) {
    // data-b is "kind:id:dir:n": dir s = station to the ship shown, t = from it to
    // the station; n = a count or "all". The kind is only what the tile shows
    // (ORE / MOD) — the item catalogue says what the thing is, so one move
    // handles goods and parts alike.
    const [, id, dir, n] = String(arg || "").split(":");
    const ship = viewedShip();
    const [from, to] = dir === "s" ? [inv.STATION, ship] : [ship, inv.STATION];
    const count = n === "all" ? Infinity : Math.max(1, +n || 1);
    state.ui.toast = "";
    inv.moveItem(from, to, id, count);
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
  },
  unfit() {
    const open = state.ui.fit;
    if (!open || open.kind !== "module") return;
    const text = fitting.unequip(open.g, open.i);
    if (text) toast(text);
  },

  // Base
  dep() {
    toast(eco.storeHold());
  },
  wd() {
    eco.withdrawStored();
  },
  sellh() {
    toast(eco.sellHold());
  },
  sells() {
    toast(eco.sellStored());
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

/** Step the flown ship through the hangar. The arrows do nothing with one ship. */
function cycleShip(dir) {
  const S = state.profile,
    owned = S.ships;
  if (!owned || owned.length < 2) return;
  const i = owned.indexOf(S.ship);
  const next = owned[(Math.max(0, i) + dir + owned.length) % owned.length];
  const msgText = eco.selectShip(next);
  if (msgText) toast(msgText);
}

/** Step the Inventory tab through the hangar's ships without changing the ship being flown. */
function cycleInvShip(dir) {
  const owned = state.profile.ships;
  if (!owned || owned.length < 2) return;
  const i = owned.indexOf(viewedShip());
  state.ui.invShip = owned[(Math.max(0, i) + dir + owned.length) % owned.length];
}

/** Common work after the whole save is replaced (load, import, reset). */
function afterSaveChange() {
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
  contracts.ensureBoard();
  state.flight.lock = null;
  state.flight.missileLock = { target: null, t: 0, locked: false };
  resumeFromSave();
}

function openInventorySell(button) {
  const [kind, id, dir, stack] = String(button.dataset.b || "").split(":");
  if (!canSell(id)) return;
  const source = dir === "s" ? inv.STATION : viewedShip();
  const available = inv.countOf(source, id);
  if (!(available > 0)) return;

  const context = button.closest(".inv-context");
  const anchor = {
    left: Number(context?.dataset.anchorLeft || 0),
    top: Number(context?.dataset.anchorTop || 0),
    width: Number(context?.dataset.anchorWidth || 0),
  };
  panel.querySelector(".inv-context")?.remove();
  panel.querySelector(".inv-sell-popover")?.remove();

  const popover = document.createElement("div");
  popover.className = "inv-sell-popover";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", "Sell item");
  popover.dataset.source = `${kind}:${id}:${dir}`;
  popover.innerHTML =
    `<strong>Sell ${itemName(id)}</strong>` +
    `<label>Amount <span>(1–${available})</span><input class="inv-sell-amount" type="number" min="1" max="${available}" step="1" value="${stack || available}"></label>` +
    `<div class="inv-sell-error" aria-live="polite"></div>` +
    `<div class="inv-sell-actions"><button type="button" data-a="invSellConfirm">Sell</button><button type="button" data-a="invSellCancel">Cancel</button></div>`;

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
  const text = eco.sellInventoryItem(id, source, amount);
  if (text) toast(text);
  uiSound("confirm");
  save();
  render();
}

function onInventoryContextMenu(e) {
  const tile = e.target.closest("button.inv-item[data-kind]");
  if (!tile) return;
  e.preventDefault();
  panel.querySelector(".inv-context")?.remove();
  panel.querySelector(".inv-sell-popover")?.remove();

  const menu = document.createElement("div");
  menu.className = "inv-context";
  menu.setAttribute("role", "menu");
  const sell = document.createElement("button");
  sell.type = "button";
  sell.dataset.a = "invSellOpen";
  sell.dataset.b = `${tile.dataset.kind}:${tile.dataset.id}:${tile.dataset.dir}:${tile.dataset.count}`;
  sell.setAttribute("role", "menuitem");
  sell.textContent = "Sell";
  // Goods and spare modules both have a sell value, so both can be sold here; a
  // part fitted in a bay is in no place and never gets a tile.
  if (!canSell(tile.dataset.id)) {
    sell.disabled = true;
    sell.title = "This cannot be sold.";
  }
  menu.append(sell);

  const rect = panel.getBoundingClientRect();
  const tileRect = tile.getBoundingClientRect();
  menu.dataset.anchorLeft = String(tileRect.left - rect.left + panel.scrollLeft);
  menu.dataset.anchorTop = String(tileRect.top - rect.top + panel.scrollTop);
  menu.dataset.anchorWidth = String(tileRect.width);
  const x = Math.min(panel.scrollLeft + panel.clientWidth - 132, Math.max(panel.scrollLeft, e.clientX - rect.left + panel.scrollLeft));
  const y = Math.min(panel.scrollTop + panel.clientHeight - 44, Math.max(panel.scrollTop, e.clientY - rect.top + panel.scrollTop));
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  panel.append(menu);
}

function onClick(e) {
  const btn = e.target.closest("button[data-a]");
  if (!btn) {
    if (e.target.closest(".inv-sell-popover")) return;
    panel.querySelector(".inv-context")?.remove();
    panel.querySelector(".inv-sell-popover")?.remove();
    return;
  }
  if (btn.disabled) return;
  const name = btn.dataset.a;
  if (name === "invSellOpen") {
    openInventorySell(btn);
    uiSound();
    return;
  }
  if (name === "invSellCancel") {
    panel.querySelector(".inv-context")?.remove();
    panel.querySelector(".inv-sell-popover")?.remove();
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
