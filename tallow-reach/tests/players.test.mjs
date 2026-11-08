// Step 8b: player records and local input, without a browser or networking.
import { test } from "node:test";
import assert from "node:assert/strict";
import { state, localPlayer } from "../src/state/state.js";
import { neutralControls } from "../src/state/controls.js";
import { createPlayer, createPlayerRecord } from "../src/sim/player.js";
import { keys, pointer, syncControls } from "../src/core/input.js";

function reset() {
  state.players.length = 0;
  state.localPlayerIndex = 0;
  state.controls = neutralControls();
  for (const key of Object.keys(keys)) delete keys[key];
  pointer.x = pointer.y = 0;
}

test("the local ship is a player-list entry and the compatibility aliases follow it", () => {
  reset();
  assert.equal(localPlayer(), null);
  const local = createPlayer();
  assert.equal(state.players.length, 1);
  assert.equal(localPlayer(), local);
  assert.equal(state.player, local);
  assert.equal(state.controls, local.controls);
  assert.equal(local.kind, "ship");
});

test("player records own independent controls, steering, position and orientation", () => {
  reset();
  const local = createPlayer();
  const guest = createPlayerRecord();
  state.players.push(guest);
  assert.notEqual(local.controls, guest.controls);
  assert.notEqual(local.controls.steer, guest.controls.steer);
  assert.notEqual(local.pos, guest.pos);
  assert.notEqual(local.quat, guest.quat);
  local.controls.steer.x = 0.7;
  local.controls.fire = true;
  local.pos.set(10, 20, 30);
  assert.equal(guest.controls.steer.x, 0);
  assert.equal(guest.controls.fire, false);
  assert.deepEqual(guest.pos.toArray(), [0, 0, 0]);
  assert.equal(localPlayer(), local);
});

test("input writes only the selected local player's controls", () => {
  reset();
  const local = createPlayer();
  const guest = createPlayerRecord();
  state.players.push(guest);
  keys.KeyW = 1;
  keys.fire = 1;
  pointer.x = 0.4;
  syncControls();
  assert.equal(local.controls.thrust, 1);
  assert.equal(local.controls.fire, true);
  assert.equal(local.controls.steer.x, 0.4);
  assert.deepEqual(guest.controls, neutralControls());
  // The lookup is genuinely local-player based, not hard-coded to index zero.
  state.localPlayerIndex = 1;
  keys.KeyW = 0;
  keys.KeyS = 1;
  syncControls();
  assert.equal(localPlayer(), guest);
  assert.equal(state.player, guest);
  assert.equal(state.controls, guest.controls);
  assert.equal(guest.controls.thrust, -1);
  assert.equal(local.controls.thrust, 1);
  reset();
});

test("input prepared before ship creation and local replacement is preserved without sharing", () => {
  reset();
  keys.KeyW = 1;
  pointer.y = 0.3;
  syncControls();
  const first = createPlayer();
  assert.equal(first.controls.thrust, 1);
  assert.equal(first.controls.steer.y, 0.3);
  const guest = createPlayerRecord();
  state.players.push(guest);
  const replacement = createPlayer();
  assert.equal(state.players.length, 2);
  assert.equal(state.players[1], guest);
  assert.equal(replacement.controls.thrust, 1);
  assert.notEqual(replacement.controls, first.controls);
  assert.notEqual(replacement.controls.steer, first.controls.steer);
  replacement.controls.steer.y = -1;
  assert.equal(first.controls.steer.y, 0.3);
  assert.deepEqual(guest.controls, neutralControls());
  reset();
});

test("single-player flight changes the local record, not a second player's record", async () => {
  const { newProfile } = await import("../src/state/profile.js");
  const { refreshDrive } = await import("../src/sim/drive.js");
  const { refillPower } = await import("../src/sim/power.js");
  const { flight } = await import("../src/sim/player.js");
  reset();
  state.profile = newProfile();
  state.sector = "hollow";
  state.warp = null;
  state.freeCam.on = false;
  state.world.asteroids.length = 0;
  const local = createPlayer();
  refreshDrive();
  refillPower();
  local.docked = false;
  const guest = createPlayerRecord();
  state.players.push(guest);
  local.controls.thrust = 1;
  guest.controls.thrust = -1;
  const before = guest.pos.toArray();
  flight(1 / 60);
  assert.notDeepEqual(local.pos.toArray(), [0, 0, 0]);
  assert.deepEqual(guest.pos.toArray(), before);
  assert.equal(guest.controls.thrust, -1);
  reset();
});
