// Coming back out of a wormhole run after a reload shows the pocket as it really is (owner,
// 2026-11-15).
//
// The owner's report: "Going inside a simple wormhole and exiting the game in the wormhole. Then
// open game again and go through the exit wormhole and you get back to the simple wormhole pocket in
// normal space. This causes the debris around the wormhole in normal space invisible, wormhole is
// visible though. The debris are visible again when you warp out and back into the simple wormhole
// pocket."
//
// The pocket itself was never the problem — its container was simply never built. `loadPlace` only
// fills a place when `container.loaded` is false, and on a normal visit that path runs, which is why
// warping out and back fixed it. But a pilot who quit INSIDE the run is put straight back into the
// run by the load: the pocket they came through is never visited, so nothing ever loaded it.
// `leaveInstance` → `sendPilotsHome` then put the pilot back in a pocket with no world behind it:
// the scenery (the wormhole door) is rebuilt from the place definition either way, but the asteroid
// field lives in the world, and an empty world is an invisible debris field.
//
// The fix is in `sendPilotsHome`: the place the pilot is sent back to is loaded before they stand in
// it. These tests pin the observable result — leave a run after a reload and the pocket is the same
// place a fresh visit gives you — rather than the call that does it.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  state, resetPlaces, placeWorld, applySave, currentSave,
} from "../src/state/state.js";
import { newProfile, newWorld, sanitizeSave } from "../src/state/profile.js";
import { setPlaceCatalog } from "../src/data/places.js";
import { generateGalaxy } from "../src/sim/galaxy.js";
import { createPlayer } from "../src/sim/player.js";
import { configurePlayer } from "../src/sim/session.js";
import { enterPlace, loadPlace } from "../src/sim/places.js";
import { setSeed } from "../src/util/rng.js";
import { restoreWormholes } from "../src/sim/wormholes.js";
import {
  enterRift, leaveInstance, restoreInstances, populateInstances,
} from "../src/sim/instances.js";

const SEED = 12012;

/** Boot the game the way `main.js` does: galaxy, restore, place, load. */
function boot(save) {
  resetPlaces();
  state.players.length = 0;
  state.localPlayerIndex = 0;
  state.profile = newProfile();
  state.worldState = newWorld();
  state.ui.intro = false;
  state.galaxy = generateGalaxy(SEED);
  setPlaceCatalog(state.galaxy);
  if (save) applySave(save);
  const P = configurePlayer(createPlayer(), state.profile);
  P.docked = false;
  P.flight.spawnT = 1e9;
  restoreInstances();
  restoreWormholes();
  if (!save) {
    enterPlace("reach", P);
    P.pos.set(0, 0, 4000);
    P.quat.identity();
  }
  loadPlace(state.place);
  populateInstances();
  return P;
}

/** The first simple wormhole in the universe, and the run behind its door. */
function firstWormhole() {
  return [...state.wormholes.values()][0];
}

test("leaving a run after a reload shows the pocket exactly as a fresh visit does", () => {
  setSeed(SEED);

  // --- a fresh visit, for the answer to compare against ---
  let P = boot(null);
  const record = firstWormhole();
  assert.ok(record, "the universe has simple wormholes");

  P.place = record.id;
  state.place = record.id;
  loadPlace(record.id);
  const freshRocks = placeWorld(record.id).asteroids.length;
  assert.ok(freshRocks > 0, "the pocket has debris on a normal visit");

  // Through the door, into the run behind it.
  const door = placeWorld(record.id).rifts[0];
  assert.ok(door, "the pocket hangs a door");
  P.pos.copy(door.pos);
  assert.equal(enterRift(door, P), true, "the pilot goes through");
  assert.notEqual(state.place, record.id, "and is somewhere else");

  // --- quit inside the run, then load that save ---
  const save = sanitizeSave(currentSave());
  assert.equal(save.world.place, state.place, "the save names the run the pilot is standing in");

  P = boot(save);
  assert.equal(state.place, save.world.place, "the load puts the pilot back inside the run");

  // --- out through the way home ---
  const run = [...state.instances.values()][0];
  assert.ok(run, "the run came back with the save");
  P.pos.copy(run.exitPos);
  leaveInstance(P);

  assert.equal(state.place, record.id, "the pilot is back in the pocket they came from");
  const rocks = placeWorld(record.id).asteroids.length;
  assert.equal(rocks, freshRocks,
    `the pocket's debris is there (${rocks} rocks), the same as a fresh visit — it used to be 0`);
  assert.equal(state.places.get(record.id)?.loaded, true, "and its container was built, not left empty");
});

test("the pocket the pilot returns to is populated, not merely marked loaded", () => {
  // The distinction matters: `loaded` with an empty field would draw nothing and look like the bug.
  setSeed(SEED);
  let P = boot(null);
  const record = firstWormhole();
  P.place = record.id;
  state.place = record.id;
  loadPlace(record.id);
  const door = placeWorld(record.id).rifts[0];
  P.pos.copy(door.pos);
  enterRift(door, P);

  P = boot(sanitizeSave(currentSave()));
  const run = [...state.instances.values()][0];
  P.pos.copy(run.exitPos);
  leaveInstance(P);

  const w = placeWorld(record.id);
  assert.ok(w.asteroids.length > 0, "there are rocks in the world, not just a loaded flag");
  // Every rock is a real record the renderer can draw: position, shape and scale.
  for (const rock of w.asteroids) {
    assert.ok(rock.pos && Number.isFinite(rock.pos.x), "a rock has a position");
    assert.ok(Number.isFinite(rock.r) && rock.r > 0, "and a radius");
  }
});

test("leaving a run the ordinary way — no reload — still loads nothing twice and keeps the pocket", () => {
  // The fix runs on every exit, so the ordinary path must be unchanged: a pilot who never closed the
  // game gets the same pocket, and the field is not duplicated or respawned.
  setSeed(SEED);
  const P = boot(null);
  const record = firstWormhole();
  P.place = record.id;
  state.place = record.id;
  loadPlace(record.id);
  const before = placeWorld(record.id).asteroids.length;

  const door = placeWorld(record.id).rifts[0];
  P.pos.copy(door.pos);
  enterRift(door, P);
  const run = [...state.instances.values()][0];
  P.pos.copy(run.exitPos);
  leaveInstance(P);

  assert.equal(state.place, record.id, "back in the pocket");
  assert.equal(placeWorld(record.id).asteroids.length, before,
    "the same field, not a second one layered on top");
});
