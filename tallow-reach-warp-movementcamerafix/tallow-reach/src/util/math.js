import * as THREE from "three";
import { random } from "./rng.js";

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const UP = V(0, 1, 0);
export const R = (a, b) => a + random() * (b - a);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Human-readable distance: "850 m" or "2.4 km". */
export const fmtDist = d => (d > 1000 ? (d / 1000).toFixed(1) + " km" : Math.round(d) + " m");

/** Forward direction (-Z) of an object, as a new vector. */
export const fwd = o => V(0, 0, -1).applyQuaternion(o.quaternion);

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();

/** Turn `o` to face `target`. k >= 1 snaps, smaller values slerp by that fraction. */
export function face(o, target, k) {
  _m4.lookAt(o.position, target, UP);
  _q.setFromRotationMatrix(_m4);
  if (k >= 1) o.quaternion.copy(_q);
  else o.quaternion.slerp(_q, k);
}
