// Views: one mesh per entity, built and kept in step by this file.
//
// Refactor step 7 moved every world entity out of `sim/` and into plain data
// (`sim/enemy.js`, `sim/entity.js`). This file owns the *meshes*. It watches the
// world and, for each entity:
//
//   new entity             -> build its mesh, add it to the scene
//   every frame            -> copy `pos` and `quat` (and a rock's `scale`, a
//                             particle's fade) onto the mesh
//   entity leaves the world-> take its mesh out of the scene
//
// The sim says `entity-spawned` / `entity-removed` (and `enemy-spawned` /
// `enemy-removed` for hostiles) so a mesh appears or goes the moment its entity
// does; the per-frame sweep is the safety net, so a mesh can never be left behind
// or missing even if an event is missed. Nothing here changes a game rule, and
// nothing in `sim/` knows this file exists.
//
// Step 7a did hostiles and step 7b did the rest of the world (bullets, missiles,
// crates, particles, rocks and the player's own ship, plus the mining beam);
// step 7c gives the player hull a view class with named mount points.

import * as THREE from "three";
import { scene } from "./scene.js";
import { mkShip, mm, rockShapeAt } from "./models.js";
import { state } from "../state/state.js";
import { on } from "../util/events.js";
import { UP } from "../util/math.js";
import { enemyDef } from "../data/enemies.js";
import { SHIPS } from "../data/ships.js";
import { mountOffset } from "../data/mounts.js";
import { buildPlayerShip } from "./models.js";

/* ------------------------------------------------------------------------- */
/* Hostiles (step 7a)                                                        */
/* ------------------------------------------------------------------------- */

/** Enemy id -> its mesh. */
const enemies = new Map();

/** Build the mesh for enemy `e` and put it in the scene. */
function addEnemy(e) {
  const def = enemyDef(e.def),
    m = mkShip(def.col, def.scale, true);
  m.position.copy(e.pos);
  m.quaternion.copy(e.quat);
  scene.add(m);
  enemies.set(e.id, m);
  return m;
}

/** Take enemy `id`'s mesh out of the scene. Doing it twice is harmless. */
function removeEnemy(id) {
  const m = enemies.get(id);
  if (!m) return;
  scene.remove(m);
  enemies.delete(id);
}

/* ------------------------------------------------------------------------- */
/* Bullets, missiles, crates and particles (step 7b)                          */
/* ------------------------------------------------------------------------- */

const bulletGeo = new THREE.BoxGeometry(0.3, 0.3, 5);
const playerBulletMat = new THREE.MeshBasicMaterial({ color: 0xffc870 });
const enemyBulletMat = new THREE.MeshBasicMaterial({ color: 0xff4a35 });

const missileGeo = new THREE.BoxGeometry(0.5, 0.5, 3);
const missileMat = new THREE.MeshStandardMaterial({
  color: 0x8a8f94,
  emissive: 0xff7a30,
  emissiveIntensity: 0.8,
});

const crateGeo = new THREE.OctahedronGeometry(3);
const crateSalvMat = mm(0x6a5a3a, 0x4a3510);
const crateCoreMat = mm(0x3a6a7a, 0x1a5a6a);

const particleGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);

/** A crash bar: an id that somehow exists twice must not take a mesh with it. */
const claim = (map, id, m) => {
  const old = map.get(id);
  if (old) scene.remove(old);
  map.set(id, m);
};

/**
 * Build the mesh for any of the small entities, or `null` for a kind this file
 * does not draw.
 */
function buildEntity(e) {
  switch (e.kind) {
    case "bullet": {
      const m = new THREE.Mesh(bulletGeo, e.own ? playerBulletMat : enemyBulletMat);
      m.position.copy(e.pos);
      m.quaternion.copy(e.quat);
      return m;
    }
    case "missile": {
      const m = new THREE.Mesh(missileGeo, missileMat);
      m.position.copy(e.pos);
      m.quaternion.copy(e.quat);
      return m;
    }
    case "crate": {
      const m = new THREE.Mesh(crateGeo, e.item === "core" ? crateCoreMat : crateSalvMat);
      m.position.copy(e.pos);
      m.quaternion.copy(e.quat);
      return m;
    }
    case "fx": {
      // Each particle owns its own material, because it fades on its own.
      const m = new THREE.Mesh(
        particleGeo,
        new THREE.MeshBasicMaterial({ color: e.col, transparent: true })
      );
      m.position.copy(e.pos);
      m.scale.setScalar(e.size || 1);
      return m;
    }
    case "rock": {
      const m = new THREE.Mesh(rockShapeAt(e.shape || 0), mm(0x4a4540, rockGlow(e.type)));
      m.position.copy(e.pos);
      m.quaternion.copy(e.quat);
      m.scale.copy(e.scale);
      return m;
    }
    default:
      return null;
  }
}

/** A rock's faint glow by the ore inside it (the colours it always had). */
const rockGlow = type => (type === "cobalt" ? 0x14304a : type === "voidite" ? 0x3a1a55 : 0);

/** Today the small entities live in these four lists; `state.world` is the truth. */
const smallLists = () => {
  const W = state.world;
  return [W.bullets, W.missiles, W.crates, W.fx, W.asteroids];
};

const drawn = new Map();   // entity id -> { m, kind }

/** Every per-frame update a mesh might need, by kind. */
function copyState(e, m) {
  switch (e.kind) {
    case "fx":
      m.material.opacity = Math.max(0, e.l / (e.t || 1));
      break;
    case "rock":
      m.scale.copy(e.scale);
      break;
    default:
      break;
  }
}

/* ------------------------------------------------------------------------- */
/* The player's ship (step 7b; its model and mounts are 7c)                    */
/* ------------------------------------------------------------------------- */

/** Owns the visible hull and its named, data-defined weapon mounts. */
export class PlayerShipView {
  constructor(hull) {
    this.hull = hull;
    this.mesh = buildPlayerShip(hull);
    scene.add(this.mesh);
  }
  mount(name, bay = 0, barrel = 0, count = 1) {
    return mountOffset(this.hull, name, SHIPS[this.hull].sc, bay, barrel, count);
  }
  update(player) {
    const m = this.mesh;
    m.position.copy(player.pos);
    m.quaternion.copy(player.quat);
    m.visible = !player.docked;
    if (m.eng) m.eng.forEach(e => e.scale.set(1, 1, 0.5 + player.thr * 2 + player.bs * 2));
  }
  remove() { scene.remove(this.mesh); }
}

let activePlayerView = null;
function ensurePlayerView() {
  const hull = state.profile.ship;
  if (!activePlayerView || activePlayerView.hull !== hull) {
    if (activePlayerView) activePlayerView.remove();
    activePlayerView = new PlayerShipView(hull);
  }
  return activePlayerView;
}

/* ------------------------------------------------------------------------- */
/* The mining beam (step 7b)                                                  */
/* ------------------------------------------------------------------------- */

const beamMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(0.3, 0.3, 1, 6),
  new THREE.MeshBasicMaterial({ color: 0xffb25a, transparent: true, opacity: 0.8 })
);
beamMesh.visible = false;
scene.add(beamMesh);

/* ------------------------------------------------------------------------- */
/* Installing and updating                                                    */
/* ------------------------------------------------------------------------- */

/**
 * Call once at boot, before the first frame, so the meshes follow the sim's
 * events from the start.
 */
export function installEnemyViews() {
  on("enemy-spawned", ({ id }) => {
    const e = state.world.enemies.find(x => x.id === id);
    if (e && !enemies.has(id)) addEnemy(e);
  });
  on("enemy-removed", ({ id }) => removeEnemy(id));

  on("entity-spawned", ({ id }) => {
    const e = findEntity(id);
    if (!e || drawn.has(id)) return;
    const m = buildEntity(e);
    if (!m) return;
    scene.add(m);
    claim(drawn, id, m);
    drawn.set(id, { m, kind: e.kind });
  });

  on("entity-removed", ({ id }) => {
    const d = drawn.get(id);
    if (!d) return;
    scene.remove(d.m);
    if (d.kind === "fx" && d.m.material) d.m.material.dispose();
    drawn.delete(id);
  });
}

/** Where the entity with `id` is right now, from whichever list holds it. */
function findEntity(id) {
  for (const list of smallLists()) {
    const e = list.find(x => x.id === id);
    if (e) return e;
  }
  return null;
}

/**
 * Copy every enemy's position and rotation onto its mesh, and reconcile the two
 * lists. Call once per frame after the sim has run.
 */
export function updateEnemyViews() {
  const wanted = new Set();

  for (const e of state.world.enemies) {
    wanted.add(e.id);
    const m = enemies.get(e.id) || addEnemy(e);
    m.position.copy(e.pos);
    m.quaternion.copy(e.quat);
  }

  // Whatever is no longer in the world loses its mesh (this covers the cases no
  // event fired for, and a scene cleared by docking or a warp).
  for (const id of [...enemies.keys()]) if (!wanted.has(id)) removeEnemy(id);
}

/**
 * The same for every small entity: a mesh per bullet, missile, crate, particle
 * and rock, reconciled against the lists the sim keeps. Call once a frame.
 */
export function updateEntityViews() {
  const seen = new Set();

  for (const list of smallLists()) {
    for (const e of list) {
      seen.add(e.id);
      let d = drawn.get(e.id);
      if (!d) {
        const m = buildEntity(e);
        if (!m) continue;
        scene.add(m);
        claim(drawn, e.id, m);
        d = { m, kind: e.kind };
        drawn.set(e.id, d);
      }
      d.m.position.copy(e.pos);
      if (e.quat) d.m.quaternion.copy(e.quat);
      copyState(e, d.m);
    }
  }

  for (const [id, d] of [...drawn]) {
    if (seen.has(id)) continue;
    scene.remove(d.m);
    if (d.kind === "fx" && d.m.material) d.m.material.dispose();
    drawn.delete(id);
  }

  updatePlayerView();
  updateBeamView();
}

/** The player's ship: its model follows `state.player.pos` / `quat`. */
function updatePlayerView() {
  const P = state.player;
  if (!P || !P.pos) return;
  ensurePlayerView().update(P);
}

/** The mining beam: a cylinder from `beamStart` to `beamEnd` while it is on. */
function updateBeamView() {
  const F = state.flight;
  const on_ = !!(F.beamOn && F.beamStart && F.beamEnd);
  beamMesh.visible = on_;
  if (!on_) return;
  const delta = F.beamEnd.clone().sub(F.beamStart),
    len = delta.length();
  beamMesh.position.copy(F.beamStart).addScaledVector(delta, 0.5);
  beamMesh.scale.set(1, len, 1);
  beamMesh.quaternion.setFromUnitVectors(UP, delta.normalize());
}

/** How many enemy meshes exist (the tests check this number). */
export const enemyViewCount = () => enemies.size;

/** How many small-entity meshes exist (the tests check this number). */
export const entityViewCount = () => drawn.size;

/** The player's mesh, for a test to look at (null before the first frame). */
export const playerView = () => activePlayerView?.mesh || null;
