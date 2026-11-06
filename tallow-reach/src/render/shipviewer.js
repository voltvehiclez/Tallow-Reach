// The ship on the Outfitting screen: its own little three.js scene, renderer
// and camera, so a hull can be looked at by itself while the world sits behind
// the outpost panel.
//
// Visual only. It reads the ship id and the model builder, and changes no game
// rules. ui/outfitting.js owns the page: it mounts the canvas, feeds it drag and
// wheel input, and calls renderShip() once per game frame.
//
// A second WebGL context is used because the outpost panel is ordinary HTML
// sitting on top of the game's canvas; drawing into the main renderer would
// mean a hole in the panel. The context is created the first time this file is
// asked for a canvas, so a session that never opens the tab pays nothing.

import * as THREE from "three";
import { SHIPS, DEFAULT_SHIP } from "../data/ships.js";
import { buildPlayerShip } from "./models.js";

const FOV = 30;
const RADIUS = 1.8;       // every hull is scaled to this bounding-sphere radius
const SPIN = 0.16;        // idle turntable speed, radians per second
const DIST = 8.5;         // default camera distance
const ZOOM_MIN = 5.5;
const ZOOM_MAX = 13;
const PITCH_MIN = -0.7;   // low, looking up at the belly
const PITCH_MAX = 0.8;    // high, looking down on the deck
const START_YAW = 0.5;    // a three-quarter view rather than dead astern

let view = null;          // built on first use: { renderer, scene, camera, ... }
let current = null;       // id of the ship in the scene
let pitch = 0.12;
let dist = DIST;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function ensure() {
  if (view) return view;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);   // let the panel's gradient show through

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);

  // Three lights do the shaping: a warm key from the bow side, a cold rim from
  // behind, and a low amber fill so the belly is not black.
  scene.add(new THREE.HemisphereLight(0x8fb4c4, 0x141a1e, 0.75));
  const key = new THREE.DirectionalLight(0xfff0d6, 1.8);
  key.position.set(4, 6, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x7fb7c4, 1.5);
  rim.position.set(-6, 2, -7);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xe0a458, 0.55);
  fill.position.set(0, -5, 2);
  scene.add(fill);

  // The ship turns on a turntable; the ring below it stays still, which reads as
  // a display stand instead of a spinning room.
  const turntable = new THREE.Group();
  turntable.rotation.y = START_YAW;
  scene.add(turntable);

  const stand = new THREE.Group();
  scene.add(stand);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.55, 1.6, 72),
    new THREE.MeshBasicMaterial({
      color: 0xe0a458,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  stand.add(ring);

  const tick = new THREE.Mesh(
    new THREE.RingGeometry(1.72, 1.74, 96, 1, 0.2, Math.PI * 0.6),
    new THREE.MeshBasicMaterial({
      color: 0x7fb7c4,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  tick.rotation.x = -Math.PI / 2;
  stand.add(tick);

  view = { renderer, scene, camera, turntable, stand, ship: null };
  placeCamera();
  return view;
}

/** Point the camera at the ship from `dist` away, tilted by `pitch`. */
function placeCamera() {
  const v = view || ensure();
  v.camera.position.set(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist);
  v.camera.lookAt(0, 0, 0);
}

function disposeTree(root) {
  root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && o.material.dispose) o.material.dispose();
  });
}

/** The canvas to mount on the page. Creates the renderer the first time. */
export function shipViewerCanvas() {
  return ensure().renderer.domElement;
}

/**
 * Put hull `id` in the viewer. Every hull is scaled to the same bounding sphere
 * and centred on the origin, so a Bulwark is neither clipped where a Wasp looks
 * small, and the camera framing holds at any turntable angle.
 *
 * Does nothing if that hull is already on the stand.
 */
export function setShip(id) {
  const v = ensure();
  const key = SHIPS[id] ? id : DEFAULT_SHIP;
  if (current === key && v.ship) return;

  if (v.ship) {
    v.turntable.remove(v.ship);
    disposeTree(v.ship);
    v.ship = null;
  }

  const ship = buildPlayerShip(key);

  // `buildPlayerShip` has already applied the hull's own scale; normalising the
  // finished model on top of that keeps every hull the same size on screen.
  const box = new THREE.Box3().setFromObject(ship);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  ship.scale.multiplyScalar(RADIUS / (sphere.radius || 1));

  // Re-measure after scaling, then sit the model on the origin.
  const fitted = new THREE.Box3().setFromObject(ship);
  const centre = fitted.getCenter(new THREE.Vector3());
  ship.position.sub(centre);

  v.turntable.add(ship);
  v.turntable.rotation.y = START_YAW;
  v.stand.position.y = fitted.min.y - centre.y - 0.1;   // just under the belly
  v.ship = ship;
  current = key;
  resetShipView();
}

/** Match the drawing buffer to the box on screen (CSS sizes the element). */
export function resizeShipViewer(w, h) {
  const v = ensure();
  if (!w || !h) return;
  v.renderer.setSize(w, h, false);
  v.camera.aspect = w / h;
  v.camera.updateProjectionMatrix();
}

/** Drag the view: horizontal spins the ship, vertical tilts the camera. */
export function dragShip(dx, dy) {
  const v = ensure();
  v.turntable.rotation.y += dx * 0.01;
  pitch = clamp(pitch + dy * 0.006, PITCH_MIN, PITCH_MAX);
  placeCamera();
}

/** Wheel zoom. Positive `delta` pulls the camera back. */
export function zoomShip(delta) {
  dist = clamp(dist + delta * 0.004, ZOOM_MIN, ZOOM_MAX);
  placeCamera();
}

/** Back to the starting three-quarter view. */
export function resetShipView() {
  const v = ensure();
  v.turntable.rotation.y = START_YAW;
  pitch = 0.12;
  dist = DIST;
  placeCamera();
}

/** Draw one frame, turning the stand by `spin` radians per second. */
export function renderShip(dt, spin = SPIN) {
  const v = ensure();
  if (!v.ship) return;
  v.turntable.rotation.y += spin * dt;
  v.renderer.render(v.scene, v.camera);
}
