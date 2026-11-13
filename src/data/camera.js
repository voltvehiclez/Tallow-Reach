// Chase-camera trail. These are distances in world units from the ship to the
// camera, measured along the ship's back-to-front axis (the camera sits behind
// the ship on its +Z side).
//
// The camera used to trail further the faster you went, because it followed the
// ship with a fixed lag: at full boost it sat 43 units back, which read as the
// view running away. The trail is now a deliberate, bounded line in speed:
// idle, flat out and reversing all land on the distances below.

export const CAMERA = {
  base: 11,     // distance behind the ship when it is standing still
  fast: 17,     // at full forward speed (full throttle + boost)
  reverse: 10.5, // at maximum reverse thrust
};

/**
 * How far behind the ship the camera sits, in world units.
 * `vf` is the ship's speed along its own forward axis (negative when reversing),
 * `fwdTop` the fastest it can go forward (throttle 1 plus boost) and `revTop` the
 * fastest it can reverse. The trail is linear in speed between the three points
 * above, so a hull that accelerates less never reaches the full 17.
 */
export function cameraTrail(vf, fwdTop, revTop) {
  if (!(fwdTop > 0) || !(revTop > 0)) return CAMERA.base;
  const t = vf >= 0
    ? Math.min(1, vf / fwdTop)
    : -Math.min(1, -vf / revTop);
  return t >= 0
    ? CAMERA.base + (CAMERA.fast - CAMERA.base) * t
    : CAMERA.base - (CAMERA.base - CAMERA.reverse) * -t;
}
