// Step 8a: test the real fixed clock and real game rules without a browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../src/state/state.js";
import { newProfile } from "../src/state/profile.js";
import { neutralControls } from "../src/state/controls.js";
import { SIM_DT, MAX_FRAME_DT } from "../src/data/simulation.js";
import { createSimClock, stepSim } from "../src/sim/step.js";
import { createPlayer, setShip, flight } from "../src/sim/player.js";
import { refreshDrive } from "../src/sim/drive.js";
import { refreshShield, updateShield } from "../src/sim/shield.js";
import { refreshHull } from "../src/sim/hull.js";
import { refillPower, updatePower } from "../src/sim/power.js";
import { refreshGuns } from "../src/sim/guns.js";
import { updateWarp } from "../src/sim/sectors.js";
import { updatePrimary, updateMissiles } from "../src/sim/weapons.js";
import { updateEnemies } from "../src/sim/ai.js";
import { updateBullets, updateCrates } from "../src/sim/combat.js";
import { updateEffects } from "../src/sim/effects.js";
import { setSeed, random, cosmeticRandom } from "../src/util/rng.js";

function fresh() {
  state.profile = newProfile();
  state.time = 0;
  state.warp = null;
  state.place = "hollow";
  state.freeCam.on = false;
  state.controls = neutralControls();
  state.controls.thrust = 1;
  state.controls.strafe = 0.25;
  state.controls.steer.x = 0.22;
  state.aimDirection = { x: 0, y: 0, z: -1 };
  for (const list of Object.values(state.world)) list.length = 0;
  Object.assign(state.flight, { lock: null, missileLock: { target: null, t: 0, locked: false },
    gunCd: [], missileCd: 0, spawnT: 1e9, beamOn: false, beamT: 0 });
  createPlayer();
  setShip(state.profile.ship);
  refillPower();
  refreshDrive();
  refreshShield();
  refreshHull();
  refreshGuns();
  state.player.docked = false;
  state.player.pos.set(0, 0, 0);
  setSeed(987);
}

// The exact pre-8a ordering, including time, preserved as the comparison oracle.
function legacyStep(dt) {
  state.time += dt;
  if (!state.player.docked) {
    flight(dt); updateShield(dt); updatePower(dt); updateWarp(dt);
    updatePrimary(dt); updateMissiles(dt); updateEnemies(dt);
    updateBullets(dt); updateCrates(dt);
  }
  updateEffects(dt);
}

function snapshot() {
  const p = state.player;
  return { pos: p.pos.toArray(), vel: p.v.toArray(), quat: p.quat.toArray(),
    thr: p.thr, en: p.en, sh: p.sh, stored: state.power.stored, time: state.time };
}
function run(fps, mode) {
  fresh();
  const clock = createSimClock();
  for (let frame = 0; frame < fps * 10; frame++) {
    if (mode === "fixed") clock.advance(1 / fps);
    else legacyStep(1 / fps);
  }
  return snapshot();
}
function distance(a, b) {
  return Math.hypot(...a.pos.map((value, i) => value - b.pos[i]));
}

test("fixed simulation produces identical flight at 30, 60 and 144 display fps", () => {
  const at60 = run(60, "fixed");
  assert.deepEqual(run(30, "fixed"), at60);
  assert.deepEqual(run(144, "fixed"), at60);
  assert.ok(Math.abs(at60.time - 10) < 1e-10);
});

test("60 fps fixed flight matches the former 60 fps loop; other old rates are measured", t => {
  const fixed = run(60, "fixed");
  const old60 = run(60, "legacy");
  assert.deepEqual(fixed, old60);
  const old30 = run(30, "legacy"), old144 = run(144, "legacy");
  const diff30 = distance(fixed, old30), diff144 = distance(fixed, old144);
  t.diagnostic(`Position difference after 10 seconds, fixed 60 vs old 30: ${diff30.toFixed(4)} units; vs old 144: ${diff144.toFixed(4)} units`);
  // The old variable-step integrator was already frame-rate dependent. Keep the
  // resulting differences bounded without claiming byte-for-byte equality.
  assert.ok(diff30 < 15 && diff144 < 15, "legacy trajectory remains close across these rates");
});

test("the clock handles fractional frames, long stalls and invalid durations", () => {
  const ticks = [];
  const clock = createSimClock(dt => ticks.push(dt));
  assert.equal(clock.advance(SIM_DT / 2), 0);
  assert.equal(clock.advance(SIM_DT / 2), 1);
  assert.equal(clock.advance(0), 0);
  assert.equal(clock.advance(NaN), 0);
  assert.equal(clock.advance(-1), 0);
  assert.equal(clock.advance(10), Math.round(MAX_FRAME_DT / SIM_DT));
  assert.ok(ticks.every(dt => dt === SIM_DT));
});

test("cosmetic randomness does not consume the seeded gameplay sequence", () => {
  setSeed(111);
  const expected = [random(), random()];
  setSeed(111);
  const first = random();
  for (let i = 0; i < 100; i++) cosmeticRandom();
  assert.deepEqual([first, random()], expected);
  setSeed(null);
});

test("seeded combat evolves identically with 30, 60 and 144 display frames", async () => {
  const { spawnEnemy } = await import("../src/sim/ai.js");
  function battle(fps) {
    fresh();
    state.controls.fire = true;
    state.controls.steer.x = 0;
    state.controls.strafe = 0;
    state.controls.thrust = 0;
    spawnEnemy("raider", { x: 0, y: 0, z: -600 });
    const clock = createSimClock();
    for (let i = 0; i < fps * 3; i++) {
      // Screen and sound may make a different number of cosmetic rolls per frame.
      cosmeticRandom();
      clock.advance(1 / fps);
    }
    return {
      player: snapshot(), kills: state.profile.kills,
      enemies: state.world.enemies.map(e => ({ pos: e.pos.toArray(), hp: e.hp, fire: e.fire })),
      bullets: state.world.bullets.map(b => ({ pos: b.pos.toArray(), l: b.l, own: b.own })),
      crates: state.world.crates.map(c => ({ pos: c.pos.toArray(), item: c.item })),
    };
  }
  const at60 = battle(60);
  assert.deepEqual(battle(30), at60);
  assert.deepEqual(battle(144), at60);
});

test("simulation advances while docked, but flight waits until launch", () => {
  fresh();
  state.player.docked = true;
  const position = state.player.pos.clone();
  stepSim(SIM_DT);
  assert.equal(state.time, SIM_DT);
  assert.ok(state.player.pos.equals(position));
  state.player.docked = false;
  stepSim(SIM_DT);
  assert.ok(!state.player.pos.equals(position));
});

test("a hint survives display-only frames and is cleared on the next tick", () => {
  fresh();
  const clock = createSimClock();
  state.hud.prompt = "A test hint";
  clock.advance(SIM_DT / 2);
  assert.equal(state.hud.prompt, "A test hint");
  clock.advance(SIM_DT / 2);
  assert.equal(state.hud.prompt, "");
});
