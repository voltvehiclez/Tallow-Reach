// Mesh builders for ships and asteroids. Shared geometry is created once
// here so the sim can ask for a model by name.

import * as THREE from "three";
import { SHIPS } from "../data/ships.js";
import { R } from "../util/math.js";

export const mm = (color, emissive) =>
  new THREE.MeshStandardMaterial({
    color,
    metalness: 0.75,
    roughness: 0.5,
    emissive: emissive || 0,
    flatShading: true,
  });

/**
 * Basic fighter hull. `foe` tints it for pirates.
 * `g.eng` holds the two engine glows, scaled by thrust during flight.
 */
export function mkShip(color, scale, foe) {
  const g = new THREE.Group(),
    body = mm(color);
  const add = (geo, mat, x, y, z, rx) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    if (rx) o.rotation.x = rx;
    g.add(o);
    return o;
  };
  add(new THREE.BoxGeometry(2.6, 1.3, 8), body, 0, 0, 0);
  add(new THREE.ConeGeometry(1.2, 4.5, 6), body, 0, 0, -6.2, -Math.PI / 2);
  const wingMat = mm(foe ? 0x2b1816 : 0x3a434a);
  add(new THREE.BoxGeometry(10, 0.25, 3), wingMat, 0, -0.2, 1.5);
  add(new THREE.BoxGeometry(0.3, 2.2, 2.2), wingMat, -4.5, 0.9, 2);
  add(new THREE.BoxGeometry(0.3, 2.2, 2.2), wingMat, 4.5, 0.9, 2);
  g.eng = [-1, 1].map(s =>
    add(
      new THREE.BoxGeometry(0.9, 0.9, 0.6),
      new THREE.MeshBasicMaterial({ color: foe ? 0xff5a3c : 0x9fd4e8 }),
      s * 1.1, 0, 4.2
    )
  );
  add(
    new THREE.BoxGeometry(1.2, 0.5, 1.6),
    new THREE.MeshBasicMaterial({ color: foe ? 0xff3b2a : 0xe0a458 }),
    0, 0.8, -1
  );
  g.scale.setScalar(scale);
  return g;
}

/** The player's ship, including the per-class add-ons. */
export function buildPlayerShip(id) {
  const d = SHIPS[id],
    g = mkShip(d.col, d.sc, false);
  if (id === "prospector") {
    const drill = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.6, 2, 8), mm(0xb08a3c));
    drill.rotation.x = Math.PI / 2;
    drill.position.set(0, -1, -8);
    g.add(drill);
  }
  if (id === "bulwark") {
    [-1.5, 1.5].forEach(x => {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 2.4), mm(0x2a3036));
      plate.position.set(x, 1, -1);
      g.add(plate);
    });
  }
  return g;
}

// Six lumpy rock shapes, built once and reused by every asteroid.
const rockShapes = [...Array(6)].map((_, k) => {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const s =
      1 +
      0.28 * Math.sin(x * 5.1 + k) * Math.sin(y * 4.3 + k * 2) +
      0.2 * Math.sin(z * 6.2 + k);
    p.setXYZ(i, x * s, y * s, z * s);
  }
  g.computeVertexNormals();
  return g;
});

export const rockShape = () => rockShapes[Math.floor(R(0, 6))];
