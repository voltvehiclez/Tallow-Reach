// Views: one mesh per entity, built and kept in step by this file.
//
// Step 16 slice 8a ended the local-only rule for **other pilots**: every hull but yours is drawn
// from `state.players` on the host and from the host's snapshots on a guest (see "Other pilots"
// below). The mining beam follows the OWN local pilot on every screen — a visiting guest's
// beam rides the host's snapshot into its own `state.flight`.
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

import { tagLockView, LOCK_VIEW_KINDS } from "./target-picking.js";
import * as THREE from "three";
import { scene } from "./scene.js";
import { mkShip, mm, rockShapeAt } from "./models.js";
import { state, localPlayer } from "../state/state.js";
import { on } from "../util/events.js";
import { UP } from "../util/math.js";
import { enemyDef } from "../data/enemies.js";
import { rockColor } from "../data/items.js";
import { DEFAULT_SHIP, shipDef, shipTypeOf } from "../data/ships.js";
import { mountOffset } from "../data/mounts.js";
import { buildPlayerShip, ROCK_SHAPES } from "./models.js";
import { instantiateModel, modelTemplate, engNodes } from "./gltf.js";
import { colliderFromObject } from "./collideModel.js";
import { setRockSoup } from "../sim/colliders.js";
import { BULLET_COLOURS } from "../data/weapons.js";
import { hullFraction, shieldFraction } from "../sim/pilot-stats.js";

/* ------------------------------------------------------------------------- */
/* Entity view registry                                                       */
/* ------------------------------------------------------------------------- */

const bulletGeo = new THREE.BoxGeometry(0.3, 0.3, 5);
const playerBulletMat = new THREE.MeshBasicMaterial({ color: BULLET_COLOURS.cannon });
const enemyBulletMat = new THREE.MeshBasicMaterial({ color: BULLET_COLOURS.hostile });
const bulletMats = new Map();
/** Rounds are drawn in their weapon module's colour; a shot without one keeps the
 *  old rule (the pilot's white-hot orange, everyone else's red). */
function bulletMaterial(shot) {
  const colour = shot?.colour;
  if (colour == null) return shot?.own ? playerBulletMat : enemyBulletMat;
  let material = bulletMats.get(colour);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color: colour });
    bulletMats.set(colour, material);
  }
  return material;
}

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

// A simple wormhole (slice 14c): the grey dark sphere that hangs in a spawned pocket, a F-lockable
// anomaly with a greyish radiance around it — EVE-like, cooler and quieter than a rift. One look
// shared by the door in normal space and the Stable wormhole way out of a run (both carry
// `variant: "simple"`; the update picks the right breathing from that).
const wormholeCoreGeo = new THREE.SphereGeometry(0.5, 32, 22);
const wormholeCoreMat = new THREE.MeshStandardMaterial({
  color: 0x121419,
  emissive: 0x8f99ab,
  emissiveIntensity: 0.18,
  roughness: 0.5,
  metalness: 0.4,
});
const wormholeGlowGeo = new THREE.SphereGeometry(0.82, 28, 18);
const wormholeGlowMat = new THREE.MeshBasicMaterial({
  color: 0x7e8798,
  transparent: true,
  opacity: 0.35,
  blending: THREE.AdditiveBlending,
  side: THREE.BackSide,
  depthWrite: false,
});
const wormholeAuraGeo = new THREE.SphereGeometry(1.25, 30, 22);
const wormholeAuraMat = new THREE.MeshBasicMaterial({
  color: 0x99a2b4,
  transparent: true,
  opacity: 0.13,
  blending: THREE.AdditiveBlending,
  side: THREE.BackSide,
  depthWrite: false,
});
const wormholeFlareGeo = new THREE.SphereGeometry(1.7, 24, 16);
const wormholeFlareMat = new THREE.MeshBasicMaterial({
  color: 0x565e6e,
  transparent: true,
  opacity: 0.06,
  blending: THREE.AdditiveBlending,
  side: THREE.BackSide,
  depthWrite: false,
});

// The prize canister: a plain drum with two bands and a lamp that says whether it is still sealed.
const cacheBodyGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.35, 16, 1);
const cacheCapGeo = new THREE.CylinderGeometry(0.3, 0.44, 0.24, 16, 1);
const cacheBandGeo = new THREE.TorusGeometry(0.45, 0.05, 8, 20);
const cacheMat = mm(0x3a3129, 0x2a1c0c);
const cacheSealedMat = new THREE.MeshBasicMaterial({ color: 0xff3b1f });
const cacheOpenMat = new THREE.MeshBasicMaterial({ color: 0x8dffab });

// Enemy IDs and other entity IDs come from separate counters, so a single map
// must namespace them. `group` also preserves the two existing frame updates.
// A rock must collide with what is drawn. When `asteroid.glb` is registered, every rock
// wears the same GLB mesh (scale/rotation vary); its triangles replace the built-in shape
// soups the first time a rock is drawn. Module init is too early to rely on the GLB having
// loaded (it is usually still warming up), so the swap happens lazily, once.
let glbRockSoupDone = false;
function ensureGlbRockSoup() {
  if (glbRockSoupDone) return;
  const template = modelTemplate("asteroid");
  if (!template) return;
  const col = colliderFromObject(template, { id: "asteroid", damage: 1 });
  if (col) for (let k = 0; k < ROCK_SHAPES; k++) setRockSoup(k, col.soup);
  glbRockSoupDone = true;
}

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
  if (P && !state.away) capturePose(P);
  // Step 16 slice 8a: every other pilot is a record too, so its hull interpolates between ticks
  // exactly as the local one does (a visitor is flown by this host's own sim, not by a mesh).
  for (const other of state.players) if (other && other !== P) capturePose(other);
  for (const [, handler] of kinds) {
    for (const e of handler.list()) {
      // Network-mirrored entities (`_net`) are already smoothed per render frame by entityStream;
      // snapshotting them on a 60 Hz clock against 24 Hz data causes sawtooth jitter.
      if (e && !e._net) capturePose(e);
    }
  }
}

/** Snap the local player's previous pose after teleports (launch, warp, dock). */
export function snapRenderedPlayer() {
  const P = localPlayer();
  if (P && !state.away && (P.snap || P.docked)) capturePose(P);
}

/** Interpolated world position for `e` at fractional tick `alpha` (for HUD markers). */
export function interpolatedPos(e, alpha = frameAlpha, out = new THREE.Vector3()) {
  if (!e || !e.pos) return out;
  if (e._net) return out.copy(e.pos);
  const p = prevPoses.get(e);
  if (!p || alpha >= 1 || p.pos.distanceToSquared(e.pos) > TELEPORT_DIST_SQ) {
    return out.copy(e.pos);
  }
  return out.copy(p.pos).lerp(e.pos, alpha);
}

/** Velocity at the same render time as interpolatedPos (for ballistic instruments). */
export function interpolatedVelocity(e, alpha = frameAlpha, out = new THREE.Vector3()) {
  if (!e?.v) return out.set(0, 0, 0);
  if (e._net) return out.copy(e.v);
  const p = prevPoses.get(e);
  if (!p?.v || alpha >= 1 || p.pos.distanceToSquared(e.pos) > TELEPORT_DIST_SQ) return out.copy(e.v);
  return out.copy(p.v).lerp(e.v, alpha);
}

/** Interpolated pose for `P` at fractional tick `alpha` (shared by hull view and camera). */
export function renderPlayerPose(P = localPlayer(), alpha = frameAlpha) {
  if (!P || !P.pos) return P;
  if (state.away && P === localPlayer()) {
    _playerPose.pos.copy(P.pos);
    _playerPose.quat.copy(P.quat);
    if (P.v) _playerPose.v.copy(P.v);
    _playerPose.thr = P.thr || 0;
    _playerPose.bs = P.bs || 0;
    _playerPose.docked = !!P.docked;
    return _playerPose;
  }
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
  if (e._net) {
    m.position.copy(e.pos);
    if (e.quat) m.quaternion.copy(e.quat);
    return;
  }
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
  build: e => {
    const def = enemyDef(e.def);
    // `enemy.<defId>.glb` replaces the built-in pirate hull when registered; the def's
    // scale still applies, for parity with the built-in model.
    const gltf = instantiateModel(`enemy.${e.def}`);
    if (gltf) {
      gltf.scale.multiplyScalar(def.scale ?? 1);
      gltf.eng = engNodes(gltf);
      return initialPose(e, gltf);
    }
    return initialPose(e, mkShip(def.col, def.scale, def.foe !== false));
  },
  update: (e, m) => {
    updatePose(e, m);
    // A friendly story hull carries the Wasp's blue engine glow, and it grows
    // when the ship boosts.
    if (m.eng && enemyDef(e.def).friendly === true) {
      const def = enemyDef(e.def);
      const speed = e.v ? e.v.length() : 0;
      const glow = 0.5 + Math.min(1.8, speed / Math.max(1, def.spdFar)) * 1.2 + (e.boosting ? 2.4 : 0);
      for (const eng of m.eng) eng.scale.z = (eng.userData.engZ0 ?? 1) * glow;
    }
  }, remove: noCleanup,
});
registerEntityView("bullet", {
  list: () => state.world.bullets,
  build: e => {
    const gltf = instantiateModel("bullet");
    if (gltf) return initialPose(e, gltf);
    return initialPose(e, new THREE.Mesh(bulletGeo, bulletMaterial(e)));
  },
  update: updatePose, remove: noCleanup,
});
registerEntityView("missile", {
  list: () => state.world.missiles,
  build: e => {
    const gltf = instantiateModel("missile");
    return initialPose(e, gltf || new THREE.Mesh(missileGeo, missileMat));
  },
  update: updatePose, remove: noCleanup,
});
registerEntityView("crate", {
  list: () => state.world.crates,
  build: e => {
    // One `crate.glb` replaces the built-in crate (both ore kinds — the seam that marked
    // a core crate is baked into the model). The built-in look keeps them distinct.
    const gltf = instantiateModel("crate");
    if (gltf) return initialPose(e, gltf);
    return initialPose(e, new THREE.Mesh(crateGeo, e.item === "core" ? crateCoreMat : crateSalvMat));
  },
  update: updatePose, remove: noCleanup,
});
registerEntityView("fx", {
  list: () => state.world.fx,
  build: e => {
    const gltf = instantiateModel("fx");
    if (gltf) {
      // Every spark clones its materials so it can fade on its own clock.
      gltf.traverse(node => { if (node.isMesh && node.material) node.material = node.material.clone(); });
      gltf.scale.setScalar(e.size || 1);
      return initialPose(e, gltf);
    }
    const m = initialPose(e, new THREE.Mesh(particleGeo, new THREE.MeshBasicMaterial({ color: e.col, transparent: true })));
    m.scale.setScalar(e.size || 1);
    return m;
  },
  update: (e, m) => {
    updatePose(e, m);
    const opacity = Math.max(0, e.l / (e.t || 1));
    // A GLB's materials are cloned per particle so each can fade on its own clock.
    if (m.material) {
      m.material.transparent = true;   // cloned fx must fade; the built-in material is already set
      m.material.opacity = opacity;
    } else {
      m.traverse(node => { if (node.isMesh && node.material) { node.material.transparent = true; node.material.opacity = opacity; } });
    }
  },
  remove: m => {
    // A GLB's cloned materials are shared between the mesh's own remove path and the
    // test's disposal counter — dispose every material it finds, exactly once each.
    const done = new Set();
    const disposeMat = mat => { if (mat && !done.has(mat)) { done.add(mat); mat.dispose(); } };
    m.traverse(node => { if (node.isMesh) { disposeMat(node.material); } });
    disposeMat(m.material);
  },
});
registerEntityView("rock", {
  list: () => state.world.asteroids,
  build: e => {
    // One `asteroid.glb` replaces the six built-in rock shapes (per-ore surface colour is baked
    // into the model, or lost — see docs/GLB_MODELS.md).
    ensureGlbRockSoup();
    const gltf = instantiateModel("asteroid");
    if (gltf) {
      gltf.scale.copy(e.scale);
      return initialPose(e, gltf);
    }
    const m = initialPose(e, new THREE.Mesh(rockShapeAt(e.shape || 0), mm(rockColor(e.type))));
    m.scale.copy(e.scale);
    return m;
  },
  update: (e, m) => { updatePose(e, m); m.scale.copy(e.scale); },
  // The shape is shared, but every rock carries its own material (its ore's surface colour), so it
  // is freed with the rock — an instance's field comes and goes, and the card must not keep it.
  remove: m => { if (m.material) m.material.dispose(); },
});
/**
 * One anomaly: a dark core eye, its bright centre, a glowing aura and a wider flare — plus the dim
 * sealed shells, which are shown instead while the record says `locked`. The sim turns it
 * (`e.quat`); the shimmer is this file's own business and scales each view's shells by a phase taken
 * from the record's id, so two doors never pulse in step and nothing shared is animated.
 */
// A simple wormhole: one dark sphere with two shells of grey radiance around it. No eye, no
// sealed/unsealed state — a simple wormhole is never locked, so the view never has to guess why.
function buildSimpleWormhole(e) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(wormholeCoreGeo, wormholeCoreMat);
  const glow = new THREE.Mesh(wormholeGlowGeo, wormholeGlowMat);
  const aura = new THREE.Mesh(wormholeAuraGeo, wormholeAuraMat);
  const flare = new THREE.Mesh(wormholeFlareGeo, wormholeFlareMat);
  g.add(core, glow, aura, flare);
  g.userData = { core, glow, aura, flare, phase: ((Number(e.id) || 0) % 628) / 100, simple: true };
  g.scale.setScalar(Math.max(1, Number(e.r) || 30));
  return initialPose(e, g);
}

function updateSimpleWormhole(e, g) {
  updatePose(e, g);
  g.scale.setScalar(Math.max(1, Number(e.r) || 30));
  const u = g.userData,
    t = performance.now() * 0.001,
    // Two slow waves, like something breathing in its sleep — never a flicker.
    swell = Math.sin(t * 0.9 + u.phase) * 0.05 + Math.sin(t * 2.3 + u.phase * 1.7) * 0.025;
  u.core.rotation.y = t * 0.05 + u.phase;   // the sphere turns glacially, on the clock, not per frame
  u.glow.scale.setScalar(1 + swell * 0.9);
  u.aura.scale.setScalar(1 + swell * 1.6);
  u.flare.scale.setScalar(1 - swell * 1.1);
}

// The door hanging in a pocket and the way out of a run are one kind of object; the variant on the
// record decides which of the two looks it wears (a rift is the orange anomaly, a simple wormhole is
// the grey sphere). `render/` never reads the template — only the colour of the record, ever.
const buildDoor = e => {
  const key = e.variant === "simple" ? "wormhole" : "anomaly";
  const glb = instantiateModel(key);
  if (glb) {
    glb.userData = { door: "glb" };
    glb.scale.setScalar(Math.max(1, Number(e.r) || 30));
    return initialPose(e, glb);
  }
  return e.variant === "simple" ? buildSimpleWormhole(e) : buildAnomaly(e);
};
const updateDoor = (e, g) => {
  if (g.userData?.door === "glb") {
    updatePose(e, g);
    g.scale.setScalar(Math.max(1, Number(e.r) || 30));
    return;
  }
  if (e.variant === "simple") updateSimpleWormhole(e, g);
  else updateAnomaly(e, g);
};

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

// The door hanging in a pocket, and the way out of a run: one kind of object; the record's variant
// decides the look (the orange anomaly, or the grey simple wormhole).
registerEntityView("rift", { list: () => state.world.rifts, build: buildDoor, update: updateDoor, remove: noCleanup });
registerEntityView("gate", { list: () => state.world.gates, build: buildDoor, update: updateDoor, remove: noCleanup });

// The prize: a canister, visible and plainly locked from the moment the pilot arrives. Opening it is
// a deliberate R beside it, and an emptied one is dropped by the sim, so it is never drawn open and
// bare.
registerEntityView("cache", {
  list: () => state.world.caches,
  build: e => {
    const glb = instantiateModel("cache");
    if (glb) {
      // No lamps on a custom model — the sealed/unsealed state is the model's own business.
      glb.userData = { lampSealed: null, lampOpen: null };
      glb.scale.setScalar(Math.max(1, Number(e.r) || 9));
      return initialPose(e, glb);
    }
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
    if (g.userData.lampSealed) g.userData.lampSealed.visible = !!e.locked;
    if (g.userData.lampOpen) g.userData.lampOpen.visible = !e.locked;
  },
  remove: noCleanup,
});

function addView(e, handler) {
  const key = keyFor(handler.group, e.id);
  if (drawn.has(key)) return drawn.get(key);
  capturePose(e);
  const mesh = handler.build(e);
  if (!mesh) return null;
  const lockKind = LOCK_VIEW_KINDS[e.kind];
  if (lockKind) tagLockView(mesh, { k: lockKind, o: e });
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
    return mountOffset(this.hull, name, shipDef(this.hull)?.sc ?? 1, bay, barrel, count);
  }
  update(player) {
    const m = this.mesh;
    m.position.copy(player.pos);
    m.quaternion.copy(player.quat);
    m.visible = !player.docked;
    if (m.eng) for (const e of m.eng) e.scale.set(e.scale.x, e.scale.y, (e.userData.engZ0 ?? 1) * (0.5 + player.thr * 2 + player.bs * 2));
  }
  remove() { scene.remove(this.mesh); }
}

/* ------------------------------------------------------------------------- */
/* Other pilots (step 16, slice 8a): the hull of everybody else               */
/* ------------------------------------------------------------------------- */

// The owner's ask for slice 8 — *"one world, two ships visible"* — begins here: **a second hull on
// the glass**. It is drawn from two sources, and neither of them is sim state on the guest:
//
//   the host      `state.players` already holds every visiting pilot as a real record the host's
//                 own `sim/step.js` flies. No wire is involved at all: the same interpolation the
//                 local hull gets (`renderPlayerPose`) is used, so a visitor moves smoothly while
//                 the host watches. This is the half the owner most wanted to see.
//   a guest       a list of poses arrives from `render/shipstream.js` (the host's snapshots, drawn
//                 `SHIP_STREAM.delayMs` in the past and interpolated between two of them). They are
//                 read once a frame and copied onto meshes; nothing is written back, and there is
//                 no record, no copy and nothing to save.
//
// **Only pilots in the pocket being drawn.** A hull from another pocket would hang in this sky
// like a ghost, so `place` decides — and on the guest side that is what keeps the slice honest
// until 8c makes the guest's screen follow the host's pocket.
//
// **A docked pilot is not drawn.** The local hull hides while docked because the camera is on the
// station card and the ship is "inside"; the same rule holds for every other pilot (owner,
// 2026-11-26): a docked hull is inside the station and out of the sky. A dead pilot draws
// nothing.
const pilotViews = new Map(); // id -> { mesh, hull }

// **Every other pilot is a lock target, like anything else in the sky** (playtest 23).
//
// The owner's words: a visiting pilot "must be selectable (F / list), must show the player's name,
// and must show hull/shield stats like any other ship". Two things were missing for that, and both
// are the screen's job rather than the simulation's:
//
//   `state.otherPilots`  the list `sim/targeting.js` offers to F and the N-list rows are built
//                        from. A guest has no record for a friend — slice 8a forbids it — so the
//                        only place the friend exists is the pose this file drew. Publishing it
//                        keeps the arrow pointing one way: the renderer writes the mirror, the
//                        simulation and the HUD read it, and nothing is ever written back into a
//                        pilot. These are the numbers a marker is placed from, not sim state.
//   a lock reference     `tagLockView` on the hull mesh, so the reticle can pick a friend exactly
//                        as it picks a rock (`render/target-picking.js`).
//
// The reference is ONE object per pilot, updated in place every frame: F compares targets by
// identity, and a fresh object each frame would silently drop the lock on the next one.
const pilotRefs = new Map(); // id -> { k, id, name, ship, place, pos, quat, hull, shield, dead }

const clamp01 = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
};

function pilotRefFor(id) {
  let ref = pilotRefs.get(id);
  if (!ref) {
    ref = {
      k: "p",
      id,
      name: "",
      ship: "",
      place: "",
      pos: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      // **How fast that hull is going** (owner, playtest 25): the ballistic lead instrument draws
      // where to aim *ahead* of a locked target, and F can lock a pilot — so a pilot has to carry
      // the one number a lead is computed from, exactly as a hostile record does (`v`).
      v: new THREE.Vector3(),
      hull: 1,
      shield: 0,
      dead: false,
      docked: false,
    };
    // The lock the reticle picks, and the one `tagLockView` hands back: `{ k, o }`, `o` this ref.
    ref.lock = { k: "p", o: ref };
    pilotRefs.set(id, ref);
  }
  return ref;
}

function applyOtherPilotPose(mesh, pose) {
  mesh.position.copy(pose.pos);
  mesh.quaternion.copy(pose.quat);
  // The same engine glow the local hull gets, from the throttle and boost that travelled.
  if (mesh.eng) {
    const glow = 0.5 + Math.max(0, Number(pose.throttle) || 0) * 2 + (pose.boost ? 2.4 : 0);
    for (const eng of mesh.eng) eng.scale.set(eng.scale.x, eng.scale.y, (eng.userData.engZ0 ?? 1) * glow);
  }
}

/** One pose from a live record, interpolated exactly as the local hull is. */
function poseOfRecord(P, alpha, at) {
  const snapped = P.snap === true;
  const p = renderPlayerPose(P, alpha);
  const pose = {
    id: P.guestId || P.id || `pilot-${at}`,
    name: P.name || P.profile?.name || "",
    ship: P.ship,
    place: P.place || state.place,
    pos: _otherPose.pos.copy(p.pos),
    quat: _otherPose.quat.copy(p.quat),
    throttle: Number(p.thr) || 0,
    dead: P.dead === true,
    docked: P.docked === true,
    boost: P.boost === true,
    // The same two fractions the host puts on the wire (`sim/pilot-stats.js`), so the bar the
    // host draws for a friend and the bar the friend's own screen gets can never disagree.
    hull: hullFraction(P),
    shield: shieldFraction(P),
    // The velocity the lead instrument leads with, interpolated at the same render time as the
    // pose (the same numbers `sim/targeting.js` and the HUD read off any other record).
    velocity: interpolatedVelocity(P, alpha, _otherPose.vel),
  };
  // **A visitor's `snap` belongs to the screen that drew it** (owner, playtest 24).
  //
  // `snap` means "do not interpolate: this frame is a jump". On the local hull `chaseView` clears
  // it once it has snapped the camera to it — but nothing ever cleared it for *another* pilot, and
  // `launch()` sets it when a visitor's hull leaves the station. So from the moment a guest took
  // off, every frame of its hull took the un-interpolated branch and was placed at the last 60 Hz
  // tick while a 240 Hz camera moved every frame: a ~60 Hz sawtooth on the hull and on its name
  // tag, worse the faster the guest flew, and only visible while the host turned. This is the same
  // fault the 2026-11-08 fix removed from the local hull and from NPCs; the visitor was the one
  // record nobody cleared.
  //
  // Consuming it here (after the pose has been taken, so the jump frame is still drawn as a jump)
  // gives back the between-tick interpolation the rest of the sky already has.
  if (snapped) P.snap = false;
  return pose;
}
const _otherPose = {
  pos: new THREE.Vector3(),
  quat: new THREE.Quaternion(),
  vel: new THREE.Vector3(),
};

/**
 * Draw every other pilot once a frame: the host's own records, plus (on a guest) the poses its
 * ship stream interpolated. `remote` entries are `render/shipstream.js` samples.
 */
export function updateOtherPilotViews(alpha = frameAlpha, remote = []) {
  const local = localPlayer();
  const seen = new Set();
  const drawn = [];
  const draw = (id, ship, pose) => {
    // Another pilot's hull is drawn only where this screen is looking, and only while it exists
    // and is flying. A docked hull is inside its station (owner, 2026-11-26) — it is not in the sky.
    if (!id || pose.dead || pose.docked || pose.place !== state.place) return;
    const key = String(id);
    seen.add(key);
    let view = pilotViews.get(key);
    const hull = shipTypeOf(ship) || DEFAULT_SHIP;
    if (view && view.hull !== hull) {
      scene.remove(view.mesh);
      view = null;
    }
    if (!view) {
      const mesh = buildPlayerShip(hull);
      scene.add(mesh);
      view = { mesh, hull };
      pilotViews.set(key, view);
    }
    applyOtherPilotPose(view.mesh, pose);

    // The pickable, nameable copy of that pilot (see the note by `pilotRefs`). Its own name comes
    // off the wire (a guest) or off the record (the host); a pilot nobody named is still a pilot.
    const ref = pilotRefFor(key);
    ref.name = String(pose.name || "").trim() || "Pilot";
    ref.ship = hull;
    ref.place = pose.place || state.place;
    // From the pose, not from the mesh: the mesh is the renderer's, and on a headless screen its
    // `position` is a stub. The pose is the number the hull was placed from either way.
    ref.pos.copy(pose.pos);
    ref.quat.copy(pose.quat);
    ref.hull = clamp01(pose.hull, 1);
    ref.shield = clamp01(pose.shield, 0);
    ref.dead = pose.dead === true;
    ref.docked = pose.docked === true;
    // The host's own records hand over their interpolated velocity; a guest's poses carry the
    // host's (`SHIP_FIELDS.velocity`), already smoothed by `render/shipstream.js`. A record with
    // neither reads as still, which is honest: a docked or stationary hull has nothing to lead.
    if (pose.velocity) ref.v.copy(pose.velocity); else ref.v.set(0, 0, 0);
    tagLockView(view.mesh, ref.lock);
    drawn.push(ref);
  };
  // The host (or anybody) with a visiting record: drawn with no wire at all.
  for (const P of state.players) {
    if (!P || P === local || !P.pos) continue;
    draw(P.guestId || P.id, P.ship, poseOfRecord(P, alpha, state.players.indexOf(P)));
  }
  // A guest: what the host said, already interpolated by the stream.
  for (const pose of Array.isArray(remote) ? remote : []) draw(pose.id, pose.ship, pose);
  for (const [key, view] of [...pilotViews]) {
    if (seen.has(key)) continue;
    scene.remove(view.mesh);
    pilotViews.delete(key);
    pilotRefs.delete(key);            // a pilot that left is no longer a target
  }
  // The mirror the simulation and the HUD read. Replaced wholesale, exactly like the sky it
  // describes: a pilot that stopped being drawn stops being selectable in the same frame.
  state.otherPilots = drawn;
}

/** How many other-pilot hulls are drawn (the tests check this number). */
export const otherPilotViewCount = () => pilotViews.size;

let activePlayerView = null;
function ensurePlayerView() {
  const hull = shipTypeOf(state.profile.ship) || DEFAULT_SHIP;
  if (!activePlayerView || activePlayerView.hull !== hull) {
    if (activePlayerView) activePlayerView.remove();
    activePlayerView = new PlayerShipView(hull);
  }
  return activePlayerView;
}

/* ------------------------------------------------------------------------- */
/* The mining beam (step 7b)                                                  */
/* ------------------------------------------------------------------------- */

// `beam.glb` replaces the built-in cylinder (unit height along Y, origin at the centre —
// the same convention the cylinder uses, so the scaling below is unchanged). Built lazily:
// the .glb is not guaranteed loaded until after boot.
let beamMesh = null;
function ensureBeam() {
  if (beamMesh) return beamMesh;
  beamMesh = instantiateModel("beam") ||
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 1, 6),
      new THREE.MeshBasicMaterial({ color: 0xffb25a, transparent: true, opacity: 0.8 })
    );
  beamMesh.visible = false;
  scene.add(beamMesh);
  return beamMesh;
}

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

/**
 * Reconcile other entities, then every other pilot's hull, then the local hull and mining beam.
 * `remote` is a guest's interpolated ship poses (`render/shipstream.js`); a host passes nothing
 * and still draws its visitors, because they are records in `state.players`.
 */
export function updateEntityViews(alpha = 1, remote = []) {
  frameAlpha = alpha;
  updateGroup("entity");
  updateOtherPilotViews(alpha, remote);
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
  const beamMesh = ensureBeam();
  beamMesh.visible = on_;
  if (!on_) return;
  let start = F.beamStart;
  const P = localPlayer();
  if (frameAlpha < 1 && P && !P.docked) {
    const pose = renderPlayerPose(P, frameAlpha);
    const hull = state.profile.ship;
    _beamOrigin
      .copy(mountOffset(hull, "beam", shipDef(hull)?.sc ?? 1))
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
