// Enemy behaviour, run headlessly (no browser). These tests spawn the real
// enemies through the real sim code with the 3D scene and the sound stubbed out
// (see tests/headless.mjs), so they prove that an enemy is a data entry.
//
// Since refactor step 7a a hostile is *plain data* (see sim/enemy.js): `spawnEnemy`
// makes a record with a position, a rotation and its numbers, and never touches
// the scene. `render/views.js` builds the mesh — so there is no mesh call to check
// here any more, and `tests/views.test.mjs` checks the drawing instead.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadHeadless } from "./headless.mjs";

// One bundle, so the spawned enemies land in the same state object the test reads.
// `ensureBoard` is only re-exported to make the bundle run sim/contracts.js, which
// listens for kills while the game is running.
const sim = await loadHeadless("src/sim/ai.js", {
  state: "src/state/state.js",
  on: "src/util/events.js",
  emit: "src/util/events.js",
  hitHostile: "src/sim/combat.js",
  ensureBoard: "src/sim/contracts.js",
  ENEMIES: "src/data/enemies.js",
  DEFAULT_ENEMY: "src/data/enemies.js",
  enemyDef: "src/data/enemies.js",
});

const at = { x: 0, y: 0, z: 0 };

test("spawnEnemy builds the raider from its def", () => {
  sim.state.world.enemies.length = 0;
  const e = sim.spawnEnemy("raider", { x: 1, y: 2, z: 3 });

  assert.equal(sim.state.world.enemies.length, 1, "the enemy is in the world");
  assert.equal(e.def, "raider", "it remembers which def it came from");
  assert.equal(e.n, "Newbie Raider", "the lock marker's name comes from the def");
  assert.equal(e.f, "pirates", "so does the faction");
  assert.equal(e.hp, 10, "10 Hull HP");
  assert.equal(e.mx, 10, "mx is the hull maximum, so the lock marker reads 100%");
  assert.equal(e.mx, e.hp, "enemies have no shield pool");
  assert.equal(e.fire, 2, "two seconds before the first shot, as before");

  // Step 7a: the enemy is plain data with an id and a kind, and its position is
  // a maths vector rather than a mesh. Nothing here needed the scene.
  assert.equal(e.kind, "enemy", "the kind names what it is");
  assert.ok(Number.isInteger(e.id) && e.id > 0, "every enemy has its own id");
  assert.deepEqual([e.pos.x, e.pos.y, e.pos.z], [1, 2, 3], "it stands where it was spawned");
  assert.equal(typeof e.pos.applyQuaternion, "function", "a position is a three.js maths type, not a mesh");
  assert.deepEqual([e.quat.x, e.quat.y, e.quat.z, e.quat.w], [0, 0, 0, 1], "it starts unrotated");
  assert.equal(e.m, undefined, "and it holds no mesh: render/views.js owns the mesh");
  assert.deepEqual(
    sim.__calls.filter(c => c.name === "mkShip"),
    [],
    "spawning an enemy builds no mesh at all any more"
  );
});

test("a second enemy is a data entry: add a def, spawn it, change no code", () => {
  // Numbers chosen so a mix-up with the raider cannot pass.
  sim.ENEMIES.gunboat = {
    n: "Test Gunboat",
    pl: "test gunboats",
    hp: 42,
    col: 0x123456,
    scale: 2.5,
    f: "pirates",
    ai: "chase",
    turn: 1,
    spdFar: 90,
    spdNear: 15,
    spdOrbit: 30,
    circleAt: 300,
    fireRange: 500,
    lostRange: 3000,
    hearRange: 400,
    fireGap: [1, 2],
    dmg: 3,
    bspd: 400,
    spawnDist: [500, 600],
  };

  try {
    sim.state.world.enemies.length = 0;
    const e = sim.spawnEnemy("gunboat", at);

    assert.equal(sim.state.world.enemies.length, 1);
    assert.equal(e.def, "gunboat");
    assert.equal(e.n, "Test Gunboat", "its own name");
    assert.equal(e.hp, 42, "its own Hull HP");
    assert.equal(e.mx, 42);
    assert.equal(sim.enemyDef("gunboat").col, 0x123456, "its own colour (the view reads it from the def)");
    assert.equal(sim.enemyDef("gunboat").scale, 2.5, "its own size");
  } finally {
    // The game keeps exactly one enemy type: the test's extra def goes away again.
    delete sim.ENEMIES.gunboat;
  }
});

test("an unknown enemy id falls back to the default enemy instead of crashing", () => {
  sim.state.world.enemies.length = 0;
  const e = sim.spawnEnemy("no-such-enemy", at);
  assert.equal(e.def, sim.DEFAULT_ENEMY, "the record is sorted back onto the default def");
  assert.equal(e.n, sim.ENEMIES[sim.DEFAULT_ENEMY].n);
  assert.equal(sim.enemyDef("no-such-enemy").hp, sim.ENEMIES[sim.DEFAULT_ENEMY].hp);
});

test("a kill reports which enemy and which faction died", () => {
  sim.state.world.enemies.length = 0;
  const e = sim.spawnEnemy("raider", at);
  const seen = [];
  sim.on("enemy-killed", payload => seen.push(payload));

  sim.hitHostile(e, 99, at);

  assert.deepEqual(
    seen.map(s => ({ def: s.def, faction: s.faction })),
    [{ def: "raider", faction: "pirates" }],
    "the event carries ids, not objects"
  );
  assert.equal(seen[0].id, e.id, "and the enemy's own id, so a view can find its mesh");
  assert.equal(sim.state.world.enemies.length, 0, "the dead enemy leaves the world");
  assert.equal(sim.state.profile.kills, 1, "the kill is counted, as before");
});

test("a hunt contract counts only the enemy it names", () => {
  const P = sim.state.profile;
  sim.state.world.enemies.length = 0;

  // A contract offered today names its enemy ("raider").
  P.mission = { type: "hunt", tier: 1, p: 0, n: 3, r: 100, e: "raider" };
  sim.emit("enemy-killed", { def: "raider", faction: "pirates" });
  assert.equal(P.mission.p, 1, "killing the named enemy counts");

  sim.emit("enemy-killed", { def: "some-other-enemy", faction: "pirates" });
  assert.equal(P.mission.p, 1, "a different enemy type does not count");

  // A contract accepted on an old save named no enemy: every hostile counted then,
  // so every hostile still counts for it.
  P.mission = { type: "hunt", tier: 1, p: 0, n: 3, r: 100 };
  sim.emit("enemy-killed", { def: "some-other-enemy", faction: "pirates" });
  assert.equal(P.mission.p, 1, "an old contract still counts kills");

  P.mission = null;
});

test("no enemy is written into the sim code any more", () => {
  const src = readFileSync(new URL("../src/sim/ai.js", import.meta.url), "utf8");

  // Nothing that belongs in data/enemies.js may be left in the sim: not the name,
  // not the numbers, not the colour.
  for (const [re, what] of [
    [/RAIDER/, "the RAIDER constant"],
    [/PIRATE_/, "a PIRATE_ constant"],
    [/Newbie/, "the enemy's name"],
    [/0x3a2420/, "the hull colour"],
    [/\b520\b/, "the bullet speed"],
    [/\b750\b/, "the fire range"],
    [/\b4000\b/, "the lost range"],
  ]) {
    assert.doesNotMatch(src, re, `${what} belongs in data/enemies.js`);
  }

  assert.match(src, /AI_BEHAVIOURS\[def\.ai\]/, "the behaviour is chosen by the def's ai field");
  // The shot's numbers come from the def. Step 14 added exactly one modifier: an instance's
  // declared difficulty scalar, read from the runtime record (data/instances.js), so this reads the
  // call's arguments instead of pinning one exact line of source.
  const shot = src.match(/const shot = fire\(([^;]*)\);/);
  assert.ok(shot, "an enemy shoots through sim/combat.js `fire`");
  assert.match(shot[1], /def\.bspd/, "the shot's speed comes from the def");
  assert.match(shot[1], /def\.dmg/, "and its damage comes from the def");
  assert.doesNotMatch(shot[1], /def\.(bspd|dmg)\s*[-+*/]\s*[\d.]/, "never combined with a literal number");
  assert.doesNotMatch(shot[1], /(?:^|,)\s*[\d.]+\s*(?:,|$)/, "and no argument of the call is a literal");

  // Step 7a: the AI moves data, not meshes, and needs no scene to do it.
  assert.doesNotMatch(src, /e\.m\b/, "an enemy has no mesh any more (it is `e.pos` / `e.quat`)");
  assert.doesNotMatch(src, /from\s*"\.\.\/render\//, "ai.js imports nothing from render/ (step 7a)");
});
