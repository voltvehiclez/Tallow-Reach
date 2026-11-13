// Discard: right-click an inventory tile (station or ship) to trash the stack.
// It is the only thing to do with cargo in space, and a mission item cannot go.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { state } from "../src/state/state.js";
import { newProfile } from "../src/state/profile.js";
import { addItem, countOf, discardItem, itemsAt, STATION } from "../src/sim/inventory.js";
import { discardAskHtml, discardConfirmHtml, discardQuestion } from "../src/ui/discard.js";
import { canDiscard, canSell } from "../src/data/items.js";
import { cargoHtml, outpostHtml } from "../src/ui/screens.js";

test("discard empties a stack in the ship's hold", () => {
  const previous = state.profile;
  try {
    const profile = newProfile();
    state.profile = profile;
    addItem(profile.ship, "ferrite", 7, profile, state.worldState);
    assert.equal(countOf(profile.ship, "ferrite", profile, state.worldState), 7);
    assert.equal(discardItem(profile.ship, "ferrite", Infinity, profile, state.worldState),
      `Discarded 7 Ferrite from the ${profile.ship === "wasp" ? "Wasp" : "ship"}.`);
    assert.equal(countOf(profile.ship, "ferrite", profile, state.worldState), 0, "the whole stack is gone");
    assert.deepEqual(itemsAt(profile.ship, profile, state.worldState).map(i => i.id), [], "and the tile too");
  } finally {
    state.profile = previous;
  }
});

test("discard works on the station store as well, and only on what is there", () => {
  const previous = state.profile;
  try {
    const profile = newProfile();
    state.profile = profile;
    addItem(STATION, "ferrite", 4, profile, state.worldState);
    assert.equal(countOf(STATION, "ferrite", profile, state.worldState), 4);
    assert.equal(discardItem(STATION, "ferrite", Infinity, profile, state.worldState), "Discarded 4 Ferrite from the station.");
    assert.equal(countOf(STATION, "ferrite", profile, state.worldState), 0);
    assert.equal(discardItem(STATION, "ferrite", Infinity, profile, state.worldState), "No Ferrite to discard.",
      "a second discard says there is nothing left");
    assert.equal(discardItem(STATION, "nonsense", Infinity, profile, state.worldState), "Unknown item.");
    assert.equal(discardItem(profile.ship, "cobalt", Infinity, profile, state.worldState), "No Cobalt to discard.");
  } finally {
    state.profile = previous;
  }
});

test("a partial discard takes only the count asked for", () => {
  const previous = state.profile;
  try {
    const profile = newProfile();
    state.profile = profile;
    addItem(profile.ship, "cobalt", 9, profile, state.worldState);
    assert.equal(discardItem(profile.ship, "cobalt", 3, profile, state.worldState),
      "Discarded 3 Cobalt from the Wasp.");
    assert.equal(countOf(profile.ship, "cobalt", profile, state.worldState), 6, "the rest stays aboard");
    assert.equal(discardItem(profile.ship, "cobalt", 99, profile, state.worldState),
      "Discarded 6 Cobalt from the Wasp.", "asking for more than there is takes what is left");
    assert.equal(countOf(profile.ship, "cobalt", profile, state.worldState), 0);
  } finally {
    state.profile = previous;
  }
});

test("the discard popover asks how many, then asks for sure", () => {
  const ask = discardAskHtml("ferrite", 7, 7);
  assert.match(ask, /Discard Ferrite/, "step one names the item");
  assert.match(ask, /class="inv-sell-amount"[^>]*min="1" max="7"[^>]*value="7"/,
    "the same number box the sell popover uses, holding the whole stack");
  assert.match(ask, /\[data-a="discardAsk"\]|data-a="discardAsk"/, "and its own Discard button");
  assert.match(ask, /data-a="discardCancel"/, "with a cancel");
  assert.match(discardAskHtml("ferrite", 7, 2), /value="2"/, "the count asked for is kept");

  assert.equal(discardQuestion("ferrite", 3), "Are you sure you want to discard 3 Ferrite?",
    "step two asks the question the owner asked for");
  const confirm = discardConfirmHtml("ferrite", 3);
  assert.match(confirm, /Are you sure you want to discard 3 Ferrite\?/);
  assert.match(confirm, /It cannot be recovered\./, "and says the loss is final");
  assert.match(confirm, /data-a="discardConfirm"/, "one button commits");
  assert.match(confirm, /data-a="discardCancel"/, "one backs out");
});

test("a mission item cannot be discarded, and nothing sellable is affected", () => {
  assert.equal(canDiscard("beacon"), false, "a beacon strands its mission if trashed");
  assert.equal(canDiscard("parcel"), false, "so does a sealed parcel");
  assert.equal(canDiscard("ferrite"), true);
  assert.equal(canDiscard("power_basic"), true, "a spare module is ordinary cargo");
  assert.equal(canSell("ferrite"), true, "discard did not change the sell rule");
  assert.equal(canSell("beacon"), false);
});

test("every inventory tile says where it lives, so the menu trashes the right place", () => {
  const previous = state.profile;
  try {
    const profile = newProfile();
    state.profile = profile;
    addItem(profile.ship, "ferrite", 3, profile, state.worldState);
    addItem(STATION, "cobalt", 2, profile, state.worldState);

    const flight = cargoHtml(profile);
    assert.match(flight, new RegExp(`data-where="${profile.ship}"`), "the flight tile names the ship");
    assert.match(flight, /Right-click to discard/, "and says what right-click does");

    const station = outpostHtml({ tab: "i" });
    assert.match(station, /data-where="station"/, "station tiles name the store");
    assert.match(station, new RegExp(`data-where="${profile.ship}"`), "ship tiles name the hold");
    assert.match(station, /Right-click to discard/);
    assert.match(station, /data-a="mv"/, "moving is still the left-click action");
  } finally {
    state.profile = previous;
  }
});

test("both menus offer Discard: the station panel next to Sell, the flight card alone", () => {
  const read = file => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const menu = read("ui/menu.js");
  const cargo = read("ui/cargo.js");
  const items = read("data/items.js");

  assert.match(menu, /discard\.dataset\.a = "discard"/, "the station context menu has a Discard entry");
  assert.match(menu, /Discard \\u00d7\$\{tile\.dataset\.count\}/, "labelled with the stack it would trash");
  assert.match(menu, /if \(name === "discard"\)/, "and a handler for it");
  assert.match(menu, /openInventoryDiscard\(btn\)/, "which opens the popover, not a silent trash");
  assert.match(menu, /openDiscardPopover\(\{/, "through the shared two-step popover");
  assert.match(menu, /inv\.discardItem\(place, item, amount\)/, "discarding the amount asked for, from the tile's own place");
  assert.match(menu, /inventoryChanged\(\);/, "mission hand-offs retry after a discard");

  assert.match(cargo, /onCargoContextMenu/, "the flight card has a right-click menu");
  assert.match(cargo, /discard\.dataset\.a = "cargoDiscard"/);
  assert.match(cargo, /openCargoDiscard\(discard\)/, "the flight card uses the same two steps");
  assert.match(cargo, /discardItem\(place, item, amount\)/);

  assert.match(items, /canDiscard = id => isItem\(id\) && itemCat\(id\) !== "mission"/,
    "one rule decides what may be trashed");
});
