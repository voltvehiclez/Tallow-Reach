// Three.js setup: renderer, lights, starfield, and per-place scenery built from
// data/places.js features. Visual only; gameplay positions live in the sim/data.

import * as THREE from "three";
import { DEFAULT_PLACE, DEFAULT_SKY, placeDef, placeAt } from "../data/places.js";
import { VIEW } from "../data/camera.js";
import { mm, rockShapeAt, stationModel, planetModel } from "./models.js";
import { orientFace } from "./cubemap.js";
import { colliderFromObject } from "./collideModel.js";
import { registerPlaceCollider, clearPlaceColliders } from "../sim/colliders.js";
import { cosmeticRandom } from "../util/rng.js";

// The title screen and hangar draw the same models; re-exported so they keep importing from here.
export { stationModel, planetModel };
// Generated skyboxes (`tools/skybox/skybox.py`): their ids and colours are data, their six cube faces
// are imports (inlined as data URLs by the build, so the game stays one self-contained file).
// The owner's three panoramas (`src/assets/sky-*.webp`) are kept as history and are no longer drawn:
// every sky in the game is a generated cube map (owner 2026-11-15).
import { SKYBOXES } from "../data/skyboxes.js";
import { SKYBOX_URLS } from "./skyboxes.js";
import { buildSystemSkyLayer, systemLightFor } from "./systemsky.js";
const R = (a, b) => a + cosmeticRandom() * (b - a);

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(VIEW.base, innerWidth / innerHeight, 0.5, 40000);
scene.add(camera);

// Each place's scenery hangs off its own group, so moving between pockets is a
// visibility toggle and no geometry has to be rebuilt. Groups are made on first
// use from the place definition and start hidden unless active.
const placeGroups = new Map();
const scenerySpins = new Map(); // place id -> [{ object, rate }]
const sceneryMovers = new Map(); // place id -> [live collider] (turning parts)
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
  // The starfield is a per-place look, not a global: it shows only where the place's own sky asks
  // for one (`starfield: true`) — and only while the master switch is on. Everywhere else the sky
  // picture is the stars (owner 2026-11-15).
  const skyDef = placeAt(id).sky || DEFAULT_SKY;
  stars.visible = STARFIELD.enabled && skyDef.starfield === true;
  // The one scene light always comes from the central body of the system you are in (star, or
  // black hole — dimmer and orange-tinted). Instances are in no system: the old default stands.
  const light = systemLightFor(id);
  if (light) {
    sun.color.set(light.color);
    sun.intensity = light.intensity;
    sun.position.copy(light.direction).multiplyScalar(80);
  } else {
    sun.color.set(SUN_DEFAULT.color);
    sun.intensity = SUN_DEFAULT.intensity;
    sun.position.copy(SUN_DEFAULT.position);
  }
}

/** Rotate the active place's scenery (planet, station ring) and carry its sky with the camera. */
export function updateScenery(dt) {
  for (const spin of scenerySpins.get(activePlace) || []) spin.object.rotation.y += dt * spin.rate;
  // A turning part's collider is exact without ever being re-baked: the soup stays in the part's
  // own space and this hands the sim the part's live transform. Cheap — one decompose per moving
  // node per frame, not one per triangle.
  for (const mover of sceneryMovers.get(activePlace) || []) refreshMover(mover);
  const sky = scenerySkies.get(activePlace);
  if (sky) sky.position.copy(camera.position);
}

/** Re-read one live collider's placement from the part it belongs to. */
function refreshMover(collider) {
  const object = collider.mover.object;
  if (!object) return;
  object.updateWorldMatrix(true, false);
  object.matrixWorld.decompose(_mvPos, _mvQuat, _mvScale);
  const m = collider.mover;
  m.pos.x = _mvPos.x; m.pos.y = _mvPos.y; m.pos.z = _mvPos.z;
  m.quat.x = _mvQuat.x; m.quat.y = _mvQuat.y; m.quat.z = _mvQuat.z; m.quat.w = _mvQuat.w;
  m.scale.x = _mvScale.x; m.scale.y = _mvScale.y; m.scale.z = _mvScale.z;
}

const _mvPos = new THREE.Vector3();
const _mvQuat = new THREE.Quaternion();
const _mvScale = new THREE.Vector3();

function buildScenery(id, group) {
  const def = placeDef(id);
  const spins = [];
  const movers = [];
  for (const [index, f] of def.features.entries()) {
    let built = null;
    if (f.kind === "planet") built = planetModel(f);
    else if (f.kind === "station") built = stationModel(f);
    if (!built) continue;
    spins.push(...addModel(built, group));
    // Collision mirrors what is drawn (see docs/GLB_MODELS.md): the baked triangles are the
    // collider. `collide: false` in a feature opts a glow or decoration out. The feature
    // index keeps two same-kind features without ids from overwriting each other's collider.
    // Damage defaults to 1, like a rock: anything solid hurts at speed unless the feature says
    // otherwise (`collideDmg: 0` bounces without damage).
    if (f.collide !== false) {
      const col = colliderFromObject(built.object, { id: f.id || `${f.kind}#${index}`, damage: f.collideDmg ?? 1 });
      if (col) {
        // A still model registers itself; a model with turning parts registers one live mover per
        // turning node, each of which the sim re-reads through its `mover.transform` every frame.
        if (col.soup) registerPlaceCollider(id, col);
        for (const mover of col.movers || []) {
          registerPlaceCollider(id, mover);
          movers.push(mover);
        }
      }
    }
  }
  // Step 14: an instance declares its own sky on its place record, so it never looks like the space
  // outside it. `placeDef` is about features; the sky belongs to the place itself. An ordinary
  // pocket declares nothing and wears `DEFAULT_SKY` — normal space, a generated skybox with its own
  // stars in the picture (owner 2026-11-15). A kind nothing builds is dropped, never fatal.
  const skyDef = skyFor(placeAt(id).sky || DEFAULT_SKY);
  const sky = skyDef ? SKIES[skyDef.kind](skyDef) : null;
  if (sky) {
    group.add(sky.object);
    spins.push(...sky.spins);
    scenerySkies.set(id, sky.object);
    if (sky.dispose) skyDisposers.set(id, sky.dispose);
  }
  // The system sky layer (2026-11-16): the star/black hole and the sibling pockets hanging in
  // their true AU directions. Rides inside the sky group, so it follows the camera and can never
  // be reached; instances and unregistered places get nothing and keep their own sky.
  const layer = buildSystemSkyLayer(id);
  if (layer) {
    if (sky) {
      sky.object.add(layer.object);
      const disposeSky = sky.dispose;
      const disposeLayer = layer.dispose;
      skyDisposers.set(id, () => { if (disposeSky) disposeSky(); disposeLayer(); });
    } else {
      const holder = new THREE.Group();
      holder.add(layer.object);
      group.add(holder);
      scenerySkies.set(id, holder);
      skyDisposers.set(id, layer.dispose);
    }
  }
  scenerySpins.set(id, spins);
  sceneryMovers.set(id, movers);
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
  sceneryMovers.delete(id);
  scenerySkies.delete(id);
  const dispose = skyDisposers.get(id);
  skyDisposers.delete(id);
  clearPlaceColliders(id);
  if (dispose) dispose();
  return !!group;
}

/** How far out a sky shell sits: beyond the play area, inside the camera's far plane. */
const SKY_RADIUS = 15000;

/**
 * What a sky definition resolves to, or `null` when nothing should be drawn for it.
 *
 * A `cube` sky whose skybox is not installed (a typo, or a sky removed from the game) leaves its
 * pocket on plain black rather than throwing — a look, never a rule. Everything else passes through
 * untouched, so each builder still sees exactly the data its template declared.
 */
function skyFor(def) {
  if (!def || !SKIES[def.kind]) return null;
  if (def.kind === "cube" && !Object.prototype.hasOwnProperty.call(SKYBOX_URLS, def.skybox)) return null;
  return def;
}

/**
 * The skies a place can declare (`data/instances.js` `sky.kind`). One builder per kind, each
 * returning `{ object, spins, dispose }` exactly like a scenery model, so a sky hangs off its
 * place's own group and is shown and hidden with it. Visual only: every number here is a look,
 * never a rule.
 *
 *   cube   a generated cube map (`sky.skybox` is an id in `data/skyboxes.js`, made with
 *          `tools/skybox/skybox.py`; recipe 24): six 90-degree faces drawn on the inside of a box,
 *          plus `shards` broken rocks drifting in front of them. Every sky in the game is one of
 *          these, including normal space (`DEFAULT_SKY`, `data/places.js`).
 *
 * Why a box and not a sphere wearing a panorama: a cube map gives every direction the same texel
 * density and has no poles, so nothing is stretched or pinched — on a 4K screen the old 4096x2048
 * panorama was spread thin exactly where the camera looks most, and that was the blur and the
 * distortion the owner saw (owner, 2026-11-15). One sky, one look, six files.
 */
export const SKIES = {
  /**
   * The somewhere a pocket is: a generated cube map seen from the inside, with shattered rock
   * drifting in it (owner 2026-11-14: "shattered asteroids in the background skybox").
   *
   * The six faces go on the box's own six faces, one picture each, in the order
   * `BoxGeometry` groups them — which is `[px, nx, py, ny, pz, nz]`, the order `render/skyboxes.js`
   * lists them in. That order is the OpenGL cube convention, and both `tools/skybox/skybox.py`'s
   * `face_dirs` and `BoxGeometry`'s UVs follow it, so the pictures land the right way up with no
   * rotation and no mirroring anywhere (`npm test` checks the two against each other). A single
   * `CubeTexture` would need `envMap` and a shader hook in this three.js version; six plain
   * textures on six faces is the same picture with nothing to go wrong.
   *
   * `BackSide` means we stand inside the box; unlit and depth-write-free, so it is only ever a
   * picture behind everything else. No mipmaps and one linear filter, exactly as the panoramas
   * were: nothing here is a thing the owner did not see approved.
   */
  cube(sky) {
    const urls = Object.prototype.hasOwnProperty.call(SKYBOX_URLS, sky?.skybox) ? SKYBOX_URLS[sky.skybox] : null;
    const tint = Object.prototype.hasOwnProperty.call(SKYBOXES, sky?.skybox) ? SKYBOXES[sky.skybox].tint : undefined;
    const g = new THREE.Group();
    if (!urls) return { object: g, spins: [], dispose: () => {} };   // `skyFor` normally catches this

    // A data URL decodes off the main thread; the very first frames may render black before the
    // faces land. That is the whole failure mode, and it is per face.
    const textures = urls.map(url => {
      const t = new THREE.TextureLoader().load(url);
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;      // no mips and no trilinear: the sky never shimmers
      return t;
    });
    const shellGeo = new THREE.BoxGeometry(SKY_RADIUS * 2, SKY_RADIUS * 2, SKY_RADIUS * 2);
    // One material per face, in the box's own group order (px, nx, py, ny, pz, nz), each pointed
    // right way up by `orientFace` — BoxGeometry's top and bottom frames disagree with the cube
    // convention the files are painted in, and `tests/skybox.test.mjs` proves the table correct.
    const shellMats = textures.map((map, i) => new THREE.MeshBasicMaterial({
      map: orientFace(map, i),
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    }));
    const shell = new THREE.Mesh(shellGeo, shellMats);
    g.add(shell);

    const shards = Math.max(0, Math.floor(Number(sky.shards) || 0));
    // No spin: a sky that turns under a fixed star pattern reads as the ship drifting, and now every
    // star is fixed in a face — the place's own rock is what moves.
    const spins = [];
    // Lit cool, with a breath of the nebula's teal caught in the rock: near-black, never bright.
    const shardMat = mm(0x14161d, tint ?? 0x2f6f78);
    shardMat.emissiveIntensity = 0.12;   // the teal bleeds into the rock, no more than that
    for (let i = 0; i < shards; i++) {
      const shard = new THREE.Mesh(rockShapeAt(i), shardMat);
      // Spread through the whole shell, near and far: a handful close enough to be shapes with
      // edges, and the rest a long way off, small against the nebula.
      const d = R(1200, 9000),
        u = R(-1, 1),
        t = R(0, 6.283),
        s = Math.sqrt(Math.max(0, 1 - u * u));
      shard.position.set(s * Math.cos(t) * d, u * d, s * Math.sin(t) * d);
      shard.rotation.set(R(0, 6.283), R(0, 6.283), R(0, 6.283));
      shard.scale.setScalar(d < 3000 ? R(26, 90) : R(10, 40));
      g.add(shard);
      spins.push({ object: shard, rate: R(-0.05, 0.05) });
    }
    // A run's sky is built for that run alone, so it is freed with it: an instance comes and goes,
    // and nothing else in the game may end up wearing this sky's textures. The rock shapes are
    // shared with every field in the game, so they are not this sky's to dispose.
    const own = [shellGeo, ...shellMats, ...textures, shardMat];
    return { object: g, spins, dispose: () => own.forEach(r => r && r.dispose && r.dispose()) };
  },
};

/** Put a built model in a group and hand back its spin records. */
function addModel(model, group) {
  group.add(model.object);
  return model.spins;
}

scene.add(new THREE.HemisphereLight(0x5a6e80, 0x120e0c, 0.45));
const SUN_DEFAULT = { color: 0xffe2b8, intensity: 2.1, position: new THREE.Vector3(-1, 0.4, 0.6) };
const sun = new THREE.DirectionalLight(SUN_DEFAULT.color, SUN_DEFAULT.intensity);
sun.position.copy(SUN_DEFAULT.position);
scene.add(sun);
scene.add(sun.target);

// Starfield on a far sphere.
//
// OWNER 2026-11-15: "remove the existing starfield. This is because our previously generated
// skybox already has some stars baked in it. I might re-add star fields in the future but not
// now." So this is off by default: normal space wears a generated skybox that carries its own
// stars (`DEFAULT_SKY` in data/places.js), and a second set drawn here would double them up.
//
// Putting stars back is this one flag plus a pocket whose sky says `starfield: true` — the
// geometry, the material and the per-frame follow (`stars.position`) are all kept, so nothing
// else has to be rebuilt. `STARFIELD.enabled` is the master switch; `STARFIELD.count` is the
// number of points it makes.
export const STARFIELD = { enabled: false, count: 2500 };

export const stars = (() => {
  const p = [];
  const n = STARFIELD.enabled ? STARFIELD.count : 0;
  for (let i = 0; i < n; i++) {
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
  points.visible = STARFIELD.enabled;
  scene.add(points);
  return points;
})();
