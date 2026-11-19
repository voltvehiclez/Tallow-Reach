// The system sky layer (2026-11-16): the inside of a system wears its own sky.
//
// Every ordinary pocket of a system — and a spawned simple-wormhole pocket, which is a pocket of
// its system like any sibling — gets the dynamic layer: the system's star or black hole hangs in
// its true direction from that pocket, and every *other* pocket of the system hangs as a barely
// visible dot, the way a settlement shows up as a pinprick from orbit. Instances (rifts, the far
// side of a wormhole) are not pockets of a system and get a seeded central body over their own skies.
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
import { PLANET_VIEW, atmosphereRadius } from "../data/scenery.js";
import { AU_METRES } from "../data/planets.js";
import { state } from "../state/state.js";
import { systemSpatialLayout, instanceSkyContext } from "../sim/galaxy.js";

/**
 * Resolve the system a place belongs to, or null when the place is not an ordinary pocket of one
 * (instances, the wormhole's far side, the map itself). Reads the live catalog, so a seeded
 * layout is all it needs; nothing is cached — the resolved galaxy is small and is rebuilt on load.
 */
export function systemSkyContext(id) {
  const place = placeAt(id);
  if (place?.kind === "instance") return instanceSkyContext(id, state.galaxy?.seed, place.environment);
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

function buildPlanetOrb(planet, position, radiusPx, local = false) {
  const group = new THREE.Group();
  const geometry = new THREE.SphereGeometry(radiusPx, local ? 36 : 20, local ? 24 : 14);
  const material = new THREE.MeshLambertMaterial({
    color: planet.col,
    emissive: planet.emissive || 0x000000,
    emissiveIntensity: planet.classId === "volcanic" ? 0.55 : 0.06,
  });
  const orb = new THREE.Mesh(geometry, material);
  orb.name = local ? "low-orbit-planet" : "planet";
  orb.position.copy(position);
  group.add(orb);

  const atmosphereScale = Math.max(1.06, Number(planet.atmosphere || planet.radiusM * 1.14) / Math.max(1, Number(planet.radiusM) || 1));
  const atmoGeo = new THREE.SphereGeometry(atmosphereRadius(radiusPx, radiusPx * atmosphereScale), local ? 36 : 20, local ? 24 : 14);
  const atmoMat = new THREE.MeshBasicMaterial({
    color: planet.atmoCol || 0x8fb3c7,
    transparent: true,
    opacity: Number(planet.atmoOpacity ?? 0.18),
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const atmosphere = new THREE.Mesh(atmoGeo, atmoMat);
  atmosphere.name = "planet-atmosphere";
  atmosphere.position.copy(position);
  group.add(atmosphere);
  return { group, disposables: [geometry, material, atmoGeo, atmoMat], radiusPx };
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
  const radiusAu = body.radiusAu * (spatial.core?.radiusScale ?? 1);
  const apparent = L * Math.tan(Math.asin(Math.min(1, radiusAu / dist)));
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

  // Planets: real bodies in the visitor's sky. In a planet pocket it is a huge low-orbit
  // body; elsewhere its angular size follows the AU separation divided by its radius.
  const planetNodes = spatial.nodes.filter(node => node.role === "planet");
  for (const node of planetNodes) {
    const record = placeAt(node.id);
    const planet = record?.planet;
    if (!planet) continue;
    if (node.id === id) {
      const arrival = record.enter;
      const sightline = arrival?.face && arrival?.pos
        ? arrival.face.map((value, i) => value - arrival.pos[i]) : planet.approach || [0, 0, 1];
      const dir = new THREE.Vector3(...sightline).normalize();
      dir.y = PLANET_VIEW.elevation;
      dir.normalize();
      const radiusPx = L * PLANET_VIEW.radius;
      const position = dir.multiplyScalar(L * PLANET_VIEW.distance);
      const local = buildPlanetOrb(planet, position, radiusPx, true);
      g.add(local.group);
      disposables.push(...local.disposables);
      continue;
    }
    const offset = new THREE.Vector3(
      node.pos[0] - here.pos[0],
      node.pos[1] - here.pos[1],
      node.pos[2] - here.pos[2]
    );
    const distanceAu = offset.length();
    if (distanceAu < 1e-9) continue;
    const distanceM = Math.max(distanceAu * AU_METRES, Number(planet.radiusM) * 1.001);
    const direction = offset.normalize();
    const angularRadius = Math.asin(Math.min(1, Number(planet.radiusM) / distanceM));
    const radiusPx = THREE.MathUtils.clamp(L * Math.tan(angularRadius), 5, 150);
    const position = direction.multiplyScalar(L);
    const body = buildPlanetOrb(planet, position, radiusPx, false);
    g.add(body.group);
    disposables.push(...body.disposables);
    // A faint atmospheric limb so the dot still reads as a world, not a star.
    const haloMat = new THREE.SpriteMaterial({
      map: getHaloTexture(),
      color: planet.atmoCol || 0x8fb3c7,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.setScalar(atmosphereRadius(radiusPx * 2, radiusPx * 3.2));
    halo.position.copy(position);
    g.add(halo);
    disposables.push(haloMat);
  }

  // Belt pockets get their own barely-visible ochre dots; planets replace theirs with bodies.
  const beltOffsets = new Float32Array(spatial.nodes.length * 3);
  let beltCount = 0;
  for (const node of spatial.nodes) {
    if (node.id === id || node.role !== "belt") continue;
    const dir = new THREE.Vector3(node.pos[0] - here.pos[0], node.pos[1] - here.pos[1], node.pos[2] - here.pos[2]);
    if (dir.lengthSq() < 1e-12) continue;
    dir.normalize().multiplyScalar(L);
    beltOffsets[beltCount * 3] = dir.x;
    beltOffsets[beltCount * 3 + 1] = dir.y;
    beltOffsets[beltCount * 3 + 2] = dir.z;
    beltCount += 1;
  }
  if (beltCount > 0) {
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute("position", new THREE.BufferAttribute(beltOffsets.subarray(0, beltCount * 3), 3));
    const beltTuning = GALAXY.systemMap.beltDot || { size: 4.2, color: 0xc8b18a, opacity: 0.85 };
    const dotMat = new THREE.PointsMaterial({
      size: beltTuning.size,
      sizeAttenuation: false,
      color: beltTuning.color,
      transparent: true,
      opacity: beltTuning.opacity,
      depthWrite: false,
      fog: false,
    });
    // WebGL points are square unless explicitly masked into circular pinpricks.
    dotMat.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace("void main() {", `void main() {
        float pointRadius = length(gl_PointCoord - vec2(0.5));
        if (pointRadius > 0.5) discard;`);
    };
    dotMat.customProgramCacheKey = () => "circular-pocket-point";
    const dots = new THREE.Points(dotGeo, dotMat);
    dots.name = "belt-dots";
    g.add(dots);
    disposables.push(dotGeo, dotMat);
  }

  // The sibling ordinary pockets: one point each, fixed in direction, barely there. The pocket
  // The sibling ordinary pockets: one point each, fixed in direction, barely there. The pocket
  // the pilot is standing in has no direction at all and is skipped, as are planets and belts.
  const offsets = new Float32Array(spatial.nodes.length * 3);
  let count = 0;
  for (const node of spatial.nodes) {
    if (node.id === id || node.role === "planet" || node.role === "belt") continue;
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
    // WebGL points are square unless explicitly masked into circular pinpricks.
    dotMat.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace("void main() {", `void main() {
        float pointRadius = length(gl_PointCoord - vec2(0.5));
        if (pointRadius > 0.5) discard;`);
    };
    dotMat.customProgramCacheKey = () => "circular-pocket-point";
    const dots = new THREE.Points(dotGeo, dotMat);
    dots.name = "pocket-dots";
    g.add(dots);
    disposables.push(dotGeo, dotMat);
  }

  return { object: g, dispose: () => disposables.forEach(d => d.dispose && d.dispose()) };
}
