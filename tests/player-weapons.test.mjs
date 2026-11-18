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
  state.place = "hollow";
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
  setWeapon(1, b);
  assert.equal(state.profile.pw, "1");
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

test('F switches directly to another target and toggles same target or empty space off', () => {
  const { a } = setup();
  const first = spawnEnemy('raider', V(0, 0, -300));
  const second = spawnEnemy('raider', V(200, 0, -300));
  toggleLock(a);
  assert.equal(a.flight.lock.o, first);
  a.pos.x = 200;
  toggleLock(a);
  assert.equal(a.flight.lock.o, second, 'one press switches without an unlock step');
  toggleLock(a);
  assert.equal(a.flight.lock, null, 'same target toggles off');
  toggleLock(a);
  a.pos.x = 10000;
  toggleLock(a);
  assert.equal(a.flight.lock, null, 'no candidate releases previous lock');
});

test('F station locks compare station identity rather than temporary wrapper objects', () => {
  const { a } = setup();
  a.place = 'reach'; a.pos.set(0, 0, 200); a.quat.identity();
  toggleLock(a);
  assert.equal(a.flight.lock.k, 's');
  toggleLock(a);
  assert.equal(a.flight.lock, null);
});

test('F-selected enemy keeps missile acquisition while another crosses the reticle', () => {
  const { a } = setup();
  state.aimDirection = { x: 0, y: 0, z: -1 };
  const selected = spawnEnemy('raider', V(60, 0, -500));
  a.flight.lock = { k: 'e', o: selected };
  updateMissiles(0.1, a, false);
  updateMissiles(0.5, a, false);
  const crossing = spawnEnemy('raider', V(0, 0, -200));
  const progress = a.flight.missileLock.t;
  updateMissiles(0.5, a, false);
  assert.equal(a.flight.missileLock.target, selected);
  assert.ok(a.flight.missileLock.t > progress);
  updateMissiles(2, a, false);
  assert.equal(a.flight.missileLock.locked, true);
  a.flight.lock = { k: 'e', o: crossing };
  updateMissiles(0.1, a, false);
  assert.equal(a.flight.missileLock.target, crossing);
  assert.equal(a.flight.missileLock.t, 0, 'changing target starts fresh acquisition');
  crossing.pos.x = 5000;
  updateMissiles(0.1, a, false);
  assert.equal(a.flight.missileLock.target, selected, 'selected out-of-range target cannot override a valid candidate');
  selected.hp = 0;
  updateMissiles(0.1, a, false);
  assert.equal(a.flight.missileLock.target, null);
});

test('NPC health bars clamp percentages, show no invented shields and leave names uncluttered', async () => {
  const { targetHealth, lockName } = await import('../src/sim/targeting.js');
  assert.deepEqual(targetHealth({ hp: 5, mx: 10 }), { shield: 0, hull: 50 });
  assert.deepEqual(targetHealth({ sh: 3, maxSh: 12, hp: 20, mx: 10 }), { shield: 25, hull: 100 });
  assert.deepEqual(targetHealth({ sh: -2, maxSh: 10, hp: -1, mx: 10 }), { shield: 0, hull: 0 });
  assert.equal(lockName({ k: 'e', o: { n: 'Guardian', hp: 5, mx: 10 } }), 'Guardian');
});

test('Missile HUD retains expanded corner animation without a bar or percentage', async () => {
  const { MISSILE_HUD } = await import('../src/data/weapons.js');
  const { readFileSync } = await import('node:fs');
  const hud = readFileSync('src/ui/hud.js', 'utf8');
  const html = readFileSync('src/index.html', 'utf8');
  assert.ok(MISSILE_HUD.startRadius - MISSILE_HUD.endRadius >= 70);
  assert.equal(MISSILE_HUD.startRadius, 106);
  assert.equal(MISSILE_HUD.endRadius, 34);
  assert.ok(html.includes(`id="retc" width="${MISSILE_HUD.canvas}" height="${MISSILE_HUD.canvas}"`));
  const ring = hud.slice(hud.indexOf('function drawLockRing'), hud.indexOf('function mark('));
  assert.ok(!ring.includes('fillRect'));
  assert.ok(!ring.includes('fillText'));
  assert.ok(ring.includes('raw * 0.5 * (1 + raw)'));
  assert.ok(ring.includes('ctx.stroke()'));
  assert.ok(!hud.includes('"Locked " + lockName'));
});
