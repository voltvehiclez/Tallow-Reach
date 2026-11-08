// The simulation, stepped with no browser at all (refactor step 7a).
//
// This is the test the refactor plan asks for in step 7: build a world, spawn an
// enemy, step it for 600 ticks and check the enemy approached and shot. No
// renderer, no canvas, no DOM — just the real sim code.
//
// It runs the AI against a stand-in player *position* (everything about the
// player's own ship becomes plain data in 7c, so `state.player.m.position` is
// still how the sim learns where the pilot is). The 3D scene and the sound are
// swapped for recording stand-ins by tests/headless.mjs; nothing about an enemy
// needs them any more, which is what step 7a changed.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadHeadless } from "./headless.mjs";

const sim = await loadHeadless("src/sim/ai.js", {
  state: "src/state/state.js",
  on: "src/util/events.js",
  emit: "src/util/events.js",
  V: "src/util/math.js",
  spawnEnemy: "src/sim/ai.js",
  updateEnemies: "src/sim/ai.js",
  dropEnemy: "src/sim/enemy.js",
  hitHostile: "src/sim/combat.js",
  clearTransient: "src/sim/world.js",
});

const DT = 1 / 60;
const TICKS = 600;          // ten seconds

/** A world with the player parked at the origin and the spawner switched off. */
function freshWorld() {
  const S = sim.state;
  S.world.enemies.length = 0;
  S.world.bullets.length = 0;
  S.world.asteroids.length = 0;
  S.world.crates.length = 0;
  S.player = { m: { position: sim.V(0, 0, 0) }, v: sim.V(0, 0, 0) };
  S.flight.spawnT = 1e9;         // no wandering pirates: this test is one raider
  S.sector = "reach";
  S.profile.mission = null;
  S.profile.kills = 0;
  return S;
}

const dist = e => Math.hypot(e.pos.x, e.pos.y, e.pos.z);

test("600 ticks with no browser: the raider closes in, turns, and shoots", () => {
  const S = freshWorld();

  // 900 m out, which is inside its fire range (750 m) once it has closed a little.
  const e = sim.spawnEnemy("raider", { x: 0, y: 0, z: 900 });
  const start = dist(e);
  assert.ok(Math.abs(start - 900) < 1e-9, `it starts 900 m away (${start})`);

  let shots = 0;
  sim.on("sfx", ({ name }) => {
    if (name === "enemy-fire") shots++;
  });

  for (let i = 0; i < TICKS; i++) sim.updateEnemies(DT);

  const end = dist(e);
  assert.ok(end < start - 200, `it approached: ${start.toFixed(0)} m -> ${end.toFixed(0)} m`);
  assert.ok(end < 300, `it is on top of the player after ten seconds (${end.toFixed(0)} m)`);
  assert.ok(shots > 0, "and it opened fire");
  assert.ok(S.world.bullets.length > 0, "its shots are in the world");

  // It turned to face the player: the nose points back along -Z toward the origin.
  const nose = { x: 0, y: 0, z: -1 };
  const q = e.quat;
  // Rotate (0,0,-1) by the enemy's quaternion, by hand, so this proves the
  // record's rotation is real and needs no scene.
  const { x, y, z, w } = q;
  const ix = w * nose.x + y * nose.z - z * nose.y;
  const iy = w * nose.y + z * nose.x - x * nose.z;
  const iz = w * nose.z + x * nose.y - y * nose.x;
  const iw = -x * nose.x - y * nose.y - z * nose.z;
  const fx = ix * w + iw * -x + iy * -z - iz * -y;
  const fy = iy * w + iw * -y + iz * -x - ix * -z;
  const fz = iz * w + iw * -z + ix * -y - iy * -x;

  // It is heading at the player, so its nose points back toward the origin.
  const toPlayer = { x: -e.pos.x, y: -e.pos.y, z: -e.pos.z };
  const len = Math.hypot(toPlayer.x, toPlayer.y, toPlayer.z);
  const dot = (fx * toPlayer.x + fy * toPlayer.y + fz * toPlayer.z) / len;
  assert.ok(dot > 0.9, `it is pointing at the player (dot ${dot.toFixed(2)})`);
});

test("an enemy killed leaves the world, and its id is announced", () => {
  freshWorld();
  const e = sim.spawnEnemy("raider", { x: 0, y: 0, z: 500 });
  const removed = [];
  sim.on("enemy-removed", ({ id }) => removed.push(id));

  sim.hitHostile(e, 999, e.pos);

  assert.deepEqual(removed, [e.id], "removal names the enemy's id, so a view can drop its mesh");
  assert.equal(sim.state.world.enemies.length, 0, "it is out of the world");
  assert.equal(sim.state.profile.kills, 1, "and counted, as before");
});

test("an enemy that drifts out of range is removed without a kill", () => {
  freshWorld();
  const e = sim.spawnEnemy("raider", { x: 0, y: 0, z: 20000 });   // past lostRange (4000 m)
  sim.updateEnemies(DT);
  assert.equal(sim.state.world.enemies.length, 0, "out of range, out of the world");
  assert.equal(sim.state.profile.kills, 0, "and it was not a kill");
  assert.equal(e.hp, 10, "nothing about it changed");
});

test("clearing the field empties the world however many there are", () => {
  freshWorld();
  for (let i = 0; i < 5; i++) sim.spawnEnemy("raider", { x: i * 100, y: 0, z: 900 });
  assert.equal(sim.state.world.enemies.length, 5);
  sim.clearTransient();
  assert.equal(sim.state.world.enemies.length, 0, "docking and warping leave no hostiles behind");
});
