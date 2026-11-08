// render/views.js: one mesh per entity, built and removed by the view
// (refactor step 7a for hostiles, step 7b for everything else).
//
// The sim makes enemies as plain data and says so with `enemy-spawned` /
// `enemy-removed`; bullets, missiles, crates, particles, rocks and the player's
// ship are data too (step 7b), and the view watches `entity-spawned` /
// `entity-removed` plus a per-frame sweep. This file checks the other half of the
// deal: a mesh appears for each one, follows its data every frame, and goes away
// when the entity does. `tests/headless.mjs` stands in for the scene, so the
// third-party wiring (three.js objects, the scene graph) is recorded rather than
// rendered.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadHeadless } from "./headless.mjs";

// `render/views.js` is the code under test, so it is bundled for real even
// though it lives in render/; the scene and the mesh builder it calls stay
// stand-ins, and every call they receive is recorded in `__calls`.
const views = await loadHeadless(
  "src/render/views.js",
  {
    state: "src/state/state.js",
    emit: "src/util/events.js",
    spawnEnemy: "src/sim/ai.js",
    hitHostile: "src/sim/combat.js",
    clearTransient: "src/sim/world.js",
    clearWorldObjects: "src/sim/world.js",
    dropEnemy: "src/sim/enemy.js",
    V: "src/util/math.js",
    // Step 7b: the sim's own makers, so a test can spawn real shots and rocks.
    fire: "src/sim/combat.js",
    spawnCrate: "src/sim/combat.js",
    updateBullets: "src/sim/combat.js",
    boom: "src/sim/effects.js",
    launchMissile: "src/sim/missile.js",
    spawnAsteroid: "src/sim/asteroids.js",
    populateField: "src/sim/asteroids.js",
    createPlayer: "src/sim/player.js",
    setShip: "src/sim/player.js",
    newProfile: "src/state/profile.js",
  },
  { keep: ["views.js"] }
);

/** Names of the stand-in calls made so far, so a test can look for scene work. */
const callsFrom = mark => views.__calls.slice(mark).map(c => c.name);

/** A fresh world with no hostiles and nothing else flying. */
function fresh() {
  const W = views.state.world;
  W.enemies.length = 0;
  views.updateEnemyViews();          // sweep the meshes of anything left over
  for (const k of ["bullets", "missiles", "crates", "fx", "asteroids"]) W[k].length = 0;
  views.updateEntityViews();
  return views.state;
}

test("a hostile gets a mesh the moment it spawns, and loses it when it dies", () => {
  const S = fresh();
  views.installEnemyViews();

  const mark = views.__calls.length;
  const e = views.spawnEnemy("raider", { x: 100, y: 20, z: -50 });

  // The event did the work: no frame had to pass for the mesh to appear.
  const made = callsFrom(mark).filter(n => n === "mkShip");
  assert.equal(made.length, 1, "one mesh was built for the one enemy");
  assert.equal(views.enemyViewCount(), 1, "the view holds it");

  const m = views.__calls.filter(c => c.name === "mkShip").pop();
  assert.deepEqual(m.args, [0x3a2420, 1.2, true], "from the enemy's def: colour and size, pirate tint");

  // Killed: the mesh goes with it.
  const mark2 = views.__calls.length;
  views.hitHostile(e, 999, e.pos);
  assert.equal(views.enemyViewCount(), 0, "the mesh is gone");
  assert.deepEqual(
    callsFrom(mark2).filter(n => n.includes("remove")),
    ["scene.remove"],
    "and it was taken out of the scene, not just forgotten"
  );
  assert.equal(S.world.enemies.length, 0);
});

test("the mesh follows its enemy's position and rotation every frame", () => {
  const S = fresh();
  views.installEnemyViews();
  const e = views.spawnEnemy("raider", { x: 0, y: 0, z: 900 });

  // Pretend a frame of the real AI ran: move the data only.
  e.pos.set(12, 34, 56);
  e.quat.set(0, Math.SQRT1_2, 0, Math.SQRT1_2);   // a quarter turn about Y

  const mark = views.__calls.length;
  views.updateEnemyViews();
  const names = callsFrom(mark);

  assert.equal(names.filter(n => n === "mkShip").length, 0, "no second mesh is built for the same enemy");
  assert.equal(names.filter(n => n.endsWith("position.copy")).length, 1, "its position is copied once");
  assert.equal(names.filter(n => n.endsWith("quaternion.copy")).length, 1, "and its rotation");
  assert.equal(names.filter(n => n === "scene.add").length, 0, "nothing is added to the scene again");

  // What was copied is where the enemy now is, and which way it now points.
  const pos = views.__calls.slice(mark).find(c => c.name.endsWith("position.copy"));
  const rot = views.__calls.slice(mark).find(c => c.name.endsWith("quaternion.copy"));
  assert.deepEqual([pos.args[0].x, pos.args[0].y, pos.args[0].z], [12, 34, 56], "the mesh followed the data");
  assert.deepEqual([rot.args[0].x, rot.args[0].y, rot.args[0].z, rot.args[0].w], [0, Math.SQRT1_2, 0, Math.SQRT1_2]);

  assert.equal(S.world.enemies.length, 1, "a frame of drawing never changes the world");
  assert.equal(views.enemyViewCount(), 1);
});

test("the per-frame sweep cleans up whatever the events did not", () => {
  const S = fresh();
  views.installEnemyViews();
  views.spawnEnemy("raider", { x: 0, y: 0, z: 500 });
  views.spawnEnemy("raider", { x: 50, y: 0, z: 500 });
  assert.equal(views.enemyViewCount(), 2);

  // Something emptied the world without going through dropEnemy (a load, a
  // reset). The next frame must not leave the meshes behind.
  S.world.enemies.length = 0;
  views.updateEnemyViews();
  assert.equal(views.enemyViewCount(), 0, "the sweep removed both meshes");

  // And the other way round: an enemy that arrives without its event still gets
  // a mesh.
  S.world.enemies.push({ id: 999, kind: "enemy", def: "raider", pos: views.V(0, 0, 0), quat: views.V(0, 0, 0) });
  S.world.enemies[S.world.enemies.length - 1].quat.w = 1;
  views.updateEnemyViews();
  assert.equal(views.enemyViewCount(), 1, "a hostile with no event still gets drawn");
  S.world.enemies.length = 0;
  views.updateEnemyViews();
});

test("docking clears the field, and every mesh with it", () => {
  const S = fresh();
  views.installEnemyViews();
  for (let i = 0; i < 4; i++) views.spawnEnemy("raider", { x: i * 200, y: 0, z: 900 });
  assert.equal(views.enemyViewCount(), 4);

  views.clearTransient();
  assert.equal(S.world.enemies.length, 0, "the world is empty");
  assert.equal(views.enemyViewCount(), 0, "and so is the scene");
});

/* ------------------------------------------------------------------------- */
/* Step 7b: bullets, missiles, crates, particles, rocks and the player's ship */
/* ------------------------------------------------------------------------- */

test("a bullet gets a mesh the moment it is fired, and loses it when it expires", () => {
  const S = fresh();
  views.installEnemyViews();       // a second install is harmless: both listen

  views.createPlayer();            // a player bullet inherits the ship's speed
  const mark = views.__calls.length;
  const b = views.fire(views.V(10, 20, 30), views.V(0, 0, -1), 500, true, 1);

  // The event did the work: no frame had to pass for the mesh to appear.
  assert.equal(views.entityViewCount(), 1, "one mesh for the one bullet");
  const added = views.__calls.slice(mark).filter(c => c.name === "scene.add");
  assert.equal(added.length, 1, "and it went into the scene at once");

  // It is drawn from the record, not from a mesh of its own.
  assert.equal(b.m, undefined, "the bullet holds no mesh: render/views.js owns it");
  assert.equal(b.kind, "bullet", "it says what kind of thing it is");
  assert.ok(Number.isInteger(b.id) && b.id > 0, "and it has an id for the view to key on");

  // A frame copies its position and rotation onto the mesh: one mesh, and the
  // copy carries the record's new position.
  b.pos.set(0, 0, -100);
  const mark2 = views.__calls.length;
  views.updateEntityViews();
  const calls = views.__calls.slice(mark2);
  assert.ok(calls.some(c => c.name.endsWith("position.copy")), "its mesh is moved every frame");
  assert.equal(views.entityViewCount(), 1, "and it is still exactly one mesh for it");
  assert.deepEqual([b.pos.x, b.pos.y, b.pos.z], [0, 0, -100], "drawing never moves the bullet");

  // Expired: the mesh goes with it, and so does the scene entry.
  b.l = 0;
  views.updateBullets(1 / 60);
  assert.equal(S.world.bullets.length, 0, "the bullet is out of the world");
  views.updateEntityViews();
  assert.equal(views.entityViewCount(), 0, "and out of the scene");
});

test("a spawned crate, party and rock are drawn, and a cleared field empties the scene", () => {
  const S = fresh();
  views.installEnemyViews();

  views.spawnCrate(views.V(0, 0, 500), "salv");
  views.spawnCrate(views.V(0, 0, 600), "core");
  views.boom(views.V(0, 0, 0), 3, 0xffd080);          // three particles
  views.spawnAsteroid();                              // one rock
  views.updateEntityViews();

  assert.equal(S.world.crates.length, 2);
  assert.equal(S.world.fx.length, 3);
  assert.equal(S.world.asteroids.length, 1);
  assert.equal(views.entityViewCount(), 6, "two crates, three sparks and a rock");

  // Each particle is drawn from its record: the sim names the colour, and each
  // spark gets a mesh of its own (it fades on its own).
  const fx = S.world.fx[0];
  assert.equal(fx.kind, "fx");
  assert.equal(fx.col, 0xffd080, "the explosion's colour is on the record");
  assert.equal(fx.size, 1, "and so is its size");
  assert.ok(Number.isInteger(fx.id), "with an id for the view to key on");

  // Clearing the field the way docking and warping do empties the scene too —
  // shots, crates and sparks go; rocks stay, because they are the sector's.
  views.clearTransient();
  views.clearWorldObjects();
  views.updateEntityViews();
  assert.equal(S.world.fx.length + S.world.crates.length, 0, "crates and sparks are gone");
  assert.equal(S.world.asteroids.length, 1, "the rock is geography: it stays");
  assert.equal(views.entityViewCount(), 1, "so only the rock is still drawn");
});

test("a missile is a record, flown and drawn by data", () => {
  const S = fresh();
  views.installEnemyViews();
  views.createPlayer();
  views.setShip("wasp");
  S.player.pos.set(0, 0, 0);
  S.player.v.set(0, 0, 0);

  const m = views.launchMissile(null, { dmg: 8 }, views.V(0, 0, -1), views.V(0, -1.2, -5));
  assert.equal(S.world.missiles.length, 1);
  assert.equal(m.kind, "missile");
  assert.equal(m.m, undefined, "the missile holds no mesh either");
  assert.equal(views.entityViewCount(), 1, "and one mesh was made for it");
  assert.equal(m.sp > 0, true, "it leaves with a speed");
});

test("the player's own ship is drawn from its record, not the other way round", () => {
  const S = fresh();
  views.createPlayer();
  views.setShip("wasp");
  S.player.pos.set(120, 30, -400);
  S.player.quat.set(0, 0, 0, 1);
  S.player.docked = false;

  const mark = views.__calls.length;
  views.updateEntityViews();
  assert.ok(views.playerView(), "the ship has a mesh");
  const pos = views.__calls.slice(mark).filter(c => c.name.endsWith("position.copy")).pop();
  assert.deepEqual([pos.args[0].x, pos.args[0].y, pos.args[0].z], [120, 30, -400],
    "and it sits where the record says the ship is");

  // Docking hides the model through the record's own flag: `visible` is written,
  // never read back as a game fact.
  S.player.docked = true;
  views.updateEntityViews();
  assert.equal(S.player.docked, true, "the record says docked");
  assert.deepEqual([S.player.pos.x, S.player.pos.y, S.player.pos.z], [120, 30, -400],
    "drawing never moves the ship");
});

test("the mining beam is drawn from the sim's start and end points", () => {
  const S = fresh();
  views.installEnemyViews();
  S.flight.beamOn = true;
  S.flight.beamStart = views.V(0, 0, 0);
  S.flight.beamEnd = views.V(0, 0, -300);

  // The sim's numbers are what the view reads: start, end and the beam's length.
  assert.equal(S.flight.beamOn, true);
  assert.deepEqual([S.flight.beamStart.z, S.flight.beamEnd.z], [0, -300], "the sim says where the beam runs");
  // Drawing a frame must never change them.
  views.updateEntityViews();
  assert.deepEqual([S.flight.beamStart.z, S.flight.beamEnd.z], [0, -300], "drawing the beam changes no rule");

  // Off again the moment the sim says so.
  S.flight.beamOn = false;
  views.updateEntityViews();
  assert.equal(S.flight.beamOn, false);
});

test("a registered fake kind appears, updates and disappears without changing view machinery", () => {
  const S = fresh();
  views.installEnemyViews();
  S.world.testProbes = [];
  let built = 0, updated = 0, removed = 0;
  const mesh = { marker: "fake mesh" };
  views.registerEntityView("test-probe", {
    list: () => S.world.testProbes,
    build: () => { built++; return mesh; },
    update: (entity, actual) => { assert.equal(actual, mesh); actual.x = entity.pos.x; updated++; },
    remove: actual => { assert.equal(actual, mesh); removed++; },
  });
  const probe = { id: 123456, kind: "test-probe", pos: views.V(3, 0, 0) };
  S.world.testProbes.push(probe);
  const mark = views.__calls.length;
  views.emit("entity-spawned", { id: probe.id, kind: probe.kind });
  assert.equal(built, 1, "spawn event builds immediately, even with multiple listeners");
  assert.ok(views.__calls.slice(mark).some(c => c.name === "scene.add" && c.args[0] === mesh));
  probe.pos.x = 42;
  views.updateEntityViews();
  assert.equal(mesh.x, 42);
  assert.equal(updated, 1);
  S.world.testProbes.pop();
  views.emit("entity-removed", { id: probe.id, kind: probe.kind });
  assert.equal(removed, 1, "the kind's cleanup runs on the removal event");
  assert.ok(views.__calls.slice(mark).some(c => c.name === "scene.remove" && c.args[0] === mesh));
  views.updateEntityViews();
  assert.equal(removed, 1, "the frame sweep does not remove it twice");

  // Missed events are also reconciled by the generic sweep.
  S.world.testProbes.push(probe);
  views.updateEntityViews();
  assert.equal(built, 2);
  S.world.testProbes.pop();
  views.updateEntityViews();
  assert.equal(removed, 2);
});

test("enemy and other entity IDs can overlap without sharing a view", () => {
  const S = fresh();
  views.installEnemyViews();
  const e = { id: 55555, kind: "enemy", def: "raider", pos: views.V(0, 0, 1), quat: views.V(0, 0, 0) };
  e.quat.w = 1;
  const b = { id: e.id, kind: "bullet", own: true, pos: views.V(0, 0, 2), quat: views.V(0, 0, 0) };
  b.quat.w = 1;
  S.world.enemies.push(e);
  S.world.bullets.push(b);
  views.emit("enemy-spawned", { id: e.id });
  views.emit("entity-spawned", { id: b.id, kind: b.kind });
  assert.equal(views.enemyViewCount(), 1);
  assert.equal(views.entityViewCount(), 1);
  S.world.bullets.pop();
  views.emit("entity-removed", { id: b.id, kind: b.kind });
  assert.equal(views.enemyViewCount(), 1, "removing the bullet leaves the enemy");
  assert.equal(views.entityViewCount(), 0);
  S.world.enemies.pop();
  views.emit("enemy-removed", { id: e.id });
  assert.equal(views.enemyViewCount(), 0);
});

test("particle views fade and dispose their own material on event and sweep removal", () => {
  const S = fresh();
  views.installEnemyViews();
  const particle = id => ({ id, kind: "fx", pos: views.V(0, 0, 0), col: 0xffd080, size: 1, l: 1, t: 2 });
  for (const byEvent of [true, false]) {
    const fx = particle(byEvent ? 88801 : 88802);
    S.world.fx.push(fx);
    const mark = views.__calls.length;
    views.emit("entity-spawned", { id: fx.id, kind: fx.kind });
    const mesh = views.__calls.slice(mark).find(c => c.name === "scene.add").args[0];
    views.updateEntityViews();
    assert.equal(mesh.material.opacity, 0.5);
    let disposed = 0;
    mesh.material.addEventListener("dispose", () => disposed++);
    S.world.fx.pop();
    if (byEvent) views.emit("entity-removed", { id: fx.id, kind: fx.kind });
    views.updateEntityViews();
    assert.equal(disposed, 1);
  }
});
