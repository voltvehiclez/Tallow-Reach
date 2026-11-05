// The outpost panel: renders the current screen and runs the actions behind
// its buttons. Buttons carry a data-a action name and an optional data-b argument.

import { on } from "../util/events.js";
import { initAudio, uiSound, hoverSound } from "../core/audio.js";
import { state } from "../state/state.js";
import { saveAutosave, readSlot, writeSlot, deleteSlot, decodeSave, encodeSave } from "../state/storage.js";
import { newProfile, sanitizeProfile } from "../state/profile.js";
import { setShip } from "../sim/player.js";
import { launch } from "../sim/session.js";
import * as eco from "../sim/economy.js";
import * as contracts from "../sim/contracts.js";
import { introHtml, outpostHtml } from "./screens.js";

const $ = id => document.getElementById(id);
let panel;

export function setupMenu() {
  panel = $("panel");
  panel.addEventListener("click", onClick);
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
  panel.innerHTML = state.ui.intro ? introHtml() : outpostHtml(state.ui);
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
  },
  go() {
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

/** Common work after the whole profile is replaced (load, import, reset). */
function afterProfileChange() {
  setShip(state.profile.ship);
  contracts.rerollBoard();
  state.flight.lock = null;
  state.flight.missileLock = { target: null, t: 0, locked: false };
}

function onClick(e) {
  const btn = e.target.closest("button[data-a]");
  if (!btn || btn.disabled) return;
  const name = btn.dataset.a;
  const fn = ACTIONS[name];
  if (!fn) return;

  fn(btn.dataset.b);
  uiSound(name === "go" ? "go" : ["buy", "up", "done", "sellh", "sells", "wb", "wr", "rp"].includes(name) ? "confirm" : "click");
  save();
  if (name !== "go") render();
}
