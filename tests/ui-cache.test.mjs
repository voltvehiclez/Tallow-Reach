// The rift-cache trade panel (owner 2026-11-14: opening a cache shows the ship's inventory and the
// cache's inventory side by side, and clicking and Shift-clicking moves cargo between them "exactly
// like ship inv and station inv").
//
// The sim half of the trade — what a canister holds, what a move is allowed to do, what a save keeps —
// is tested in step14-instances.test.mjs. This file tests the panel: that it is the station
// Inventory's own tiles in two columns, ship on the left and canister on the right, that the clicks
// the tiles promise are the clicks the handler makes, and that it opens and closes like the other
// modal surfaces in flight.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { state, localPlayer, instanceAt, resetPlaces } from "../src/state/state.js";
import { newProfile, newWorld } from "../src/state/profile.js";
import { configurePlayer } from "../src/sim/session.js";
import { createPlayer } from "../src/sim/player.js";
import { generateGalaxy } from "../src/sim/galaxy.js";
import { setPlaceCatalog, DEFAULT_PLACE } from "../src/data/places.js";
import { enterPlace } from "../src/sim/places.js";
import { addItem, countOf, CACHE } from "../src/sim/inventory.js";
import { openRift, enterRift, riftAction, updateInstances, cacheUnits } from "../src/sim/instances.js";
import { setSeed } from "../src/util/rng.js";
import { emit } from "../src/util/events.js";
import { keys, pointer, syncControls } from "../src/core/input.js";
import { SHIPS } from "../src/data/ships.js";
import {
  canOpenCache, setupCache, openCache, closeCache, isCacheOpen, toggleCache,
} from "../src/ui/cache.js";

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
    getBoundingClientRect() { return { left: 0, top: 0, width: 1160, height: 600 }; },
    classList: { add() {}, remove() {}, toggle() {} },
    closest() { return null; },
    querySelectorAll() { return []; },
    remove() {
      const parent = this.parentNode;
      if (parent) parent.children = parent.children.filter(kid => kid !== this);
      this.parentNode = null;
    },
  };
  // Named parts get their own node so the panel's body can be read back after a render.
  const parts = { "#cache-body": "body", ".cache-card": "card" };
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
    if (!found[selector]) {
      found[selector] = makeElement("div");
      found[selector].parentNode = node;
    }
    return found[selector];
  };
  return node;
}

let root = null;
function installDom() {
  globalThis.document = { body: makeElement("body"), createElement: makeElement };
  root = setupCache();
  return root;
}

/** A fresh session in the home pocket, in clear space, with a run the pilot is inside. */
function insideRift(seed = 4242) {
  resetPlaces();        // the previous test's run goes with it: one session, one rift at a time
  state.players.length = 0;
  state.localPlayerIndex = 0;
  state.profile = newProfile();
  state.worldState = newWorld();
  state.ui.intro = false;
  state.ui.starmap = null;
  state.ui.cargo = null;
  state.ui.cache = null;
  state.paused = false;
  state.place = DEFAULT_PLACE;
  state.galaxy = generateGalaxy(12012);
  setPlaceCatalog(state.galaxy);
  const player = configurePlayer(createPlayer(), state.profile);
  player.docked = false;
  player.flight.spawnT = 1e9;
  enterPlace(DEFAULT_PLACE, player);
  player.pos.set(0, 0, 4000);
  setSeed(seed);
  addItem(state.profile.ship, "rift_basic", 2, state.profile);
  const rift = openRift("basic", player, seed);
  assert.equal(typeof rift, "object", `the rift opens in clear space (${rift})`);
  assert.equal(enterRift(rift, player), true, "and the pilot goes in");
  const record = instanceAt(player.place);
  record.cache.open = true;        // the objective path that unlocks it is step14's test to own
  player.pos.copy(record.cache.pos);
  return { player, record };
}

/** A click on a panel tile: `closest` answers for the selector the handler asks about first. */
function clickOn(dataset, { shift = false } = {}) {
  const tile = makeElement("button");
  tile.dataset = dataset;
  const target = { closest: sel => (sel.includes("cmv") ? tile : null) };
  root.handlers.click({ target, shiftKey: shift, preventDefault() {} });
}

test("beside an unlocked canister, R opens the trade: the hold on the left, the canister on the right", () => {
  installDom();
  const { record } = insideRift();
  assert.equal(isCacheOpen(), false, "the panel is shut before anything is offered");
  assert.equal(riftAction(localPlayer()), true, "R beside the canister offers the trade");
  assert.equal(isCacheOpen(), true, "and the offer opens the panel");
  assert.equal(state.ui.cache.id, record.id, "which knows which run it is trading with");

  const html = root.querySelector("#cache-body").innerHTML;
  assert.match(html, new RegExp(`<h2>${record.cache.n}</h2>`), "it says which canister this is");
  const cols = [...html.matchAll(/<section class="inv-col">/g)];
  assert.equal(cols.length, 2, "two columns: a trade is two containers");
  const shipAt = html.indexOf(`${SHIPS[state.profile.ship].n} hold`),
    cacheAt = html.indexOf(`<h3>${record.cache.n}</h3>`);
  assert.ok(shipAt > -1 && cacheAt > shipAt, "the ship's own hold comes first, the canister off to the right");
  assert.ok(html.indexOf(`<div class="cache-cols">`) < shipAt, "and they sit side by side");

  // The same tiles as the station's Inventory tab, but with the trade's own move action, and pointing
  // at the other column: stow goes hold to canister, take goes canister to hold.
  assert.match(html, /data-a="cmv"/, "its tiles carry the trade's move action");
  assert.match(html, /data-dir="stow"/, "the hold's tiles send cargo into the canister");
  assert.match(html, /data-dir="take"/, "and the canister's tiles send it into the hold");
  const slots = html.match(/class="inv-item"|class="inv-empty-slot"/g) || [];
  assert.equal(slots.length, 70, "each column keeps the flight card's full slot field");
  assert.match(html, /Shift-click to move its whole stack/, "the panel explains the clicks");
  assert.match(html, /goes both ways/, "and that cargo can be put back");
  // A canister has no measured volume, so its column says what is in it and nothing more.
  const head = html.slice(cacheAt, cacheAt + 220);
  assert.match(head, /m³<\/span>/, "the canister's column reports its load");
  assert.doesNotMatch(head, /\/ [0-9.]+ m³|\/ Infinity/, "but has no capacity to show against");
  closeCache({ silent: true });
});

test("a click moves one and Shift moves the whole stack, in either direction", () => {
  installDom();
  const { player, record } = insideRift(777);
  const ship = state.profile.ship;
  const first = Object.keys(record.cache.stock)[0];
  const rolled = record.cache.stock[first];
  assert.ok(rolled > 1, "this seed rolls a stack the test can take apart");

  openCache();
  clickOn({ b: `c:${first}:take:1`, id: first, dir: "take", where: CACHE });
  assert.equal(countOf(ship, first), 1, "a click takes one unit into the hold");
  assert.equal(record.cache.stock[first], rolled - 1, "out of the canister");

  clickOn({ b: `c:${first}:take:1`, id: first, dir: "take", where: CACHE }, { shift: true });
  assert.equal(countOf(ship, first), rolled, "Shift-click takes the rest of the stack");
  assert.equal(record.cache.stock[first], undefined, "and a stack that reaches zero leaves the canister");

  clickOn({ b: `c:${first}:stow:1`, id: first, dir: "stow", where: ship });
  assert.equal(countOf(ship, first), rolled - 1, "a click puts one back");
  assert.equal(record.cache.stock[first], 1, "into the canister");
  updateInstances(1 / 60);
  assert.equal(state.world.caches.length, 1, "which hangs in the world again");
  assert.equal(state.world.caches[0].locked, false, "still open, as the pilot left it");
  assert.equal(player.docked, false, "and none of this docked or hurt anybody");
});

test("the trade is offered to a pilot who may look at it, and refused to one who may not", () => {
  installDom();
  const { player } = insideRift();
  assert.equal(canOpenCache(player), true, "in a run, beside an open canister, it opens");
  for (const [over, why] of [
    [{ docked: true }, "a docked pilot has the station's own Inventory tab"],
    [{ dead: true }, "a dead pilot has no hands"],
    [{ warp: {} }, "not mid-warp"],
    [{ loading: true }, "not while loading"],
  ]) {
    assert.equal(canOpenCache({ ...player, ...over }), false, why);
  }
  state.ui.starmap = {};
  assert.equal(canOpenCache(player), false, "not on top of the chart");
  state.ui.starmap = null;
  state.ui.cargo = { open: true };
  assert.equal(canOpenCache(player), false, "nor on top of the flight card");
  state.ui.cargo = null;
  state.paused = true;
  assert.equal(canOpenCache(player), false, "nor while paused");
  state.paused = false;
  state.ui.intro = true;
  assert.equal(canOpenCache(player), false, "nor on the title screen");
  state.ui.intro = false;

  // And with no run around the pilot there is nothing to trade with, whatever else is true.
  state.place = DEFAULT_PLACE;
  state.players[0].place = DEFAULT_PLACE;
  assert.equal(canOpenCache(player), false, "out in a pocket there is no canister to offer");
});

test("it closes like the other flight surfaces: on R again, on Esc's key, and when the run ends", () => {
  installDom();
  insideRift();
  openCache();
  assert.equal(isCacheOpen(), true, "open to start with");
  assert.equal(toggleCache(), true, "the same key that opened it puts it away");
  assert.equal(isCacheOpen(), false, "and the panel says so");
  assert.equal(state.ui.cache, null, "with no trade left in the ui state");

  openCache();
  emit("rift-left", { id: "x", origin: "reach" });
  assert.equal(isCacheOpen(), false, "leaving the run closes the trade");

  openCache();
  emit("died", "test");
  assert.equal(isCacheOpen(), false, "so does dying");

  openCache();
  emit("instance-closed", { id: "x", origin: "reach", reason: "expiry" });
  assert.equal(isCacheOpen(), false, "and the run collapsing under the pilot");

  openCache();
  emit("docked", {});
  assert.equal(isCacheOpen(), false, "and reaching a station, where cargo has its own tab");
});

test("an emptied canister keeps the panel open, and the hold's tiles still work beside it", () => {
  installDom();
  const { record } = insideRift(31337);
  const ship = state.profile.ship;
  openCache();

  // Empty it the way the pilot would: Shift-click each stack in the canister's column. The panel
  // redraws after every move, so the tiles it offers are read back from what it is showing.
  for (let i = 0; i < 6; i++) {
    const tile = root.querySelector("#cache-body").innerHTML.match(/data-b="c:([a-z_]+):take:1"/);
    if (!tile) break;
    clickOn({ b: `c:${tile[1]}:take:1`, id: tile[1], dir: "take", where: CACHE }, { shift: true });
  }
  assert.equal(cacheUnits(record.cache), 0, "the canister is empty");
  assert.equal(isCacheOpen(), true, "and the panel stays open: the pilot is still standing at it");
  const html = root.querySelector("#cache-body").innerHTML;
  assert.match(html, /The canister is empty/, "it says so plainly");
  assert.match(html, /data-dir="stow"/, "with the hold's tiles still offering to put something back");

  clickOn({ b: `c:ferrite:stow:1`, id: "ferrite", dir: "stow", where: ship });
  assert.equal(record.cache.stock.ferrite, undefined, "an empty hold has nothing to stow, and says nothing");
  addItem(ship, "ferrite", 2, state.profile);
  clickOn({ b: `c:ferrite:stow:1`, id: "ferrite", dir: "stow", where: ship });
  assert.equal(record.cache.stock.ferrite, 1, "but once the hold holds something, a click stows it");
  updateInstances(1 / 60);
  assert.equal(state.world.caches.length, 1, "and the canister is back in the world, holding it");
  closeCache({ silent: true });
});

test("opening the trade leaves the ship still: no thrust, no steer, no carry (owner 2026-11-14)", () => {
  installDom();
  const { player } = insideRift();

  // With the panel shut the stick is live: W is thrust, the mouse is steer, and the ship carries.
  keys.KeyW = 1;
  keys.ShiftLeft = 1;
  pointer.x = 0.8;
  pointer.y = -0.4;
  syncControls();
  assert.equal(player.controls.thrust, 1, "W thrusts while flying");
  assert.equal(player.controls.boost, true, "Shift boosts");
  assert.equal(player.controls.steer.x, 0.8, "and the mouse steers");
  player.v.set(30, 4, -12);
  player.thr = 0.7;

  openCache();
  assert.deepEqual(player.v.toArray(), [0, 0, 0], "opening the trade kills the carry outright");
  assert.equal(player.thr, 0, "and the throttle with it");
  // Now press them AGAIN while the panel is open, the way a pilot fidgets: opening released what was
  // held, so these are fresh presses against an open trade.
  keys.KeyW = 1;
  keys.ShiftLeft = 1;
  pointer.x = 0.8;
  pointer.y = -0.4;
  syncControls();
  assert.equal(player.controls.thrust, 0, "W held down does nothing while the trade is open");
  assert.equal(player.controls.strafe, 0, "nor A/D");
  assert.equal(player.controls.boost, false, "nor Shift");
  assert.equal(player.controls.fire, false, "nor a click on the panel: it is a click on the panel");
  assert.deepEqual([player.controls.steer.x, player.controls.steer.y], [0, 0],
    "and moving the mouse turns nothing");

  // A tick of the sim with those controls leaves the ship exactly where the trade opened.
  const spot = player.pos.toArray();
  updateInstances(1 / 60);
  assert.deepEqual(player.pos.toArray(), spot, "the ship hangs still beside the canister");

  closeCache({ silent: true });
  syncControls();
  assert.equal(player.controls.thrust, 1, "closing hands the stick back over a ship at rest");
  keys.KeyW = 0;
  keys.ShiftLeft = 0;
  pointer.x = pointer.y = 0;
  syncControls();
});
