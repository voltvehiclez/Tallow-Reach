// The asteroid field. Rocks carry ore and respawn after they are mined out.

import * as THREE from "three";
import { V, R } from "../util/math.js";
import { scene } from "../render/scene.js";
import { mm, rockShape } from "../render/models.js";
import { state } from "../state/state.js";
import { FIELD_CENTER } from "./world.js";

export const FIELD_COUNT = 70;
const FIELD_RADIUS = 700;   // horizontal spread
const FIELD_HEIGHT = 250;   // vertical spread

/** Spawn one rock somewhere in the field. Ore type depends on the roll. */
export function spawnAsteroid() {
  const r = R(18, 70),
    roll = Math.random(),
    type = roll < 0.62 ? "ferrite" : roll < 0.92 ? "cobalt" : "voidite";
  const glow = type === "cobalt" ? 0x14304a : type === "voidite" ? 0x3a1a55 : 0;

  const m = new THREE.Mesh(rockShape(), mm(0x4a4540, glow));

  // Rejection-sample a point inside the field's horizontal radius.
  let p;
  do {
    p = V(R(-FIELD_RADIUS, FIELD_RADIUS), R(-FIELD_HEIGHT, FIELD_HEIGHT), R(-FIELD_RADIUS, FIELD_RADIUS));
  } while (p.length() > FIELD_RADIUS);
  m.position.copy(FIELD_CENTER).add(p);

  m.scale.set(r * R(0.8, 1.2), r * R(0.8, 1.2), r * R(0.8, 1.2));
  m.rotation.set(R(0, 6), R(0, 6), R(0, 6));
  scene.add(m);

  state.world.asteroids.push({
    m,
    r,
    type,
    ore: r * 1.6,
    max: r * 1.6,
    s0: m.scale.clone(),   // original scale, so the rock shrinks as it is mined
  });
}

/** Fill the field at game start. */
export function populateField() {
  for (let i = 0; i < FIELD_COUNT; i++) spawnAsteroid();
}
