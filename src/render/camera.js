// Camera: docking orbit, chase view, free orbit (hold Alt) and screen shake.
// Input comes in through the event bus; the sim decides when free cam is allowed.

import { V, face, clamp, fwdQ } from "../util/math.js";
import { on } from "../util/events.js";
import { state } from "../state/state.js";
import { cosmeticRandom } from "../util/rng.js";
const R = (a, b) => a + cosmeticRandom() * (b - a);
import { FLIGHT } from "../data/ships.js";
import { cameraTrail } from "../data/camera.js";
import { camera } from "./scene.js";

const _rel = V(0, 0, 0);
const _want = V(0, 0, 0);
const _prev = V(0, 0, 0);   // where the ship was last frame
const _delta = V(0, 0, 0);  // how far it moved since
let _havePrev = false;

/**
 * Distance behind the ship for the speed it is doing right now. Forward speed
 * lengthens the trail up to `CAMERA.fast`, reversing shortens it to
 * `CAMERA.reverse`; both limits follow the fitted thrusters, so every ship
 * reaches the same numbers at its own top speed.
 */
function trail(P) {
  const d = state.drive;
  return cameraTrail(P.v.dot(fwdQ(P.quat)), d.spd * 2, d.spd * FLIGHT.reverse);
}

/** Slow orbit around the outpost while docked. */
export function dockedView(time) {
  const t = time * 0.06;
  camera.position.set(Math.cos(t) * 380, 90, Math.sin(t) * 380);
  camera.lookAt(0, 0, 0);
}

/**
 * Chase camera behind the ship, or the free orbit when it is active.
 * `P` is the player record; `fc` is state.freeCam; `pose` is the interpolated
 * visual pose for the current display frame (defaults to `P`).
 */
export function chaseView(dt, P, fc, pose = P) {
  // Built from the ship's position and quaternion by hand, not with
  // localToWorld(): matrixWorld is only refreshed when the scene is drawn, so
  // reading it here gives last frame's transform.
  const tp = V(0, 2.6, trail(pose)).applyQuaternion(pose.quat).add(pose.pos);

  // The ship's own travel this frame. The camera is carried along by it, so the
  // easing below never sees the ship's speed; a jump (arriving in a new pocket)
  // is ignored, and the camera snaps there instead.
  if (!_havePrev || fc.on) {
    _prev.copy(pose.pos);
    _havePrev = true;
  }
  _delta.copy(pose.pos).sub(_prev);
  if (_delta.lengthSq() > 2500) _delta.set(0, 0, 0);
  _prev.copy(pose.pos);

  if (P.snap) {
    camera.position.copy(tp);
    camera.quaternion.copy(pose.quat);
    _delta.set(0, 0, 0);
    P.snap = false;
  }
  if (fc.on) {
    const c = Math.cos(fc.pitch);
    const o = V(Math.sin(fc.yaw) * c, Math.sin(fc.pitch), Math.cos(fc.yaw) * c)
      .multiplyScalar(fc.dist)
      .applyQuaternion(pose.quat)
      .add(pose.pos);
    camera.position.copy(o);
    face(camera, pose.pos, 1);
  } else {
    // Ride along with the ship's movement and smooth only the offset, so that
    // speed cannot push the camera back by itself: the trail above is the whole
    // of the speed effect, and nothing can exceed CAMERA.fast. Turning still
    // swings the view, because the offset is eased in world space.
    _rel.copy(camera.position).sub(pose.pos).add(_delta);
    _want.copy(tp).sub(pose.pos);
    _rel.lerp(_want, 1 - Math.exp(-10 * dt));
    camera.position.copy(pose.pos).add(_rel);
    camera.quaternion.slerp(pose.quat, 1 - Math.exp(-5 * dt));
  }
  // A warp widens the view; state.warp.fx runs 0 -> 1 -> 0. It must not turn or
  // roll the picture: nothing rotates when the drive engages.
  const warp = state.warp ? state.warp.fx : 0;
  camera.fov += (70 + 4 * pose.bs + 16 * warp - camera.fov) * Math.min(1, dt * 4);
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
