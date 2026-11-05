// Explosions and exhaust puffs. These are cosmetic particles that fade out.

import * as THREE from "three";
import { V, R } from "../util/math.js";
import { nz } from "../core/audio.js";
import { scene } from "../render/scene.js";
import { state } from "../state/state.js";

const particleGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);

/** Burst of `count` particles from point `p`. Big bursts also make a rumble. */
export function boom(p, count, color) {
  if (count > 10) nz(1.2, 500, 0.5);
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(
      particleGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true })
    );
    m.position.copy(p);
    scene.add(m);
    state.world.fx.push({
      m,
      v: V(R(-1, 1), R(-1, 1), R(-1, 1)).normalize().multiplyScalar(R(10, 70)),
      l: 1,
    });
  }
}

/** Single slow particle, used for missile exhaust. */
export function puff(p, color, life) {
  const m = new THREE.Mesh(
    particleGeo,
    new THREE.MeshBasicMaterial({ color, transparent: true })
  );
  m.scale.setScalar(0.4);
  m.position.copy(p);
  scene.add(m);
  state.world.fx.push({ m, v: V(0, 0, 0), l: life || 0.6 });
}

export function updateEffects(dt) {
  const fx = state.world.fx;
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.m.position.addScaledVector(f.v, dt);
    f.l -= dt * 1.3;
    f.m.material.opacity = Math.max(0, f.l);
    if (f.l <= 0) {
      scene.remove(f.m);
      f.m.material.dispose();
      fx.splice(i, 1);
    }
  }
}
