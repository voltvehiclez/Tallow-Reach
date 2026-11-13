// A real fixed simulation tick with two independent, configured pilot records.
import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../src/state/state.js";
import { newProfile } from "../src/state/profile.js";
import { createPlayer, createPlayerRecord } from "../src/sim/player.js";
import { configurePlayer } from "../src/sim/session.js";
import { stepSim } from "../src/sim/step.js";
import { spawnEnemy, nearestPlayer } from "../src/sim/ai.js";
import { enemyFwd } from "../src/sim/enemy.js";
import { fire, updateBullets } from "../src/sim/combat.js";
import { launchMissile } from "../src/sim/missile.js";
import { V } from "../src/util/math.js";
import { setSeed } from "../src/util/rng.js";

const dt = 1 / 60;
function fresh() {
  state.players.length = 0; state.localPlayerIndex = 0;
  state.profile = newProfile(); state.place = "hollow";
  state.time = 0; state.warp = null; state.freeCam.on = false;
  state.aimDirection = { x: 0, y: 0, z: -1 };
  for (const list of Object.values(state.world)) list.length = 0;
  const local = configurePlayer(createPlayer(), state.profile);
  const other = configurePlayer(createPlayerRecord(), newProfile());
  local.docked = other.docked = false;
  local.pos.set(-500, 0, 0); other.pos.set(500, 0, 0);
  local.en = local.enMax; other.en = other.enMax;
  state.players.push(other);
  local.flight.spawnT = 1e9;
  setSeed(12345);
  return { local, other };
}

test("two players fly and shoot independently while an enemy turns towards the nearer one", () => {
  const { local, other } = fresh();
  const enemy = spawnEnemy("raider", V(500, 0, 600));
  enemy.fire = 100;
  assert.equal(nearestPlayer(enemy.pos), other);
  local.controls.thrust = 1; local.controls.fire = true;
  other.controls.strafe = 1; other.controls.fire = true;
  stepSim(dt);
  assert.ok(local.pos.z < 0, "local thrust moved only their own ship");
  assert.ok(other.pos.x > 500, "the other pilot strafed independently");
  assert.equal(state.world.bullets.filter(b => b.owner === local).length, 2);
  assert.equal(state.world.bullets.filter(b => b.owner === other).length, 2);
  assert.notEqual(local.flight, other.flight);
  assert.notEqual(local.power, other.power);
  assert.notEqual(local.drive, other.drive);
  assert.notEqual(local.shield, other.shield);
  assert.notEqual(local.hullSpec, other.hullSpec);
  assert.ok(local.power.use.drive > 0);
  assert.equal(other.power.use.drive, 0);
  local.controls.fire = false; other.controls.fire = true;
  for (let i = 0; i < 30; i++) stepSim(dt);
  assert.ok(state.world.bullets.filter(b => b.owner === other).length > 2);
  assert.ok(enemyFwd(enemy).dot(other.pos.clone().sub(enemy.pos).normalize()) > 0.99,
    "enemy faces the closer pilot, not the local pilot");
  other.pos.set(5000, 0, 0);
  assert.equal(nearestPlayer(enemy.pos), local, "target changes when the other pilot moves away");
  for (let i = 0; i < 180; i++) stepSim(dt);
  assert.ok(enemyFwd(enemy).dot(local.pos.clone().sub(enemy.pos).normalize()) > 0.9,
    "enemy actually turns toward the newly closest pilot");
});

test("hostile bolts hit the actual pilot without damaging the local player or save", () => {
  const { local, other } = fresh();
  const savedHp = state.profile.hp[state.profile.ship];
  const localShield = local.sh, otherShield = other.sh;
  fire(other.pos, V(0, 0, -1), 0, false, 3);
  updateBullets(0);
  assert.equal(other.sh, otherShield - 3);
  assert.equal(local.sh, localShield);
  assert.equal(state.profile.hp[state.profile.ship], savedHp);
  assert.equal(state.world.bullets.length, 0);
});

test("shared missile flight is stepped once, not once for each player", () => {
  const { local } = fresh();
  const m = launchMissile(null, { dmg: 1 }, V(0, 0, -1), V(100, 100, 100), local);
  const life = m.l;
  stepSim(dt);
  assert.equal(m.l, life - dt);
});

test("AI ignores docked and destroyed pilots, and breaks ties by list order", () => {
  const { local, other } = fresh();
  const midway = V(0, 0, 0);
  assert.equal(nearestPlayer(midway), local);
  local.docked = true;
  assert.equal(nearestPlayer(midway), other);
  other.dead = true;
  assert.equal(nearestPlayer(midway), null);
});

test("a configured pilot cannot accidentally share another pilot's live power budget", () => {
  const { local, other } = fresh();
  other.power = local.power;
  assert.throws(() => stepSim(dt), /own drive, power and profile/);
});

test("a rock collision damages the colliding non-local pilot, not the local profile", () => {
  const { local, other } = fresh();
  const beforeLocal = { hull: local.hull, sh: local.sh, hp: state.profile.hp[state.profile.ship] };
  other.v.set(100, 0, 0);
  const rock = { pos: other.pos.clone(), r: 10, scale: V(1, 1, 1), s0: V(1, 1, 1) };
  state.world.asteroids.push(rock);
  const before = other.sh;
  stepSim(dt);
  assert.ok(other.sh < before);
  assert.deepEqual({ hull: local.hull, sh: local.sh, hp: state.profile.hp[state.profile.ship] }, beforeLocal);
});
