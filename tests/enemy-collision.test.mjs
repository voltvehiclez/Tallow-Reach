// Enemies are solid: they collide with the pilot, with rocks, with scenery and with
// each other — and a collision hurts the same way it hurts the pilot.
//
// The pilot's collision rules are the reference: a hit above 25 m/s costs 0.015
// hull per m/s (shields first for the pilot), rocks damage whoever flies at them
// (with no one credited for the kill), **solid scenery damages the same way** (owner,
// 2026-11-15 — it used to bounce for free, which is why hitting Meridian Station cost
// nothing), and two ships knock each other aside so the ailment reads as a re-aim, not
// a grind.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../src/state/state.js";
import { newProfile } from "../src/state/profile.js";
import { createPlayer, createPlayerRecord } from "../src/sim/player.js";
import { configurePlayer } from "../src/sim/session.js";
import { stepSim } from "../src/sim/step.js";
import { spawnEnemy, updateEnemies } from "../src/sim/ai.js";
import { advanceMissions, acceptMission, missionProgress } from "../src/sim/missions.js";
import { V, Q } from "../src/util/math.js";
import { setSeed } from "../src/util/rng.js";
import {
  makeSoup, registerPlaceCollider, clearPlaceColliders,
} from "../src/sim/colliders.js";

/** A closed box as 12 triangles, from min/max on each axis — the soup an author would bake. */
function slab(x0, x1, y0, y1, z0, z1) {
  const v = [];
  const quad = (a, b, c, d) => v.push(...a, ...b, ...c, ...a, ...c, ...d);
  const V3 = (x, y, z) => [x, y, z];
  const p000 = V3(x0, y0, z0), p100 = V3(x1, y0, z0), p110 = V3(x1, y1, z0), p010 = V3(x0, y1, z0);
  const p001 = V3(x0, y0, z1), p101 = V3(x1, y0, z1), p111 = V3(x1, y1, z1), p011 = V3(x0, y1, z1);
  quad(p001, p101, p111, p011);   // +z face (nearest the raider)
  quad(p000, p010, p110, p100);   // -z face
  quad(p010, p011, p111, p110);   // top
  quad(p000, p100, p101, p001);   // bottom
  quad(p000, p001, p011, p010);   // -x
  quad(p100, p110, p111, p101);   // +x
  return v;
}

const dt = 1 / 60;

function fresh() {
  state.players.length = 0; state.localPlayerIndex = 0;
  state.profile = newProfile(); state.place = "reach";
  state.time = 0; state.warp = null; state.freeCam.on = false;
  state.aimDirection = { x: 0, y: 0, z: -1 };
  for (const list of Object.values(state.world)) list.length = 0;
  const local = configurePlayer(createPlayer(), state.profile);
  local.docked = false;
  local.pos.set(0, 0, 0);
  local.v.set(0, 0, 0);
  local.en = local.enMax;
  state.players.push(local);
  local.flight.spawnT = 1e9;     // no respawn jitter
  setSeed(12345);
  return { local };
}

test("a ramming pilot and the rammed enemy both take collision damage, and the kill is credited", () => {
  const { local } = fresh();
  const enemy = spawnEnemy("raider", V(0, 0, -6));
  enemy.fire = 1e9;
  const shBefore = local.sh,
    hpBefore = enemy.hp;
  local.v.set(0, 0, -100);       // head-on, well above the 25 m/s rule
  for (let i = 0; i < 6; i++) stepSim(dt);
  assert.ok(local.sh < shBefore, "the pilot took ramming damage through the shields");
  assert.ok(enemy.hp < hpBefore, "the hostile took collision damage the same way");
  assert.ok(local.pos.distanceTo(enemy.pos) > 1, "the ships were pushed apart, not left overlapping");
});

test("a kill by ramming the pilot is the pilot's: credited, enemy removed", () => {
  const { local } = fresh();
  const enemy = spawnEnemy("raider", V(0, 0, -6));
  enemy.fire = 1e9;
  enemy.hp = 1;                  // one graze finishes it
  const killsBefore = state.profile.kills;
  local.v.set(0, 0, -100);
  for (let i = 0; i < 8; i++) stepSim(dt);
  assert.equal(state.profile.kills, killsBefore + 1, "the ram kill counts for the ramming pilot");
  assert.ok(!state.world.enemies.includes(enemy), "the dead enemy leaves the world");
});

test("two enemies in the same space ricochet apart and live on", () => {
  fresh();
  const a = spawnEnemy("raider", V(0, 0, 2000));
  const b = spawnEnemy("raider", V(1, 0, 2000));
  a.fire = b.fire = 1e9;
  a.v.set(20, 0, 0);
  b.v.set(-20, 0, 0);
  updateEnemies(dt, "reach");
  const dist = a.pos.distanceTo(b.pos);
  assert.ok(dist >= 8.5, `the hulls were separated, not left overlapping (distance ${dist.toFixed(2)})`);
  assert.ok(a.v.x < 0 && b.v.x > 0, "their velocities rebounded off each other");
  assert.equal(a.hp, a.mx, "enemy-vs-enemy contact costs no hull by design");
  assert.equal(b.hp, b.mx, "enemy-vs-enemy contact costs no hull by design");
});

test("a rock damages a hostile like it damages the pilot, without crediting anyone", () => {
  fresh();
  const enemy = spawnEnemy("raider", V(0, 0, 0));
  enemy.fire = 1e9;
  state.world.asteroids.push({
    id: 9901, kind: "rock", place: "reach",
    pos: V(0, 0, 0), shape: 0, quat: Q(0, 0, 0, 1),
    s0: V(2, 2, 2), scale: V(2, 2, 2), r: 2,
    type: "ferrite", ore: 100, max: 100,
  });
  enemy.v.set(100, 0, 0);        // full burn into the rock
  updateEnemies(dt, "reach");
  assert.ok(enemy.hp < enemy.mx, "the hostile took collision damage from the rock");
  assert.equal(state.profile.kills, 0, "an environmental kill credits no pilot");
});

test("solid scenery damages a hostile too: the station is not a free bounce for anyone", () => {
  // Same rule as the pilot's (owner, 2026-11-15: "everything that is solid"). Scenery used to
  // bounce a hostile for free while a rock hurt it; both use the collider's `damage` factor now,
  // and neither credits a pilot.
  fresh();
  // A wall across the hostile's path, as the render layer would bake it: damage 1 by default.
  // A solid SLAB (not a single flat tri: a 4.8 m hull can straddle a zero-thickness plane between
  // ticks and never register, which is a property of the test prop, not of the game — real scenery
  // is closed geometry). Its near face is 3 m ahead of the raider.
  const wall = { id: "wall", damage: 1, soup: makeSoup(new Float32Array(slab(-200, 200, -200, 200, -3, 3))) };
  clearPlaceColliders("reach");
  registerPlaceCollider("reach", wall);
  const enemy = spawnEnemy("raider", V(0, 0, 0));
  enemy.fire = 1e9;
  enemy.v.set(0, 0, 120);        // full burn into the wall
  const hpBefore = enemy.hp;
  updateEnemies(dt, "reach");
  assert.ok(enemy.hp < hpBefore, "the hostile took collision damage from the scenery");
  assert.equal(state.profile.kills, 0, "and no pilot is credited: a wall is not a pilot");

  // The opt-out still holds for hostiles: a zero-damage surface bounces them unharmed.
  clearPlaceColliders("reach");
  registerPlaceCollider("reach", { ...wall, damage: 0 });
  const second = spawnEnemy("raider", V(0, 0, 0));
  second.fire = 1e9;
  second.v.set(0, 0, 120);
  const hp2 = second.hp;
  updateEnemies(dt, "reach");
  assert.equal(second.hp, hp2, "collideDmg: 0 bounces a hostile without damage");
  clearPlaceColliders("reach");
});

test("an environmental kill settles a hunt contract — destroyed is destroyed", () => {
  fresh();
  const hunt = acceptMission({ type: "hunt", tier: 1, n: 1, r: 400, e: "raider" }, state.profile, "reach");
  // A rock killed the target: no pilot is credited for the stat...
  assert.equal(advanceMissions("enemy-killed", { def: "raider", faction: "pirates", player: null, place: "hollow" }), false,
    "a kill in another pocket still does not pay");
  assert.equal(missionProgress(hunt).done, 0);
  // ...but in the pocket the hunt was taken in, the target being gone is enough.
  assert.equal(advanceMissions("enemy-killed", { def: "raider", faction: "pirates", player: null, place: "reach" }), true);
  assert.equal(missionProgress(hunt).done, 1, "an environmental kill pays the hunt");
});

test("an ownerless kill advances every pilot's hunt, not only the local pilot's", () => {
  const { local } = fresh();
  const guestProfile = newProfile();
  const guest = configurePlayer(createPlayerRecord(), guestProfile);
  guest.docked = false;
  state.players.push(guest);
  const localHunt = acceptMission({ type: "hunt", tier: 1, n: 1, r: 400, e: "raider" }, state.profile, "reach");
  const guestHunt = acceptMission({ type: "hunt", tier: 1, n: 1, r: 400, e: "raider" }, guestProfile, "reach");
  advanceMissions("enemy-killed", { def: "raider", faction: "pirates", player: null, place: "reach" });
  assert.equal(missionProgress(localHunt).done, 1, "the local hunt paid");
  assert.equal(missionProgress(guestHunt).done, 1, "the co-pilot's hunt paid too — destroyed is destroyed");
});

test("a hostile killed by a rock splits no loot and stays dead", () => {
  fresh();
  const enemy = spawnEnemy("raider", V(0, 0, 0));
  enemy.fire = 1e9;
  enemy.hp = 0.5;                // any rock touch finishes it
  state.world.asteroids.push({
    id: 9902, kind: "rock", place: "reach",
    pos: V(0, 0, 0), shape: 1, quat: Q(0, 0, 0, 1),
    s0: V(2, 2, 2), scale: V(2, 2, 2), r: 2,
    type: "ferrite", ore: 100, max: 100,
  });
  enemy.v.set(100, 0, 0);
  updateEnemies(dt, "reach");
  assert.ok(!state.world.enemies.includes(enemy), "the dead enemy is gone for good");
  updateEnemies(dt, "reach");    // the world keeps running without it
  assert.ok(!state.world.enemies.includes(enemy), "and it does not come back");
});

test("an enemy is damaged by a fast oblique pass, not only by head-on rams", () => {
  const { local } = fresh();
  const enemy = spawnEnemy("raider", V(0, 0, 0));
  enemy.fire = 1e9;
  enemy.v.set(0, 0, 0);
  local.pos.set(0, 0, 0);
  local.v.set(80, 0, 40);        // fast, oblique — the kind of pass that clips a hull
  const before = enemy.hp;
  stepSim(dt);
  assert.ok(enemy.hp < before, "the enemy took collision damage from the pass");
});
