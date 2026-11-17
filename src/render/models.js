// Mesh builders for ships, asteroids, stations and planets. Shared geometry is created once
// here so the sim can ask for a model by name. Every builder first checks for a .glb registered
// under its own key (see render/gltf.js); when there is one it is used instead of the built-in
// geometry, so an asset drop-in replaces — never duplicates — what is drawn.

import * as THREE from "three";
import { SHIPS } from "../data/ships.js";
import { atmosphereRadius } from "../data/scenery.js";
import { stationClass } from "../data/stations.js";
import { R } from "../util/math.js";
import { instantiateModel, modelTemplate, spinNodes, engNodes } from "./gltf.js";
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

// Use the model's full bounding diagonal: width, height and length all affect
// framing. Measuring before flight transforms avoids speed/thrust camera pumping.
export function modelFramingRatio(model, reference) {
  const size = object => new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()).length();
  const baseline = size(reference), measured = size(model);
  return baseline > 0 && measured > 0 ? measured / baseline : 1;
}

const framingCache = new Map();
/** Visual size relative to the actual Wasp model, including GLB import fitting.
 * Cache per template pair; an early fallback measurement cannot mask later preload.
 */
export function shipCameraScale(id) {
  if (id === "wasp") return 1; // the owner's gold-standard view never changes
  const source = modelTemplate(`ship.${id}`), wasp = modelTemplate("ship.wasp");
  const cached = framingCache.get(id);
  if (cached && cached.source === source && cached.wasp === wasp) return cached.scale;
  const scale = modelFramingRatio(buildPlayerShip(id), buildPlayerShip("wasp")) * (SHIPS[id]?.cameraPadding ?? 1);
  framingCache.set(id, { source, wasp, scale });
  return scale;
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
  const planetRecord = f.planet || null;
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
      new THREE.SphereGeometry(atmosphereRadius(f.radius, f.atmosphere), 48, 32),
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
    new THREE.MeshStandardMaterial({
      color: f.col,
      emissive: planetRecord?.emissive || 0x000000,
      emissiveIntensity: planetRecord?.classId === "volcanic" ? 0.48 : 0.04,
      roughness: 1,
    })
  );
  planet.position.set(...f.pos);
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(atmosphereRadius(f.radius, f.atmosphere), 48, 32),
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
 * The station itself: four built-in silhouettes selected by the place feature's
 * `style` (`commerce`, `industrial`, `military`, `mining`). A registered GLB wins:
 * `station.<style>.glb` first, then the shared `station.glb`, so a future asset
 * drop can replace one family without replacing all four.
 */
export function stationModel(f) {
  if (f.model === "original-meridian") return originalMeridianModel(f);
  const cls = stationClass(f.style || f.class || "commerce");
  const style = cls.style || "commerce";
  const gltf = instantiateModel(`station.${style}`) || instantiateModel("station");
  if (gltf) {
    gltf.position.set(...f.pos);
    return { object: gltf, spins: spinNodes(gltf).map(node => ({ object: node, rate: 0.1 })) };
  }

  const stn = new THREE.Group();
  stn.position.set(...f.pos);
  stn.userData.stationClass = style;
  const body = mm(cls.col);
  const accent = mm(cls.accent);
  const dark = mm(0x1c2228);
  const add = (geo, mat, x, y, z, parent = stn) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const addLight = (x, y, z, parent = stn) => add(new THREE.BoxGeometry(7, 3, 2), new THREE.MeshBasicMaterial({ color: cls.lights }), x, y, z, parent);

  if (style === "industrial") {
    // Vertical stack of foundry towers with radiator fins and a slow beacon mast.
    add(new THREE.CylinderGeometry(22, 28, 230, 12), body, 0, 8, 0);
    add(new THREE.CylinderGeometry(34, 34, 26, 12), accent, 0, -92, 0);
    add(new THREE.CylinderGeometry(29, 29, 24, 12), dark, 0, -28, 0);
    add(new THREE.CylinderGeometry(24, 24, 22, 12), accent, 0, 38, 0);
    add(new THREE.CylinderGeometry(17, 17, 26, 10), dark, 0, 102, 0);
    for (const y of [-62, -2, 68]) {
      for (let i = 0; i < 4; i++) {
        const fin = add(new THREE.BoxGeometry(74, 5, 12), body, 0, y, 0);
        fin.rotation.y = (i * Math.PI) / 4;
      }
    }
    const mast = new THREE.Group();
    mast.name = "spin";
    stn.add(mast);
    mast.position.set(0, 146, 0);
    add(new THREE.CylinderGeometry(4, 4, 62, 8), accent, 0, 0, 0, mast);
    add(new THREE.BoxGeometry(54, 3, 3), body, 0, 22, 0, mast);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      addLight(Math.cos(a) * 26, -80 + (i % 3) * 70, Math.sin(a) * 26);
    }
    return { object: stn, spins: [{ object: mast, rate: 0.18 }] };
  }

  if (style === "military") {
    // Octagonal citadel: heavy core, angular battlements and a red-lit sensor crown.
    add(new THREE.CylinderGeometry(31, 38, 132, 8), body, 0, 0, 0);
    add(new THREE.CylinderGeometry(44, 44, 15, 8), dark, 0, 62, 0);
    add(new THREE.CylinderGeometry(48, 48, 12, 8), accent, 0, -56, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const x = Math.cos(a) * 42, z = Math.sin(a) * 42;
      const wall = add(new THREE.BoxGeometry(22, 58, 10), dark, x, 2, z);
      wall.rotation.y = -a;
      const turret = add(new THREE.CylinderGeometry(6, 8, 16, 6), accent, x, 35, z);
      turret.rotation.y = -a;
    }
    const crown = new THREE.Group();
    crown.name = "spin";
    crown.position.set(0, 82, 0);
    stn.add(crown);
    add(new THREE.TorusGeometry(22, 3, 6, 16), accent, 0, 0, 0, crown).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(5, 5, 38, 8), dark, 0, 16, 0, crown);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      addLight(Math.cos(a) * 31, 72, Math.sin(a) * 31);
    }
    add(new THREE.BoxGeometry(70, 4, 32), dark, 0, -76, 0);
    return { object: stn, spins: [{ object: crown, rate: 0.08 }] };
  }

  if (style === "mining") {
    // A low, wide excavation platform with container stacks and a slow drill arm.
    add(new THREE.BoxGeometry(190, 18, 120), body, 0, -24, 0);
    add(new THREE.BoxGeometry(150, 26, 84), dark, 0, 4, 0);
    for (const x of [-70, -24, 22, 68]) {
      add(new THREE.CylinderGeometry(8, 12, 150, 8), accent, x, -105, 0);
    }
    const containers = [[-58, 30, -25, 0xb15d32], [-28, 31, 18, 0x4e6f78], [16, 30, -8, 0x7b6a42], [52, 31, 24, 0x5d5041]];
    for (const [x, y, z, color] of containers) add(new THREE.BoxGeometry(28, 20, 22), mm(color), x, y, z);
    const arm = new THREE.Group();
    arm.name = "spin";
    arm.position.set(104, 22, 0);
    stn.add(arm);
    const beam = add(new THREE.BoxGeometry(96, 9, 12), accent, 48, 0, 0, arm);
    beam.rotation.z = -0.18;
    add(new THREE.ConeGeometry(12, 28, 8), dark, 96, -8, 0, arm).rotation.z = Math.PI / 2;
    for (const x of [-78, -40, 2, 44, 78]) {
      addLight(x, 24, 60);
      addLight(x, 24, -60);
    }
    return { object: stn, spins: [{ object: arm, rate: 0.11 }] };
  }

  // Commerce: the classic spun docking ring, brighter and wider than the others.
  const spin = new THREE.Group();
  spin.name = "spin";
  stn.add(spin);
  const ring = add(new THREE.TorusGeometry(104, 8, 8, 52), body, 0, 0, 0, spin);
  ring.rotation.x = Math.PI / 2;
  const arms = new THREE.Group();
  arms.name = "spin";
  spin.add(arms);
  for (let i = 0; i < 6; i++) {
    const spoke = add(new THREE.BoxGeometry(208, 3, 3), accent, 0, 0, 0, arms);
    spoke.rotation.y = (i * Math.PI) / 6;
  }
  add(new THREE.CylinderGeometry(16, 16, 180, 12), body, 0, 0, 0, stn);
  add(new THREE.CylinderGeometry(26, 26, 18, 12), accent, 0, -82, 0, stn);
  add(new THREE.CylinderGeometry(11, 20, 90, 10), dark, 0, 135, 0, stn);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const light = add(new THREE.BoxGeometry(6, 3, 2), new THREE.MeshBasicMaterial({ color: cls.lights }), Math.cos(a) * 104, 9, Math.sin(a) * 104, spin);
    light.rotation.y = -a;
    light.name = "noclip.spin";
  }
  add(new THREE.BoxGeometry(66, 3, 34), dark, 0, -66, 0, stn);
  add(new THREE.BoxGeometry(9, 9, 48), accent, 0, 0, 31, stn);
  return { object: stn, spins: [{ object: spin, rate: 0.1 }] };
}

function originalMeridianModel(f) {
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
  // The arms are big moving parts, so they are solid like everything else (owner, 2026-11-15).
  // They hang in a node named for the `spin` convention so the collider knows they turn: its soup
  // is baked once in the arms' own frame and carried into the world by the live transform, so the
  // hitbox follows them round exactly and never needs re-baking. See docs/GLB_MODELS.md.
  const arms = new THREE.Group();
  arms.name = "spin";
  spin.add(arms);
  for (let i = 0; i < 4; i++) {
    const spoke = add(new THREE.BoxGeometry(180, 2.5, 2.5), 0, 0, 0, arms);
    spoke.rotation.y = (i * Math.PI) / 4;
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
