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

/**
 * The title screen's own camera: a slow cinematic arc around the home station
 * with its planet behind it. Nothing here reads the game state, so the menu
 * always looks the same no matter where the pilot left off, and `menuPose()` is
 * plain numbers so a test can check the framing without a renderer.
 *
 * Angles are radians and distances world units. The camera always sits on the
 * side of the station *away* from the planet (so the planet fills the
 * background), a little above the ring plane, and sways across that line slowly
 * enough to read as a drift rather than a turn.
 */
export const MENU_CAMERA = {
  distance: 520,        // from the station centre
  distanceDrift: 55,    // slow breathing of that distance
  driftSeconds: 210,    // one breathing cycle
  elevation: 0.14,      // radians above the ring plane
  elevationDrift: 0.05,
  sway: 0.30,           // radians of arc either side of the planet-facing line
  swaySeconds: 110,     // one slow pass — wide enough to breathe, narrow enough
                        // that the planet stays behind the station
  lookHeight: 8,        // aim just above the station centre
  fov: 52,
};

const norm3 = (x, y, z) => {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};

/**
 * Where the title camera sits at time `t` (seconds) and what it looks at.
 * `planetDir` is the direction from the station to the planet (any length).
 * Returns `{ pos: [x, y, z], look: [x, y, z], dist }`.
 */
export function menuPose(t, planetDir = [-0.568, -0.122, -0.812]) {
  const [px, py, pz] = norm3(...planetDir);
  const sway = Math.sin((t * 2 * Math.PI) / MENU_CAMERA.swaySeconds) * MENU_CAMERA.sway;
  // Base yaw points the camera at the station from the side opposite the planet.
  const yaw = Math.atan2(-px, -pz) + sway;
  const elevation = MENU_CAMERA.elevation +
    Math.sin((t * 2 * Math.PI) / MENU_CAMERA.driftSeconds + 1.1) * MENU_CAMERA.elevationDrift;
  const dist = MENU_CAMERA.distance +
    Math.sin((t * 2 * Math.PI) / MENU_CAMERA.driftSeconds) * MENU_CAMERA.distanceDrift;
  const flat = Math.cos(elevation) * dist;
  return {
    pos: [Math.sin(yaw) * flat, Math.sin(elevation) * dist, Math.cos(yaw) * flat],
    look: [0, MENU_CAMERA.lookHeight, 0],
    dist,
  };
}
