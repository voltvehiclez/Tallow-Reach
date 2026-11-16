// Turn a built three.js model into triangle soup the sim can collide with, in one
// code path for procedural geometry and GLB templates alike. Called from the render
// layer after a model is positioned — the sim never sees a mesh, only Float32Arrays
// (see sim/colliders.js).
//
// **Everything is solid by default.** A big moving part (a station's arms, a turning ring) is NOT
// an opt-out: it becomes a live `mover` collider — its soup is baked once in its own space and the
// render layer refreshes where that space is each frame, so the hitbox turns with the part and is
// never stale. Baking a spinning part once in world space would be wrong within a second (the
// station's 180 m arms stray 144 m inside a minute), and baking many copies would be wrong between
// copies and cost triangles forever; a live transform is exact and free per frame.
//
// Node names, then, only mark what genuinely should not stop anything:
//   noclip      decoration — glow shells, auras, warning lights. Small or see-through things.
//
// A part that the render layer turns is a mover. Its node carries either name convention:
//   spin        turns about its own Y; the ancestor a model rolls/spins is what matters,
//               not the exact rate (the collider reads the transform, not the number).

import * as THREE from "three";
import { makeSoup } from "../sim/colliders.js";

const isNamed = (node, want) => {
  const name = String(node?.name || "").toLowerCase();
  return name === want || name.startsWith(`${want}-`) || name.startsWith(`${want}.`);
};

const isNoclipNode = node => isNamed(node, "noclip");

/** True for a node the render layer turns (convention: `spin`, `spin-*`; docs/GLB_MODELS.md). */
const isSpinNode = node => isNamed(node, "spin");

/** Push one mesh's triangles into `points`, through `matrix`. */
function emitMesh(mesh, matrix, points, v) {
  const geometry = mesh.geometry;
  const position = geometry?.getAttribute?.("position");
  if (!position) return;
  const index = geometry.getIndex();
  const emit = i => {
    v.fromBufferAttribute(position, i).applyMatrix4(matrix);
    points.push(v.x, v.y, v.z);
  };
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      emit(index.getX(i));
      emit(index.getX(i + 1));
      emit(index.getX(i + 2));
    }
  } else {
    for (let i = 0; i < position.count; i++) emit(i);
  }
}

/**
 * Read a node's live placement — the transform the sim needs to put a mover's soup in the world.
 * `scale` is a plain object, not a Vector3, because a mover outlives any one rebuild and the sim
 * must never hold a reference to something `three` might mutate behind its back.
 */
function placementOf(object) {
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  object.updateWorldMatrix(true, false);
  object.matrixWorld.decompose(pos, quat, scale);
  return {
    pos: { x: pos.x, y: pos.y, z: pos.z },
    quat: { x: quat.x, y: quat.y, z: quat.z, w: quat.w },
    scale: { x: scale.x, y: scale.y, z: scale.z },
    object,
  };
}

/**
 * Extract collision from `root` (which must already carry its final position/rotation/scale).
 *
 * Returns `{ id, soup, damage, mover }` for a solid still part, or `{ id, damage, movers: [...] }`
 * when the model has turning parts — one live mover per turning node, in that node's own space.
 * `null` when nothing solid was found.
 *
 * **Solid means it hurts.** `damage` defaults to `1`, the same factor a rock uses: fly into a station
 * ring above 25 m/s and it costs hull, exactly as a rock does (owner, 2026-11-15 — "everything that
 * is solid should apply collision damage unless otherwise specified"). A feature that should bounce
 * without hurting says so in data: `collideDmg: 0`.
 */
export function colliderFromObject(root, { id = "model", damage = 1 } = {}) {
  if (!root) return null;
  root.updateMatrixWorld(true);
  const points = [];
  const v = new THREE.Vector3();
  const movers = [];

  // Custom walk instead of traverse(): a `noclip` node's whole subtree is skipped, children
  // included, and a turning node is handed to the mover collection rather than baked.
  const walk = node => {
    if (isNoclipNode(node)) return;
    if (isSpinNode(node)) {
      const local = [];
      // Bake the turning subtree in the node's OWN space: every mesh composed from the node down.
      const bake = (child, matrix) => {
        if (isNoclipNode(child)) return;
        if (child.isMesh) emitMesh(child, matrix, local, v);
        for (const grand of child.children || []) {
          grand.updateMatrix();
          bake(grand, matrix.clone().multiply(grand.matrix));
        }
      };
      // The node's own matrix is deliberately NOT applied: the soup must live in the node's own
      // frame, because `mover` will carry it into the world with the node's live transform.
      const identity = new THREE.Matrix4();
      if (node.isMesh) emitMesh(node, identity, local, v);
      for (const child of node.children || []) bake(child, child.matrix.clone());
      if (local.length) {
        const soup = makeSoup(new Float32Array(local));
        soup.damage = damage;
        movers.push({ id: `${id}:${node.name || "spin"}`, soup, damage, mover: placementOf(node) });
      }
      return;
    }
    if (node.isMesh) emitMesh(node, node.matrixWorld, points, v);
    for (const child of node.children || []) walk(child);
  };
  walk(root);

  if (movers.length) {
    // Static parts go with the model's own record; the movers are registered alongside it.
    const still = points.length
      ? (() => { const soup = makeSoup(new Float32Array(points)); soup.damage = damage; return soup; })()
      : null;
    return { id, soup: still, damage, movers };
  }
  if (!points.length) return null;
  const soup = makeSoup(new Float32Array(points));
  soup.damage = damage;
  return { id, soup, damage, mover: null };
}
