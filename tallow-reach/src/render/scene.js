// Three.js setup: renderer, lights, starfield, the planet and the outpost.
// Visual only. Gameplay positions live in sim/ and are read here.

import * as THREE from "three";
import { V } from "../util/math.js";
import { DEFAULT_SECTOR } from "../data/sectors.js";
import { mm } from "./models.js";
import { cosmeticRandom } from "../util/rng.js";
const R = (a, b) => a + cosmeticRandom() * (b - a);

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.5, 40000);
scene.add(camera);

// Each sector's scenery hangs off its own group, so moving between sectors is a
// visibility toggle and no geometry has to be rebuilt. Groups are made on first
// use and start hidden unless they are the sector you are in.
const sectorGroups = new Map();
let activeSector = DEFAULT_SECTOR;

/** The scene group holding everything that belongs to sector `id`. */
export function sectorGroup(id) {
  let g = sectorGroups.get(id);
  if (!g) {
    g = new THREE.Group();
    g.visible = id === activeSector;
    sectorGroups.set(id, g);
    scene.add(g);
  }
  return g;
}

/** Show sector `id` and hide every other sector. */
export function showSector(id) {
  activeSector = id;
  sectorGroup(id);
  for (const [key, g] of sectorGroups) g.visible = key === id;
}


scene.add(new THREE.HemisphereLight(0x5a6e80, 0x120e0c, 0.45));
const sun = new THREE.DirectionalLight(0xffe2b8, 2.1);
sun.position.set(-1, 0.4, 0.6);
scene.add(sun);

// Starfield on a far sphere. It follows the camera so it never runs out.
// The stars are the backdrop of every sector, so they are not hidden on a warp.
export const stars = (() => {
  const p = [];
  for (let i = 0; i < 2500; i++) {
    const u = R(-1, 1),
      t = R(0, 6.283),
      s = Math.sqrt(1 - u * u);
    p.push(s * Math.cos(t) * 12000, u * 12000, s * Math.sin(t) * 12000);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  const points = new THREE.Points(
    g,
    new THREE.PointsMaterial({ color: 0x9aa6b2, size: 1.6, sizeAttenuation: false })
  );
  scene.add(points);
  return points;
})();

export const planet = new THREE.Mesh(
  new THREE.SphereGeometry(2800, 48, 32),
  new THREE.MeshStandardMaterial({ color: 0x2c3b45, roughness: 1 })
);
planet.position.set(-7000, -1500, -10000);
sectorGroup(DEFAULT_SECTOR).add(planet);

const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(2950, 48, 32),
  new THREE.MeshBasicMaterial({
    color: 0x4f7f95,
    transparent: true,
    opacity: 0.18,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
  })
);
atmosphere.position.copy(planet.position);
sectorGroup(DEFAULT_SECTOR).add(atmosphere);

// Meridian Outpost. `stn` stays put; `spin` (the ring) rotates.
export const stn = new THREE.Group();
export const spin = new THREE.Group();
stn.add(spin);
sectorGroup(DEFAULT_SECTOR).add(stn);
{
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
    spin.add(light);
  }
  add(new THREE.BoxGeometry(60, 2, 30), 0, -60, 0, stn);
  add(new THREE.BoxGeometry(8, 8, 40), 0, 0, 26, stn);
}

// Meridian Outpost is at the origin, and `stn` above is already placed there.
// Where that is, as a number the rules can use, is `STATION_POS` in
// `sim/world.js` (step 7a): the sim needs it and must not import this file.
