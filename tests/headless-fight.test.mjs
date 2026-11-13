// The whole projectile fight with no browser at all (refactor step 7b).
//
// Step 7's own headless test (`headless-sim.test.mjs`) proves a hostile can be
// flown and shot at without a screen. This one proves the rest of the fight is
// data too: bullets spawn, fly, hit and die; crates drop, drift and are picked
// up; missiles are launched and home; particles fade; a rock is mined; and the
// field can be cleared — all of it by the real sim code, with no mesh anywhere.
//
// It talks only to the sim's own makers, and it *never* asks a scene for
// anything: the recording stand-ins stay silent, which is the point. What is
// compared afterwards is `state`, which is what a host would send a guest.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadHeadless } from "./headless.mjs";

const sim = await loadHeadless("src/sim/combat.js", {
  state: "src/state/state.js",
  newProfile: "src/state/profile.js",
  V: "src/util/math.js",
  setSeed: "src/util/rng.js",
  createPlayer: "src/sim/player.js",
  setShip: "src/sim/player.js",
  hurt: "src/sim/player.js",
  refreshGuns: "src/sim/guns.js",
  refreshDrive: "src/sim/drive.js",
  refreshShield: "src/sim/shield.js",
  refreshHull: "src/sim/hull.js",
  refillPower: "src/sim/power.js",
  updatePower: "src/sim/power.js",
  updateShield: "src/sim/shield.js",
  updatePrimary: "src/sim/weapons.js",
  updateMissiles: "src/sim/weapons.js",
  setWeapon: "src/sim/weapons.js",
  launchMissile: "src/sim/missile.js",
  updateMissileFlight: "src/sim/missile.js",
  spawnEnemy: "src/sim/ai.js",
  updateEnemies: "src/sim/ai.js",
  hitHostile: "src/sim/combat.js",
  fire: "src/sim/combat.js",
  spawnCrate: "src/sim/combat.js",
  updateBullets: "src/sim/combat.js",
  updateCrates: "src/sim/combat.js",
  boom: "src/sim/effects.js",
  updateEffects: "src/sim/effects.js",
  spawnAsteroid: "src/sim/asteroids.js",
  populateField: "src/sim/asteroids.js",
  clearTransient: "src/sim/world.js",
  clearWorldObjects: "src/sim/world.js",
});

const DT = 1 / 60;

/** A fresh, flying player with a cannon, a beam and missiles fitted. */
function freshWorld() {
  const S = sim.state;
  sim.setSeed(11);
  S.profile = sim.newProfile();
  S.profile.msl = 8;
  S.profile.loadout.wasp.primary = ["cannon_basic", "beam_basic"];
  S.profile.loadout.wasp.secondary = ["missile_basic", null];
  for (const k of ["enemies", "bullets", "missiles", "crates", "fx", "asteroids"]) S.world[k].length = 0;
  S.profile.kills = 0;
  S.profile.holds = { wasp: {} };
  sim.createPlayer();
  sim.setShip("wasp");
  sim.refillPower();
  sim.refreshDrive();
  sim.refreshShield();
  sim.refreshHull();
  sim.refreshGuns();
  S.player.docked = false;
  S.player.pos.set(0, 0, 0);
  S.player.quat.set(0, 0, 0, 1);
  S.player.v.set(0, 0, 0);
  S.flight.spawnT = 1e9;          // no wandering pirates: this test places its own
  S.flight.gunCd = [0, 0];
  S.controls = { ...S.controls, fire: false, sec: false, thrust: 0, steer: { x: 0, y: 0 } };
  return S;
}

/** One tick of the world, in the order main.js runs it. */
function tick() {
  sim.updatePrimary(DT);
  sim.updateMissiles(DT);
  sim.updateEnemies(DT);
  sim.updateBullets(DT);
  sim.updateCrates(DT);
  sim.updateEffects(DT);
}

const run = secs => { for (let i = 0; i < Math.round(secs / DT); i++) tick(); };

test("a shot leaves a record with an id, and no mesh at all", () => {
  const S = freshWorld();
  const b = sim.fire(sim.V(0, 0, 0), sim.V(0, 0, -1), 500, true, 1);

  assert.equal(S.world.bullets.length, 1);
  assert.equal(b.kind, "bullet");
  assert.ok(Number.isInteger(b.id) && b.id > 0, "every shot has its own id");
  assert.equal(b.m, undefined, "it holds no mesh: render/views.js draws it");
  assert.equal(b.own, true, "it says whose shot it is");
  assert.deepEqual([b.pos.x, b.pos.y, b.pos.z], [0, 0, 0], "it starts where it was fired from");
  assert.equal(b.l, 2.4, "and lives as long as it always has");
  // Its velocity is the shot's own plus the ship's (the ship is at rest here).
  assert.equal(b.v.z, -500, "the shot's speed comes from the gun");
  // It is the same maths for the enemy's shots.
  const e = sim.fire(sim.V(0, 0, 0), sim.V(1, 0, 0), 300, false, 1);
  assert.equal(e.own, false);
  assert.equal(e.v.x, 300);
});

test("a shot that reaches a hostile takes its hull down, and the shot is gone", () => {
  const S = freshWorld();

  // A raider 60 m ahead, on the guns' line. Fired and ticked at once, so the
  // raider has no time to circle away: this is the hit rule, not the aim.
  const e = sim.spawnEnemy("raider", { x: 0, y: 0, z: -60 });
  sim.fire(sim.V(0, 0, 0), sim.V(0, 0, -1), 500, true, 4);
  assert.equal(S.world.bullets.length, 1);

  for (let i = 0; i < 12; i++) sim.updateBullets(DT);   // a fifth of a second

  assert.equal(e.hp, 6, "4 damage reached it");
  assert.equal(S.world.bullets.length, 0, "and the shot spent itself on the hit");
});

test("a kill counts, throws sparks and leaves its loot as crate records", () => {
  const S = freshWorld();
  const e = sim.spawnEnemy("raider", { x: 0, y: 0, z: -60 });

  sim.hitHostile(e, 99, e.pos);

  assert.equal(S.world.enemies.length, 0, "the raider is out of the world");
  assert.equal(S.profile.kills, 1, "and the kill is counted, as before");
  assert.ok(S.world.crates.length > 0, "its loot is in the world as crates");
  for (const c of S.world.crates) {
    assert.equal(c.kind, "crate", "a crate says what it is");
    assert.ok(Number.isInteger(c.id) && c.id > 0, "and has an id");
    assert.equal(c.m, undefined, "and no mesh");
    assert.ok(c.t > 0 && c.t <= 240, "it has its 240-second life");
    assert.ok(typeof c.item === "string", "and carries the item id it holds");
  }
  assert.ok(S.world.fx.length > 0, "the death threw sparks, which are records too");
  for (const p of S.world.fx) {
    assert.equal(p.kind, "fx");
    assert.equal(p.m, undefined, "a spark holds no mesh and no material");
    assert.ok(typeof p.col === "number", "just a colour");
    assert.ok(typeof p.size === "number", "and a size");
  }
  // The particles fade to nothing and leave the world on their own.
  run(2);
  assert.equal(S.world.fx.length, 0, "every spark burned out");
});

test("the pilot collects a crate by flying into it", () => {
  const S = freshWorld();
  const c = sim.spawnCrate(sim.V(0, 0, -40), "salv");

  assert.equal(S.world.crates.length, 1);
  run(1);
  assert.equal(S.world.crates.length, 0, "the crate was taken");

  // A sweep can leave a stale entry behind; the loop must skip it, not crash.
  S.world.crates.push(null);
  assert.doesNotThrow(() => sim.updateCrates(DT));
  S.world.crates.length = 0;
});

test("a crate that is never collected expires and leaves the world", () => {
  const S = freshWorld();
  sim.spawnCrate(sim.V(0, 0, -5000), "salv");     // far out of reach
  assert.equal(S.world.crates.length, 1);
  run(241);
  assert.equal(S.world.crates.length, 0, "240 seconds and it is gone");
});

test("a missile is a record that homes, hits and explodes", () => {
  const S = freshWorld();
  const e = sim.spawnEnemy("raider", { x: 0, y: 0, z: -400 });

  const before = S.profile.msl;
  const m = sim.launchMissile(e, { dmg: 8 }, sim.V(0, 0, -1), sim.V(0, 0, -5));
  S.profile.msl = before - 1;

  assert.equal(S.world.missiles.length, 1);
  assert.equal(m.kind, "missile");
  assert.equal(m.m, undefined, "no mesh");
  assert.equal(m.dmg, 8, "the launcher decides the damage");
  assert.equal(m.t, e, "it locks onto the hostile it was fired at");

  run(3);
  assert.equal(S.world.missiles.length, 0, "it reached its target or ran out of life");
  assert.ok(e.hp < 10, `the hostile was hit (hp ${e.hp})`);
});

test("mining a rock is a data change: the ore, the shrinking scale and the cargo", () => {
  const S = freshWorld();
  S.world.asteroids.length = 0;
  sim.spawnAsteroid();
  const rock = S.world.asteroids[0];
  rock.ore = 40;
  rock.max = 40;

  // Park the pilot 90 m from the rock, nose on it.
  S.player.pos.copy(rock.pos).add(sim.V(0, 0, 90));
  S.player.quat.set(0, 0, 0, 1);
  S.player.v.set(0, 0, 0);
  S.player.acc = 0;
  sim.setWeapon("beam");
  S.controls.fire = true;
  const before = rock.scale.x;

  run(10);

  assert.ok(rock.ore < 40, "ore left the rock");
  assert.ok(rock.scale.x < before, "and the rock shrank (its collision size is its data)");
  assert.ok(S.flight.beamOn, "the sim says the beam is cutting");
  assert.ok(S.flight.beamStart && S.flight.beamEnd, "and where it runs, for the view to draw");
  const held = Object.values(S.profile.holds.wasp).reduce((a, b) => a + b, 0);
  assert.ok(held > 0, "and the ore is in the hold");
});

test("clearing the world empties every list, however many things are in them", () => {
  const S = freshWorld();
  sim.spawnEnemy("raider", { x: 0, y: 0, z: -400 });
  for (let i = 0; i < 5; i++) sim.fire(sim.V(0, 0, 0), sim.V(0, 0, -1), 500, true, 1);
  sim.spawnCrate(sim.V(0, 0, -50), "salv");
  sim.boom(sim.V(0, 0, 0), 4, 0xffd080);
  sim.spawnAsteroid();
  assert.ok(S.world.bullets.length >= 5);

  // Docking takes hostiles, shots and sparks; crates and rocks stay.
  sim.clearTransient();
  assert.equal(S.world.enemies.length + S.world.bullets.length + S.world.missiles.length, 0);

  // Warping away takes the crates and sparks too.
  sim.clearWorldObjects();
  assert.equal(S.world.crates.length + S.world.fx.length, 0);
  assert.equal(S.world.asteroids.length, 1, "the sector's rocks are geography: they stay");
});

test("nothing about a shot, a crate or a spark needs the scene", () => {
  const S = freshWorld();
  sim.spawnEnemy("raider", { x: 0, y: 0, z: -300 });
  S.controls.fire = true;
  run(2);
  sim.spawnCrate(sim.V(0, 0, -30), "salv");
  run(1);

  // The stand-in scene records every call it receives. Step 7b means the sim
  // makes none of them at all: no `scene.add`, no mesh, no material.
  const sceneWork = sim.__calls.filter(c =>
    c.name.startsWith("scene.") || c.name === "mkShip" || c.name === "Mesh"
  );
  assert.deepEqual(sceneWork.map(c => c.name), [], "the sim never touches the scene");
});
