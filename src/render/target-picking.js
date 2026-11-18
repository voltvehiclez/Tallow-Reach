// Presentation-only picking. Return a plain lock reference, never a mesh, to the sim.
import { Raycaster } from 'three';

export const LOCK_VIEW_KINDS = Object.freeze({ enemy: 'e', rock: 'a', crate: 'c', rift: 'r', gate: 'g', cache: 'k' });
const ray = new Raycaster();

/** Tag the root so every solid child (including animated GLB parts) belongs to its target. */
export function tagLockView(root, target) {
  root.userData.lockTarget = target;
}

/** First visible target surface at the white centre dot. Decorations cannot steal a hit. */
export function pickLockSurface(root, camera) {
  const meshes = [], targets = new Map();
  function visit(node, inherited) {
    if (!node.visible) return;
    const target = node.userData?.lockTarget || inherited;
    if (target && node.isMesh) {
      meshes.push(node); targets.set(node, target);
    }
    for (const child of node.children || []) visit(child, target);
  }
  root.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  visit(root, null);
  ray.setFromCamera({ x: 0, y: 0 }, camera);
  ray.near = camera.near;
  ray.far = camera.far;
  for (const hit of ray.intersectObjects(meshes, false)) {
    const materials = hit.object.material;
    const material = Array.isArray(materials) ? materials[hit.face?.materialIndex || 0] : materials;
    // Faint auras, engine glows and transparent decoration are not the visible solid body.
    if (!material?.visible || (material.transparent && (material.opacity < 0.5 || !material.depthWrite))) continue;
    return targets.get(hit.object);
  }
  return null;
}
