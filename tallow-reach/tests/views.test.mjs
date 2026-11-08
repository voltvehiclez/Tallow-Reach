// render/views.js: one mesh per hostile, built and removed by the view
// (refactor step 7a).
//
// The sim makes enemies as plain data and says so with `enemy-spawned` /
// `enemy-removed`. This file checks the other half of the deal: a mesh appears
// for each one, follows its position and rotation every frame, and goes away
// when the enemy does. `tests/headless.mjs` stands in for the scene, so the
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
    dropEnemy: "src/sim/enemy.js",
    V: "src/util/math.js",
  },
  { keep: ["views.js"] }
);

/** Names of the stand-in calls made so far, so a test can look for scene work. */
const callsFrom = mark => views.__calls.slice(mark).map(c => c.name);

/** A fresh world with no hostiles. */
function fresh() {
  views.state.world.enemies.length = 0;
  views.updateEnemyViews();          // sweep the meshes of anything left over
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
