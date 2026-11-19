// Slice 3 + polish verification:
//   - 0 MJ power tank rule: nothing using MJ runs or reports draw at 0 MJ stored
//   - Shop -> Modules -> Primary weapons -> Mining beams collapsible sub-category
//   - #1 My Assets sub-tab (docked Station Inventory & in-flight Ship Inventory `I`)
//   - #7 Minecraft-style inventory slots, right-click place-1, right-click Take amount,
//     Shift+left-click stack transfer, Stack all, and save v24 slot persistence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { state, currentSave, applySave, resetPlaces } from "../src/state/state.js";
import { SAVE_VERSION, newProfile, newWorld, sanitizeSave } from "../src/state/profile.js";
import { encodeSave, decodeSave } from "../src/state/storage.js";
import { DEFAULT_PLACE, setPlaceCatalog, stationKeyAt } from "../src/data/places.js";
import { generateGalaxy } from "../src/sim/galaxy.js";
import { prepareGalaxySave } from "../src/sim/galaxy-session.js";
import { createPlayer } from "../src/sim/player.js";
import { configurePlayer } from "../src/sim/session.js";
import { enterPlace } from "../src/sim/places.js";
import { stepSim } from "../src/sim/step.js";
import { fitModule, unequip } from "../src/sim/fitting.js";
import { V } from "../src/util/math.js";
import { hasPower } from "../src/sim/power.js";
import {
  STATION,
  addItem,
  countOf,
  discardItem,
  slotsAt,
  slotAt,
  takeItem,
} from "../src/sim/inventory.js";
import {
  buyShip,
  listPlayerAssets,
  sellInventoryItem,
  shopCatalogue,
} from "../src/sim/economy.js";
import {
  cancelHeldStack,
  clickInventorySlot,
  getHeldStack,
  openTakeAmountPopover,
  pickupSlotAmount,
  rightClickInventorySlot,
  runStackAll,
  takeAmountHtml,
} from "../src/ui/inventory-ui.js";
import { assetsHtml, cargoHtml, leftPanelHtml, outpostHtml } from "../src/ui/screens.js";

function freshSession({ docked = true } = {}) {
  cancelHeldStack();
  resetPlaces();
  state.players.length = 0;
  state.localPlayerIndex = 0;
  const galaxy = generateGalaxy();
  setPlaceCatalog(galaxy);
  state.galaxy = galaxy;
  state.profile = newProfile();
  state.worldState = newWorld();
  state.place = DEFAULT_PLACE;
  state.worldState.place = DEFAULT_PLACE;
  state.paused = false;
  state.warp = null;
  state.freeCam.on = false;
  state.ui.intro = false;
  state.ui.tab = "i";
  state.ui.invShip = null;
  state.ui.invView = "inv";
  state.ui.cargoView = "hold";
  state.ui.assetsOpen = {};
  state.ui.invHeld = null;
  state.ui.shopOpen = {};
  state.hud.msg = "";
  state.hud.msgT = 0;
  state.hud.prompt = "";
  const player = configurePlayer(createPlayer(), state.profile);
  enterPlace(DEFAULT_PLACE, player);
  player.docked = docked;
  player.pos.set(0, 0, 6000);
  player.spd = 0;
  return { player, galaxy };
}

test("0 MJ power fix: unequipped power cell disables thrusters, boost, shields, guns and mining beam with 0 draw", () => {
  const { player } = freshSession({ docked: true });
  // Fit a mining beam in bay 2, then unequip the power cell so cap === 0 and stored === 0 while gen === 10.
  addItem(STATION, "beam_basic", 1, state.profile, state.worldState);
  fitModule("primary", 1, "beam_basic", player, state.profile, state.worldState);
  unequip("cell", 0, player, state.profile, state.worldState);

  assert.equal(player.power.cap, 0, "no cell capacity");
  assert.equal(player.power.stored, 0, "0 MJ stored in tank");
  assert.equal(player.power.gen, 10, "powerplant still installed");
  assert.equal(hasPower(2, player.power), false, "cannot draw MJ from 0 MJ tank");

  // Launch into clear space with shields initially up and press every MJ-consuming control at once.
  player.docked = false;
  const shBefore = player.sh;
  assert.ok(shBefore > 0);
  const startPos = player.pos.clone();
  const startQuat = player.quat.clone();

  const c = player.controls;
  c.thrust = 1;
  c.strafe = 1;
  c.lift = 1;
  c.roll = 1;
  c.steer.x = 0.8;
  c.steer.y = 0.5;
  c.boost = true;
  c.fire = true;
  state.world.bullets.length = 0;

  for (let i = 0; i < 30; i++) stepSim(0.05);

  assert.equal(player.power.stored, 0, "power tank remains 0 MJ");
  assert.equal(player.power.draw, 0, "HUD reports Using 0 of 10 MJ/s (no phantom usage)");
  assert.equal(player.power.use.drive || 0, 0, "drive draw is 0");
  assert.equal(player.power.use.shield || 0, 0, "shield draw is 0");
  assert.equal(player.power.use.guns || 0, 0, "cannon draw is 0");
  assert.equal(player.thr, 0, "throttle stays cold at 0 MJ");
  assert.equal(player.spd, 0, "speed stays 0 m/s");
  assert.equal(player.boost, false, "boost never ignites at 0 MJ");
  assert.ok(player.pos.distanceTo(startPos) < 1e-6, "ship does not move on thrust, strafe or lift");
  assert.ok(Math.abs(player.quat.dot(startQuat)) > 0.999999, "ship does not turn without stored power");
  assert.ok(player.sh < shBefore, "unpowered shields bleed down");
  assert.equal(state.world.bullets.length, 0, "cannons fire zero shots at 0 MJ");
  assert.equal(state.hud.msg, "No stored power", "pilot is told why the ship cannot move");

  // Switch to primary bay 2 (mining beam) directly in front of an asteroid (and also test wall-free range).
  player.pos.set(0, 0, 6000);
  player.quat.set(0, 0, 0, 1);
  state.world.asteroids.push({
    id: "r-zero-mj",
    kind: "rock",
    pos: V(0, 0, 5940),
    scale: V(1, 1, 1),
    s0: V(1, 1, 1),
    r: 12,
    type: "ferrite",
    ore: 10,
    max: 10,
    shape: 0,
  });
  state.profile.pw = "2";
  player.weapon = "2";
  for (let i = 0; i < 20; i++) stepSim(0.05);

  assert.equal(player.flight.beamOn, false, "mining beam never lights at 0 MJ");
  assert.equal(player.power.use.beam || 0, 0, "mining beam draw is 0");
  assert.equal(player.power.draw, 0, "total draw remains 0 MJ/s");
  assert.equal(countOf(player.ship, "ferrite"), 0, "zero ore mined at 0 MJ");
  assert.equal(state.hud.prompt, "Not enough power");
});

test("0 MJ power fix: draining a power cell without a powerplant cuts all systems and drops draw to 0", () => {
  const { player } = freshSession({ docked: true });
  unequip("power", 0, player, state.profile, state.worldState);
  player.docked = false;
  player.power.stored = 0.2;
  player.controls.thrust = 1;
  player.controls.fire = true;

  // Step 1: still has 0.2 MJ -> draws and empties tank to 0.
  stepSim(0.1);
  assert.equal(player.power.stored, 0, "cell ran dry");

  // Step 2: now at 0 MJ -> every MJ consumer shuts down and draw drops to 0.
  const shotsAfterDrain = state.world.bullets.length;
  stepSim(0.1);
  assert.equal(player.power.stored, 0);
  assert.equal(player.power.draw, 0, "0 MJ/s drawn once the tank is empty");
  assert.equal(player.power.use.drive || 0, 0);
  assert.equal(player.power.use.shield || 0, 0);
  assert.equal(player.power.use.guns || 0, 0);
  assert.equal(state.world.bullets.length, shotsAfterDrain, "no further cannon shots at 0 MJ");
});

test("Shop: Mining beams has its own collapsible sub-category under Primary weapons", () => {
  freshSession({ docked: true });
  const cat = shopCatalogue("meridian", state.profile, state.worldState);
  const primary = cat.find(g => g.k === "modules").subgroups.find(s => s.k === "primary");
  const mining = primary.subgroups.find(s => s.k === "mining");
  assert.ok(mining, "Mining beams sub-category exists");
  assert.equal(mining.n, "Mining beams");
  assert.deepEqual(mining.items.map(i => i.id), ["beam_basic"]);

  state.ui.leftPanel = "p";
  state.ui.shopOpen = { modules: true, "modules:primary": true };
  const closedSub = leftPanelHtml(state.ui);
  assert.match(closedSub, /Mining beams/);
  assert.doesNotMatch(closedSub, /data-b="meridian:item:beam_basic"/);

  state.ui.shopOpen["modules:primary:mining"] = true;
  const openSub = leftPanelHtml(state.ui);
  assert.match(openSub, /data-a="wb" data-b="meridian:item:beam_basic"/);
});

test("Slice 3 #1: My Assets lists stations with stored ships and items both docked and in flight", () => {
  const { player, galaxy } = freshSession({ docked: true });
  // Find a second station pocket in the galaxy so we verify multi-station listing.
  const otherStation = Object.values(galaxy.pockets).find(
    p => p.id !== DEFAULT_PLACE && stationKeyAt(p.id)
  );
  assert.ok(otherStation, "galaxy has another dockable station");

  // Empty flight state: only flying Wasp, zero stored items anywhere -> empty My Assets.
  assert.deepEqual(
    listPlayerAssets(state.profile, state.worldState, { docked: false, place: DEFAULT_PLACE }),
    [],
    "flying with only one ship and no stored items yields no station rows"
  );
  assert.match(
    assetsHtml(state.profile, state.worldState, { docked: false }),
    /No ships or items stored at any station/
  );

  // Stock Meridian with a second Wasp, 8 Ferrite and a spare Beam; stock the second station with a Prospector & 5 Cobalt.
  state.worldState.base.hangar = 3;
  state.profile.cr = 20000;
  buyShip("wasp", state.profile, state.worldState, 1, null, player);
  addItem(STATION, "ferrite", 8, state.profile, state.worldState);
  addItem(STATION, "beam_basic", 1, state.profile, state.worldState);
  addItem("wasp#2", "salv", 3, state.profile, state.worldState);

  buyShip("prospector", state.profile, state.worldState, 1, null, player);
  state.profile.shipPlaces.prospector = otherStation.id;
  const otherKey = stationKeyAt(otherStation.id);
  state.worldState.stationStores[otherKey] = { cobalt: 5 };

  // Docked at Meridian: Meridian comes first (Docked), has 2 ships (Wasp active + Wasp #2) and 9 items; other station has Prospector + 5 Cobalt.
  const dockedAssets = listPlayerAssets(state.profile, state.worldState, { docked: true, place: DEFAULT_PLACE });
  assert.equal(dockedAssets.length, 2, "only the 2 stations with assets appear");
  assert.equal(dockedAssets[0].placeId, DEFAULT_PLACE, "docked station sorts first");
  assert.equal(dockedAssets[0].here, true);
  assert.deepEqual(dockedAssets[0].ships.map(s => [s.name, s.active]), [["Wasp #1", true], ["Wasp #2", false]]);
  assert.equal(dockedAssets[0].ships[1].cargoUnits, 3, "reports cargo aboard stored ship");
  assert.deepEqual(dockedAssets[0].items.map(i => [i.id, i.n]), [["ferrite", 8], ["beam_basic", 1]]);
  assert.equal(dockedAssets[1].placeId, otherStation.id);
  assert.deepEqual(dockedAssets[1].ships.map(s => s.id), ["prospector"]);
  assert.deepEqual(dockedAssets[1].items.map(i => [i.id, i.n]), [["cobalt", 5]]);

  // Docked UI: collapsed station rows expand to compact 1-line entries on toggle.
  state.ui.tab = "i";
  state.ui.invView = "assets";
  state.ui.assetsOpen = {};
  const collapsed = outpostHtml(state.ui);
  assert.match(collapsed, new RegExp(`data-a="assetStation" data-b="${DEFAULT_PLACE}"`));
  assert.match(collapsed, new RegExp(`data-a="assetStation" data-b="${otherStation.id}"`));
  assert.doesNotMatch(collapsed, /class="assets-rows"/, "collapsed until clicked");

  state.ui.assetsOpen[DEFAULT_PLACE] = true;
  state.ui.assetsOpen[otherStation.id] = true;
  const expanded = outpostHtml(state.ui);
  assert.match(expanded, /Wasp #1/);
  assert.match(expanded, /Active ship/);
  assert.match(expanded, /Wasp #2/);
  assert.match(expanded, /Ferrite/);
  assert.match(expanded, /&times;8/);
  assert.match(expanded, /Prospector/);
  assert.match(expanded, /Cobalt/);
  assert.match(expanded, /&times;5/);
  assert.match(expanded, /data-ship-type="prospector"/, "right-click ship info hook present");

  // In-flight Ship Inventory `I`: omits the actively flown Wasp #1, still lists Wasp #2 at Meridian and Prospector + Cobalt at otherStation.
  player.docked = false;
  state.ui.cargoView = "assets";
  const flightHtml = cargoHtml(state.profile);
  assert.match(flightHtml, /My Assets/);
  assert.doesNotMatch(flightHtml, /Active ship/, "flown ship is out in space, not in hangar");
  assert.match(flightHtml, /Wasp/);
  assert.match(flightHtml, /Ferrite/);
  assert.match(flightHtml, /Prospector/);
  assert.match(flightHtml, /Cobalt/);
});

test("Slice 3 #7: Minecraft-style slots — pick/place/sort, right-click place-1, merge, swap, Take amount, Shift+click, Stack all, and save v24 round-trip", () => {
  freshSession({ docked: true });
  const ship = state.profile.ship; // Wasp: 20 m³ cargo

  addItem(STATION, "ferrite", 10, state.profile, state.worldState);
  addItem(STATION, "cobalt", 6, state.profile, state.worldState);

  // 1. Left-click does NOT instantly move an item to the ship: it picks the stack up onto the cursor.
  clickInventorySlot({ where: STATION, slot: 0, otherWhere: ship });
  assert.deepEqual(getHeldStack()?.id, "ferrite");
  assert.equal(getHeldStack()?.n, 10);
  assert.equal(countOf(ship, "ferrite"), 0, "left-click did not auto-transfer to ship");
  assert.equal(slotAt(STATION, 0), null, "lifted out of station slot 0");

  // 2. Right-click while holding places 1 item into empty slots (both in Station and in Ship hold) and merges +1 into matching slots.
  rightClickInventorySlot({ where: STATION, slot: 7 });
  rightClickInventorySlot({ where: STATION, slot: 7 });
  rightClickInventorySlot({ where: ship, slot: 5 });
  rightClickInventorySlot({ where: ship, slot: 9 });
  assert.deepEqual(slotAt(STATION, 7), { id: "ferrite", n: 2 }, "two right-clicks placed 2 in station slot 7");
  assert.deepEqual(slotAt(ship, 5), { id: "ferrite", n: 1 }, "placed 1 in ship slot 5");
  assert.deepEqual(slotAt(ship, 9), { id: "ferrite", n: 1 }, "placed 1 in ship slot 9");
  assert.equal(getHeldStack()?.n, 6, "6 remain on the cursor");

  // 3. Left-click an empty slot drops the whole held stack at that exact slot (sorting with gaps).
  clickInventorySlot({ where: STATION, slot: 12 });
  assert.equal(getHeldStack(), null, "cursor cleared on drop");
  assert.deepEqual(slotAt(STATION, 12), { id: "ferrite", n: 6 });
  assert.equal(countOf(STATION, "ferrite"), 8);
  assert.equal(countOf(ship, "ferrite"), 2);

  // 4. Right-click -> Take amount picks up an exact count and leaves the remainder in the slot.
  assert.match(takeAmountHtml("ferrite", 6, 4), /data-a="takeConfirm"/);
  const bad = pickupSlotAmount({ where: STATION, slot: 12, amount: 99 });
  assert.equal(bad.ok, false);
  const took = pickupSlotAmount({ where: STATION, slot: 12, amount: 4 });
  assert.equal(took.ok, true);
  assert.equal(getHeldStack()?.n, 4);
  assert.deepEqual(slotAt(STATION, 12), { id: "ferrite", n: 2 }, "remainder stayed in slot 12");

  // 5. Left-click a matching stack merges into it.
  clickInventorySlot({ where: ship, slot: 5 });
  assert.equal(getHeldStack(), null);
  assert.deepEqual(slotAt(ship, 5), { id: "ferrite", n: 5 }, "merged 4 onto the 1 in ship slot 5");

  // 6. Left-click a different item stack swaps atomically.
  clickInventorySlot({ where: STATION, slot: 1 }); // cobalt x6
  assert.equal(getHeldStack()?.id, "cobalt");
  clickInventorySlot({ where: ship, slot: 5 }); // ferrite x5 -> swap!
  assert.deepEqual(slotAt(ship, 5), { id: "cobalt", n: 6 }, "cobalt swapped into ship slot 5");
  assert.deepEqual({ id: getHeldStack()?.id, n: getHeldStack()?.n }, { id: "ferrite", n: 5 }, "ferrite is now on cursor");
  clickInventorySlot({ where: STATION, slot: 1 }); // drop ferrite x5 in station slot 1
  assert.equal(getHeldStack(), null);

  // 7. Over-capacity swap into a ship hold is refused cleanly without losing an item.
  addItem(STATION, "salv", 25, state.profile, state.worldState);
  const salvIdx = slotsAt(STATION).findIndex(s => s?.id === "salv");
  clickInventorySlot({ where: STATION, slot: salvIdx });
  const refused = clickInventorySlot({ where: ship, slot: 5 }); // 25 m³ > Wasp's 20 m³ cap
  assert.equal(refused.changed, false, "swap exceeding m³ refused");
  assert.match(refused.message, /No room/);
  assert.deepEqual(slotAt(ship, 5), { id: "cobalt", n: 6 }, "ship slot untouched");
  assert.equal(getHeldStack()?.n, 25, "held stack untouched");

  // 8. Save snapshot while holding a stack never loses the held cargo, and Escape/cancel puts it right back.
  const midDragSave = decodeSave(encodeSave(currentSave()), prepareGalaxySave);
  assert.equal(midDragSave.v, SAVE_VERSION);
  assert.equal(SAVE_VERSION, 24);
  assert.equal(midDragSave.world.store.salv, 25, "save captured held stack safely");
  assert.equal(cancelHeldStack(), true, "Escape returns held stack to origin");
  assert.equal(countOf(STATION, "salv"), 25);

  // 9. Shift+left-click moves as much of the stack as fits into the other open inventory.
  const shiftRes = clickInventorySlot({ where: STATION, slot: salvIdx, otherWhere: ship, shiftKey: true });
  assert.equal(shiftRes.changed, true);
  assert.equal(shiftRes.moved, 13, "Wasp had 7/20 m³ used, so Shift-click moved 13 of 25 salv");
  assert.equal(countOf(ship, "salv"), 13);
  assert.deepEqual(slotAt(STATION, salvIdx), { id: "salv", n: 12 }, "remaining 12 stayed in its station slot");

  // 10. Slot-specific Sell and Discard deduct from the targeted split stack first.
  // Station currently has ferrite in slot 1 (x5), slot 7 (x2), and slot 12 (x2) = 9 total.
  sellInventoryItem("ferrite", STATION, 2, state.profile, state.worldState, 7);
  assert.equal(slotAt(STATION, 7), null, "sold slot 7's 2 ferrite");
  assert.deepEqual(slotAt(STATION, 1), { id: "ferrite", n: 5 }, "slot 1 untouched");
  assert.deepEqual(slotAt(STATION, 12), { id: "ferrite", n: 2 }, "slot 12 untouched");

  discardItem(STATION, "ferrite", 1, state.profile, state.worldState, 12);
  assert.deepEqual(slotAt(STATION, 12), { id: "ferrite", n: 1 }, "slot 12 dropped from 2 to 1");
  assert.deepEqual(slotAt(STATION, 1), { id: "ferrite", n: 5 }, "slot 1 still untouched");

  // 11. Custom split stacks & empty-slot positions survive save v24 encode/decode byte-for-byte.
  const saved = currentSave();
  const decoded = decodeSave(encodeSave(saved), prepareGalaxySave);
  applySave(decoded);
  assert.deepEqual(slotAt(STATION, 1), { id: "ferrite", n: 5 });
  assert.equal(slotAt(STATION, 7), null);
  assert.deepEqual(slotAt(STATION, 12), { id: "ferrite", n: 1 });
  assert.deepEqual(slotAt(ship, 5), { id: "cobalt", n: 6 });
  assert.deepEqual(slotAt(ship, 9), { id: "ferrite", n: 1 });

  // 12. External stock gain (mining +3 ferrite into ship hold) keeps custom slots intact and sums cleanly.
  takeItem(ship, "salv", 5, state.profile, state.worldState);
  addItem(ship, "ferrite", 3, state.profile, state.worldState);
  assert.deepEqual(slotAt(ship, 5), { id: "cobalt", n: 6 });
  assert.deepEqual(slotAt(ship, 9), { id: "ferrite", n: 4 }, "mined ferrite topped up the existing ferrite slot");

  // 13. Stack all merges all split stacks and compacts empty gaps in both Station and Ship hold.
  const stackStation = runStackAll(STATION);
  assert.equal(stackStation.changed, true);
  assert.deepEqual(slotsAt(STATION), [
    { id: "salv", n: 12 },
    { id: "ferrite", n: 6 },
  ], "Station split ferrite (5 + 1) merged in first-seen order and gaps removed");

  // Split ferrite in flight ship hold, then Stack all it too.
  clickInventorySlot({ where: ship, slot: 9 });
  rightClickInventorySlot({ where: ship, slot: 15 });
  clickInventorySlot({ where: ship, slot: 20 });
  const stackShip = runStackAll(ship);
  assert.equal(stackShip.changed, true);
  assert.deepEqual(slotsAt(ship), [
    { id: "salv", n: 8 },
    { id: "cobalt", n: 6 },
    { id: "ferrite", n: 4 },
  ], "Ship split ferrite merged and gaps compacted");

  // 14. Malformed saved slot layouts sanitize cleanly without ever creating or losing items.
  const dirty = JSON.parse(JSON.stringify(currentSave()));
  dirty.profile.holdSlots[ship] = [["ferrite", 999], ["fake_item", 50], null, ["cobalt", -3]];
  const cleaned = sanitizeSave(dirty);
  const sumBy = list => {
    const out = {};
    for (const s of list || []) if (s) out[s[0]] = (out[s[0]] || 0) + s[1];
    return out;
  };
  assert.deepEqual(sumBy(cleaned.profile.holdSlots[ship]), cleaned.profile.holds[ship]);
});

test("Slice 3 #7: openTakeAmountPopover validates input and lifts the requested count onto the cursor", () => {
  freshSession({ docked: true });
  addItem(STATION, "ferrite", 9, state.profile, state.worldState);

  const makeEl = tag => {
    const el = {
      tag,
      className: "",
      innerHTML: "",
      style: {},
      dataset: {},
      children: [],
      handlers: {},
      clientWidth: 600,
      clientHeight: 500,
      scrollLeft: 0,
      scrollTop: 0,
      setAttribute() {},
      addEventListener(type, fn) { this.handlers[type] = fn; },
      append(child) { this.children.push(child); child.parent = this; },
      remove() {
        if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this);
      },
      focus() {},
      select() {},
      querySelector(sel) {
        if (sel === ".inv-take-popover") return this.children.find(c => c.className.includes("inv-take-popover")) || null;
        if (sel === ".inv-sell-amount") return this._input || (this._input = { value: "5", focus() {}, select() {} });
        if (sel === ".inv-sell-error") return this._err || (this._err = { textContent: "" });
        return null;
      },
    };
    return el;
  };

  const prevDoc = globalThis.document;
  globalThis.document = { createElement: makeEl, body: makeEl("body") };
  try {
    const host = makeEl("div");
    let callbackPayload = null;
    const pop = openTakeAmountPopover({
      host,
      anchor: { left: 40, top: 60, width: 0 },
      where: STATION,
      slot: 0,
      id: "ferrite",
      count: 9,
      onTake: info => { callbackPayload = info; },
    });
    assert.ok(pop && host.children.includes(pop), "popover mounted inside host");
    assert.match(pop.innerHTML, /value="5"/, "defaults to half the stack rounded up");

    // Invalid amount shows error and takes nothing.
    pop.querySelector(".inv-sell-amount").value = "0";
    const confirmBtn = { dataset: { a: "takeConfirm" }, closest: () => confirmBtn };
    pop.handlers.click({ target: confirmBtn, stopPropagation() {}, clientX: 50, clientY: 60 });
    assert.equal(pop.querySelector(".inv-sell-error").textContent, "Enter a whole number from 1 to 9.");
    assert.equal(getHeldStack(), null);

    // Valid amount (3) lifts 3 onto cursor, leaves 6 in slot 0, and closes popover.
    pop.querySelector(".inv-sell-amount").value = "3";
    pop.handlers.click({ target: confirmBtn, stopPropagation() {}, clientX: 50, clientY: 60 });
    assert.equal(host.children.includes(pop), false, "popover closed after taking");
    assert.equal(callbackPayload?.amount, 3);
    assert.deepEqual({ id: getHeldStack()?.id, n: getHeldStack()?.n }, { id: "ferrite", n: 3 });
    assert.deepEqual(slotAt(STATION, 0), { id: "ferrite", n: 6 });
    cancelHeldStack();
  } finally {
    globalThis.document = prevDoc;
  }
});
