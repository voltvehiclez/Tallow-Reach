// Camera: docking orbit, chase view, free orbit (hold Alt) and screen shake.
// Input comes in through the event bus; the sim decides when free cam is allowed.

import { V, R, face, clamp } from "../util/math.js";
import { on } from "../util/events.js";
import { camera } from "./scene.js";

/** Slow orbit around the outpost while docked. */
export function dockedView(time) {
  const t = time * 0.06;
  camera.position.set(Math.cos(t) * 380, 90, Math.sin(t) * 380);
  camera.lookAt(0, 0, 0);
}

/**
 * Chase camera behind the ship, or the free orbit when it is active.
 * `P` is the player record; `fc` is state.freeCam; `shipScale` sets the zoom range.
 */
export function chaseView(dt, P, fc) {
  const tp = P.m.localToWorld(V(0, 2.6, 11));
  if (P.snap) {
    camera.position.copy(tp);
    camera.quaternion.copy(P.m.quaternion);
    P.snap = false;
  }
  if (fc.on) {
    const c = Math.cos(fc.pitch);
    const o = V(Math.sin(fc.yaw) * c, Math.sin(fc.pitch), Math.cos(fc.yaw) * c)
      .multiplyScalar(fc.dist)
      .applyQuaternion(P.m.quaternion)
      .add(P.m.position);
    camera.position.copy(o);
    face(camera, P.m.position, 1);
  } else {
    camera.position.lerp(tp, 1 - Math.exp(-10 * dt));
    camera.quaternion.slerp(P.m.quaternion, 1 - Math.exp(-5 * dt));
  }
  camera.fov += (70 + 4 * P.bs - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
}

/** Random offset for the current shake level. Null when there is no shake. */
export function shakeOffset(P, dt, shipScale) {
  P.shake *= Math.exp(-dt * 6);
  if (P.shake <= 0.01) return null;
  return V(R(-1, 1), R(-1, 1), R(-1, 1)).multiplyScalar(P.shake * 0.3 * shipScale);
}

/**
 * Wires free-cam controls to input events. `canStart` is asked before Alt
 * starts an orbit (not while docked or paused). `getScale` returns the
 * current ship's model scale, which sets the zoom range.
 */
export function installCameraControls(fc, { canStart, getScale }) {
  on("freecam", down => {
    if (down) {
      if (!fc.on && canStart()) {
        fc.on = true;
        fc.yaw = 0;
        fc.pitch = 0.25;
        fc.dist = 14 * getScale();
      }
    } else {
      fc.on = false;
    }
  });
  on("look", ({ dx, dy }) => {
    if (!fc.on) return;
    fc.yaw -= dx * 0.006;
    fc.pitch = clamp(fc.pitch + dy * 0.006, -1.45, 1.45);
  });
  on("wheel", deltaY => {
    if (!fc.on) return;
    const s = getScale();
    fc.dist = clamp(fc.dist * (1 + deltaY * 0.001), 6 * s, 45 * s);
  });
}
