// Step 16 slice 4: a visiting pilot becomes a real ship in the host's world.
//
// The wire tests (`multiplayer-carry`) prove the suitcase moves. These prove the other
// half: `sim/multiplayer.js` turns that bundle into a player record the host's own
// `sim/step.js` will fly, and takes it out again — headlessly, with no browser.
//
// What this cannot prove: that the ship is DRAWN. `render/views.js` draws the local pilot
// and, since slice 3, nothing else; drawing a remote ship is slice 8. What ships here is
// the pilot is *real*: it has a fit, a hold, Hull HP, its own controls, and it is docked
// at a station this world actually has.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../src/state/state.js";
import { SAVE_VERSION, newProfile, newWorld, sanitizeSave } from "../src/state/profile.js";
import { checkOut, hostProfile, bundleFromProfile } from "../src/net/custody.js";
import {
  arriveGuest, leaveGuest, guestRecordOf, guestPlayers, guestPlayerCount, isGuestRecord,
  arrivalPlace, resetGuests,
} from "../src/sim/multiplayer.js";
import { createPlayer } from "../src/sim/player.js";
import { on } from "../src/util/events.js";
import { DEFAULT_PLACE } from "../src/data/places.js";

/** Start from a clean world with only the local pilot, as the game boots. */
function freshLocal() {
  resetGuests();
  state.players.length = 0;
  state.localPlayerIndex = 0;
  state.profile = newProfile();
  state.place = DEFAULT_PLACE;
  const local = createPlayer();
  local.docked = true;
  return local;
}

/** A guest's home save with a fit, a hold and credits. */
function guestSave({ cr = 1234, item = "ferrite", count = 7 } = {}) {
  const save = { v: SAVE_VERSION, profile: newProfile(), world: newWorld(), away: null };
  save.profile.cr = cr;
  save.profile.holds[save.profile.ship] = { [item]: count };
  return sanitizeSave(save);
}

const bundleFor = (save, extra = {}) =>
  checkOut(save, { worldId: "w-host", hostName: "Ada", guestId: "guest-1", token: "tok", ...extra }).bundle;

test("slice 4: a visiting pilot becomes a docked record with its own ship, hold and credits", () => {
  const local = freshLocal();
  const bundle = bundleFor(guestSave());
  const profile = hostProfile(bundle);
  const P = arriveGuest({ guestId: "guest-1", name: "Acey", profile, place: bundle.homeStation });

  assert.ok(P, "the visitor exists");
  assert.equal(state.players.length, 2, "the host's pilot and the visitor");
  assert.notEqual(P, local, "it is not the local pilot");
  assert.equal(P.guestId, "guest-1");
  assert.equal(P.name, "Acey");
  assert.equal(P.docked, true, "a guest arrives docked: flight positions never travel");
  assert.ok(P.profile && P.profile !== state.profile, "it has its own profile, never the host's");
  assert.equal(P.profile.cr, 1234, "its own credits came with it");
  assert.deepEqual(P.profile.holds[P.ship], { ferrite: 7 }, "its own hold came with it");
  assert.ok(P.hullMax > 0, "its fitted hull gives it Hull HP (L16: a hull id is not a ship)");
  assert.ok(P.configured, "and it was configured through the sim's own door");
  assert.equal(isGuestRecord(P), true);
  assert.equal(isGuestRecord(local), false, "the host's own pilot is not a visitor");
});

test("slice 4: a guest arrives at a station this world has, never in mid-space", () => {
  freshLocal();
  const bundle = bundleFor(guestSave(), {});
  // A guest whose home station this world does not know lands at Meridian.
  const moved = { ...bundle, homeStation: "a-galaxy-that-is-gone:pocket" };
  assert.equal(arrivalPlace(moved.profile, moved.homeStation), DEFAULT_PLACE, "an unknown station falls back to Meridian");
  // ...and one this world knows lands there.
  assert.equal(arrivalPlace({ homeStation: DEFAULT_PLACE }, DEFAULT_PLACE), DEFAULT_PLACE);
  const P = arriveGuest({ guestId: "g2", name: "Bex", profile: hostProfile(moved), place: moved.homeStation });
  assert.equal(P.place, DEFAULT_PLACE);
  assert.equal(P.docked, true);
});

test("slice 4: a visitor's own record is never the host's, so neither can fly the other's ship", () => {
  const local = freshLocal();
  const bundle = bundleFor(guestSave({ cr: 99 }));
  const P = arriveGuest({ guestId: "guest-1", name: "Acey", profile: hostProfile(bundle) });

  assert.notEqual(P.controls, local.controls, "two control records");
  assert.notEqual(P.controls.steer, local.controls.steer);
  assert.notEqual(P.power, state.power, "two power budgets");
  assert.notEqual(P.drive, state.drive, "two drives");
  // The host's pilot is untouched by the guest arriving.
  assert.equal(state.profile.cr, local.profile.cr);
  assert.equal(state.players[0], local);
});

test("slice 4: going home takes the record out and leaves every other pilot alone", () => {
  const local = freshLocal();
  const bundle = bundleFor(guestSave());
  const P = arriveGuest({ guestId: "guest-1", name: "Acey", profile: hostProfile(bundle) });
  assert.equal(guestPlayerCount(), 1);
  assert.equal(guestRecordOf("guest-1"), P);
  assert.deepEqual(guestPlayers(), [P]);

  assert.equal(leaveGuest("guest-1"), true);
  assert.equal(guestPlayerCount(), 0);
  assert.equal(guestRecordOf("guest-1"), null);
  assert.deepEqual(state.players, [local], "the host's pilot is still there, and only it");
  assert.equal(leaveGuest("guest-1"), false, "leaving twice is not an error");
});

test("slice 4: a second arrival for the same guest replaces the first, never adds a ship", () => {
  freshLocal();
  arriveGuest({ guestId: "guest-1", name: "Acey", profile: hostProfile(bundleFor(guestSave({ cr: 10 }))) });
  const again = arriveGuest({ guestId: "guest-1", name: "Acey", profile: hostProfile(bundleFor(guestSave({ cr: 20 }))) });
  assert.equal(state.players.length, 2, "still one host and one visitor");
  assert.equal(guestRecordOf("guest-1"), again);
  assert.equal(again.profile.cr, 20, "the newer copy is the live one");
});

test("slice 4: a bundle that cannot be configured is refused, and says so instead of half-arriving", () => {
  freshLocal();
  const heard = [];
  on("mp-notice", text => heard.push(text));
  // A profile with no fit at all is not a ship (L16): it must not be added.
  const P = arriveGuest({ guestId: "broken", name: "Cid", profile: { v: SAVE_VERSION } });
  assert.equal(P, null, "no record");
  assert.equal(state.players.length, 1, "and nothing was added");
  assert.equal(state.players[0].guestId, undefined, "the host's pilot was not touched");
});

test("slice 4: the host can read the visitor back out as a suitcase", () => {
  freshLocal();
  const bundle = bundleFor(guestSave({ cr: 500 }));
  const P = arriveGuest({ guestId: "guest-1", name: "Acey", profile: hostProfile(bundle) });
  // The guest flies, mines and is paid in the host's world.
  P.profile.cr = 1750;
  P.profile.holds[P.ship] = { ...P.profile.holds[P.ship], lumenite: 3 };

  const back = bundleFromProfile(P.profile, {
    lockers: [],
    previous: { ...bundle, guestId: "guest-1", hostName: "Ada" },
    name: P.name,
    rev: 2,
  });
  assert.equal(back.profile.cr, 1750, "the copy the host sends home is what the pilot BECAME");
  assert.equal(back.profile.holds[P.ship].lumenite, 3, "including what it mined here");
  assert.equal(back.rev, 2, "and it is ordered");
  assert.equal(back.token, "", "a host never holds the guest's secret");
  // The home half is not in it: a visitor has no missions, so none can leak home.
  assert.equal("missions" in back.profile, false, "no missions travel");
  assert.equal("flags" in back.profile, false, "no story flags travel");
});

test("slice 4: the guest's arrival is announced on the bus, which is how net/ hears it", () => {
  freshLocal();
  const seen = { arrived: [], left: [] };
  on("mp-guest-arrived", payload => seen.arrived.push(payload));
  on("mp-guest-left", payload => seen.left.push(payload));
  arriveGuest({ guestId: "guest-1", name: "Acey", profile: hostProfile(bundleFor(guestSave())) });
  leaveGuest("guest-1");
  assert.equal(seen.arrived.length, 1);
  assert.equal(seen.arrived[0].guestId, "guest-1");
  assert.equal(seen.arrived[0].name, "Acey");
  assert.ok(seen.arrived[0].player, "the live record is in the payload, for net/ to read");
  assert.equal(seen.left.length, 1);
});
