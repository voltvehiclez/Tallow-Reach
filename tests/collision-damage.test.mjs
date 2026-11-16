// Solid means it hurts (owner, 2026-11-15).
//
// The report: "Collision damage is gone from the meridian station. Everything that is solid should
// apply collision damage unless otherwise specific. Asteroids still apply collision damage
// correctly."
//
// Exactly right, and the cause was one default. A rock's collider carries `damage: 1` — hardcoded in
// `collideRockAt` — so rocks always hurt. Scenery went the other way: `colliderFromObject` took
// `damage = 0` and `scene.js` passed `f.collideDmg ?? 0`, with `player.js` then gating on
// `hit.damage > 0`. So every station, planet and cave in the game was a free bounce, and had been
// since the model-fitted collision work. Nothing tested it either way, which is why it survived.
//
// The rule now matches the owner's: **solid means damage 1**, the same factor a rock uses. A
// feature can opt out with `collideDmg: 0` (bounce, no damage) or opt up with `collideDmg: 2`.
// `collide: false` still means no collider at all.
//
// These tests pin the *behaviour at the hull*, not the plumbing: fly a ship into baked scenery at
// speed and check the hull, then repeat with 0 and 2 to prove the opt-out and the scale.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { loadHeadless } from "./headless.mjs";

// collideModel.js imports only `three` and sim/colliders.js, so it loads headless as-is.
const { colliderFromObject } = await import("../src/render/collideModel.js");

const sim = await loadHeadless("src/sim/player.js", {
  state: "src/state/state.js",
  newProfile: "src/state/profile.js",
  createPlayer: "src/sim/player.js",
  flight: "src/sim/player.js",
  configurePlayer: "src/sim/session.js",
  registerPlaceCollider: "src/sim/colliders.js",
  clearPlaceColliders: "src/sim/colliders.js",
  placeCollidersOf: "src/sim/colliders.js",
  setSeed: "src/util/rng.js",
  resetPlaces: "src/state/state.js",
});

const DT = 1 / 60;
const SX = 1800, SY = 200, SZ = -1500;

/** Meridian's station, built the way `stationModel()` builds it (same parts, names, parents). */
function station() {
  const stn = new THREE.Group();
  const spin = new THREE.Group();
  stn.add(spin);
  stn.position.set(SX, SY, SZ);
  const m = new THREE.MeshStandardMaterial();
  const add = (geo, x, y, z, parent) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    (parent || spin).add(o);
    return o;
  };
  const ring = add(new THREE.TorusGeometry(90, 7, 8, 48), 0, 0, 0);
  ring.rotation.x = Math.PI / 2;
  const arms = new THREE.Group();
  arms.name = "spin";
  spin.add(arms);
  for (let i = 0; i < 4; i++) {
    const spoke = add(new THREE.BoxGeometry(180, 2.5, 2.5), 0, 0, 0, arms);
    spoke.rotation.y = (i * Math.PI) / 4;
  }
  add(new THREE.CylinderGeometry(14, 14, 150, 12), 0, 0, 0, stn);
  add(new THREE.BoxGeometry(60, 2, 30), 0, -60, 0, stn);
  add(new THREE.BoxGeometry(8, 8, 40), 0, 0, 26, stn);
  return stn;
}

/** A fresh pilot in `reach`, with `collider` (and its movers) registered there. */
function freshWith(collider) {
  const S = sim.state;
  sim.resetPlaces();
  S.players.length = 0;
  S.localPlayerIndex = 0;
  S.profile = sim.newProfile();
  S.place = "reach";
  S.ui.intro = false;
  S.time = 0;
  S.warp = null;
  for (const list of Object.values(S.world)) list.length = 0;
  const P = sim.configurePlayer(sim.createPlayer(), S.profile);
  P.docked = false;
  P.flight.spawnT = 1e9;
  S.players.push(P);
  sim.setSeed(1);
  sim.clearPlaceColliders("reach");
  if (collider) {
    if (collider.soup) sim.registerPlaceCollider("reach", collider);
    for (const mover of collider.movers || []) sim.registerPlaceCollider("reach", mover);
  }
  return P;
}

/** Fly the pilot at the ring's rim, holding the throttle, and report what it cost. */
function flyIntoStation(P) {
  const sh0 = P.sh, hull0 = P.hull;
  P.pos.set(SX, SY, SZ + 600);
  P.quat.identity();
  P.v.set(0, 0, -200);
  P.en = P.enMax;
  for (let i = 0; i < 240; i++) {     // four seconds: cover the 600 m and hit
    P.thr = 1;                        // a coasting hull bleeds speed; hold the throttle
    sim.flight(DT, P);
  }
  return { loss: (sh0 - P.sh) + (hull0 - P.hull), sh0, hull0, sh: P.sh, hull: P.hull };
}

test("the bake gives solid scenery damage 1 by default — the same factor a rock uses", () => {
  const col = colliderFromObject(station(), { id: "meridian#0" });
  assert.equal(col.soup.damage, 1, "the station's still parts hurt like a rock");
  assert.equal(col.movers.length, 1, "the arms are a live mover");
  assert.equal(col.movers[0].soup.damage, 1, "and the arms hurt too, with the same factor");
});

test("flying into Meridian Station at speed costs hull (the owner's bug: it cost nothing)", () => {
  const P = freshWith(colliderFromObject(station(), { id: "meridian#0" }));
  const result = flyIntoStation(P);
  assert.ok(result.loss > 1,
    `the hull took damage from the station (lost ${result.loss.toFixed(2)}), it used to take none`);
  // Shields go first, exactly as they do for a rock.
  assert.ok(result.sh < result.sh0, "the shields took it first");
});

test("the damage is the rock rate: 0.015 per m/s above 25, times the feature's factor", () => {
  // The pilot flies in at ~200 m/s, so a factor of 1 should cost about (200-25) * 0.015 = 2.6,
  // and a factor of 2 exactly twice that. Measured through the real hit, so a wrong unit shows up.
  const one = flyIntoStation(freshWith(colliderFromObject(station(), { id: "s", damage: 1 })));
  const two = flyIntoStation(freshWith(colliderFromObject(station(), { id: "s", damage: 2 })));
  assert.ok(one.loss > 2 && one.loss < 4, `factor 1 costs about the rock rate (${one.loss.toFixed(2)})`);
  assert.ok(Math.abs(two.loss - one.loss * 2) < 0.5,
    `factor 2 costs twice as much (${two.loss.toFixed(2)} vs ${one.loss.toFixed(2)})`);
});

test("collideDmg: 0 is the opt-out — that surface bounces without damage", () => {
  const P = freshWith(colliderFromObject(station(), { id: "meridian#0", damage: 0 }));
  const result = flyIntoStation(P);
  assert.equal(result.loss, 0, "a zero-damage feature costs nothing, by the owner's exception");
  // It still bounces: the ship is stopped by the ring rather than sailing through it.
  assert.ok(P.pos.z > SZ - 120, "and it is still solid — the hull was pushed out, not through");
});

test("slow contact does not hurt: the 25 m/s threshold is unchanged", () => {
  const P = freshWith(colliderFromObject(station(), { id: "meridian#0" }));
  const sh0 = P.sh, hull0 = P.hull;
  P.pos.set(SX, SY, SZ + 130);      // already touching the ring's outer edge (radius 97)
  P.quat.identity();
  P.v.set(0, 0, -10);               // a gentle nudge, well under 25 m/s
  P.thr = 0;
  for (let i = 0; i < 60; i++) sim.flight(DT, P);
  assert.equal((sh0 - P.sh) + (hull0 - P.hull), 0, "drifting into a station is free; hitting it is not");
});

test("a rock and a station in the same place cost the same, so the rule is one rule", () => {
  // The owner's check: "Asteroids still apply collision damage correctly." A rock's factor is 1 and
  // the station's default is 1, so the two must agree to the last decimal for the same approach.
  const stationLoss = flyIntoStation(freshWith(colliderFromObject(station(), { id: "s", damage: 1 }))).loss;
  const P = freshWith(null);
  // A rock face at the same place, as a soup the rock path would produce (damage 1, hardcoded).
  const s = 60;
  P.place = "reach";
  sim.state.world.asteroids.push({
    kind: "rock", pos: { x: SX, y: SY, z: SZ }, quat: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: s, y: s, z: s }, r: 60, ore: 500, max: 500, type: "ferrite",
  });
  const sh0 = P.sh, hull0 = P.hull;
  P.pos.set(SX, SY, SZ + 600);
  P.quat.identity();
  P.v.set(0, 0, -200);
  P.en = P.enMax;
  for (let i = 0; i < 240; i++) { P.thr = 1; sim.flight(DT, P); }
  const rockLoss = (sh0 - P.sh) + (hull0 - P.hull);
  assert.ok(rockLoss > 1, `the rock hurt as expected (${rockLoss.toFixed(2)})`);
  assert.ok(Math.abs(rockLoss - stationLoss) < 1.5,
    `station and rock cost the same for the same approach (${stationLoss.toFixed(2)} vs ${rockLoss.toFixed(2)})`);
});
