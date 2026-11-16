// Projectiles stop on colliders (owner, 2026-11-15).
//
// The owner's report: "collision boxes that are not no-clipable stop all types of weapons /
// projectiles in a logical way. So all cannons, missiles etc should impact when hitting a collision
// box. I notice if I shoot meridian station with cannons it goes through it. Not sure how it works
// with asteroids but make sure the hit boxes stop them so its realistic."
//
// He was right, and the cause was simple: `updateBullets` tested hostiles, then a distance-to-centre
// circle for rocks, and never looked at a place's colliders at all. A station had nothing to hit.
//
// What these tests pin down:
//   * a bolt that crosses a collider dies on it, at the impact point, and damages nothing
//   * it cannot tunnel through a thin wall between two ticks (the segment is swept, not sampled)
//   * the shot that already hit a hostile is unaffected: hull before scenery, in that order
//   * `noclip` decorations and `collide: false` features do NOT stop shots — that is what they are for
//   * a missile bursts on scenery and on rocks the same way
//   * the mining beam is blocked by scenery instead of cutting a rock through a station wall
//   * a rock in the field stops a hostile shot aimed at the pilot, which it did not before
//
// Everything here is the real sim: no mesh, no browser. Run with `npm test`.

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
  refreshGuns: "src/sim/guns.js",
  refreshDrive: "src/sim/drive.js",
  refreshShield: "src/sim/shield.js",
  refreshHull: "src/sim/hull.js",
  refillPower: "src/sim/power.js",
  fire: "src/sim/combat.js",
  updateBullets: "src/sim/combat.js",
  hitHostile: "src/sim/combat.js",
  spawnEnemy: "src/sim/ai.js",
  boom: "src/sim/effects.js",
  sweepColliders: "src/sim/colliders.js",
  makeSoup: "src/sim/colliders.js",
  registerPlaceCollider: "src/sim/colliders.js",
  clearPlaceColliders: "src/sim/colliders.js",
  placeCollidersOf: "src/sim/colliders.js",
  setWeapon: "src/sim/weapons.js",
  updatePrimary: "src/sim/weapons.js",
  launchMissile: "src/sim/missile.js",
  updateMissileFlight: "src/sim/missile.js",
});

const DT = 1 / 60;
const P = (x, y, z) => sim.V(x, y, z);

/** A fresh, flying player at the origin, with a cannon fitted and no rocks around. */
function freshWorld(place = "hollow") {
  const S = sim.state;
  sim.setSeed(3);
  S.profile = sim.newProfile();
  S.profile.loadout.wasp.primary = ["cannon_basic", "beam_basic"];
  for (const k of ["enemies", "bullets", "missiles", "crates", "fx", "asteroids"]) S.world[k].length = 0;
  sim.createPlayer();
  sim.setShip("wasp");
  sim.refillPower();
  sim.refreshDrive();
  sim.refreshShield();
  sim.refreshHull();
  sim.refreshGuns();
  S.player.docked = false;
  S.player.place = place;
  S.place = place;
  S.player.pos.set(0, 0, 0);
  S.player.quat.set(0, 0, 0, 1);
  S.player.v.set(0, 0, 0);
  S.flight.spawnT = 1e9;
  S.flight.gunCd = [0, 0];
  sim.clearPlaceColliders(place);
  return S;
}

/** A flat wall across +X, `halfSize` wide, at distance `z`. Triangle soup, like a station panel. */
function wallAt(z, halfSize = 200, place = "hollow", id = "wall") {
  const s = halfSize;
  const v = [
    -s, -s, z, s, -s, z, s, s, z,
    -s, -s, z, s, s, z, -s, s, z,
  ];
  const col = { id, soup: sim.makeSoup(new Float32Array(v)), damage: 0 };
  sim.registerPlaceCollider(place, col);
  return col;
}

test("a cannon bolt dies on a collider instead of passing through it (the Meridian Station bug)", () => {
  const S = freshWorld();
  wallAt(-100);
  assert.equal(sim.placeCollidersOf("hollow").length, 1, "the wall is registered for this place");

  const b = sim.fire(P(0, 0, 0), P(0, 0, -1), 500, true, 2);
  assert.equal(S.world.bullets.length, 1);

  for (let i = 0; i < 30; i++) sim.updateBullets(DT);   // half a second, plenty to reach z=-100

  assert.equal(S.world.bullets.length, 0, "the bolt stopped on the wall");
  assert.equal(b.pos.z >= -101 && b.pos.z <= -99, true,
    `it died AT the wall (z=${b.pos.z.toFixed(2)}), not somewhere past it`);
  assert.ok(S.world.fx.length > 0, "and it sparked, so the pilot sees it hit something");
});

test("a bolt cannot tunnel through a thin wall between two ticks", () => {
  const S = freshWorld();
  wallAt(-100);
  // The basic cannon's bolt covers 15 m a tick; fire it so the wall sits in the MIDDLE of a step,
  // where an end-point test would see clear space on both sides.
  sim.fire(P(0, 0, 0), P(0, 0, -1), 900, true, 2);
  for (let i = 0; i < 20; i++) sim.updateBullets(DT);
  assert.equal(S.world.bullets.length, 0, "the swept segment caught the wall the end point had already passed");
});

test("a clear line of fire is still clear: no wall, no false hits", () => {
  const S = freshWorld();
  sim.fire(P(0, 0, 0), P(0, 0, -1), 500, true, 2);
  for (let i = 0; i < 30; i++) sim.updateBullets(DT);
  assert.equal(S.world.bullets.length, 1, "with nothing in the way the shot flies on");
});

test("scenery does not swallow a shot before it reaches a hostile: hull first", () => {
  const S = freshWorld();
  // A wall BEHIND the raider: the hull is nearer, so the hull takes it.
  wallAt(-200);
  const e = sim.spawnEnemy("raider", { x: 0, y: 0, z: -60 });
  sim.fire(P(0, 0, 0), P(0, 0, -1), 500, true, 4);
  for (let i = 0; i < 12; i++) sim.updateBullets(DT);
  assert.equal(e.hp, 6, "the raider took the 4 damage");
  assert.equal(S.world.bullets.length, 0, "and the shot died on the hull, not the wall behind it");
});

test("a shot that passes a wall's edge is not stopped by it", () => {
  const S = freshWorld();
  wallAt(-100, 20);                       // a small panel: 40 m across, centred on the axis
  sim.fire(P(100, 0, 0), P(0, 0, -1), 500, true, 2);   // fired well clear of it to the side
  for (let i = 0; i < 30; i++) sim.updateBullets(DT);
  assert.equal(S.world.bullets.length, 1, "the shot missed the panel and flew on");
});

test("noclip decoration and collide:false features do not stop shots, by design", () => {
  const S = freshWorld();
  // `noclip` nodes are stripped when the collider is baked (render/collideModel.js), and a feature
  // with `collide: false` registers no collider at all — so there is simply nothing here to hit.
  // This asserts the consequence the owner asked for: only clipping colliders stop projectiles.
  assert.equal(sim.placeCollidersOf("hollow").length, 0, "no collider was registered");
  sim.fire(P(0, 0, 0), P(0, 0, -1), 500, true, 2);
  for (let i = 0; i < 30; i++) sim.updateBullets(DT);
  assert.equal(S.world.bullets.length, 1, "nothing to stop it");
});

test("a rock in the field stops a hostile shot aimed at the pilot (it used to reach through)", () => {
  const S = freshWorld();
  S.world.asteroids.push({
    kind: "rock", pos: P(0, 0, -200), quat: { x: 0, y: 0, z: 0, w: 1 },
    r: 20, scale: P(20, 20, 20), s0: P(20, 20, 20), ore: 500, max: 500, type: "ferrite",
  });
  const shieldBefore = S.player.sh;
  sim.fire(P(0, 0, -400), P(0, 0, 1), 600, false, 3);   // a hostile's shot, at the pilot
  for (let i = 0; i < 60; i++) sim.updateBullets(DT);
  assert.equal(S.world.bullets.length, 0, "the shot is spent");
  assert.equal(S.player.sh, shieldBefore, "and it never reached the pilot: the rock stopped it");
});

test("the mining beam is blocked by scenery instead of cutting a rock through it", () => {
  const S = freshWorld();
  // A rock 200 m down the nose; the basic beam reaches 340 m, so it can cut it.
  S.world.asteroids.push({
    kind: "rock", pos: P(0, 0, -200), quat: { x: 0, y: 0, z: 0, w: 1 },
    r: 20, scale: P(20, 20, 20), s0: P(20, 20, 20), ore: 500, max: 500, type: "ferrite",
  });
  // Select the bay the beam is fitted in and hold fire: the real path the game runs.
  // `setWeapon(1)` means "the second primary bay", which is where freshWorld put the beam.
  sim.setWeapon(1);
  S.controls = { ...S.controls, fire: true, sec: false, thrust: 0, steer: { x: 0, y: 0 } };

  sim.updatePrimary(DT);
  assert.equal(S.flight.beamOn, true, "with a clear line the beam is on");
  assert.ok(S.flight.beamEnd.z < -150, "and it reaches the rock");
  const clearEnd = S.flight.beamEnd.z;

  // Now put the station's wall between the ship and the rock.
  wallAt(-100);
  sim.updatePrimary(DT);
  assert.equal(S.flight.beamOn, true, "the beam still draws, but it stops at the wall");
  assert.ok(S.flight.beamEnd.z > -130 && S.flight.beamEnd.z < -95,
    `the beam ends at the wall (z=${S.flight.beamEnd.z.toFixed(1)}), not at the rock (z=${clearEnd.toFixed(1)})`);
  assert.equal(S.flight.beamT, 0, "and it makes no progress toward an ore through a wall");
});

test("a missile bursts on scenery, and on a rock, instead of sailing through", () => {
  const S = freshWorld();
  sim.launchMissile(null, { dmg: 4 }, P(0, 0, -1), P(0, 0, 0));   // unguided, down the nose
  assert.equal(S.world.missiles.length, 1, "the missile is in the world");

  wallAt(-200);
  const countFx = () => S.world.fx.length;
  const before = countFx();
  // A missile leaves at 140 m/s and accelerates to 480, so a wall 200 m out is about a second away.
  for (let i = 0; i < 90 && S.world.missiles.length; i++) sim.updateMissileFlight(DT);

  assert.equal(S.world.missiles.length, 0, "it is gone: it met the wall");
  assert.ok(countFx() > before, "and it burst where it hit (the explosion particles are in the world)");
});

test("a missile is stopped by a rock in the field", () => {
  const S = freshWorld();
  S.world.asteroids.push({
    kind: "rock", pos: P(0, 0, -300), quat: { x: 0, y: 0, z: 0, w: 1 },
    r: 20, scale: P(20, 20, 20), s0: P(20, 20, 20), ore: 500, max: 500, type: "ferrite",
  });
  sim.launchMissile(null, { dmg: 4 }, P(0, 0, -1), P(0, 0, 0));
  for (let i = 0; i < 60; i++) sim.updateMissileFlight(DT);
  assert.equal(S.world.missiles.length, 0, "the rock stopped it short of its full life");
});

test("the real Meridian Station's own hull stops a shot (the owner's exact report)", async () => {
  // Built from the same primitives `render/models.js` stationModel() uses and converted the way
  // `render/collideModel.js` converts them: a ring (90 m radius, 7 m tube), a hub (14 m radius,
  // 150 m tall), a base box and a dock box. The four spokes are named `noclip.spin`, so they are
  // deliberately NOT in the collider — which is the whole reason this test also checks that a shot
  // can still get through the gaps. This is the object the owner was shooting at.
  const THREE = await import("three");
  const parts = [];
  const add = (geo, x, y, z) => {
    const pos = geo.getAttribute("position"), idx = geo.getIndex();
    for (let i = 0; i < idx.count; i += 3) {
      for (const k of [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)]) {
        parts.push(pos.getX(k) + x, pos.getY(k) + y, pos.getZ(k) + z);
      }
    }
  };
  const ring = new THREE.TorusGeometry(90, 7, 8, 48);
  ring.rotateX(Math.PI / 2);
  add(ring, 0, 0, 0);
  add(new THREE.CylinderGeometry(14, 14, 150, 12), 0, 0, 0);
  add(new THREE.BoxGeometry(60, 2, 30), 0, -60, 0);
  add(new THREE.BoxGeometry(8, 8, 40), 0, 0, 26);

  const station = { id: "meridian-station", soup: sim.makeSoup(new Float32Array(parts)), damage: 0 };
  const shot = (x, y) => sim.sweepColliders([station], [], P(x, y, 600), P(x, y, 0));

  const hub = shot(0, 0);
  assert.ok(hub, "a bolt fired down the station's axis HITS it — this is the bug the owner reported");
  assert.ok(hub.z > 90 && hub.z < 105, `it stops on the hub's hull (z=${hub.z.toFixed(1)}), not inside or past it`);

  const rim = shot(90, 0);
  assert.ok(rim, "a bolt aimed at the ring's rim hits the ring");

  assert.equal(shot(400, 0), null, "400 m clear of the station, a shot flies on");
  assert.equal(shot(0, 200), null, "and so does one passing well above it");

  // The `noclip` spokes are 180 m long across the whole ring; a shot straight through a gap between
  // the hub and the ring at a height the spokes do not occupy must not be caught by anything.
  assert.equal(sim.placeCollidersOf("hollow").length, 0, "and no collider leaked into the test's own place");
});
