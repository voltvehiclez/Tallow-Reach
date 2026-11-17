// The title screen's own 3D scene: a cinematic view of the home station turning
// slowly with its planet filling the background.
//
// It is deliberately NOT the game scene. The menu used to be whatever the camera
// last rendered — the pocket the pilot quit in — which meant the title screen
// changed depending on the last game and could show a ship, rocks or a raider
// floating in the panel's background. This scene holds nothing but the home
// pocket's station, its planet and a copy of the starfield, and the camera path
// (`menuPose` in data/camera.js) is the same every time.
//
// Only `main.js` drives it: `updateMenuView(dt)` then `menuView()`. It never
// reads the live world, so no save, place or ship can change what it shows.

import * as THREE from "three";
import { MENU_CAMERA, menuPose } from "../data/camera.js";
import { planetModel, stationModel, stars, STARFIELD, SKIES } from "./scene.js";
import { DEFAULT_PLACE, DEFAULT_SKY, placeDef } from "../data/places.js";
import { makePlanet } from "../data/planets.js";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(MENU_CAMERA.fov, innerWidth / innerHeight, 0.5, 40000);
scene.add(camera);

// The title is the normal-space sky, not a black void. The generated sky is built
// once for the authored home pocket so the backdrop matches where the pilot spawns.
const menuPlace = placeDef(DEFAULT_PLACE);
const menuSkyDef = menuPlace?.sky || DEFAULT_SKY;
const menuSky = menuSkyDef && SKIES[menuSkyDef.kind] ? SKIES[menuSkyDef.kind](menuSkyDef) : null;
if (menuSky) scene.add(menuSky.object);

// The same light rig as the game, so the station reads the same way there and here.
scene.add(new THREE.HemisphereLight(0x5a6e80, 0x120e0c, 0.45));
const sun = new THREE.DirectionalLight(0xffe2b8, 2.1);
sun.position.set(-1, 0.4, 0.6);
scene.add(sun);

// A copy of the open-world starfield can still ride along if the master switch is ever
// re-enabled; normally the generated sky is the title's only star source.
if (STARFIELD.enabled) scene.add(stars.clone());

const spins = [];
// The menu keeps its own procedural planet backdrop: the home pocket is pure space
// now (planets are warpable pockets), so the title builds a fixed class world here
// instead of reading one from place data.
const MENU_PLANET = makePlanet("menu-backdrop", "Meridian", "b", "meridian", 0x5eed);
const MENU_PLANET_DIST = 2500;
const MENU_PLANET_RADIUS = 760;
const menuPlanetPos = MENU_PLANET.approach.map(n => n * MENU_PLANET_DIST);
let planetDir = menuPlanetPos;
let t = 0;
let built = false;

/** Build the title immediately with available models (built-in fallback while
 * background imports load). Never hold the title screen behind ship decoding. */
function ensureBuilt() {
  if (built) return;
  built = true;
  for (const feature of placeDef(DEFAULT_PLACE).features) {
    if (feature.kind === "station") {
      const model = stationModel(feature);
      scene.add(model.object);
      spins.push(...model.spins);
    }
  }
  const backdrop = planetModel({
    pos: menuPlanetPos,
    radius: MENU_PLANET_RADIUS,
    atmosphere: MENU_PLANET_RADIUS * 1.18,
    spin: MENU_PLANET.spin,
    col: MENU_PLANET.col,
    atmoCol: MENU_PLANET.atmoCol,
    planet: MENU_PLANET,
  });
  scene.add(backdrop.object);
  spins.push(...backdrop.spins);
}

/** One frame of the title view: slow camera arc, and the station's own spin. */
export function updateMenuView(dt) {
  ensureBuilt();
  t += Math.max(0, dt);
  if (menuSky) menuSky.object.position.copy(camera.position);
  for (const spin of spins) spin.object.rotation.y += dt * spin.rate;
  const pose = menuPose(t, planetDir);
  camera.position.set(...pose.pos);
  camera.lookAt(...pose.look);
}

/** The scene and camera to render while the title screen is up. */
export const menuView = () => {
  ensureBuilt();
  return { scene, camera };
};

/**
 * Keep the framing right on resize. The title panel covers the right-hand side
 * of a wide screen, so the station is nudged left of centre to stay in the open
 * part of the picture; on a narrow screen the panel is the whole screen and the
 * shift is skipped.
 */
export function resizeMenuView() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h;
  const shift = w > 980 ? Math.min(180, Math.round(w * 0.12)) : 0;
  if (shift) camera.setViewOffset(w, h, shift, 0, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}

resizeMenuView();
