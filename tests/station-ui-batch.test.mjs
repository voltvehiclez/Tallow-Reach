// Regression coverage for the 11-item station UI, reusable left panel, inventory
// polish, and My Assets Set destination batch.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import "./headless.mjs";
import { state, applySave } from "../src/state/state.js";
import { newSave } from "../src/state/profile.js";
import { prepareGalaxySave } from "../src/sim/galaxy-session.js";
import { createPlayer } from "../src/sim/player.js";
import { resumeFromSave } from "../src/sim/session.js";
import { DEFAULT_PLACE } from "../src/data/places.js";
import { stationAt } from "../src/sim/places.js";
import { STATION, addItem, capacityOf, freeOf } from "../src/sim/inventory.js";
import { buyItem, selectShip } from "../src/sim/economy.js";
import { acceptMission, ensureBoard } from "../src/sim/contracts.js";
import {
  TABS,
  assetsHtml,
  cargoHtml,
  contractsHtml,
  leftPanelHtml,
  outfittingHtml,
  outpostHtml,
  viewedShip,
} from "../src/ui/screens.js";
import {
  activeLeftPanel,
  activeRightTab,
  closeLeftPanel,
  resetStationPanels,
  selectRightTab,
  syncLeftPanelElement,
  toggleLeftPanel,
} from "../src/ui/left-panel.js";
import {
  buildAssetStationContextMenu,
  cancelHeldStack,
  clearAssetStationDestination,
  clickInventorySlot,
  hasHeldStack,
  setAssetStationDestination,
  stationDestinationStatus,
} from "../src/ui/inventory-ui.js";

function freshDocked(credits = 8000) {
  cancelHeldStack();
  const save = prepareGalaxySave(newSave());
  save.profile.cr = credits;
  applySave(save);
  state.ui.intro = false;
  resetStationPanels(state.ui);
  state.ui.invShip = null;
  state.ui.invView = "inv";
  state.ui.cargoView = "hold";
  state.ui.assetsOpen = {};
  state.ui.shopOpen = {};
  state.ui.destination = null;
  state.worldState.destination = null;
  if (!state.player) createPlayer();
  const player = state.player;
  resumeFromSave(player);
  ensureBoard();
  return { player, galaxy: state.galaxy };
}

function makeFakeDoc() {
  const nodes = [];
  const makeEl = tag => {
    const classes = new Set();
    const attrs = new Map();
    const el = {
      tagName: String(tag).toUpperCase(),
      id: "",
      className: "",
      hidden: false,
      disabled: false,
      title: "",
      textContent: "",
      innerHTML: "",
      scrollTop: 0,
      dataset: {},
      style: {},
      children: [],
      parentNode: null,
      isConnected: false,
      classList: {
        add: (...cs) => cs.forEach(c => classes.add(c)),
        remove: (...cs) => cs.forEach(c => classes.delete(c)),
        contains: c => classes.has(c),
      },
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.get(k) ?? null; },
      append(...kids) {
        for (const k of kids) {
          k.parentNode = el;
          k.isConnected = true;
          el.children.push(k);
        }
      },
      remove() {
        if (el.parentNode) {
          el.parentNode.children = el.parentNode.children.filter(c => c !== el);
          el.parentNode = null;
        }
        el.isConnected = false;
      },
    };
    nodes.push(el);
    return el;
  };
  const body = makeEl("body");
  body.isConnected = true;
  return {
    body,
    createElement: makeEl,
    addEventListener() {},
    removeEventListener() {},
    getElementById(id) {
      return body.children.find(c => c.id === id) || null;
    },
  };
}

test("Items #1, #2, #4: held ghost removes cleanly on drop, no held banner, no full-hold slot dimming, no Inventory subtitle", () => {
  freshDocked();
  addItem(STATION, "ferrite", 4);

  const prevDoc = globalThis.document;
  const fakeDoc = makeFakeDoc();
  globalThis.document = fakeDoc;
  try {
    // Pick up slot 0: floating ghost mounts once while holding, and NO held banner renders.
    const pick = clickInventorySlot({ where: STATION, slot: 0, otherWhere: "wasp", clientX: 120, clientY: 160 });
    assert.equal(pick.picked, true);
    assert.equal(hasHeldStack(), true);
    assert.ok(fakeDoc.getElementById("inv-held-ghost"), "floating ghost exists while holding");

    state.ui.tab = "i";
    const holdingHtml = outpostHtml(state.ui);
    assert.doesNotMatch(holdingHtml, /inv-held-bar|Put back|Holding <strong>/i, "redundant held banner is gone from docked Inventory");
    assert.doesNotMatch(cargoHtml(state.profile), /inv-held-bar|Put back|Holding <strong>/i, "redundant held banner is gone from flight Inventory");

    // Place into empty slot 3: ghost node is completely removed so no empty box lingers.
    const drop = clickInventorySlot({ where: STATION, slot: 3, otherWhere: "wasp", clientX: 200, clientY: 220 });
    assert.equal(drop.changed, true);
    assert.equal(hasHeldStack(), false);
    assert.equal(fakeDoc.getElementById("inv-held-ghost"), null, "ghost element is removed from DOM after placing");
    assert.equal(fakeDoc.body.children.length, 0, "no empty overlay box lingers in document.body");

    // Pick up again and cancel via Escape helper: also removes the ghost node completely.
    clickInventorySlot({ where: STATION, slot: 3, otherWhere: "wasp", clientX: 80, clientY: 90 });
    assert.ok(fakeDoc.getElementById("inv-held-ghost"));
    assert.equal(cancelHeldStack(), true);
    assert.equal(fakeDoc.getElementById("inv-held-ghost"), null, "cancelHeldStack removes the ghost node too");
  } finally {
    globalThis.document = prevDoc;
  }

  // Fill the Wasp's hold to 100% capacity: station slots stay full brightness (never aria-disabled),
  // while trying to Shift-click into the full ship still surfaces the "No room" notice.
  const waspCap = capacityOf("wasp");
  addItem("wasp", "ferrite", waspCap);
  assert.equal(freeOf("wasp"), 0, "Wasp hold is completely full");

  const fullInvHtml = outpostHtml(state.ui);
  assert.doesNotMatch(fullInvHtml, /aria-disabled="true"/, "slots are not greyed out when destination lacks hold space");
  assert.doesNotMatch(fullInvHtml, /Click a stack to pick it up|Click an item to move/i, "Inventory subtitle text is removed");

  const blocked = clickInventorySlot({ where: STATION, slot: 3, otherWhere: "wasp", shiftKey: true });
  assert.equal(blocked.changed, false);
  assert.match(blocked.message, /no room/i, "No room notice still informs the player");

  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.inv-held-ghost\[hidden\]\s*\{\s*display:\s*none/, "CSS hides [hidden] ghost defensively");
  assert.doesNotMatch(css, /\.inv-item\[aria-disabled="true"\]/, "dimmed aria-disabled slot rule removed");
  assert.doesNotMatch(css, /\.inv-held-bar/, "obsolete held-bar CSS removed");
});

test("Items #3, #6, #7, #8: Missions + left Contracts, reusable mutually exclusive left panel for Outfitting/Shop, fixed panel sizing", () => {
  freshDocked();
  acceptMission({ type: "mine", tier: 1, o: "ferrite", n: 2, r: 250 }, state.profile, DEFAULT_PLACE);

  // Station nav contains Missions, Inventory, Outfitting, Shop, Base, Saves — no Contracts or Hangar.
  assert.deepEqual(TABS, [
    ["l", "Missions"],
    ["i", "Inventory"],
    ["o", "Outfitting"],
    ["p", "Shop"],
    ["b", "Base"],
    ["s", "Saves"],
  ]);

  // Default & clicking Missions shows Missions on the right AND Contract board on the left,
  // and Contract board omits the redundant Active missions section.
  assert.equal(activeRightTab(state.ui), "l");
  assert.equal(activeLeftPanel(state.ui), "m");
  const rightMissions = outpostHtml(state.ui);
  const leftContracts = leftPanelHtml(state.ui);
  assert.match(rightMissions, /<h2>Missions<\/h2>/);
  assert.match(rightMissions, /Ferrite/, "active contract shows in right Missions tab");
  assert.match(leftContracts, /<h2>Contract board<\/h2>/);
  assert.match(leftContracts, /data-a="ref"/, "Contract board keeps Refresh button");
  assert.doesNotMatch(contractsHtml(), /Active missions|data-a="drop"|data-a="done"/, "Active missions stripped from Contract board");

  // Switching to Inventory closes companion Contracts, leaving left panel closed.
  selectRightTab("i", state.ui);
  assert.equal(state.ui.tab, "i");
  assert.equal(state.ui.leftPanel, null);

  // Reusable left panel element: Outfitting and Shop toggle inside the exact same container,
  // strictly mutually exclusive (clicking Shop toggles off Outfitting and vice versa).
  const fakeDoc = makeFakeDoc();
  const leftEl = fakeDoc.createElement("aside");
  leftEl.id = "station-left";
  leftEl.hidden = true;

  assert.equal(toggleLeftPanel("o", state.ui), "o");
  const r1 = syncLeftPanelElement(leftEl, state.ui.leftPanel, leftPanelHtml(state.ui));
  assert.equal(r1.opened, true);
  assert.equal(leftEl.hidden, false);
  assert.equal(leftEl.dataset.view, "o");
  assert.equal(leftEl.classList.contains("is-entering"), true);
  assert.match(leftEl.innerHTML, /<h2>Outfitting<\/h2>/);
  assert.match(leftEl.innerHTML, /class="outfit"/, "Outfitting preserves its 3-column layout format");
  assert.match(outpostHtml(state.ui), /data-a="leftTab" data-b="o" class="on" aria-pressed="true"/);
  assert.match(outpostHtml(state.ui), /data-a="leftTab" data-b="p" class="" aria-pressed="false"/);

  // Clicking Shop while Outfitting is open switches the same container to Shop and turns Outfitting off.
  assert.equal(toggleLeftPanel("p", state.ui), "p");
  const r2 = syncLeftPanelElement(leftEl, state.ui.leftPanel, leftPanelHtml(state.ui));
  assert.equal(r2.switched, true);
  assert.equal(leftEl.hidden, false);
  assert.equal(leftEl.dataset.view, "p");
  assert.match(leftEl.innerHTML, /shop-tree/, "Shop renders inside the same #station-left container");
  assert.doesNotMatch(leftEl.innerHTML, /<h2>Outfitting<\/h2>/);
  assert.match(outpostHtml(state.ui), /data-a="leftTab" data-b="o" class="" aria-pressed="false"/);
  assert.match(outpostHtml(state.ui), /data-a="leftTab" data-b="p" class="on" aria-pressed="true"/);

  // Switching right-hand tabs (Base, Saves, Inventory) keeps Shop open without closing it.
  selectRightTab("b", state.ui);
  assert.equal(state.ui.leftPanel, "p", "right-panel tab switch keeps open Shop untouched");

  // Clicking Outfitting while Shop is open turns Shop off and opens Outfitting.
  assert.equal(toggleLeftPanel("o", state.ui), "o");
  assert.equal(state.ui.leftPanel, "o");

  // Clicking Outfitting again toggles it off.
  assert.equal(toggleLeftPanel("o", state.ui), null);
  syncLeftPanelElement(leftEl, state.ui.leftPanel, "");
  assert.equal(leftEl.hidden, true);
  assert.equal(leftEl.innerHTML, "");

  // Opening Shop then clicking Missions opens Missions (right) + Contract board (left) together.
  toggleLeftPanel("p", state.ui);
  selectRightTab("l", state.ui);
  assert.equal(state.ui.tab, "l");
  assert.equal(state.ui.leftPanel, "m");
  assert.equal(closeLeftPanel(state.ui), true);
  assert.equal(state.ui.leftPanel, null);

  // CSS & HTML enforce one reusable #station-left container and zero #panel.wide resizing.
  const html = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const menu = readFileSync(new URL("../src/ui/menu.js", import.meta.url), "utf8");
  const outfitting = readFileSync(new URL("../src/ui/outfitting.js", import.meta.url), "utf8");
  assert.match(html, /id="station-left"/);
  assert.match(css, /#station-left\s*\{/);
  assert.match(css, /#station-left\[hidden\]/);
  assert.match(css, /@keyframes station-left-enter/);
  assert.doesNotMatch(css, /#panel\.wide/, "#panel never resizes for wide tabs");
  assert.doesNotMatch(menu, /classList\.toggle\("wide"/, "menu.js never toggles #panel.wide");
  assert.match(outfitting, /state\.ui\.leftPanel !== "o"/, "3D ship viewer updates when left Outfitting window is open");
});

test("Items #5, #9, #10: Inventory shows Ships above Station and Ship hold with quick Fly button; Outfitting has no ship-switcher box", () => {
  const { player } = freshDocked(10000);
  buyItem("meridian", "prospector", 1, player, state.profile, state.worldState, "ship");

  state.ui.tab = "i";
  state.ui.invView = "inv";
  const invHtml = outpostHtml(state.ui);

  // Strict top-to-bottom order: Inventory -> Ships list -> Station hold -> active Ship hold.
  const headingPos = invHtml.indexOf("<h2>Inventory</h2>");
  const shipsPos = invHtml.indexOf('class="hangar-ships"');
  const stationPos = invHtml.indexOf("<h3>Station</h3>");
  const holdPos = invHtml.indexOf("<h3>Wasp hold</h3>");
  assert.ok(headingPos >= 0 && shipsPos > headingPos, "ship list renders beneath Inventory heading");
  assert.ok(stationPos > shipsPos, "Station hold renders below ship list");
  assert.ok(holdPos > stationPos, "ship hold renders below Station hold");

  // Every ship row places a small Fly button to the right of Active / Stored;
  // disabled on the active ship, enabled on stored ships.
  assert.match(
    invHtml,
    /<small>Active<\/small><button type="button" class="hangar-fly-btn" data-a="hangarFly" data-b="wasp" disabled/,
    "active ship shows disabled Fly button to the right of Active"
  );
  assert.match(
    invHtml,
    /<small>Stored<\/small><button type="button" class="hangar-fly-btn" data-a="hangarFly" data-b="prospector" aria-label="Fly Prospector">Fly<\/button>/,
    "stored ship shows enabled Fly button to the right of Stored"
  );

  // Flying Prospector switches active ship, updates Inventory hold and updates Outfitting viewer,
  // with NO WASP / 1 of 2 ship-switch box or arrows in Outfitting.
  selectShip("prospector", player, state.profile, state.worldState);
  state.ui.invShip = null;
  assert.equal(viewedShip(), "prospector");
  const outfit = outfittingHtml();
  assert.match(outfit, /id="shipview" data-ship-type="prospector" data-ship-id="prospector"/);
  assert.match(outfit, /<div class="outfit-title">Prospector<small>/);
  assert.doesNotMatch(outfit, /ship-switch|shipPrev|shipNext|in the hangar/, "Outfitting ship switcher and arrows removed");
});

test("Item #11: right-clicking a station in My Assets offers Set destination (and Clear destination) both docked and in flight", () => {
  const { galaxy } = freshDocked();
  const remoteStation = Object.values(galaxy.pocketsById).find(
    p => p.id !== DEFAULT_PLACE && stationAt(p.id)
  );
  assert.ok(remoteStation, "galaxy has a reachable remote station");

  // Store ore at the remote station so both current and remote stations appear in My Assets.
  const prevPlace = state.place;
  state.place = remoteStation.id;
  addItem(STATION, "ferrite", 5);
  state.place = prevPlace;
  const htmlBefore = assetsHtml(state.profile, state.worldState, { docked: true });
  assert.match(htmlBefore, new RegExp(`data-asset-station="${DEFAULT_PLACE}"`));
  assert.match(htmlBefore, new RegExp(`data-asset-station="${remoteStation.id}"`));

  const fakeDoc = makeFakeDoc();

  // Current station: Set destination is shown but disabled ("Already at this station.").
  const hereMenu = buildAssetStationContextMenu(fakeDoc, DEFAULT_PLACE);
  assert.equal(hereMenu.children.length, 1);
  assert.equal(hereMenu.children[0].dataset.a, "assetSetDest");
  assert.equal(hereMenu.children[0].textContent, "Set destination");
  assert.equal(hereMenu.children[0].disabled, true);
  assert.equal(stationDestinationStatus(DEFAULT_PLACE).isCurrent, true);

  // Remote station: Set destination is enabled and persists exact pocket destination.
  const remoteMenu = buildAssetStationContextMenu(fakeDoc, remoteStation.id);
  assert.equal(remoteMenu.children.length, 1);
  assert.equal(remoteMenu.children[0].dataset.a, "assetSetDest");
  assert.equal(remoteMenu.children[0].dataset.b, remoteStation.id);
  assert.equal(remoteMenu.children[0].textContent, "Set destination");
  assert.equal(remoteMenu.children[0].disabled, false);

  const res = setAssetStationDestination(remoteStation.id);
  assert.equal(res.ok, true);
  assert.deepEqual(state.ui.destination, { pocketId: remoteStation.id });
  assert.deepEqual(state.worldState.destination, { pocketId: remoteStation.id });

  // Assets list highlights the active destination station (both docked and in flight),
  // and right-clicking again offers Clear destination.
  const htmlSetDocked = assetsHtml(state.profile, state.worldState, { docked: true });
  const htmlSetFlight = assetsHtml(state.profile, state.worldState, { docked: false });
  assert.match(htmlSetDocked, /Destination/);
  assert.match(htmlSetFlight, /Destination/);

  const activeMenu = buildAssetStationContextMenu(fakeDoc, remoteStation.id);
  assert.equal(activeMenu.children.length, 2);
  assert.equal(activeMenu.children[0].disabled, true);
  assert.equal(activeMenu.children[1].dataset.a, "assetClearDest");
  assert.equal(activeMenu.children[1].textContent, "Clear destination");

  assert.equal(clearAssetStationDestination().ok, true);
  assert.equal(state.ui.destination, null);
  assert.equal(state.worldState.destination, null);

  // Both docked menu.js and in-flight cargo.js wire data-asset-station context menus & actions.
  const menuSrc = readFileSync(new URL("../src/ui/menu.js", import.meta.url), "utf8");
  const cargoSrc = readFileSync(new URL("../src/ui/cargo.js", import.meta.url), "utf8");
  for (const [name, src] of [["menu.js", menuSrc], ["cargo.js", cargoSrc]]) {
    assert.match(src, /data-asset-station/, `${name} handles right-click on My Assets station rows`);
    assert.match(src, /assetSetDest/, `${name} handles Set destination click`);
    assert.match(src, /assetClearDest/, `${name} handles Clear destination click`);
  }
});

test("End-to-end setupMenu: left Shop Buy cursor popup, live Fly sync into Outfitting, Missions+Contracts, and My Assets right-click Set destination", async () => {
  const { registerHooks } = await import("node:module");
  registerHooks({
    load(url, ctx, next) {
      if (/\.(txt|glb|png|ogg|wav|mp3)$/.test(url)) return { format: "module", shortCircuit: true, source: 'export default "";' };
      return next(url, ctx);
    },
  });
  const { closePanelPopovers, setupMenu } = await import("../src/ui/menu.js");
  const { galaxy } = freshDocked(10000);
  const remoteStation = Object.values(galaxy.pocketsById).find(
    p => p.id !== DEFAULT_PLACE && stationAt(p.id)
  );
  const prevPlace = state.place;
  state.place = remoteStation.id;
  addItem(STATION, "ferrite", 3);
  state.place = prevPlace;

  const makeSurface = (tag, box = { left: 0, top: 0, width: 490, height: 1080 }) => {
    const classes = new Set();
    const attrs = new Map();
    const handlers = {};
    const el = {
      tagName: String(tag).toUpperCase(),
      id: "",
      hidden: false,
      disabled: false,
      value: "1",
      title: "",
      textContent: "",
      innerHTML: "",
      scrollLeft: 0,
      scrollTop: 0,
      clientLeft: 0,
      clientTop: 0,
      clientWidth: box.width,
      clientHeight: box.height,
      dataset: {},
      style: {},
      children: [],
      parentNode: null,
      handlers,
      get className() { return [...classes].join(" "); },
      set className(v) {
        classes.clear();
        String(v || "").split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
      },
      classList: {
        add: (...cs) => cs.forEach(c => classes.add(c)),
        remove: (...cs) => cs.forEach(c => classes.delete(c)),
        contains: c => classes.has(c),
        toggle(c, force) {
          const on = force === undefined ? !classes.has(c) : Boolean(force);
          if (on) classes.add(c); else classes.delete(c);
          return on;
        },
      },
      setAttribute(k, v) { attrs.set(k, String(v)); },
      getAttribute(k) { return attrs.get(k) ?? null; },
      addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
      getBoundingClientRect: () => ({
        left: box.left,
        top: box.top,
        right: box.left + box.width,
        bottom: box.top + box.height,
        width: box.width,
        height: box.height,
      }),
      focus() {},
      select() {},
      closest() { return null; },
      append(...kids) {
        for (const k of kids) {
          k.parentNode = el;
          el.children.push(k);
        }
      },
      appendChild(k) { el.append(k); return k; },
      querySelector(sel) {
        if (sel === ".inv-sell-amount") return (el._input ||= makeSurface("input"));
        if (sel === "[data-buy-total]") return (el._total ||= makeSurface("strong"));
        if (sel === ".inv-sell-error") return (el._err ||= makeSurface("div"));
        return null;
      },
      querySelectorAll(sel) {
        const names = sel.split(",").map(s => s.trim().replace(/^\./, ""));
        return el.children.filter(c => names.some(n => c.classList.contains(n)));
      },
      remove() {
        if (el.parentNode) el.parentNode.children = el.parentNode.children.filter(c => c !== el);
        el.parentNode = null;
      },
    };
    return el;
  };

  // Simulate a 1920x1080 desktop viewport: #station-left at x=516..1416, #panel at x=1430..1920.
  const left = makeSurface("aside", { left: 516, top: 16, width: 900, height: 1048 });
  left.id = "station-left";
  left.hidden = true;
  const right = makeSurface("div", { left: 1430, top: 0, width: 490, height: 1080 });
  right.id = "panel";

  const clickAction = async (surface, a, b, extra = {}) => {
    const btn = makeSurface("button");
    btn.dataset = b === undefined ? { a } : { a, b };
    btn.closest = sel => {
      if (sel === "button[data-a]") return btn;
      if (sel === "#station-left") return surface === left ? left : null;
      if (extra.popover && sel === ".shop-buy-popover") return extra.popover;
      return null;
    };
    await surface.handlers.click[0]({
      target: btn,
      shiftKey: false,
      clientX: extra.clientX ?? 0,
      clientY: extra.clientY ?? 0,
    });
  };

  const prevDoc = globalThis.document;
  globalThis.document = {
    body: makeSurface("body", { left: 0, top: 0, width: 1920, height: 1080 }),
    getElementById: id => (id === "panel" ? right : id === "station-left" ? left : null),
    createElement: tag => makeSurface(tag, { left: 0, top: 0, width: 0, height: 0 }),
    addEventListener() {},
    removeEventListener() {},
  };
  try {
    setupMenu();
    // Initial docked view: Missions on the right + Contract board on the left, zero .wide on #panel.
    assert.equal(right.hidden, false);
    assert.equal(right.classList.contains("wide"), false);
    assert.match(right.innerHTML, /<h2>Missions<\/h2>/);
    assert.equal(left.hidden, false);
    assert.equal(left.dataset.view, "m");
    assert.match(left.innerHTML, /<h2>Contract board<\/h2>/);

    // Switch right panel to Inventory -> companion Contract board closes; toggle Outfitting then Shop.
    await clickAction(right, "tab", "i");
    assert.equal(left.hidden, true);
    assert.match(right.innerHTML, /<h2>Inventory<\/h2>/);

    await clickAction(right, "leftTab", "o");
    assert.equal(left.hidden, false);
    assert.equal(left.dataset.view, "o");
    assert.equal(right.classList.contains("wide"), false, "#panel never widens when Outfitting opens");

    await clickAction(right, "leftTab", "p");
    assert.equal(left.hidden, false);
    assert.equal(left.dataset.view, "p", "Shop automatically replaces Outfitting in #station-left");

    // Click Buy in #station-left at screen coords (1360, 260) -> local (844, 244):
    // popup mounts inside #station-left with its Buy confirm button dead-centre over cursor.
    await clickAction(left, "wb", "meridian:ship:prospector", { clientX: 1360, clientY: 260 });
    assert.equal(right.children.length, 0, "Shop Buy popup mounts in #station-left, not #panel");
    const buyPop = left.children.find(c => c.classList.contains("shop-buy-popover"));
    assert.ok(buyPop, "Shop Buy popup opened in #station-left");
    assert.equal(parseFloat(buyPop.style.left) + 214, 1360 - 516, "Buy confirm X lands straight over cursor");
    assert.equal(parseFloat(buyPop.style.top) + 46, 260 - 16, "Buy confirm Y lands straight over cursor");

    // Confirm buying Prospector -> appears immediately in right Inventory ship list with Fly button.
    buyPop.querySelector(".inv-sell-amount").value = "1";
    await clickAction(left, "shopBuyConfirm", undefined, { popover: buyPop });
    assert.match(right.innerHTML, /data-a="hangarFly" data-b="prospector"/);

    // Toggle Outfitting open (shows Wasp), then click Fly on Prospector in Inventory -> both update live!
    await clickAction(right, "leftTab", "o");
    assert.match(left.innerHTML, /data-ship-id="wasp"/);
    await clickAction(right, "hangarFly", "prospector");
    assert.equal(state.profile.ship, "prospector");
    assert.match(right.innerHTML, /<h3>Prospector hold<\/h3>/);
    assert.match(left.innerHTML, /data-ship-id="prospector"/, "left Outfitting viewer switches live to newly flown ship");

    // Escape helper dismisses toggleable Outfitting window; clicking Missions reopens both Missions + Contracts.
    assert.equal(closePanelPopovers({ returnHeld: true, dismissLeft: true }), true);
    assert.equal(left.hidden, true);
    await clickAction(right, "tab", "l");
    assert.match(right.innerHTML, /<h2>Missions<\/h2>/);
    assert.equal(left.hidden, false);
    assert.equal(left.dataset.view, "m");

    // Switch Inventory -> My Assets, right-click remote station -> Set destination menu -> click Set destination.
    await clickAction(right, "tab", "i");
    await clickAction(right, "invView", "assets");
    const stRow = makeSurface("button");
    stRow.dataset = { assetStation: remoteStation.id };
    stRow.closest = sel => (sel === "[data-asset-station]" ? stRow : null);
    let prevented = false;
    right.handlers.contextmenu[0]({
      target: stRow,
      clientX: 1580,
      clientY: 220,
      preventDefault() { prevented = true; },
    });
    assert.equal(prevented, true);
    const ctx = right.children.find(c => c.classList.contains("assets-context"));
    assert.ok(ctx, "right-clicking station in My Assets opens context menu");
    assert.equal(ctx.children[0].dataset.a, "assetSetDest");
    assert.equal(ctx.children[0].disabled, false);

    await clickAction(right, "assetSetDest", remoteStation.id);
    assert.deepEqual(state.ui.destination, { pocketId: remoteStation.id });
    assert.match(right.innerHTML, /Destination/, "station row updates to show Destination");
  } finally {
    globalThis.document = prevDoc;
  }
});
