// Mesh builders for ships, asteroids, stations and planets. Shared geometry is created once
// here so the sim can ask for a model by name. Every builder first checks for a .glb registered
// under its own key (see render/gltf.js); when there is one it is used instead of the built-in
// geometry, so an asset drop-in replaces — never duplicates — what is drawn.

import * as THREE from "three";
import { SHIPS } from "../data/ships.js";
import { R } from "../util/math.js";
import { instantiateModel, spinNodes, engNodes } from "./gltf.js";
import { builtInRockPositions } from "../sim/colliders.js";

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
  g.eng = [-1, 1].map(s => {
    const o = add(
      new THREE.BoxGeometry(0.9, 0.9, 0.6),
      new THREE.MeshBasicMaterial({ color: foe ? 0xff5a3c : 0x9fd4e8 }),
      s * 1.1, 0, 4.2
    );
    o.userData.engZ0 = o.scale.z;   // see engNodes in render/gltf.js
    return o;
  });
  add(
    new THREE.BoxGeometry(1.2, 0.5, 1.6),
    new THREE.MeshBasicMaterial({ color: foe ? 0xff3b2a : 0xe0a458 }),
    0, 0.8, -1
  );
  g.scale.setScalar(scale);
  return g;
}

/** Optional import correction, isolated from flight scale and the source template.
 * Centre after rotation/scaling so exporter origins never offset the flying hull.
 */
export function fitShipModel(model, data) {
  const root = new THREE.Group();
  root.add(model);
  if (data?.modelYaw) model.rotateY(data.modelYaw);
  if (data?.modelLength) {
    let bounds = new THREE.Box3().setFromObject(model);
    const length = bounds.getSize(new THREE.Vector3()).z;
    if (length > 0) model.scale.multiplyScalar(data.modelLength / length);
    bounds = new THREE.Box3().setFromObject(model);
    model.position.sub(bounds.getCenter(new THREE.Vector3()));
  }
  root.scale.setScalar(data?.sc ?? 1);
  root.eng = engNodes(model);
  return root;
}

/** The player's ship, including the per-class add-ons — or its `ship.<id>.glb`, if one is registered. */
export function buildPlayerShip(id) {
  const d = SHIPS[id];
  const gltf = instantiateModel(`ship.${id}`);
  if (gltf) {
    return fitShipModel(gltf, d);
  }
  const g = mkShip(d.col, d.sc, false);
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

// Six lumpy rock shapes, built once and reused by every asteroid — the same positions the
// collision soup in sim/colliders.js uses, so the mesh and the hull are one lump.
const rockShapes = [...Array(6)].map((_, k) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(builtInRockPositions(k), 3));
  g.computeVertexNormals();   // non-indexed: flat lumps, like the old jittered icosahedron
  return g;
});

/** The shape with index `k` (0..5). Which one a rock uses is a roll the sim makes. */
export const rockShapeAt = k => rockShapes[Math.abs(Math.floor(k)) % rockShapes.length];
export const ROCK_SHAPES = rockShapes.length;

// The sim collides against the same triangles that are drawn: registered here once, so
// rocks collide with their lumpy outline — never a plain sphere.

/** A planet and its atmosphere shell, with the spin rate its feature asks for — or `planet.glb`. */
export function planetModel(f) {
  const gltf = instantiateModel("planet");
  if (gltf) {
    // Convention (see docs/GLB_MODELS.md): the planet .glb is authored as a UNIT sphere
    // (radius 1) and scaled to the feature's radius — the atmosphere shell stays procedural.
    gltf.position.set(...f.pos);
    gltf.scale.setScalar(f.radius || 1);
    const spins = spinNodes(gltf).map(node => ({ object: node, rate: f.spin || 0.002 }));
    const object = new THREE.Group();
    object.add(gltf);
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(f.atmosphere, 48, 32),
      new THREE.MeshBasicMaterial({
        color: f.atmoCol, transparent: true, opacity: 0.18,
        side: THREE.BackSide, blending: THREE.AdditiveBlending,
      })
    );
    atmosphere.name = "noclip.atmosphere";   // glow shell: no collision
    atmosphere.position.copy(gltf.position);
    object.add(atmosphere);
    return { object, spins };
  }
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(f.radius, 48, 32),
    new THREE.MeshStandardMaterial({ color: f.col, roughness: 1 })
  );
  planet.position.set(...f.pos);
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(f.atmosphere, 48, 32),
    new THREE.MeshBasicMaterial({
      color: f.atmoCol, transparent: true, opacity: 0.18,
      side: THREE.BackSide, blending: THREE.AdditiveBlending,
    })
  );
  atmosphere.name = "noclip.atmosphere";   // glow shell: no collision
  atmosphere.position.copy(planet.position);
  const object = new THREE.Group();
  object.add(planet, atmosphere);
  return { object, spins: [{ object: planet, rate: f.spin }] };
}

/**
 * The station itself: a spun ring, spokes, a hub and its lights — or `station.glb`.
 * Exported so the title screen can show the same station without a second copy of the geometry.
 */
export function stationModel(f) {
  const gltf = instantiateModel("station");
  if (gltf) {
    gltf.position.set(...f.pos);
    return { object: gltf, spins: spinNodes(gltf).map(node => ({ object: node, rate: 0.1 })) };
  }
  const stn = new THREE.Group();
  const spin = new THREE.Group();
  stn.add(spin);
  stn.position.set(...f.pos);
  const m = mm(0x4a545c);
  const add = (geo, x, y, z, parent) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    (parent || spin).add(o);
    return o;
  };
  const ring = add(new THREE.TorusGeometry(90, 7, 8, 48), 0, 0, 0);
  ring.rotation.x = Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const spoke = add(new THREE.BoxGeometry(180, 2.5, 2.5), 0, 0, 0);
    spoke.rotation.y = (i * Math.PI) / 4;
    spoke.name = "noclip.spin";   // the collider is baked once; see docs/GLB_MODELS.md
  }
  add(new THREE.CylinderGeometry(14, 14, 150, 12), 0, 0, 0, stn);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 6.283;
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(6, 3, 2),
      new THREE.MeshBasicMaterial({ color: 0xd9a45a })
    );
    light.position.set(Math.cos(a) * 90, 8, Math.sin(a) * 90);
    light.rotation.y = -a;
    light.name = "noclip.spin";   // the collider is baked once; see docs/GLB_MODELS.md
    spin.add(light);
  }
  add(new THREE.BoxGeometry(60, 2, 30), 0, -60, 0, stn);
  add(new THREE.BoxGeometry(8, 8, 40), 0, 0, 26, stn);
  return { object: stn, spins: [{ object: spin, rate: 0.1 }] };
}
