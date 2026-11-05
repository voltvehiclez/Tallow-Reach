// Warp streaks: lines of light rushing past the ship while the drive runs.
// They hang off the camera, so they streak in whatever direction you are facing.
// Hidden (and skipped) whenever no warp is running, so flying costs nothing.
//
// The whole look follows state.warp.fx from sim/sectors.js, which rises 0 -> 1
// during the charge and falls back to 0 as the drive settles.

import * as THREE from "three";
import { R } from "../util/math.js";
import { camera } from "./scene.js";
import { state } from "../state/state.js";

const COUNT = 130;      // streaks in flight
const NEAR = 2;         // a streak is recycled once it reaches this z
const FAR = 320;        // how far ahead of the camera a streak starts
const INNER = 5;        // closest a streak comes to the ship's centre line
const OUTER = 95;       // furthest from the centre line

const streaks = [];
let lines = null,
  geo = null,
  positions = null;

/** Where a streak sits next time round: an angle and radius off the flight axis. */
function place(anyDepth) {
  const a = R(0, Math.PI * 2),
    r = R(INNER, OUTER);
  return {
    x: Math.cos(a) * r,
    y: Math.sin(a) * r,
    z: anyDepth ? R(-FAR, NEAR) : -FAR,
  };
}

export function setupWarpStreaks() {
  geo = new THREE.BufferGeometry();
  positions = new Float32Array(COUNT * 2 * 3);
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  lines = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({
      color: 0xcfe8ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    })
  );
  lines.frustumCulled = false;
  lines.visible = false;
  camera.add(lines);

  // Spread them out at first, so the tunnel is already full on the first frame.
  for (let i = 0; i < COUNT; i++) streaks.push(place(true));
}

/** Move the streaks and stretch them with the drive. Call every frame. */
export function updateWarpStreaks(dt) {
  if (!lines) return;
  const w = state.warp;
  if (!w) {
    if (lines.visible) lines.visible = false;
    return;
  }

  const fx = w.fx;
  lines.visible = true;
  lines.material.opacity = 0.55 * fx;
  const len = 3 + 26 * fx,           // how long each streak is
    speed = 90 + 900 * fx;           // and how fast it closes on the camera

  for (let i = 0; i < COUNT; i++) {
    const s = streaks[i];
    s.z += speed * dt;
    if (s.z > NEAR) Object.assign(s, place(false));

    const o = i * 6;
    positions[o] = s.x;
    positions[o + 1] = s.y;
    positions[o + 2] = s.z;
    positions[o + 3] = s.x;
    positions[o + 4] = s.y;
    positions[o + 5] = s.z + len;
  }
  geo.attributes.position.needsUpdate = true;
}
