// Regression coverage for the 11-item station UI, reusable left panel, inventory
// polish, and My Assets Set destination batch.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import "./headless.mjs";
import { state, applySave } from "../src/state/state.js";
import { newSave } from "../src/state/profile.js";
import { prepareGalaxySave } from "../src/sim/galaxy-session.js";
import { createPlayer, flight } from "../src/sim/player.js";
import { displayedSpeed } from "../src/sim/flight-instruments.js";
const SIM_DT = 1 / 60;
import { launch, resumeFromSave } from "../src/sim/session.js";
import { DEFAULT_PLACE } from "../src/data/places.js";
import { BORDER_SIGNAL_MISSION } from "../src/data/missions/index.js";
import { stationAt } from "../src/sim/places.js";
import {
  STATION,
  addItem,
  addItemToSlot,
  capacityOf,
  countOf,
  freeOf,
  slotsAt,
} from "../src/sim/inventory.js";
import {
  buyItem,
  filterPlayerAssets,
  listPlayerAssets,
  selectShip,
} from "../src/sim/economy.js";
import {
  canEquipModule,
  equipModuleFromInventory,
  fitModuleFrom,
  fittedAt,
  moduleInfoData,
  unequipTo,
} from "../src/sim/fitting.js";
import { MODULES } from "../src/data/modules.js";
import { enterPlace } from "../src/sim/places.js";
import { homeStationPlace } from "../src/sim/session.js";
import { acceptMission, ensureBoard } from "../src/sim/contracts.js";
import {
  TABS,
  assetsHtml,
  assetsResultsHtml,
  moduleDetailsHtml,
  cargoHtml,
  contractsHtml,
  introHtml,
  leftPanelHtml,
  missionsHtml,
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

  // Default & clicking Missions: right accepts Story missions + Contracts, left shows in-progress Mission log.
  assert.equal(activeRightTab(state.ui), "l");
  assert.equal(activeLeftPanel(state.ui), "m");
  const rightMissions = outpostHtml(state.ui);
  const leftLog = leftPanelHtml(state.ui);
  assert.match(rightMissions, /<h2>Story missions<\/h2>/);
  assert.match(rightMissions, /<h2>Contract board<\/h2>/);
  assert.match(rightMissions, /data-a="ref"/, "right Missions tab keeps contract Refresh button");
  assert.match(leftLog, /<h2>Mission log<\/h2>/);
  assert.match(leftLog, /Ferrite/, "active contract shows in the left Mission log window");
  assert.doesNotMatch(contractsHtml(), /Active missions|data-a="drop"|data-a="done"/, "Active missions stripped from Contract board");

  // Accepting the only story mission leaves Story missions visible with "No more story missions available."
  acceptMission(BORDER_SIGNAL_MISSION, state.profile, DEFAULT_PLACE);
  const afterStory = missionsHtml(state.profile);
  assert.match(afterStory, /<h2>Story missions<\/h2>/);
  assert.match(afterStory, /No more story missions available\./);
  assert.match(leftPanelHtml(state.ui), /The Border Signal/, "accepted story mission moves into left Mission log");

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
    // Initial docked view: right accepts Story missions & Contract board, left shows in-progress Mission log.
    assert.equal(right.hidden, false);
    assert.equal(right.classList.contains("wide"), false);
    assert.match(right.innerHTML, /<h2>Story missions<\/h2>/);
    assert.match(right.innerHTML, /<h2>Contract board<\/h2>/);
    assert.equal(left.hidden, false);
    assert.equal(left.dataset.view, "m");
    assert.match(left.innerHTML, /<h2>Mission log<\/h2>/);

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

    // Escape helper dismisses toggleable Outfitting window; clicking Missions reopens offers (right) + Mission log (left).
    assert.equal(closePanelPopovers({ returnHeld: true, dismissLeft: true }), true);
    assert.equal(left.hidden, true);
    await clickAction(right, "tab", "l");
    assert.match(right.innerHTML, /<h2>Story missions<\/h2>/);
    assert.match(right.innerHTML, /<h2>Contract board<\/h2>/);
    assert.equal(left.hidden, false);
    assert.equal(left.dataset.view, "m");
    assert.match(left.innerHTML, /<h2>Mission log<\/h2>/);

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

    // Verify ship-hold Stack all button in live menu compacts spread ship-hold items to slot 0 (not station!).
    await clickAction(right, "invView", "inv");
    addItemToSlot(state.profile.ship, 6, "ferrite", 2);
    addItemToSlot(state.profile.ship, 12, "cobalt", 1);
    addItemToSlot(state.profile.ship, 18, "ferrite", 3);
    assert.equal(slotsAt(state.profile.ship)[0], null, "ship hold starts with empty top-left slots");
    const stackShipBtn = makeSurface("button");
    stackShipBtn.dataset = { a: "stackAll", b: state.profile.ship, where: state.profile.ship };
    stackShipBtn.closest = sel => (sel === "button[data-a]" ? stackShipBtn : null);
    await right.handlers.click[0]({ target: stackShipBtn, shiftKey: false, clientX: 0, clientY: 0 });
    assert.deepEqual(slotsAt(state.profile.ship), [
      { id: "ferrite", n: 5 },
      { id: "cobalt", n: 1 },
    ], "Stack all on ship hold packs and merges every item starting at top-left slot 0");

    // Verify right-click Equip works while Outfitting is CLOSED and only targets the active ship.
    assert.equal(left.hidden, true, "Outfitting is closed");
    addItemToSlot(STATION, 0, "beam_basic", 1);
    addItemToSlot(STATION, 1, "ferrite", 2);
    const modTile = makeSurface("button");
    modTile.dataset = { kind: "m", id: "beam_basic", where: STATION, slot: "0", dir: "s", count: "1" };
    modTile.closest = sel => (sel === "button.inv-item[data-kind]" ? modTile : null);
    right.handlers.contextmenu[0]({ target: modTile, clientX: 1500, clientY: 300, preventDefault() {} });
    const modMenu = right.children.find(c => c.classList.contains("inv-context"));
    const modInfoBtn = modMenu.children.find(c => c.dataset.a === "modInfo");
    assert.ok(modInfoBtn && modInfoBtn.textContent === "Show info", "module in Inventory has Show info");
    const equipBtn = modMenu.children.find(c => c.dataset.a === "invEquip");
    assert.ok(equipBtn && !equipBtn.disabled, "module fitting active ship offers enabled Equip");
    equipBtn.closest = sel => (sel === "button[data-a]" ? equipBtn : null);
    await right.handlers.click[0]({ target: equipBtn, shiftKey: false, clientX: 0, clientY: 0 });
    assert.equal(fittedAt("primary", 1), "beam_basic", "Equip fits module into active ship's open bay with Outfitting closed");
    assert.equal(countOf(STATION, "beam_basic"), 0);

    // Non-module ore offers disabled Equip (and no module Show info) and refuses if invoked.
    const oreTile = makeSurface("button");
    oreTile.dataset = { kind: "c", id: "ferrite", where: STATION, slot: "1", dir: "s", count: "2" };
    oreTile.closest = sel => (sel === "button.inv-item[data-kind]" ? oreTile : null);
    right.handlers.contextmenu[0]({ target: oreTile, clientX: 1500, clientY: 300, preventDefault() {} });
    const oreMenu = right.children.find(c => c.classList.contains("inv-context"));
    assert.equal(oreMenu.children.find(c => c.dataset.a === "modInfo"), undefined);
    assert.equal(oreMenu.children[0].dataset.a, "invEquip");
    assert.equal(oreMenu.children[0].disabled, true, "ore cannot be equipped");

    // Verify pointer drag-and-drop: Outfitting bay -> ship hold slot 4, then ship hold slot 4 -> Outfitting bay!
    const docHandlers = {};
    globalThis.document.addEventListener = (type, fn) => { (docHandlers[type] ||= []).push(fn); };
    // Re-init on fresh doc reference so document drag listeners attach.
    globalThis.document = { ...globalThis.document, addEventListener: globalThis.document.addEventListener };
    setupMenu();
    await clickAction(right, "tab", "i");
    await clickAction(right, "leftTab", "o");
    assert.doesNotMatch(left.innerHTML, /No modules in storage|fit-picker/, "no Modules in storage box");

    // Drag fitted beam_basic from primary bay 1 into active ship hold slot 4.
    const fromBay = makeSurface("button");
    fromBay.dataset = { fitGroup: "primary", fitBay: "1", module: "beam_basic" };
    fromBay.closest = sel => (sel.includes("button.mod-bay.fitted") ? fromBay : null);
    const toInvSlot = makeSurface("button");
    toInvSlot.dataset = { a: "invSlot", where: state.profile.ship, slot: "4" };
    toInvSlot.closest = sel => (sel === "button[data-a='invSlot']" ? toInvSlot : null);
    globalThis.document.elementFromPoint = () => toInvSlot;

    left.handlers.pointerdown[0]({ button: 0, shiftKey: false, clientX: 700, clientY: 260, target: fromBay });
    docHandlers.pointermove[0]({ clientX: 1550, clientY: 520, target: toInvSlot, preventDefault() {} });
    docHandlers.pointerup[0]({ type: "pointerup", clientX: 1550, clientY: 520, target: toInvSlot });
    assert.equal(fittedAt("primary", 1), null, "dragging fitted module to Inventory unequips it");
    assert.deepEqual(slotsAt(state.profile.ship)[4], { id: "beam_basic", n: 1 }, "lands in exact dropped hold slot");
    assert.equal(
      globalThis.document.body.children.filter(c => c.id === "inv-held-ghost").length,
      0,
      "drag ghost removed on drop"
    );

    // Drag beam_basic back from active ship hold slot 4 onto Outfitting primary bay 1.
    const fromInv = makeSurface("button");
    fromInv.dataset = {
      a: "invSlot", where: state.profile.ship, slot: "4", id: "beam_basic", count: "1", modGroup: "primary",
    };
    fromInv.closest = sel => (sel.includes("button.inv-item") ? fromInv : null);
    const targetBay = makeSurface("button");
    targetBay.dataset = { fitGroup: "primary", fitBay: "1" };
    targetBay.closest = sel => (sel.includes("button.mod-bay") ? targetBay : null);
    globalThis.document.elementFromPoint = () => targetBay;

    right.handlers.pointerdown[0]({ button: 0, shiftKey: false, clientX: 1550, clientY: 520, target: fromInv });
    docHandlers.pointermove[0]({ clientX: 700, clientY: 260, target: targetBay, preventDefault() {} });
    docHandlers.pointerup[0]({ type: "pointerup", clientX: 700, clientY: 260, target: targetBay });
    assert.equal(fittedAt("primary", 1), "beam_basic", "dragging module from Inventory onto Outfitting bay equips it");
    assert.equal(countOf(state.profile.ship, "beam_basic"), 0);
    assert.equal(
      globalThis.document.body.children.filter(c => c.id === "inv-held-ghost").length,
      0,
      "drag ghost removed on equip drop"
    );

    // Browser fires a trailing click right after pointerup on a completed drag (ignored by guard).
    await left.handlers.click[0]({ target: targetBay, shiftKey: false, clientX: 700, clientY: 260 });

    // Click-to-pick & click-to-place in Outfitting (no drag, identical to Inventory!):
    // 1) Click fitted beam_basic in primary bay 1 -> picks onto square cursor ghost & empties bay.
    await clickAction(left, "slot", "primary:1");
    assert.equal(fittedAt("primary", 1), null, "single click lifts fitted module from bay");
    assert.equal(state.ui.invHeld?.fromBay, true);
    assert.equal(state.ui.invHeld?.id, "beam_basic");
    // 2) Click Station slot 6 -> places module into Station slot 6 and removes cursor ghost.
    const dropStationSlot = makeSurface("button");
    dropStationSlot.dataset = { a: "invSlot", where: STATION, slot: "6" };
    dropStationSlot.closest = sel => (sel === "button[data-a]" ? dropStationSlot : null);
    await right.handlers.click[0]({ target: dropStationSlot, shiftKey: false, clientX: 1500, clientY: 300 });
    assert.equal(state.ui.invHeld, null);
    assert.deepEqual(slotsAt(STATION)[6], { id: "beam_basic", n: 1 }, "click places bay-picked module into inventory slot");
    assert.equal(globalThis.document.body.children.filter(c => c.id === "inv-held-ghost").length, 0);
    // 3) Click beam_basic in Station slot 6, then click primary bay 0 (holding cannon_basic) -> swaps onto cursor!
    await right.handlers.click[0]({ target: dropStationSlot, shiftKey: false, clientX: 1500, clientY: 300 });
    assert.equal(state.ui.invHeld?.id, "beam_basic");
    await clickAction(left, "slot", "primary:0");
    assert.equal(fittedAt("primary", 0), "beam_basic", "clicked module fitted into bay 0");
    assert.equal(state.ui.invHeld?.id, "cannon_basic", "displaced cannon_basic is now held on the cursor");
    // 4) Click primary bay 1 to drop cannon_basic there -> both bays fitted, cursor empty!
    await clickAction(left, "slot", "primary:1");
    assert.equal(fittedAt("primary", 1), "cannon_basic");
    assert.equal(state.ui.invHeld, null);

    // Right-clicking an equipped module in Outfitting NEVER throws ReferenceError
    // and presents both "Unequip" and "Show info"!
    const rcBay = makeSurface("button");
    rcBay.dataset = { fitGroup: "primary", fitBay: "1", module: "cannon_basic" };
    rcBay.closest = sel => {
      if (sel.includes("button.mod-bay.fitted")) return rcBay;
      if (sel === "#station-left") return left;
      return null;
    };
    left.handlers.contextmenu[0]({ target: rcBay, clientX: 720, clientY: 250, preventDefault() {} });
    const bayMenu = left.children.find(c => c.classList.contains("bay-context"));
    assert.ok(bayMenu, "right-clicking fitted bay opens context menu without throwing");
    assert.deepEqual(
      bayMenu.children.map(c => [c.dataset.a, c.textContent]),
      [["bayUnequip", "Unequip"], ["modInfo", "Show info"]],
      "equipped module context menu offers Unequip and Show info"
    );

    // Clicking "Show info" opens the full module stats popover inside Outfitting.
    const bayInfoBtn = bayMenu.children[1];
    bayInfoBtn.closest = sel => {
      if (sel === "button[data-a]") return bayInfoBtn;
      if (sel === ".inv-context") return bayMenu;
      if (sel === "#station-left") return left;
      return null;
    };
    await left.handlers.click[0]({ target: bayInfoBtn, shiftKey: false, clientX: 720, clientY: 250 });
    const infoPop = left.children.find(c => c.classList.contains("mod-info-popover"));
    assert.ok(infoPop, "Show info mounts module info card in Outfitting");
    assert.match(infoPop.innerHTML, /Basic cannons/);
    assert.match(infoPop.innerHTML, /2 linked barrels/);
    assert.match(infoPop.innerHTML, /2160 m/);
    assert.match(infoPop.innerHTML, /2 MJ\/s/);

    // Re-open bay menu and click "Unequip" -> moves cannon_basic straight to Station storage.
    left.handlers.contextmenu[0]({ target: rcBay, clientX: 720, clientY: 250, preventDefault() {} });
    const bayMenu2 = left.children.find(c => c.classList.contains("bay-context"));
    const unequipBtn = bayMenu2.children[0];
    unequipBtn.closest = sel => (sel === "button[data-a]" ? unequipBtn : null);
    await left.handlers.click[0]({ target: unequipBtn, shiftKey: false, clientX: 720, clientY: 250 });
    assert.equal(fittedAt("primary", 1), null, "right-click Unequip removes module from bay");
    assert.equal(countOf(STATION, "cannon_basic"), 1, "unequipped module lands in station storage");

    // Right-clicking a module row in Shop or My Assets also offers "Show info".
    const shopModRow = makeSurface("li");
    shopModRow.dataset = { moduleId: "missile_basic" };
    shopModRow.closest = sel => {
      if (sel === "[data-module-id]") return shopModRow;
      if (sel === "#station-left") return left;
      return null;
    };
    left.handlers.contextmenu[0]({ target: shopModRow, clientX: 640, clientY: 300, preventDefault() {} });
    const shopModMenu = left.children.find(c => c.classList.contains("mod-context"));
    assert.ok(shopModMenu, "right-clicking a module row offers Show info");
    assert.equal(shopModMenu.children[0].textContent, "Show info");

    // Clicking the Home icon button works at both current home and another station.
    await clickAction(right, "home");
    assert.equal(homeStationPlace(state.profile), DEFAULT_PLACE);
    const otherStation = Object.values(state.galaxy.pocketsById)
      .find(p => p.id !== DEFAULT_PLACE && stationAt(p.id));
    if (otherStation) {
      enterPlace(otherStation.id, state.player);
      state.player.docked = true;
      await clickAction(right, "home");
      assert.equal(homeStationPlace(state.profile), otherStation.id, "clicking home button updates home station");
      assert.match(right.innerHTML, /class="home-icon-btn is-home"/, "header updates immediately to active home");
    }
  } finally {
    globalThis.document = prevDoc;
  }
});

test("Controls condensation, minimalist top-right home icon, uncropped item text, and compact Services below modules", () => {
  freshDocked(5000);
  const intro = introHtml();
  const controlsBlock = intro.slice(intro.indexOf("<h2>Controls</h2>"), intro.indexOf('<div class="main-menu-actions">'));
  const plainControls = controlsBlock.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  // Old prose was ~1,520 characters; new controls-only table must stay well under 1/4 of that (< 340 chars).
  assert.ok(plainControls.length < 340, `Controls text is compact (${plainControls.length} chars)`);
  assert.match(controlsBlock, /class="controls-grid"/);
  assert.doesNotMatch(controlsBlock, /sold in the Shop|strongest thruster|world keeps running/);

  // Minimalistic top-right home station icon button: always clickable (not disabled),
  // no browser title tooltip, with an in-game themed .home-tip hover card.
  const station = outpostHtml(state.ui);
  assert.match(
    station,
    /<div class="station-head"><h1>[^<]+<\/h1><div class="home-ctl[^"]*"><button[^>]*class="home-icon-btn[^"]*"[^>]*data-a="home"/
  );
  assert.doesNotMatch(station, /<button[^>]*class="home-icon-btn[^"]*"[^>]*disabled/, "home button stays clickable");
  assert.doesNotMatch(station, /<button[^>]*class="home-icon-btn[^"]*"[^>]*title=/, "no native browser title tooltip on home button");
  assert.match(station, /<div class="home-tip" role="tooltip"><strong>Home station<\/strong><span>[^<]*recover here after death\.<\/span><\/div>/i,
    "in-game themed hover card explains home station recovery");
  assert.doesNotMatch(station, /<small>Recover here after death\.<\/small>/);

  // Outfitting removes the top drag description, places Services below module rails with no browser
  // title tooltips, less horizontal width, ~50% bigger service text, and taller 3D preview box.
  const outfit = outfittingHtml();
  assert.doesNotMatch(outfit, /Modules in storage|No modules in storage|fit-picker/);
  assert.doesNotMatch(outfit, /Drag modules between Inventory/i, "Outfitting top description removed");
  assert.match(outfit, /^<h2>Outfitting<\/h2><div class="outfit">/, "ship preview immediately follows heading");
  const viewIdx = outfit.indexOf('class="outfit-view"');
  const lastRailIdx = outfit.lastIndexOf('class="outfit-rail"');
  const svcIdx = outfit.indexOf('class="outfit-service"');
  assert.ok(viewIdx > 0 && lastRailIdx > viewIdx && svcIdx > lastRailIdx, "Services comes below module rails");
  assert.match(outfit, /class="service-grid"/);
  assert.match(outfit, /class="service-box"/);
  const svcHtml = outfit.slice(svcIdx);
  assert.doesNotMatch(svcHtml, /title=/, "no browser hover tooltip on Services");

  const css = readFileSync("src/styles.css", "utf8");
  assert.match(css, /\.home-ctl:hover \.home-tip[\s\S]*?opacity:\s*1/, "hovering home button reveals game-themed tooltip");
  assert.match(css, /\.inv-held-ghost\s*\{[\s\S]*?width:\s*var\(--ghost-size,\s*64px\);\s*height:\s*var\(--ghost-size,\s*64px\);\s*aspect-ratio:\s*1\s*\/\s*1/,
    "held inventory item ghost stays 1:1 square matching inventory slots");
  assert.match(css, /\.outfit-view\s*\{[\s\S]*?min-height:\s*clamp\(336px,\s*50vh,\s*460px\)/,
    "3D ship preview expanded vertically into removed description space");
  assert.match(css, /\.outfit-service\s*\{[\s\S]*?width:\s*min\(100%,\s*468px\)[\s\S]*?min-height:\s*172px/,
    "Services box is less horizontal and slightly enlarged for future services");
  assert.match(css, /\.service-label\s*\{[\s\S]*?font-size:\s*15px/, "Service text is 50% larger (15px vs 10px)");
  assert.match(css, /\.inv-item-name\s*\{[\s\S]*?font-size:\s*9\.5px/, "inventory item text scaled down so names never clip");
  assert.match(css, /\.inv-item-meta\s*\{[\s\S]*?font-size:\s*8\.5px/, "inventory volume meta scaled down cleanly");
});

test("Module Show info lists complete player stats for every module type and Mission log Details expands inline", () => {
  freshDocked(10000);
  // Every module in MODULES produces rich multi-section stats with MJ usage, slot & volume info.
  for (const id of Object.keys(MODULES)) {
    const info = moduleInfoData(id, state.profile);
    assert.ok(info && info.sections.length >= 2, `${id} has rich stat sections`);
    const html = moduleDetailsHtml(id, state.profile);
    assert.match(html, new RegExp(info.name));
    assert.match(html, /MJ/);
    assert.match(html, /m³/);
  }
  // Cannons: outputs, range, projectile speed, fire rate, DPS, MJ usage.
  const cannonHtml = moduleDetailsHtml("cannon_basic", state.profile);
  assert.match(cannonHtml, /Outputs<\/dt><dd>2 linked barrels/);
  assert.match(cannonHtml, /Effective range<\/dt><dd>2160 m/);
  assert.match(cannonHtml, /Projectile speed<\/dt><dd>900 m\/s/);
  assert.match(cannonHtml, /Sustained DPS<\/dt><dd>6 HP\/s/);
  assert.match(cannonHtml, /MJ usage \(firing\)<\/dt><dd>2 MJ\/s/);

  // Mining beam: outputs, beam range, cycle time, MJ usage, plus Prospector 2x bonus when flown.
  buyItem("meridian", "prospector", 1, state.player, state.profile, state.worldState, "ship");
  selectShip("prospector");
  const beamHtml = moduleDetailsHtml("beam_basic", state.profile);
  assert.match(beamHtml, /Outputs<\/dt><dd>1 emitter/);
  assert.match(beamHtml, /Beam range<\/dt><dd>340 m/);
  assert.match(beamHtml, /Cycle time<\/dt><dd>4 s \/ ore/);
  assert.match(beamHtml, /On Prospector<\/dt><dd>2 s \/ ore \(2× hull\)/);
  assert.match(beamHtml, /MJ usage \(cutting\)<\/dt><dd>2 MJ\/s/);
  assert.match(beamHtml, /Shop price<\/dt><dd>900 cr/);

  // Missiles: outputs, damage, reload, magazine, lock-on range, max flight reach, MJ usage.
  state.worldState.base.hangar = 2;
  buyItem("meridian", "bulwark", 1, state.player, state.profile, state.worldState, "ship");
  selectShip("bulwark");
  const mslHtml = moduleDetailsHtml("missile_basic", state.profile);
  assert.match(mslHtml, /Outputs<\/dt><dd>1 launch tube/);
  assert.match(mslHtml, /Damage per missile<\/dt><dd>8 HP/);
  assert.match(mslHtml, /On Bulwark<\/dt><dd>12 HP \(1\.5× hull\)/);
  assert.match(mslHtml, /Lock-on range<\/dt><dd>2500 m/);
  assert.match(mslHtml, /Max flight reach<\/dt><dd>~\d+ m/);
  assert.match(mslHtml, /Magazine capacity<\/dt><dd>12 missiles/);
  assert.match(mslHtml, /MJ usage<\/dt><dd>0 MJ\/s/);

  // Mission log Details: grows the same card inline without duplicating title, status or Next.
  const m = acceptMission(BORDER_SIGNAL_MISSION);
  m.details = ["Bring back telemetry from the hollow."];
  const log = leftPanelHtml({ tab: "l", leftPanel: "m" });
  assert.equal((log.match(/The Border Signal/g) || []).length, 1, "mission title is not duplicated in Details");
  assert.equal((log.match(/<strong>Next:<\/strong>/g) || []).length, 1, "Next objective is not duplicated in Details");
  assert.doesNotMatch(log, /<h4>/, "no duplicate inner heading box");
  assert.match(log, /Bring back telemetry from the hollow\./, "extra mission details continue inside card");
  assert.match(log, /<strong>Hand in:<\/strong> Meridian Station/, "hand-in station shown inside expanded card");
});

test("My Assets prefix search + collapsible ship cargo menu (including ship cargo in search)", () => {
  freshDocked(10000);
  buyItem("meridian", "prospector", 1, state.player, state.profile, state.worldState, "ship");
  addItem("wasp", "ferrite", 4);
  addItem("prospector", "wire", 2);
  addItem(STATION, "power_basic", 6);
  addItem(STATION, "cobalt", 3);

  const all = listPlayerAssets(state.profile, state.worldState, { docked: true });
  assert.equal(all.length, 1);
  const waspRow = all[0].ships.find(s => s.id === "wasp");
  assert.deepEqual(waspRow.cargoItems.map(c => [c.id, c.n]), [["ferrite", 4]], "ship lists its hold contents");

  // Search button + collapsible ship cargo sub-menu when expanded.
  state.ui.assetsOpen = { [DEFAULT_PLACE]: true };
  state.ui.assetShipsOpen = {};
  const collapsedHtml = assetsHtml(state.profile, state.worldState, { docked: true });
  assert.match(collapsedHtml, /data-a="assetSearchToggle"/, "My Assets includes Search button");
  assert.match(collapsedHtml, /data-a="assetShip" data-b="reach::wasp"/, "ships are collapsible");
  assert.doesNotMatch(collapsedHtml, /data-asset-ship-cargo="wasp"/, "ship cargo stays collapsed until clicked");

  state.ui.assetShipsOpen = { "reach::wasp": true };
  const expandedHtml = assetsHtml(state.profile, state.worldState, { docked: true });
  assert.match(expandedHtml, /data-asset-ship-cargo="wasp"[\s\S]*?Ferrite/, "expanding a ship shows its cargo contents");

  // Prefix filtering: typing "W" matches Wasp (and Copper wire? No — "Copper wire" starts with C!),
  // and does NOT match "Basic powerplant" even though "powerplant" contains a "w".
  const wFiltered = filterPlayerAssets(all, "W");
  assert.equal(wFiltered.length, 1);
  assert.deepEqual(wFiltered[0].ships.map(s => s.name), ["Wasp"]);
  assert.deepEqual(wFiltered[0].items, [], "Basic powerplant does not match prefix W");

  // Typing "F" matches Ferrite inside Wasp's cargo hold and auto-expands Wasp's cargo!
  const fHtml = assetsResultsHtml(state.profile, state.worldState, {
    docked: true,
    openMap: {},
    shipOpenMap: {},
    query: "f",
  });
  assert.match(fHtml, /Ferrite/, "ship hold cargo starting with F appears in search");
  assert.match(fHtml, /data-asset-ship-cargo="wasp"/, "matching ship hold auto-expands");
  assert.doesNotMatch(fHtml, /Basic powerplant|Cobalt|Prospector/, "non-matching items and ships are filtered out");

  // Typing "B" matches Basic powerplant (station) but not Ferrite/Cobalt/Wasp/Prospector.
  const bHtml = assetsResultsHtml(state.profile, state.worldState, { docked: true, query: "B" });
  assert.match(bHtml, /Basic powerplant/);
  assert.doesNotMatch(bHtml, /Wasp|Prospector|Cobalt|Ferrite/);

  // Direct fitting rules: cannot equip onto inactive ship, refuses when multi-bay full, swaps 1-bay upgrades.
  addItem(STATION, "beam_basic", 2);
  assert.equal(canEquipModule("beam_basic", STATION).ok, true);
  assert.equal(equipModuleFromInventory(STATION, -1, "beam_basic").ok, true);
  assert.equal(canEquipModule("beam_basic", STATION).ok, false, "all 2 primary bays full -> refuses overwrite");
  assert.equal(fitModuleFrom(STATION, -1, "shield", 0, "beam_basic").ok, false, "wrong bay group rejected");
  assert.equal(unequipTo("primary", 1, "wasp", 3).ok, true, "unequips straight into chosen ship hold slot");
  assert.deepEqual(slotsAt("wasp")[3], { id: "beam_basic", n: 1 });
});

test("HUD ship velocity in m/s is negative when reversing, 0 at rest, and positive moving forward", () => {
  freshDocked();
  launch();
  const p = state.player;
  p.pos.set(500, 0, 500);
  p.v.set(0, 0, 0);
  p.thr = 0;
  flight(SIM_DT, p);
  assert.equal(displayedSpeed(p), 0);
  assert.equal(Object.is(displayedSpeed(p), -0), false, "zero never renders as -0");

  // Reverse throttle accelerates backwards -> negative m/s (~ -45 m/s on stock Wasp).
  p.thr = -1;
  for (let i = 0; i < 180; i++) flight(SIM_DT, p);
  const rev = displayedSpeed(p);
  assert.ok(rev < -40, `reversing reports negative speed (${rev} m/s)`);

  // Coasting backwards with throttle cut stays negative until stopped.
  p.thr = 0;
  flight(SIM_DT, p);
  assert.ok(displayedSpeed(p) < 0, "coasting backwards still reads negative m/s");

  // Forward throttle accelerates forward -> positive m/s (~ +150 m/s on stock Wasp).
  p.thr = 1;
  for (let i = 0; i < 240; i++) flight(SIM_DT, p);
  const fwd = displayedSpeed(p);
  assert.ok(fwd > 140, `forward flight reports positive speed (${fwd} m/s)`);
});
