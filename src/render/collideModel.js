// Turn a built three.js model into triangle soup the sim can collide with, in one
// code path for procedural geometry and GLB templates alike. Called from the render
// layer after a model is positioned — the sim never sees a mesh, only Float32Arrays
// (see sim/colliders.js).
//
// Node names are the opt-outs:
//   noclip   the subtree contributes no triangles — glow shells, auras, pure decoration.

import * as THREE from "three";
import { makeSoup } from "../sim/colliders.js";

const isNoclipNode = node => {
  const name = String(node?.name || "").toLowerCase();
  return name === "noclip" || name.startsWith("noclip-") || name.startsWith("noclip.");
};

/**
 * Extract world-space triangles from `root` (which must already carry its final
 * position/rotation/scale). Returns { id, soup, damage } ready for
 * sim/colliders.js `registerPlaceCollider`, or null when the model is empty.
 */
export function colliderFromObject(root, { id = "model", damage = 0 } = {}) {
  if (!root) return null;
  root.updateMatrixWorld(true);
  const points = [];
  const v = new THREE.Vector3();
  // Custom walk instead of traverse(): a `noclip` node's whole subtree is skipped,
  // children included.
  const walk = node => {
    if (isNoclipNode(node)) return;
    if (node.isMesh) {
      const geometry = node.geometry;
      const position = geometry.getAttribute("position");
      if (position) {
        const matrix = node.matrixWorld;
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
    }
    for (const child of node.children || []) walk(child);
  };
  walk(root);
  if (!points.length) return null;
  const soup = makeSoup(new Float32Array(points));
  soup.damage = damage;
  return { id, soup, damage };
}
