// The outpost panel: renders the current screen and runs the actions behind
// its buttons. Buttons carry a data-a action name and an optional data-b argument.

import { on } from "../util/events.js";
import { initAudio, uiSound, hoverSound } from "../core/audio.js";
import { state } from "../state/state.js";
import { saveAutosave, readSlot, writeSlot, deleteSlot, decodeSave, encodeSave } from "../state/storage.js";
import { newProfile, sanitizeProfile } from "../state/profile.js";
import { setShip } from "../sim/player.js";
import { launch } from "../sim/session.js";
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
import { introHtml, outpostHtml, viewedShip } from "./screens.js";
import { mountOutfitting } from "./outfitting.js";

const $ = id => document.getElementById(id);
let panel;

export function setupMenu() {
  panel = $("panel");
  panel.addEventListener("click", onClick);
  panel.addEventListener("contextmenu", onInventoryContextMenu);
  panel.addEventListener("mouseover", e => {
    if (e.target.closest("button:not(:disabled)")) hoverSound();
  });

  on("docked", () => {
    state.ui.toast = "";
    render();
  });
  on("launched", () => (panel.hidden = true));
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
  saveAutosave(state.profile);
}

function toast(text) {
  state.ui.toast = text;
}

const ACTIONS = {
  intro() {
    state.ui.intro = false;
    state.ui.tab = "m";
    initAudio();
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
  drop() {
    contracts.abandonContract();
  },
  done() {
    toast(contracts.completeContract());
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

  // Shop
  wb(k) {
    const msgText = eco.buyWeapon(k);
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
    // data-b is "kind:id:dir:n": kind c = ore, m = module; dir s = station to the
    // ship shown, t = from it to the station; n = a count or "all".
    const [kind, id, dir, n] = String(arg || "").split(":");
    const ship = viewedShip();
    const [from, to] = dir === "s" ? [inv.STATION, ship] : [ship, inv.STATION];
    const count = n === "all" ? Infinity : Math.max(1, +n || 1);
    state.ui.toast = "";
    if (kind === "c") inv.moveCargo(from, to, id, count);
    else inv.moveModule(from, to, id, count);
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
    eco.sellHold();
  },
  sells() {
    eco.sellStored();
  },
  up(mod) {
    eco.upgradeBase(mod);
  },

  // Saves
  sv(i) {
    toast(writeSlot(+i, state.profile) ? "Saved to slot " + i : "Could not save in this browser.");
  },
  ld(i) {
    const raw = readSlot(+i);
    if (!raw) return;
    try {
      state.profile = sanitizeProfile(raw);
    } catch (e) {
      toast("That slot could not be read.");
      return;
    }
    afterProfileChange();
    toast("Loaded slot " + i);
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
    state.profile = newProfile();
    afterProfileChange();
    state.ui.confirmReset = false;
    toast("Progress reset.");
  },
  xp() {
    state.ui.xcode = encodeSave(state.profile);
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
    try {
      state.profile = decodeSave(text);
      state.ui.xcode = "";
      afterProfileChange();
      toast("Save imported.");
    } catch (e) {
      toast("That code is not a valid save.");
    }
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

/** Common work after the whole profile is replaced (load, import, reset). */
function afterProfileChange() {
  setShip(state.profile.ship);
  refillPower();
  refreshDrive();
  refreshShield();
  refreshHull();
  refreshGuns();
  state.ui.fit = null;
  state.ui.invShip = null;
  contracts.rerollBoard();
  state.flight.lock = null;
  state.flight.missileLock = { target: null, t: 0, locked: false };
}

function openInventorySell(button) {
  const [kind, id, dir, stack] = String(button.dataset.b || "").split(":");
  if (kind !== "c") return;
  const source = dir === "s" ? inv.STATION : viewedShip();
  const available = source === inv.STATION ? state.profile.store[id] : inv.cargoOf(source)[id];
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
  popover.setAttribute("aria-label", "Sell cargo");
  popover.dataset.source = `${kind}:${id}:${dir}`;
  popover.innerHTML =
    `<strong>Sell cargo</strong>` +
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
  const cargo = source === inv.STATION ? state.profile.store : inv.cargoOf(source);
  const available = cargo[id] || 0;
  const input = popover.querySelector(".inv-sell-amount");
  const amount = Number(input.value);
  if (kind !== "c" || !Number.isInteger(amount) || amount < 1 || amount > available) {
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
  if (tile.dataset.kind !== "c") {
    sell.disabled = true;
    sell.title = "Modules cannot be sold; only cargo has a sell value.";
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
  if (name !== "go") render();
}
