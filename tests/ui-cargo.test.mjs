// The flight inventory: press I in space and the ship's own hold opens in the
// same tile layout as the station Inventory tab, in a wider read-only card.
// Docked, the key switches the station panel to its Inventory tab instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../src/state/state.js";
import { newProfile } from "../src/state/profile.js";
import { addItem, countOf } from "../src/sim/inventory.js";
import { shownNotice, hideNotice } from "../src/ui/notice.js";
import { cargoHtml, outpostHtml } from "../src/ui/screens.js";
import { canOpenCargo, setupCargo, openCargo, closeCargo, isCargoOpen, toggleCargo } from "../src/ui/cargo.js";
import { isSimulationPaused } from "../src/sim/step.js";
import { BINDINGS } from "../src/core/input.js";

function makeElement(tag = "div") {
  const node = {
    tagName: tag.toUpperCase(), id: "", hidden: false, innerHTML: "", textContent: "",
    className: "", disabled: false, dataset: {}, style: {}, scrollLeft: 0, scrollTop: 0,
    children: [], handlers: {}, attrs: {},
    append(...kids) { for (const kid of kids) this.appendChild(kid); },
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return this.attrs[name] ?? null; },
    addEventListener(name, fn) { this.handlers[name] = fn; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 880, height: 500 }; },
    classList: { add() {}, remove() {}, toggle() {} },
    closest() { return null; },
    querySelectorAll() { return []; },
    remove() {
      const parent = this.parentNode;
      if (parent) parent.children = parent.children.filter(kid => kid !== this);
      this.parentNode = null;
    },
  };
  // Named parts get their own node; anything else is a memoised stand-in, so a
  // popover's input, error line and buttons can be driven from the test.
  const parts = { "#cargo-body": "body", ".cargo-card": "card" };
  const found = {};
  node.querySelector = selector => {
    const key = parts[selector];
    if (key) {
      if (!node[key]) {
        node[key] = makeElement("div");
        node[key].parentNode = node;
      }
      return node[key];
    }
    if (selector.startsWith(".")) {
      const live = node.children.find(child => child.className === selector.slice(1));
      if (live) return live;
    }
    if (!found[selector]) {
      found[selector] = makeElement(selector.startsWith("button") || selector.includes("discard") ? "button" : "div");
      found[selector].value = "";
      found[selector].parentNode = node;
    }
    return found[selector];
  };
  return node;
}

function installDom() {
  globalThis.document = { body: makeElement("body"), createElement: makeElement };
}

const player = (over = {}) => ({ docked: false, dead: false, warp: null, loading: false, place: "reach", ...over });

test("I is the flight inventory key", () => {
  assert.equal(BINDINGS.KeyI, "cargo", "I opens the ship inventory");
});

test("the flight card uses the station Inventory layout, read-only", () => {
  const previous = state.profile;
  try {
    const profile = newProfile();
    state.profile = profile;
    addItem(profile.ship, "ferrite", 3, profile, state.worldState);
    const html = cargoHtml(profile);
    assert.match(html, /Ship inventory/, "it says what it is");
    assert.match(html, /Wasp hold/, "it names the ship whose hold this is");
    assert.match(html, /inv-col/, "same column markup as the station tab");
    assert.match(html, /inv-grid/, "same tile grid");
    assert.match(html, /Ferrite/);
    assert.match(html, /&times;3/, "with the quantity on the tile");
    assert.match(html, /m³/, "and the hold's capacity");
    assert.match(html, /inv-item-read/, "the tiles are labels, not move buttons");
    // 7 across and 5 rows down: 35 slots, whatever the hold actually contains.
    const slots = html.match(/<div class="inv-item inv-item-read"|<div class="inv-empty-slot"/g) || [];
    assert.equal(slots.length, 35, "the flight card keeps a 7×5 slot field");
    assert.doesNotMatch(html, /data-a="mv"/, "nothing can be moved in flight");
    assert.doesNotMatch(html, /data-a="sell|data-a="invSell/, "and nothing can be sold");

    // The docked Inventory tab keeps its move buttons: only the flight view is read-only.
    profile.holds[profile.ship].ferrite = 3;
    const station = outpostHtml({ tab: "i" });
    assert.match(station, /data-a="mv"/, "the station Inventory tab still moves cargo");
    assert.match(station, /inv-item/, "…with the same tiles");
  } finally {
    state.profile = previous;
  }
});

test("the flight inventory opens in space and nowhere else", () => {
  const previous = { intro: state.ui.intro, cargo: state.ui.cargo, starmap: state.ui.starmap, paused: state.paused, warp: state.warp };
  try {
    state.ui.intro = false;
    state.ui.cargo = null;
    state.ui.starmap = null;
    state.paused = false;
    state.warp = null;
    assert.equal(canOpenCargo(player()), true, "in flight");
    assert.equal(canOpenCargo(player({ docked: true })), false, "a docked pilot uses the station panel");
    assert.equal(canOpenCargo(player({ dead: true })), false, "not while dead");
    assert.equal(canOpenCargo(player({ warp: {} })), false, "not mid-warp");
    assert.equal(canOpenCargo(player(), { ...state.ui, intro: true }), false, "not on the title screen");
    assert.equal(canOpenCargo(player(), { ...state.ui, starmap: { selected: "x" } }), false, "not over the chart");
    state.paused = true;
    assert.equal(canOpenCargo(player()), false, "not with the pause card up");
    state.paused = false;
    state.warp = { t: 1 };
    assert.equal(canOpenCargo(player()), false, "not while the drive is winding up");
  } finally {
    state.ui.intro = previous.intro;
    state.ui.cargo = previous.cargo;
    state.ui.starmap = previous.starmap;
    state.paused = previous.paused;
    state.warp = previous.warp;
  }
});

test("opening the hold releases flight input but leaves the world running", () => {
  installDom();
  setupCargo();
  const previous = {
    intro: state.ui.intro, cargo: state.ui.cargo, paused: state.paused,
    multiplayer: state.multiplayer, players: state.players, localPlayerIndex: state.localPlayerIndex,
  };
  try {
    state.ui.intro = false;
    state.ui.cargo = null;
    state.paused = false;
    state.multiplayer = false;
    // The local pilot, flying: openCargo reads the real player record.
    state.players = [player({
      controls: {
        thrust: 0, strafe: 0, lift: 0, roll: 0, stop: false, brake: false,
        boost: false, fire: false, sec: false, steer: { x: 0, y: 0 },
      },
    })];
    state.localPlayerIndex = 0;
    assert.equal(isSimulationPaused(), false, "flying normally");
    assert.equal(openCargo(), true, "it opens");
    assert.equal(isCargoOpen(), true);
    assert.equal(state.ui.cargo.open, true, "the ui knows, so the flight keys stay released");
    assert.equal(isSimulationPaused(), false, "the world keeps running while the hold is open");
    assert.equal(state.players[0].controls.thrust, 0, "and no held key keeps thrusting");

    assert.equal(toggleCargo(), true, "I again closes it");
    assert.equal(isCargoOpen(), false);
    assert.equal(isSimulationPaused(), false, "the flight is the same one the pilot left");

    openCargo();
    state.multiplayer = true;
    assert.equal(isSimulationPaused(), false, "a hosted world never pauses for one pilot's menu");
    closeCargo();
    assert.equal(closeCargo(), false, "closing twice is harmless");
  } finally {
    state.ui.intro = previous.intro;
    state.ui.cargo = previous.cargo;
    state.paused = previous.paused;
    state.multiplayer = previous.multiplayer;
    state.players = previous.players;
    state.localPlayerIndex = previous.localPlayerIndex;
  }
});

test("right-click Discard asks how many, then asks for sure, then trashes", () => {
  installDom();
  setupCargo();
  const previous = {
    intro: state.ui.intro, cargo: state.ui.cargo, paused: state.paused,
    players: state.players, localPlayerIndex: state.localPlayerIndex, profile: state.profile,
  };
  try {
    state.ui.intro = false;
    state.ui.cargo = null;
    state.paused = false;
    state.players = [player({
      controls: {
        thrust: 0, strafe: 0, lift: 0, roll: 0, stop: false, brake: false,
        boost: false, fire: false, sec: false, steer: { x: 0, y: 0 },
      },
    })];
    state.localPlayerIndex = 0;

    const profile = newProfile();
    state.profile = profile;
    addItem(profile.ship, "ferrite", 3, profile, state.worldState);
    assert.equal(openCargo(), true);
    const root = document.body.children.find(node => node.id === "cargo");
    const card = root.querySelector(".cargo-card");
    const cardMenu = () => card.children.find(child => child.className === "inv-context");
    const cardPopover = () => card.children.find(child => child.className === "inv-discard-popover");

    const rightClick = tile => root.handlers.contextmenu({
      target: tile, clientX: 30, clientY: 40, preventDefault() {},
    });
    const tile = (kind, id, count, where) => {
      const node = makeElement("div");
      Object.assign(node.dataset, { kind, id, count, where });
      node.closest = selector => (selector === "[data-kind][data-where]" ? node : null);
      return node;
    };
    // Click `action`'s button, and — when asked — carry on bubbling to the host,
    // exactly as the browser does unless the popover stops the event.
    const press = (host, action, node = makeElement("button"), bubbleTo = null) => {
      const button = node;
      button.dataset.a = action;
      // Only the selectors this button really answers — a detached step-one button
      // must not match the menu entry's name, and no longer sits in the popover.
      button.closest = selector =>
        selector === "button[data-a]" || selector === `[data-a='${button.dataset.a}']` ? button : null;
      const event = {
        target: button,
        stopped: false,
        preventDefault() {},
        stopPropagation() { this.stopped = true; },
      };
      host.handlers.click(event);
      if (bubbleTo && !event.stopped) bubbleTo.handlers.click(event);
      return event;
    };

    // 1. The context menu offers the stack, and nothing else.
    rightClick(tile("c", "ferrite", "3", profile.ship));
    const entry = cardMenu().children[0];
    assert.equal(entry.textContent, "Discard \u00d73");
    assert.equal(entry.dataset.a, "cargoDiscard");
    assert.equal(entry.dataset.where, profile.ship);

    // 2. Taking it opens the amount box, filled with the whole stack.
    press(root, "cargoDiscard", entry);
    const popover = cardPopover();
    assert.ok(popover, "a popover opens beside the tile");
    assert.match(popover.innerHTML, /Discard Ferrite/);
    assert.match(popover.innerHTML, /max="3"[^>]*value="3"/, "the count box holds the whole stack");
    assert.equal(countOf(profile.ship, "ferrite", profile, state.worldState), 3, "nothing is trashed yet");

    // 3. A bad count is refused with the sell box's wording.
    popover.querySelector(".inv-sell-amount").value = "9";
    press(popover, "discardAsk", undefined, root);
    assert.equal(popover.querySelector(".inv-sell-error").textContent, "Enter a whole number from 1 to 3.");
    assert.equal(countOf(profile.ship, "ferrite", profile, state.worldState), 3);

    // 4. A good count goes to the question — still nothing trashed. This is the
    // click that used to close the box: the swap detaches the button, so without
    // the popover stopping propagation the card read it as a click outside.
    popover.querySelector(".inv-sell-amount").value = "2";
    press(popover, "discardAsk", undefined, root);
    assert.ok(card.children.includes(popover), "the question survives the click that opened it");
    assert.match(popover.innerHTML, /Are you sure you want to discard 2 Ferrite\?/);
    assert.match(popover.innerHTML, /It cannot be recovered\./);
    assert.match(popover.innerHTML, /data-a="discardConfirm"/);
    assert.equal(countOf(profile.ship, "ferrite", profile, state.worldState), 3, "the question changes nothing");

    // 5. Confirming takes exactly that many.
    press(popover, "discardConfirm", undefined, root);
    assert.equal(countOf(profile.ship, "ferrite", profile, state.worldState), 1, "two left the hold");
    assert.match(shownNotice(), /Discarded 2 Ferrite from the Wasp\./);
    assert.ok(!card.children.includes(popover), "the popover closes behind it");

    // 6. Cancel backs out of the question without a scratch.
    rightClick(tile("c", "ferrite", "1", profile.ship));
    press(root, "cargoDiscard", cardMenu().children[0]);
    const second = cardPopover();
    second.querySelector(".inv-sell-amount").value = "1";
    press(second, "discardAsk", undefined, root);
    press(second, "discardCancel", undefined, root);
    assert.ok(!card.children.includes(second), "cancel closes the popover");
    assert.equal(countOf(profile.ship, "ferrite", profile, state.worldState), 1, "and keeps the cargo");

    // 7. A mission item is refused, not quietly eaten.
    rightClick(tile("c", "beacon", "1", profile.ship));
    const refuse = cardMenu().children[0];
    assert.equal(refuse.disabled, true, "a mission item cannot be discarded");
    assert.match(refuse.title, /mission item/i);
    closeCargo();
  } finally {
    state.ui.intro = previous.intro;
    state.ui.cargo = previous.cargo;
    state.paused = previous.paused;
    state.players = previous.players;
    state.localPlayerIndex = previous.localPlayerIndex;
    state.profile = previous.profile;
    hideNotice();   // do not wait out the notice timer
  }
});
