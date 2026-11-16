// The system sky layer (2026-11-16): the inside of a system wears its own sky.
//
// Every ordinary pocket of a system — and a spawned simple-wormhole pocket, which is a pocket of
// its system like any sibling — gets the dynamic layer: the system's star or black hole hangs in
// its true direction from that pocket, and every *other* pocket of the system hangs as a barely
// visible dot, the way a settlement shows up as a pinprick from orbit. Instances (rifts, the far
// side of a wormhole) are not pockets of a system and get nothing here: they keep their own skies.
//
// Everything is positioned from the derived AU layout (`systemSpatialLayout`), so what you see
// hangs exactly where the pocket map says each place is. The central body renders as a real 3D
// sphere — far beyond reach, because this whole group rides inside the sky, which follows the
// camera; no flight can close on it. Its set size (AU, `GALAXY.systemSpace`) divided by the
// flying pocket's distance to it gives the apparent size: a pocket closer to the star sees it
// bigger; a compact system's star looms, a vast system's is a glint. The black hole is the same
// construction, dimmer and with a slight orange tint. Stars are one look today; a shade list can
// be added later as data without touching this file.
//
// Lighting is not done here: `systemLightFor` hands the one scene light the same direction, and
// `scene.js` applies it per place, so the light always comes from the body you can see.

import * as THREE from "three";
import { placeAt } from "../data/places.js";
import { GALAXY } from "../data/galaxy.js";
import { state } from "../state/state.js";
import { systemSpatialLayout } from "../sim/galaxy.js";

/**
 * Resolve the system a place belongs to, or null when the place is not an ordinary pocket of one
 * (instances, the wormhole's far side, the map itself). Reads the live catalog, so a seeded
 * layout is all it needs; nothing is cached — the resolved galaxy is small and is rebuilt on load.
 */
export function systemSkyContext(id) {
  const place = placeAt(id);
  if (!place || place.kind !== "pocket" || !place.parent) return null;
  const galaxy = state.galaxy;
  if (!galaxy || !galaxy.pocketsById || !galaxy.pocketsById[id]) return null;
  const spatial = systemSpatialLayout(galaxy, place.parent);
  const here = spatial?.byId?.[id];
  if (!spatial || !here) return null;
  return { spatial, here };
}

/** The unit direction from the active pocket toward the system's star/black hole, or null. */
export function systemBodyDirection(id) {
  const ctx = systemSkyContext(id);
  if (!ctx) return null;
  const dir = new THREE.Vector3(-ctx.here.pos[0], -ctx.here.pos[1], -ctx.here.pos[2]);
  if (dir.lengthSq() < 1e-12) dir.set(0, 1, 0);   // a pocket authored exactly on the core looks straight up
  return dir.normalize();
}

/** What the one scene light should look like in this place, or null off the systems (instances). */
export function systemLightFor(id) {
  const ctx = systemSkyContext(id);
  if (!ctx) return null;
  const body = GALAXY.systemSpace[ctx.spatial.starKind];
  const direction = systemBodyDirection(id);
  if (!body || !direction) return null;
  return { color: body.lightColor, intensity: body.lightIntensity, direction };
}

// One shared halo sprite texture (a soft radial fall-off); built on first use, never disposed.
let haloTexture = null;
function getHaloTexture() {
  if (haloTexture) return haloTexture;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  haloTexture = new THREE.CanvasTexture(canvas);
  return haloTexture;
}

/**
 * Build the layer for one pocket, or null off the systems. Returns `{ object, dispose }` shaped
 * like a sky builder so the caller can hang it off the sky group (which follows the camera) and
 * free its own geometry when the place is forgotten.
 */
export function buildSystemSkyLayer(id) {
  const ctx = systemSkyContext(id);
  if (!ctx) return null;
  const { spatial, here } = ctx;
  const tuning = GALAXY.systemSpace;
  const L = tuning.layerRadius;
  const body = tuning[spatial.starKind];
  const g = new THREE.Group();
  g.name = "system-sky-layer";
  const disposables = [];

  // Direction from this pocket toward the central body. The layer keeps each object at a fixed
  // direction times L, so it never moves as the ship flies — the way the real sky does not.
  const toStar = new THREE.Vector3(-here.pos[0], -here.pos[1], -here.pos[2]);
  const dist = Math.max(toStar.length(), 1e-6);
  const starDir = toStar.normalize();

  // The body: its set size in AU over the pocket's distance — the apparent size the eye should
  // get. Clamped so a very close pass still leaves an on-screen (but never screen-filling) disc.
  const apparent = L * Math.tan(Math.asin(Math.min(1, body.radiusAu / dist)));
  const radiusPx = THREE.MathUtils.clamp(apparent, tuning.minBodyPx, tuning.maxBodyPx);
  const bodyGeo = new THREE.SphereGeometry(radiusPx, 28, 18);
  const bodyMat = new THREE.MeshBasicMaterial({ color: body.color, fog: false });
  const orb = new THREE.Mesh(bodyGeo, bodyMat);
  orb.name = spatial.starKind === "blackHole" ? "black-hole" : "star";
  orb.position.copy(starDir).multiplyScalar(L);
  g.add(orb);
  disposables.push(bodyGeo, bodyMat);

  // Its halo: additive light spilling past the limb. The black hole's is dimmer and orange.
  const haloMat = new THREE.SpriteMaterial({
    map: getHaloTexture(),
    color: body.halo,
    transparent: true,
    opacity: body.haloOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.setScalar(radiusPx * body.haloScale);
  halo.position.copy(orb.position);
  g.add(halo);
  disposables.push(haloMat);

  // The sibling pockets: one point each, fixed in direction, barely there. The pocket the pilot
  // is standing in has no direction at all and is skipped.
  const offsets = new Float32Array(spatial.nodes.length * 3);
  let count = 0;
  for (const node of spatial.nodes) {
    if (node.id === id) continue;
    const dir = new THREE.Vector3(
      node.pos[0] - here.pos[0],
      node.pos[1] - here.pos[1],
      node.pos[2] - here.pos[2]
    );
    if (dir.lengthSq() < 1e-12) continue;
    dir.normalize().multiplyScalar(L);
    offsets[count * 3] = dir.x;
    offsets[count * 3 + 1] = dir.y;
    offsets[count * 3 + 2] = dir.z;
    count += 1;
  }
  if (count > 0) {
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute("position", new THREE.BufferAttribute(offsets.subarray(0, count * 3), 3));
    const dotMat = new THREE.PointsMaterial({
      size: tuning.pocketDot.size,
      sizeAttenuation: false,
      color: tuning.pocketDot.color,
      transparent: true,
      opacity: tuning.pocketDot.opacity,
      depthWrite: false,
      fog: false,
    });
    const dots = new THREE.Points(dotGeo, dotMat);
    dots.name = "pocket-dots";
    g.add(dots);
    disposables.push(dotGeo, dotMat);
  }

  return { object: g, dispose: () => disposables.forEach(d => d.dispose && d.dispose()) };
}
