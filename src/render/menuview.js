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
import { DEFAULT_PLACE, placeDef } from "../data/places.js";
import { MENU_CAMERA, menuPose } from "../data/camera.js";
import { planetModel, stationModel, stars } from "./scene.js";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(MENU_CAMERA.fov, innerWidth / innerHeight, 0.5, 40000);
scene.add(camera);

// The same light rig as the game, so the station reads the same way there and here.
scene.add(new THREE.HemisphereLight(0x5a6e80, 0x120e0c, 0.45));
const sun = new THREE.DirectionalLight(0xffe2b8, 2.1);
sun.position.set(-1, 0.4, 0.6);
scene.add(sun);

// A copy of the open-world starfield: same geometry and material, parked at the
// origin because this camera never leaves the station.
scene.add(stars.clone());

const spins = [];
let planetDir = [-0.568, -0.122, -0.812];
let t = 0;

for (const feature of placeDef(DEFAULT_PLACE).features) {
  if (feature.kind === "station") {
    const model = stationModel(feature);
    scene.add(model.object);
    spins.push(...model.spins);
  } else if (feature.kind === "planet") {
    const model = planetModel(feature);
    scene.add(model.object);
    spins.push(...model.spins);
    // Point the camera at the side of the station away from this planet, so the
    // planet sits behind the station instead of off-screen.
    planetDir = [feature.pos[0], feature.pos[1], feature.pos[2]];
  }
}

/** One frame of the title view: slow camera arc, and the station's own spin. */
export function updateMenuView(dt) {
  t += Math.max(0, dt);
  for (const spin of spins) spin.object.rotation.y += dt * spin.rate;
  const pose = menuPose(t, planetDir);
  camera.position.set(...pose.pos);
  camera.lookAt(...pose.look);
}

/** The scene and camera to render while the title screen is up. */
export const menuView = () => ({ scene, camera });

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
