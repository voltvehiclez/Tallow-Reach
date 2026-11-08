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
/* Entity view registry                                                       */
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

/** A rock's faint glow by the ore inside it (the colours it always had). */
const rockGlow = type => (type === "cobalt" ? 0x14304a : type === "voidite" ? 0x3a1a55 : 0);

// Enemy IDs and other entity IDs come from separate counters, so a single map
// must namespace them. `group` also preserves the two existing frame updates.
const kinds = new Map();
const drawn = new Map(); // group:id -> { mesh, kind, group, handler }
const keyFor = (group, id) => `${group}:${id}`;

/**
 * Register a view kind. `list` returns its current world records; build returns
 * a mesh, update copies per-frame state, and remove releases owned resources.
 * Scene attachment/removal is managed centrally, not by the callbacks.
 */
export function registerEntityView(kind, { list, build, update, remove, group = "entity" }) {
  if (kinds.has(kind)) throw new Error(`View kind already registered: ${kind}`);
  if (typeof list !== "function" || typeof build !== "function" ||
      typeof update !== "function" || typeof remove !== "function" ||
      (group !== "entity" && group !== "enemy")) {
    throw new Error(`Invalid view registration: ${kind}`);
  }
  kinds.set(kind, { list, build, update, remove, group });
}

/** Set the initial pose before adding the mesh, just as the old builders did. */
function initialPose(e, m) {
  m.position.copy(e.pos);
  if (e.quat) m.quaternion.copy(e.quat);
  return m;
}
function updatePose(e, m) {
  m.position.copy(e.pos);
  if (e.quat) m.quaternion.copy(e.quat);
}
const noCleanup = () => {};

registerEntityView("enemy", {
  group: "enemy", list: () => state.world.enemies,
  build: e => { const def = enemyDef(e.def); return initialPose(e, mkShip(def.col, def.scale, true)); },
  update: updatePose, remove: noCleanup,
});
registerEntityView("bullet", {
  list: () => state.world.bullets,
  build: e => initialPose(e, new THREE.Mesh(bulletGeo, e.own ? playerBulletMat : enemyBulletMat)),
  update: updatePose, remove: noCleanup,
});
registerEntityView("missile", {
  list: () => state.world.missiles,
  build: e => initialPose(e, new THREE.Mesh(missileGeo, missileMat)),
  update: updatePose, remove: noCleanup,
});
registerEntityView("crate", {
  list: () => state.world.crates,
  build: e => initialPose(e, new THREE.Mesh(crateGeo, e.item === "core" ? crateCoreMat : crateSalvMat)),
  update: updatePose, remove: noCleanup,
});
registerEntityView("fx", {
  list: () => state.world.fx,
  build: e => {
    const m = initialPose(e, new THREE.Mesh(particleGeo, new THREE.MeshBasicMaterial({ color: e.col, transparent: true })));
    m.scale.setScalar(e.size || 1);
    return m;
  },
  update: (e, m) => { updatePose(e, m); m.material.opacity = Math.max(0, e.l / (e.t || 1)); },
  remove: m => { if (m.material) m.material.dispose(); },
});
registerEntityView("rock", {
  list: () => state.world.asteroids,
  build: e => {
    const m = initialPose(e, new THREE.Mesh(rockShapeAt(e.shape || 0), mm(0x4a4540, rockGlow(e.type))));
    m.scale.copy(e.scale);
    return m;
  },
  update: (e, m) => { updatePose(e, m); m.scale.copy(e.scale); },
  remove: noCleanup,
});

function addView(e, handler) {
  const key = keyFor(handler.group, e.id);
  if (drawn.has(key)) return drawn.get(key);
  const mesh = handler.build(e);
  if (!mesh) return null;
  scene.add(mesh);
  const view = { mesh, kind: e.kind, group: handler.group, handler };
  drawn.set(key, view);
  return view;
}
function removeView(key) {
  const view = drawn.get(key);
  if (!view) return;
  scene.remove(view.mesh);
  view.handler.remove(view.mesh);
  drawn.delete(key);
}
function spawnView(kind, id) {
  const handler = kinds.get(kind);
  if (!handler) return;
  const e = handler.list().find(x => x.id === id && x.kind === kind);
  if (e) addView(e, handler);
}

/** Reconcile every registered list in a group, including missed events. */
function updateGroup(group) {
  const seen = new Set();
  for (const [kind, handler] of kinds) {
    if (handler.group !== group) continue;
    for (const e of handler.list()) {
      if (e.kind !== kind) continue;
      const key = keyFor(group, e.id);
      seen.add(key);
      const view = drawn.get(key) || addView(e, handler);
      if (view) view.handler.update(e, view.mesh);
    }
  }
  for (const [key, view] of [...drawn]) {
    if (view.group === group && !seen.has(key)) {
      removeView(key);
    }
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
  on("enemy-spawned", ({ id }) => spawnView("enemy", id));
  on("enemy-removed", ({ id }) => removeView(keyFor("enemy", id)));
  on("entity-spawned", ({ id, kind }) => spawnView(kind, id));
  on("entity-removed", ({ id }) => removeView(keyFor("entity", id)));
}

/** Reconcile hostiles at their existing point in the frame. */
export function updateEnemyViews() {
  updateGroup("enemy");
}

/** Reconcile other entities, then the player hull and mining beam. */
export function updateEntityViews() {
  updateGroup("entity");
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
export const enemyViewCount = () => [...drawn.values()].filter(view => view.group === "enemy").length;

/** How many small-entity meshes exist (the tests check this number). */
export const entityViewCount = () => [...drawn.values()].filter(view => view.group === "entity").length;

/** The player's mesh, for a test to look at (null before the first frame). */
export const playerView = () => activePlayerView?.mesh || null;
