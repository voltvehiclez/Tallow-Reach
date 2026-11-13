// Step 8c in progress: transforms and projectile launch can name their player.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { state } from "../src/state/state.js";
import { createPlayer, createPlayerRecord } from "../src/sim/player.js";
import { playerPos, playerFwd, playerDist, playerVel, setPlayerPos, facePlayer, playerLocal, playerMount } from "../src/sim/pilot.js";
import { fire } from "../src/sim/combat.js";
import { launchMissile } from "../src/sim/missile.js";
import { MISSILE } from "../src/data/weapons.js";

function players() {
  state.players.length = 0;
  state.localPlayerIndex = 0;
  const local = createPlayer();
  const other = createPlayerRecord();
  state.players.push(other);
  local.pos.set(1, 2, 3);
  local.v.set(0, 0, -10);
  other.pos.set(100, 200, 300);
  other.v.set(0, 0, -35);
  state.world.bullets.length = 0;
  state.world.missiles.length = 0;
  return { local, other };
}

test("explicit player transforms and mounts do not read or modify the local player", () => {
  const { local, other } = players();
  assert.equal(playerPos(), local.pos);
  assert.equal(playerPos(other), other.pos);
  assert.equal(playerVel(other), other.v);
  assert.equal(playerDist(new Vector3(100, 200, 305), other), 5);
  setPlayerPos(100, 200, 300, other);
  facePlayer(new Vector3(200, 200, 300), 1, other);
  assert.ok(playerFwd(other).distanceTo(new Vector3(1, 0, 0)) < 1e-10);
  assert.ok(playerLocal(new Vector3(0, 0, -5), other, "wasp").distanceTo(new Vector3(105, 200, 300)) < 1e-10);
  assert.ok(playerMount("missile", 0, 0, 1, other, "wasp").distanceTo(new Vector3(105, 198.8, 300)) < 1e-10);
  assert.deepEqual(local.pos.toArray(), [1, 2, 3]);
  assert.deepEqual(local.quat.toArray(), [0, 0, 0, 1]);
});

test("projectiles inherit velocity from the player explicitly firing them", () => {
  const { local, other } = players();
  const forward = new Vector3(0, 0, -1);
  const at = new Vector3(100, 200, 300);
  const bolt = fire(at, forward, 100, true, 1, other);
  assert.deepEqual(bolt.v.toArray(), [0, 0, -135]);
  const missile = launchMissile(null, { dmg: 8 }, forward, at, other);
  assert.equal(missile.sp, MISSILE.sp0 + 35);
  const localBolt = fire(at, forward, 100, true, 1);
  const localMissile = launchMissile(null, { dmg: 8 }, forward, at);
  assert.deepEqual(localBolt.v.toArray(), [0, 0, -110]);
  assert.equal(localMissile.sp, MISSILE.sp0 + 10);
  assert.deepEqual(local.pos.toArray(), [1, 2, 3]);
  assert.deepEqual(other.pos.toArray(), [100, 200, 300]);
});
