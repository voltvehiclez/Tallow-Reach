// Death recovery: the ship you fall back to is a COMPLETE ship.
//
// The owner's report: "If you die, you get a free wasp. Cant then equip equipment to the ship."
// The cause was that `die()` deleted the lost hull's portable records and then handed out a
// replacement hull id without creating the records a ship needs. `profile.loadout[ship]` is what
// Outfitting draws its bays from, so a hull without one has no bays at all (nothing can be fitted)
// and the drive, hull and guns all read as empty. Every way a hull joins the fleet — bought, or
// lent after a loss — now goes through `addShipRecords` in `state/profile.js`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../src/state/state.js";
import { addShipRecords, ensureShipRecords, newProfile, newSave, stockFor } from "../src/state/profile.js";
import { createPlayer } from "../src/sim/player.js";
import { configurePlayer, die } from "../src/sim/session.js";
import { driveOf } from "../src/sim/drive.js";
import { hullOf } from "../src/sim/hull.js";
import { gunsOf } from "../src/sim/guns.js";
import { layoutFor } from "../src/data/outfitting.js";
import { STATION, addItem } from "../src/sim/inventory.js";
import { fitModule, fittedAt } from "../src/sim/fitting.js";
import "../src/sim/missions.js";

/** A fresh docked pilot with `profile`, ready for the real death path. */
function pilotWith(profile) {
  state.worldState = newSave().world;
  state.place = "reach";
  state.profile = profile;
  state.players.length = 0;
  state.localPlayerIndex = 0;
  const P = createPlayer();      // binds state.profile and puts it in the pilot list
  configurePlayer(P, profile);   // copies the fitted ship into independent runtime
  P.docked = true;
  P.pos.set(0, 0, 0);
  return P;
}

/** Every owned hull has a hold, a hull fraction and a fit with the right bays. */
function assertCompleteShips(profile, where) {
  for (const id of profile.ships) {
    assert.ok(profile.holds[id], `${where}: ${id} has its own hold`);
    assert.ok(Number(profile.hp[id]) > 0, `${where}: ${id} has a hull fraction`);
    const fit = profile.loadout[id];
    assert.ok(fit, `${where}: ${id} has a fit (without one it has no bays to equip)`);
    for (const [group, slots] of Object.entries(layoutFor(id))) {
      assert.equal(fit[group]?.length, slots, `${where}: ${id} has ${slots} ${group} bay(s)`);
    }
  }
}

test("death: the station's spare Wasp is a complete, equippable, flyable ship", () => {
  const profile = newProfile();
  profile.cr = 0;                         // cannot buy anything: the station lends a Wasp
  profile.ships = ["wasp"];
  profile.ship = "wasp";
  delete profile.holds.wasp;
  delete profile.hp.wasp;
  delete profile.loadout.wasp;
  const P = pilotWith(profile);
  try {
    die();
    assert.deepEqual(profile.ships, ["wasp"], "the pilot still has a ship");
    assert.deepEqual(profile.holds.wasp, {}, "a fresh empty hold");
    assert.equal(profile.hp.wasp, 1, "a fresh hull, no remembered damage");
    assert.deepEqual(profile.loadout.wasp, stockFor("wasp"), "the stock modules are fitted");
    assertCompleteShips(profile, "after death");

    // The reported symptom: Outfitting must be able to equip it.
    addItem(STATION, "cannon_basic", 1, profile, state.worldState);
    fitModule("primary", 1, "cannon_basic", P, profile, state.worldState);
    assert.equal(fittedAt("primary", 1, profile), "cannon_basic", "a module goes into the empty second bay");

    // And it must actually work: Hull HP, drive and guns all read from that fit.
    assert.ok(hullOf(profile.loadout.wasp) > 0, "the lent ship has Hull HP");
    assert.ok(driveOf(profile.loadout.wasp).spd > 0, "the lent ship can move");
    assert.ok(gunsOf(profile.loadout.wasp).length > 0, "the lent ship can shoot");
  } finally {
    state.players.length = 0;
  }
});

test("death: falling back to another owned ship keeps that ship's own hold, fit and damage", () => {
  const profile = newProfile();
  profile.cr = 0;
  profile.ships = ["wasp", "prospector"];
  profile.ship = "wasp";
  profile.hp.prospector = 0.4;
  profile.holds.prospector = { ferrite: 2 };
  profile.loadout.prospector = stockFor("prospector");
  profile.loadout.prospector.primary[1] = "cannon_basic";
  const P = pilotWith(profile);
  try {
    die();
    assert.equal(profile.ship, "prospector", "the pilot falls back to the ship they still own");
    assert.deepEqual(profile.ships, ["prospector"], "the lost ship is gone");
    assert.deepEqual(profile.holds.prospector, { ferrite: 2 }, "its cargo is untouched");
    assert.equal(profile.loadout.prospector.primary[1], "cannon_basic", "its fittings are untouched");
    assert.ok(profile.hp.prospector > 0 && profile.hp.prospector <= 1, "its damage is remembered, not reset");
    assertCompleteShips(profile, "falling back");
  } finally {
    state.players.length = 0;
  }
});

test("a hull that joins the fleet is never half a ship: buying repairs a broken save too", () => {
  const profile = newProfile();
  const before = JSON.parse(JSON.stringify(profile.loadout.wasp));
  profile.loadout.wasp = null;            // as if a very old save forgot it
  profile.holds.wasp = null;
  delete profile.hp.wasp;
  ensureShipRecords(profile, "wasp");

  assertCompleteShips(profile, "ensureShipRecords");
  assert.deepEqual(profile.loadout.wasp, before, "the stock fit is restored");
  assert.equal(profile.hp.wasp, 1);

  addShipRecords(profile, "prospector");
  profile.ships.push("prospector");
  assertCompleteShips(profile, "addShipRecords");
});
