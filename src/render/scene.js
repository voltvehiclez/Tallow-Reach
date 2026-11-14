// Three.js setup: renderer, lights, starfield, and per-place scenery built from
// data/places.js features. Visual only; gameplay positions live in the sim/data.

import * as THREE from "three";
import { DEFAULT_PLACE, placeDef, placeAt } from "../data/places.js";
import { mm, rockShapeAt } from "./models.js";
import { paintSky } from "./sky.js";
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
const scenerySkies = new Map(); // place id -> the sky group that follows the camera
const skyDisposers = new Map(); // place id -> free that sky's own geometry (an instance ends)
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
  // A place with a sky of its own is somewhere else: the ordinary starfield is not showing through it.
  stars.visible = !scenerySkies.has(id);
}

/** Rotate the active place's scenery (planet, station ring) and carry its sky with the camera. */
export function updateScenery(dt) {
  for (const spin of scenerySpins.get(activePlace) || []) spin.object.rotation.y += dt * spin.rate;
  const sky = scenerySkies.get(activePlace);
  if (sky) sky.position.copy(camera.position);
}

function buildScenery(id, group) {
  const def = placeDef(id);
  const spins = [];
  for (const f of def.features) {
    if (f.kind === "planet") spins.push(...addModel(planetModel(f), group));
    else if (f.kind === "station") spins.push(...addModel(stationModel(f), group));
  }
  // Step 14: an instance declares its own sky on its place record, so it never looks like the space
  // outside it. `placeDef` is about features; the sky belongs to the place itself.
  const skyDef = placeAt(id).sky;
  const sky = skyDef && SKIES[skyDef.kind] ? SKIES[skyDef.kind](skyDef) : null;
  if (sky) {
    group.add(sky.object);
    spins.push(...sky.spins);
    scenerySkies.set(id, sky.object);
    if (sky.dispose) skyDisposers.set(id, sky.dispose);
  }
  scenerySpins.set(id, spins);
}

/**
 * Forget a place's scenery for good — a destroyed instance, which is never coming back. Pockets are
 * permanent and are simply hidden, so this is only ever called for one (from `main.js`, on the
 * `instance-closed` event: nothing in `render/` is allowed to know when a run ends).
 */
export function forgetPlace(id) {
  const group = placeGroups.get(id);
  if (group) {
    scene.remove(group);
    placeGroups.delete(id);
  }
  scenerySpins.delete(id);
  scenerySkies.delete(id);
  const dispose = skyDisposers.get(id);
  skyDisposers.delete(id);
  if (dispose) dispose();
  return !!group;
}

/** How far out a sky shell sits: beyond the play area, inside the camera's far plane. */
const SKY_RADIUS = 15000;

/**
 * The skies a place can declare (`data/instances.js` `sky.kind`). One builder per kind, each
 * returning `{ object, spins }` exactly like a scenery model, so a sky hangs off its place's own
 * group and is shown and hidden with it. Visual only: every number here is a look, never a rule.
 *
 *   shattered  a collapsing shell of dark panels with glowing fractures running through them, and
 *              shards drifting slowly inside. Unstable, and nowhere near the space outside.
 */
export const SKIES = {
  /**
   * A broken pocket: space, but the space of somewhere that has collapsed. Painted, not built (see
   * `render/sky.js` for why), and wrapped around the inside of a sphere — unlit and seen from the
   * back, so the sphere's own facets never show and the picture is the whole of the sky. Debris
   * drifts inside it, turning slowly, in the same rock shapes the place's field uses.
   */
  shattered(sky) {
    const shards = Math.max(0, Math.floor(Number(sky.shards) || 0));
    const g = new THREE.Group();

    const canvas = document.createElement("canvas");
    paintSky(sky, canvas);
    const texture = new THREE.CanvasTexture(canvas);
    const shellGeo = new THREE.SphereGeometry(SKY_RADIUS, 64, 40);
    const shellMat = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    g.add(shell);

    // Shards drifting inside it, each turning at its own slow rate.
    const spins = [{ object: shell, rate: 0.0014 }];
    const shardMat = mm(0x241a16, Number(sky.col) || 0x120806);
    for (let i = 0; i < shards; i++) {
      const shard = new THREE.Mesh(rockShapeAt(i), shardMat);
      const d = R(1500, 6000),
        u = R(-1, 1),
        t = R(0, 6.283),
        s = Math.sqrt(Math.max(0, 1 - u * u));
      shard.position.set(s * Math.cos(t) * d, u * d, s * Math.sin(t) * d);
      shard.rotation.set(R(0, 6.283), R(0, 6.283), R(0, 6.283));
      shard.scale.setScalar(R(16, 64));
      g.add(shard);
      spins.push({ object: shard, rate: R(-0.05, 0.05) });
    }

    // A run's sky is built for that run alone, so it is freed with it: an instance comes and goes,
    // and its sphere, its painted picture and its shard material must not stay on the card after
    // it. The rock shapes are shared with every field in the game, so they are not this sky's to
    // free.
    const own = [shellGeo, shellMat, texture, shardMat];
    return { object: g, spins, dispose: () => own.forEach(r => r && r.dispose && r.dispose()) };
  },
};

/** Put a built model in a group and hand back its spin records. */
function addModel(model, group) {
  group.add(model.object);
  return model.spins;
}

/** A planet and its atmosphere shell, with the spin rate its feature asks for. */
export function planetModel(f) {
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
  atmosphere.position.copy(planet.position);
  const object = new THREE.Group();
  object.add(planet, atmosphere);
  return { object, spins: [{ object: planet, rate: f.spin }] };
}

/**
 * The station itself: a spun ring, spokes, a hub and its lights. Exported so the
 * title screen can show the same station without a second copy of the geometry.
 */
export function stationModel(f) {
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
  return { object: stn, spins: [{ object: spin, rate: 0.1 }] };
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
