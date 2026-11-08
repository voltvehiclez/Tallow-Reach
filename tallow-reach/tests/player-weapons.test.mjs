import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../src/state/state.js";
import { newProfile } from "../src/state/profile.js";
import { createPlayer, createPlayerRecord } from "../src/sim/player.js";
import { configurePlayer } from "../src/sim/session.js";
import { updatePrimary, updateMissiles, setWeapon } from "../src/sim/weapons.js";
import { toggleLock } from "../src/sim/targeting.js";
import { spawnEnemy } from "../src/sim/ai.js";
import { V } from "../src/util/math.js";

function setup() {
  state.players.length = 0;
  state.localPlayerIndex = 0;
  state.profile = newProfile();
  state.profile.msl = 8;
  state.profile.loadout.wasp.secondary = ["missile_basic", null];
  state.sector = "hollow";
  state.warp = null;
  state.freeCam.on = false;
  for (const list of Object.values(state.world)) list.length = 0;
  const a = createPlayer();
  configurePlayer(a, state.profile);
  a.docked = false; a.pos.set(0, 0, 100);
  const profile = newProfile();
  profile.msl = 4;
  profile.loadout.wasp.secondary = ["missile_basic", null];
  const b = configurePlayer(createPlayerRecord(), profile);
  b.docked = false; b.pos.set(200, 0, 100);
  state.players.push(b);
  return { a, b };
}

test("two pilots fire from their own ship, cooldown and power budget", () => {
  const { a, b } = setup();
  a.controls.fire = b.controls.fire = true;
  updatePrimary(1 / 60, a); updatePrimary(1 / 60, b);
  assert.equal(state.world.bullets.filter(x => x.owner === a).length, 2);
  assert.equal(state.world.bullets.filter(x => x.owner === b).length, 2);
  assert.equal(a.flight.gunCd[0], b.flight.gunCd[0]);
  b.flight.gunCd[0] = 0;
  a.controls.fire = false;
  updatePrimary(1 / 60, a); updatePrimary(1 / 60, b);
  assert.equal(state.world.bullets.filter(x => x.owner === a).length, 2);
  assert.equal(state.world.bullets.filter(x => x.owner === b).length, 4);
  assert.equal(a.power.use.guns, 0);
  assert.ok(b.power.use.guns > 0);
  setWeapon("beam", b);
  assert.equal(state.profile.pw, "cannon");
});

test("locks, missile stock and aim belong to the pilot", () => {
  const { a, b } = setup();
  const enemyA = spawnEnemy("raider", V(0, 0, -300));
  const enemyB = spawnEnemy("raider", V(200, 0, -300));
  toggleLock(a); toggleLock(b);
  assert.equal(a.flight.lock.o, enemyA);
  assert.equal(b.flight.lock.o, enemyB);
  a.controls.sec = b.controls.sec = true;
  updateMissiles(1 / 60, a, false); updateMissiles(1 / 60, b, false);
  assert.equal(state.world.missiles.length, 2);
  assert.equal(state.world.missiles[0].owner, a);
  assert.equal(state.world.missiles[1].owner, b);
  assert.equal(state.profile.msl, 7);
  assert.equal(b.missileStock, 3);
  assert.equal(a.flight.missileLock.target, enemyA);
  assert.equal(b.flight.missileLock.target, enemyB);
});
