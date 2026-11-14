// STEP 16 LOCAL-ONLY: the player hull and beam view follow only the local player.
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
import { state, localPlayer } from "../state/state.js";
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

// Step 14: an anomaly — the rift door hanging in a pocket, and the way out of a run, which is drawn
// identically because it is the same kind of thing. Two parts, as the owner described it: a dark core
// "eye" (a near-black sphere with an ember rim and a bright centre) and an outer glowing aura with a
// wider, fainter flare. Both are unit-sized here and scaled by the record's own `r`, so how big one
// looks is data in `data/instances.js`, not a number in the drawing code.
//
// A **sealed** one (the way out while the objective stands, or a locked canister) is dim and red
// instead of bright. Which it is comes from the record's own `locked` flag, never guessed here.
const anomalyCoreGeo = new THREE.SphereGeometry(0.5, 32, 22);
const anomalyCoreMat = new THREE.MeshStandardMaterial({
  color: 0x0b0503,
  emissive: 0xff6a1a,
  emissiveIntensity: 0.5,
  roughness: 0.4,
  metalness: 0.2,
});
const anomalyEyeGeo = new THREE.SphereGeometry(0.2, 20, 14);
const anomalyEyeMat = new THREE.MeshBasicMaterial({ color: 0xffd9a8 });
const auraGeo = new THREE.SphereGeometry(1, 28, 20);
const auraMat = new THREE.MeshBasicMaterial({
  color: 0xff7a22,
  transparent: true,
  opacity: 0.17,
  blending: THREE.AdditiveBlending,
  side: THREE.BackSide,
  depthWrite: false,
});
const flareGeo = new THREE.SphereGeometry(1, 24, 16);
const flareMat = new THREE.MeshBasicMaterial({
  color: 0xff4d0d,
  transparent: true,
  opacity: 0.07,
  blending: THREE.AdditiveBlending,
  side: THREE.BackSide,
  depthWrite: false,
});
const sealedAuraMat = new THREE.MeshBasicMaterial({
  color: 0x6a1c0c,
  transparent: true,
  opacity: 0.2,
  blending: THREE.AdditiveBlending,
  side: THREE.BackSide,
  depthWrite: false,
});
const sealedCoreMat = new THREE.MeshStandardMaterial({
  color: 0x0a0405,
  emissive: 0x8a2a10,
  emissiveIntensity: 0.35,
  roughness: 0.6,
  metalness: 0.2,
});

// The prize canister: a plain drum with two bands and a lamp that says whether it is still sealed.
const cacheBodyGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.35, 16, 1);
const cacheCapGeo = new THREE.CylinderGeometry(0.3, 0.44, 0.24, 16, 1);
const cacheBandGeo = new THREE.TorusGeometry(0.45, 0.05, 8, 20);
const cacheMat = mm(0x3a3129, 0x2a1c0c);
const cacheSealedMat = new THREE.MeshBasicMaterial({ color: 0xff3b1f });
const cacheOpenMat = new THREE.MeshBasicMaterial({ color: 0x8dffab });

/** A rock's faint glow by the ore inside it (the colours it always had). */
const rockGlow = type => (type === "cobalt" ? 0x14304a : type === "voidite" ? 0x3a1a55 : 0);

// Enemy IDs and other entity IDs come from separate counters, so a single map
// must namespace them. `group` also preserves the two existing frame updates.
const kinds = new Map();
const drawn = new Map(); // group:id -> { mesh, kind, group, handler }
const keyFor = (group, id) => `${group}:${id}`;

// Previous-tick poses for smooth between-tick interpolation on high-refresh
// displays (120/144/240 Hz). Keyed in a WeakMap so sim records stay pure.
const prevPoses = new WeakMap();
const TELEPORT_DIST_SQ = 2500; // > 50 m in one 60 Hz tick = teleport, snap instead
let frameAlpha = 1;
const _interpPos = new THREE.Vector3();
const _interpQuat = new THREE.Quaternion();
const _beamOrigin = new THREE.Vector3();
const _playerPose = {
  pos: new THREE.Vector3(),
  quat: new THREE.Quaternion(),
  v: new THREE.Vector3(),
  thr: 0,
  bs: 0,
  docked: true,
};

function capturePose(e) {
  if (!e || !e.pos) return;
  let p = prevPoses.get(e);
  if (!p) {
    prevPoses.set(e, {
      pos: e.pos.clone(),
      quat: e.quat ? e.quat.clone() : null,
      v: e.v ? e.v.clone() : null,
      thr: e.thr || 0,
      bs: e.bs || 0,
    });
    return;
  }
  p.pos.copy(e.pos);
  if (e.quat) {
    if (p.quat) p.quat.copy(e.quat);
    else p.quat = e.quat.clone();
  }
  if (e.v) {
    if (p.v) p.v.copy(e.v);
    else p.v = e.v.clone();
  }
  p.thr = e.thr || 0;
  p.bs = e.bs || 0;
}

/** Snapshot active entity and player poses immediately before a 60 Hz sim tick. */
export function snapshotSimPoses() {
  const P = localPlayer();
  if (P) capturePose(P);
  for (const [, handler] of kinds) {
    for (const e of handler.list()) {
      if (e) capturePose(e);
    }
  }
}

/** Snap the local player's previous pose after teleports (launch, warp, dock). */
export function snapRenderedPlayer() {
  const P = localPlayer();
  if (P && (P.snap || P.docked)) capturePose(P);
}

/** Interpolated world position for `e` at fractional tick `alpha` (for HUD markers). */
export function interpolatedPos(e, alpha = frameAlpha, out = new THREE.Vector3()) {
  if (!e || !e.pos) return out;
  const p = prevPoses.get(e);
  if (!p || alpha >= 1 || p.pos.distanceToSquared(e.pos) > TELEPORT_DIST_SQ) {
    return out.copy(e.pos);
  }
  return out.copy(p.pos).lerp(e.pos, alpha);
}

/** Interpolated pose for `P` at fractional tick `alpha` (shared by hull view and camera). */
export function renderPlayerPose(P = localPlayer(), alpha = frameAlpha) {
  if (!P || !P.pos) return P;
  const p = prevPoses.get(P);
  if (
    !p ||
    P.snap ||
    P.docked ||
    alpha >= 1 ||
    p.pos.distanceToSquared(P.pos) > TELEPORT_DIST_SQ
  ) {
    if (P.snap) capturePose(P);
    _playerPose.pos.copy(P.pos);
    _playerPose.quat.copy(P.quat);
    if (P.v) _playerPose.v.copy(P.v);
    _playerPose.thr = P.thr || 0;
    _playerPose.bs = P.bs || 0;
    _playerPose.docked = !!P.docked;
    return _playerPose;
  }
  _playerPose.pos.copy(p.pos).lerp(P.pos, alpha);
  if (p.quat) _playerPose.quat.copy(p.quat).slerp(P.quat, alpha);
  else _playerPose.quat.copy(P.quat);
  if (p.v && P.v) _playerPose.v.copy(p.v).lerp(P.v, alpha);
  else if (P.v) _playerPose.v.copy(P.v);
  _playerPose.thr = p.thr + ((P.thr || 0) - p.thr) * alpha;
  _playerPose.bs = p.bs + ((P.bs || 0) - p.bs) * alpha;
  _playerPose.docked = !!P.docked;
  return _playerPose;
}

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
  const p = prevPoses.get(e);
  if (!p || frameAlpha >= 1 || p.pos.distanceToSquared(e.pos) > TELEPORT_DIST_SQ) {
    m.position.copy(e.pos);
    if (e.quat) m.quaternion.copy(e.quat);
    return;
  }
  _interpPos.copy(p.pos).lerp(e.pos, frameAlpha);
  m.position.copy(_interpPos);
  if (e.quat) {
    if (p.quat) {
      _interpQuat.copy(p.quat).slerp(e.quat, frameAlpha);
      m.quaternion.copy(_interpQuat);
    } else {
      m.quaternion.copy(e.quat);
    }
  }
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
  // The shape is shared, but every rock carries its own material (its ore's faint glow), so it is
  // freed with the rock — an instance's field comes and goes, and the card must not keep it.
  remove: m => { if (m.material) m.material.dispose(); },
});
/**
 * One anomaly: a dark core eye, its bright centre, a glowing aura and a wider flare — plus the dim
 * sealed shells, which are shown instead while the record says `locked`. The sim turns it
 * (`e.quat`); the shimmer is this file's own business and scales each view's shells by a phase taken
 * from the record's id, so two doors never pulse in step and nothing shared is animated.
 */
function buildAnomaly(e) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(anomalyCoreGeo, anomalyCoreMat);
  const sealedCore = new THREE.Mesh(anomalyCoreGeo, sealedCoreMat);
  const eye = new THREE.Mesh(anomalyEyeGeo, anomalyEyeMat);
  const aura = new THREE.Mesh(auraGeo, auraMat);
  const flare = new THREE.Mesh(flareGeo, flareMat);
  const sealed = new THREE.Mesh(auraGeo, sealedAuraMat);
  flare.scale.setScalar(1.5);
  sealed.scale.setScalar(1.05);
  g.add(core, sealedCore, eye, aura, flare, sealed);
  g.userData = { core, sealedCore, eye, aura, flare, sealed, phase: ((Number(e.id) || 0) % 628) / 100 };
  g.scale.setScalar(Math.max(1, Number(e.r) || 20));
  return initialPose(e, g);
}

function updateAnomaly(e, g) {
  updatePose(e, g);
  g.scale.setScalar(Math.max(1, Number(e.r) || 20));
  const u = g.userData,
    sealed = !!e.locked,
    t = performance.now() * 0.001,
    breathe = Math.sin(t * 1.7 + u.phase) * 0.05 + Math.sin(t * 4.3 + u.phase * 2) * 0.02;
  u.sealed.visible = sealed;
  u.sealedCore.visible = sealed;
  u.core.visible = !sealed;
  u.aura.visible = !sealed;
  u.flare.visible = !sealed;
  u.aura.scale.setScalar(0.95 + breathe);
  u.flare.scale.setScalar(1.5 - breathe);
  u.eye.scale.setScalar(sealed ? 0.45 : 0.9 + Math.sin(t * 3.1 + u.phase) * 0.12);
}

// The door hanging in a pocket, and the way out of a run: one look, because they are one thing.
registerEntityView("rift", { list: () => state.world.rifts, build: buildAnomaly, update: updateAnomaly, remove: noCleanup });
registerEntityView("gate", { list: () => state.world.gates, build: buildAnomaly, update: updateAnomaly, remove: noCleanup });

// The prize: a canister, visible and plainly locked from the moment the pilot arrives. Opening it is
// a deliberate R beside it, and an emptied one is dropped by the sim, so it is never drawn open and
// bare.
registerEntityView("cache", {
  list: () => state.world.caches,
  build: e => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(cacheBodyGeo, cacheMat);
    const top = new THREE.Mesh(cacheCapGeo, cacheMat);
    const bottom = new THREE.Mesh(cacheCapGeo, cacheMat);
    top.position.y = 0.78;
    bottom.position.y = -0.78;
    bottom.rotation.x = Math.PI;
    const bands = [0.34, -0.34].map(y => {
      const band = new THREE.Mesh(cacheBandGeo, cacheMat);
      band.rotation.x = Math.PI / 2;
      band.position.y = y;
      return band;
    });
    const lampSealed = new THREE.Mesh(anomalyEyeGeo, cacheSealedMat);
    const lampOpen = new THREE.Mesh(anomalyEyeGeo, cacheOpenMat);
    for (const lamp of [lampSealed, lampOpen]) {
      lamp.position.y = 0.98;
      lamp.scale.setScalar(0.4);
    }
    g.add(body, top, bottom, ...bands, lampSealed, lampOpen);
    g.userData = { lampSealed, lampOpen };
    g.scale.setScalar(Math.max(1, Number(e.r) || 9));
    return initialPose(e, g);
  },
  update: (e, g) => {
    updatePose(e, g);
    g.scale.setScalar(Math.max(1, Number(e.r) || 9));
    g.userData.lampSealed.visible = !!e.locked;
    g.userData.lampOpen.visible = !e.locked;
  },
  remove: noCleanup,
});

function addView(e, handler) {
  const key = keyFor(handler.group, e.id);
  if (drawn.has(key)) return drawn.get(key);
  capturePose(e);
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
  if (!e) return;
  addView(e, handler);
  // A shot is created after flight has advanced the ship, but the hull is
  // drawn between the previous and current tick. Start its first rendered
  // segment at the corresponding previous hull-local muzzle position; the
  // next snapshot resumes ordinary world-space projectile interpolation.
  // This affects presentation only, not the shot's position or velocity.
  const owner = e.kind === "bullet" && e.own && e.owner === localPlayer() ? e.owner : null;
  const previous = owner && prevPoses.get(owner);
  if (previous?.quat && !owner.snap && !owner.docked &&
      previous.pos.distanceToSquared(owner.pos) <= TELEPORT_DIST_SQ) {
    const shotPose = prevPoses.get(e);
    if (shotPose) {
      shotPose.pos.copy(e.pos).sub(owner.pos)
        .applyQuaternion(owner.quat.clone().invert())
        .applyQuaternion(previous.quat).add(previous.pos);
    }
  }
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
  on("launched", () => snapRenderedPlayer());
  on("place-entered", () => snapRenderedPlayer());
}

/** Reconcile hostiles at their existing point in the frame. */
export function updateEnemyViews(alpha = 1) {
  frameAlpha = alpha;
  updateGroup("enemy");
}

/** Reconcile other entities, then the player hull and mining beam. */
export function updateEntityViews(alpha = 1) {
  frameAlpha = alpha;
  updateGroup("entity");
  updatePlayerView();
  updateBeamView();
}

/** The player's ship: its model follows `state.player.pos` / `quat` (interpolated when `alpha < 1`). */
function updatePlayerView() {
  const P = localPlayer();
  if (!P || !P.pos) return;
  const pose = frameAlpha >= 1 ? P : renderPlayerPose(P, frameAlpha);
  ensurePlayerView().update(pose);
}

/** The mining beam: a cylinder from `beamStart` to `beamEnd` while it is on. */
function updateBeamView() {
  const F = state.flight;
  const on_ = !!(F.beamOn && F.beamStart && F.beamEnd);
  beamMesh.visible = on_;
  if (!on_) return;
  let start = F.beamStart;
  const P = localPlayer();
  if (frameAlpha < 1 && P && !P.docked) {
    const pose = renderPlayerPose(P, frameAlpha);
    const hull = state.profile.ship;
    _beamOrigin
      .copy(mountOffset(hull, "beam", SHIPS[hull].sc))
      .applyQuaternion(pose.quat)
      .add(pose.pos);
    start = _beamOrigin;
  }
  const delta = F.beamEnd.clone().sub(start),
    len = delta.length();
  beamMesh.position.copy(start).addScaledVector(delta, 0.5);
  beamMesh.scale.set(1, len, 1);
  beamMesh.quaternion.setFromUnitVectors(UP, delta.normalize());
}

/** How many enemy meshes exist (the tests check this number). */
export const enemyViewCount = () => [...drawn.values()].filter(view => view.group === "enemy").length;

/** How many small-entity meshes exist (the tests check this number). */
export const entityViewCount = () => [...drawn.values()].filter(view => view.group === "entity").length;

/** The player's mesh, for a test to look at (null before the first frame). */
export const playerView = () => activePlayerView?.mesh || null;
