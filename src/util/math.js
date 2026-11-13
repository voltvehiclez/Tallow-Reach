import * as THREE from "three";
import { random } from "./rng.js";

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const Q = () => new THREE.Quaternion();
/** A rotation in the order `rotate.set(x, y, z)` used to set it (maths, not a mesh). */
export const E = (x, y, z) => new THREE.Euler(x, y, z);
export const UP = V(0, 1, 0);
export const R = (a, b) => a + random() * (b - a);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Human-readable distance: "850 m" or "2.4 km". */
export const fmtDist = d => (d > 1000 ? (d / 1000).toFixed(1) + " km" : Math.round(d) + " m");

/** Forward direction (-Z) of a rotation, as a new vector. */
export const fwdQ = quat => V(0, 0, -1).applyQuaternion(quat);

/** Forward direction (-Z) of an object that has a `.quaternion` (a mesh). */
export const fwd = o => fwdQ(o.quaternion);

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();

/**
 * Turn the rotation `quat` so that something at `from` faces `target`.
 * k >= 1 snaps, smaller values slerp by that fraction.
 */
export function faceQ(quat, from, target, k) {
  _m4.lookAt(from, target, UP);
  _q.setFromRotationMatrix(_m4);
  if (k >= 1) quat.copy(_q);
  else quat.slerp(_q, k);
}

/**
 * Turn `o` (something with `.position` and `.quaternion`) to face `target`.
 * For a plain entity — which has `pos` and `quat` and is not a mesh — use faceQ.
 */
export function face(o, target, k) {
  faceQ(o.quaternion, o.position, target, k);
}
