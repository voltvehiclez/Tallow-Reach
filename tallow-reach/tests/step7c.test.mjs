import { test } from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "three";
import { mountOffset } from "../src/data/mounts.js";
import { SHIPS } from "../src/data/ships.js";
import { state } from "../src/state/state.js";
import { playerMount } from "../src/sim/pilot.js";
import { enterPlace } from "../src/sim/places.js";
import { updateMissiles } from "../src/sim/weapons.js";
import { on } from "../src/util/events.js";

test("named mounts preserve old offsets and ship transforms for every hull", () => {
  for (const hull of Object.keys(SHIPS)) {
    state.profile.ship = hull;
    state.player = { pos: new Vector3(10, 20, 30), quat: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.7) };
    const scale = SHIPS[hull].sc;
    const cases = [
      ["gun", 0, 0, 2, [-1.8, -0.2, -5 * scale]],
      ["gun", 0, 1, 2, [1.8, -0.2, -5 * scale]],
      ["gun", 2, 0, 1, [5.4, -0.2, -5 * scale]],
      ["missile", 0, 0, 1, [0, -1.2, -5 * scale]],
      ["beam", 0, 0, 1, [0, -1, -6 * scale]],
    ];
    for (const [name, bay, barrel, count, xyz] of cases) {
      const offset = mountOffset(hull, name, scale, bay, barrel, count);
      assert.ok(new Vector3(offset.x, offset.y, offset.z).distanceTo(new Vector3(...xyz)) < 1e-10);
      const expected = new Vector3(...xyz).multiplyScalar(scale).applyQuaternion(state.player.quat).add(state.player.pos);
      assert.ok(playerMount(name, bay, barrel, count).distanceTo(expected) < 1e-10);
    }
  }
});

test("every actual sector entry notifies scenery, including a return to the outpost", () => {
  const entered = [];
  on("place-entered", ({ id }) => entered.push(id));
  state.place = "reach";
  enterPlace("hollow");
  enterPlace("hollow");
  enterPlace("reach");
  assert.deepEqual(entered, ["hollow", "reach"]);
});

test("missile lock uses supplied camera direction and free camera disables lock", () => {
  state.player = { pos: new Vector3(), quat: new Quaternion(), v: new Vector3() };
  const forward = { pos: new Vector3(0, 0, -100) };
  const side = { pos: new Vector3(100, 0, 0) };
  state.world.enemies = [forward, side];
  state.world.missiles = [];
  state.missiles = [{ dmg: 8, cd: 4 }];
  state.controls.sec = false;
  state.warp = null;
  state.freeCam.on = false;
  state.flight.missileLock = { target: null, t: 0, locked: false };
  state.aimDirection = { x: 1, y: 0, z: 0 };
  updateMissiles(0.1);
  assert.equal(state.flight.missileLock.target, side);
  state.aimDirection = { x: 0, y: 0, z: -1 };
  updateMissiles(0.1);
  assert.equal(state.flight.missileLock.target, forward);
  state.freeCam.on = true;
  updateMissiles(0.1);
  assert.equal(state.flight.missileLock.target, null);
});
