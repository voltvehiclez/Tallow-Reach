// Three.js setup: renderer, lights, starfield, and per-place scenery built from
// data/places.js features. Visual only; gameplay positions live in the sim/data.

import * as THREE from "three";
import { DEFAULT_PLACE, placeDef } from "../data/places.js";
import { mm } from "./models.js";
import { cosmeticRandom } from "../util/rng.js";
const R = (a, b) => a + cosmeticRandom() * (b - a);

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.5, 40000);
scene.add(camera);

// Each place's scenery hangs off its own group, so moving between pockets is a
// visibility toggle and no geometry has to be rebuilt. Groups are made on first
// use from the place definition and start hidden unless active.
const placeGroups = new Map();
const scenerySpins = new Map(); // place id -> [{ object, rate }]
let activePlace = DEFAULT_PLACE;

export function placeGroup(id) {
  let g = placeGroups.get(id);
  if (!g) {
    g = new THREE.Group();
    g.visible = id === activePlace;
    placeGroups.set(id, g);
    scene.add(g);
    buildScenery(id, g);
  }
  return g;
}

export function showPlace(id) {
  activePlace = id;
  placeGroup(id);
  for (const [key, g] of placeGroups) g.visible = key === id;
}

/** Rotate the active place's scenery (planet, station ring). Visual only. */
export function updateScenery(dt) {
  for (const spin of scenerySpins.get(activePlace) || []) spin.object.rotation.y += dt * spin.rate;
}

function buildScenery(id, group) {
  const spins = [];
  for (const f of placeDef(id).features) {
    if (f.kind === "planet") spins.push(...buildPlanet(f, group));
    else if (f.kind === "station") spins.push(...buildStation(f, group));
  }
  scenerySpins.set(id, spins);
}

function buildPlanet(f, group) {
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(f.radius, 48, 32),
    new THREE.MeshStandardMaterial({ color: f.col, roughness: 1 })
  );
  planet.position.set(...f.pos);
  group.add(planet);
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(f.atmosphere, 48, 32),
    new THREE.MeshBasicMaterial({
      color: f.atmoCol, transparent: true, opacity: 0.18,
      side: THREE.BackSide, blending: THREE.AdditiveBlending,
    })
  );
  atmosphere.position.copy(planet.position);
  group.add(atmosphere);
  return [{ object: planet, rate: f.spin }];
}

function buildStation(f, group) {
  const stn = new THREE.Group();
  const spin = new THREE.Group();
  stn.add(spin);
  stn.position.set(...f.pos);
  group.add(stn);
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
  return [{ object: spin, rate: 0.1 }];
}

scene.add(new THREE.HemisphereLight(0x5a6e80, 0x120e0c, 0.45));
const sun = new THREE.DirectionalLight(0xffe2b8, 2.1);
sun.position.set(-1, 0.4, 0.6);
scene.add(sun);

// Starfield on a far sphere. It follows the camera so it never runs out.
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
