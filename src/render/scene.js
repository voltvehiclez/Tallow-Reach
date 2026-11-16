// Three.js setup: renderer, lights, starfield, and per-place scenery built from
// data/places.js features. Visual only; gameplay positions live in the sim/data.

import * as THREE from "three";
import { DEFAULT_PLACE, DEFAULT_SKY, placeDef, placeAt } from "../data/places.js";
import { mm, rockShapeAt, stationModel, planetModel } from "./models.js";
import { colliderFromObject } from "./collideModel.js";
import { registerPlaceCollider, clearPlaceColliders } from "../sim/colliders.js";
import { cosmeticRandom } from "../util/rng.js";

// The title screen and hangar draw the same models; re-exported so they keep importing from here.
export { stationModel, planetModel };
// The skies of somewhere else (slice 14): the owner's panoramas (2026-11-14), inlined as data
// URLs by the build, so the game stays one self-contained file.
import shroudSkyUrl from "../assets/sky-shroud.webp";
import riftSkyUrl from "../assets/sky-rift.webp";
import deepRiftSkyUrl from "../assets/sky-deeprift.webp";
// Generated skyboxes (`tools/skybox/skybox.py`): their ids and colours are data, their images are imports.
import { SKYBOXES } from "../data/skyboxes.js";
import { SKYBOX_URLS } from "./skyboxes.js";
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
  // The starfield is a per-place look, not a global: it shows only where the place's own sky asks
  // for one (`starfield: true`) — and only while the master switch is on. Everywhere else the sky
  // picture is the stars (owner 2026-11-15).
  const skyDef = placeAt(id).sky || DEFAULT_SKY;
  stars.visible = STARFIELD.enabled && skyDef.starfield === true;
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
  for (const [index, f] of def.features.entries()) {
    let built = null;
    if (f.kind === "planet") built = planetModel(f);
    else if (f.kind === "station") built = stationModel(f);
    if (!built) continue;
    spins.push(...addModel(built, group));
    // Collision mirrors what is drawn (see docs/GLB_MODELS.md): the baked triangles are the
    // collider. `collide: false` in a feature opts a glow or decoration out. The feature
    // index keeps two same-kind features without ids from overwriting each other's collider.
    if (f.collide !== false) {
      const col = colliderFromObject(built.object, { id: f.id || `${f.kind}#${index}`, damage: f.collideDmg ?? 0 });
      if (col) registerPlaceCollider(id, col);
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
  clearPlaceColliders(id);
  if (dispose) dispose();
  return !!group;
}

/** How far out a sky shell sits: beyond the play area, inside the camera's far plane. */
const SKY_RADIUS = 15000;

// The rift's two skies (slice 14a/14b), both the owner's panoramas (2026-11-14).
const SHATTERED_URLS = { rift: riftSkyUrl, deep: deepRiftSkyUrl };

/**
 * What a sky definition resolves to, or `null` when nothing should be drawn for it.
 *
 * Only `panorama` can say no: a generated skybox that is not installed (a typo, or a sky removed
 * from the game) leaves its pocket on plain black rather than throwing — a look, never a rule.
 * Everything else passes through untouched, so each builder still sees exactly the data its
 * template declared.
 */
function skyFor(def) {
  if (!def || !SKIES[def.kind]) return null;
  if (def.kind === "panorama" && !Object.prototype.hasOwnProperty.call(SKYBOX_URLS, def.skybox)) return null;
  return def;
}

/**
 * The skies a place can declare (`data/instances.js` `sky.kind`). One builder per kind, each
 * returning `{ object, spins }` exactly like a scenery model, so a sky hangs off its place's own
 * group and is shown and hidden with it. Visual only: every number here is a look, never a rule.
 *
 *   shattered  the owner's own panoramas (2026-11-14), shards drifting inside them — the
 *              somewhere a rift's run is: `variant` picks `rift` (teal maelstrom) or `deep`
 *              (near-black, one sable cluster). The place's own rock does the rest.
 *   shroud     real space (slice 14c): the owner's dark-grey nebula panorama with few stars —
 *              the somewhere inside a simple wormhole. No shards — the place's own formations
 *              are the scenery.
 *   panorama   a generated 4K skybox (`sky.skybox` is its id in `data/skyboxes.js`): `shattered`'s
 *              treatment with that skybox's image and nebula colour. How to make one: `tools/skybox/README.md`.
 */
export const SKIES = {
  /**
   * The somewhere a rift's run is: the owner's own two panoramas (2026-11-14), wrapped around the
   * inside of a sphere, seen from the back — the same equirect-on-sphere treatment as the
   * wormhole panorama, every star where the owner put it. One linear filter, no mips. `variant`
   * picks the deep rift's darker sky; anything else (or nothing) gets the ordinary rift sky — a
   * look, never a rule, so a typo costs a prettier sky and never the place. Debris drifts inside
   * it, turning slowly, in the same rock shapes the place's field uses.
   */
  shattered(sky, override) {
    const shards = Math.max(0, Math.floor(Number(sky.shards) || 0));
    const variant = typeof sky?.variant === "string" && Object.prototype.hasOwnProperty.call(SHATTERED_URLS, sky.variant)
      ? sky.variant
      : "rift";
    const g = new THREE.Group();

    // `override` is how `SKIES.panorama` reuses this builder with a generated skybox's image and tint.
    const texture = new THREE.TextureLoader().load(override?.url || SHATTERED_URLS[variant]);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    const shellGeo = new THREE.SphereGeometry(SKY_RADIUS, 64, 40);
    const shellMat = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    g.add(shell);

    // Shattered rock drifting inside it: the asteroids of a field that broke up with the pocket,
    // silhouetted against the nebula and each turning at its own slow rate. They are cold and nearly
    // unlit, so they read as shapes in the dark rather than as scenery — which is the point of them
    // (owner 2026-11-14: "shattered asteroids in the background skybox").
    const spins = [{ object: shell, rate: 0.0014 }];
    // Lit cool, with a breath of the nebula's teal caught in the rock: near-black, never bright.
    const shardMat = mm(0x14161d, override?.tint ?? 0x2f6f78);
    shardMat.emissiveIntensity = 0.12;   // the teal bleeds into the rock, no more than that
    for (let i = 0; i < shards; i++) {
      const shard = new THREE.Mesh(rockShapeAt(i), shardMat);
      // Spread through the whole shell, near and far: a handful close enough to be shapes with edges,
      // and the rest a long way off, small against the nebula.
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
    // and its sphere, its panorama and its shard material must not stay on the card after
    // it. The rock shapes are shared with every field in the game, so they are not this sky's to
    // free.
    const own = [shellGeo, shellMat, texture, shardMat];
    return { object: g, spins, dispose: () => own.forEach(r => r && r.dispose && r.dispose()) };
  },

  /**
   * A generated skybox (`tools/skybox/skybox.py`, listed in `data/skyboxes.js`, image in
   * `render/skyboxes.js`): `sky.skybox` is its id. Everything else is `shattered`'s own treatment —
   * the same sphere, the same unlit back-face wrap, `shards` of drifting rock — with the rock
   * catching a breath of the skybox's own nebula colour instead of the rift's teal. An id that is
   * not installed falls back to the ordinary rift sky: a look, never a rule, so a typo costs a
   * prettier sky and never the place (and `npm test` fails on the typo).
   */
  panorama(sky) {
    const url = Object.prototype.hasOwnProperty.call(SKYBOX_URLS, sky?.skybox) ? SKYBOX_URLS[sky.skybox] : null;
    const tint = Object.prototype.hasOwnProperty.call(SKYBOXES, sky?.skybox) ? SKYBOXES[sky.skybox].tint : undefined;
    return SKIES.shattered(sky, url ? { url, tint } : undefined);
  },

  /**
   * The somewhere inside a simple wormhole (slice 14c): the owner's dark-grey nebula panorama
   * with few stars (2026-11-14), wrapped around the inside of a sphere, seen from the back —
   * an equirectangular image is exactly what a sphere's UV unwrap is, so the panorama hangs
   * level all round with no painter in between and every star where the owner put it. One linear
   * filter, no mips: nothing sampled here is anything the owner did not paint. No shards: the
   * place's own asteroid formations are the scenery.
   */
  shroud() {
    const g = new THREE.Group();

    // A data URL decodes off the main thread; the very first frames may render black before the
    // panorama lands. That is the whole failure mode.
    const texture = new THREE.TextureLoader().load(shroudSkyUrl);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    const shellGeo = new THREE.SphereGeometry(SKY_RADIUS, 64, 40);
    const shellMat = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    g.add(shell);

    // The shell turns so slowly it barely reads as moving — like a place that is not in a hurry.
    const spins = [{ object: shell, rate: 0.0009 }];
    const own = [shellGeo, shellMat, texture];
    return { object: g, spins, dispose: () => own.forEach(r => r && r.dispose && r.dispose()) };
  },
};

/** Put a built model in a group and hand back its spin records. */
function addModel(model, group) {
  group.add(model.object);
  return model.spins;
}

scene.add(new THREE.HemisphereLight(0x5a6e80, 0x120e0c, 0.45));
const sun = new THREE.DirectionalLight(0xffe2b8, 2.1);
sun.position.set(-1, 0.4, 0.6);
scene.add(sun);

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
