// Adapter between a compact saved world and the live place catalog (step 11B).
// profile.js validates saves without importing generation; this module resolves
// the saved seed first, then validates the pocket id against that actual galaxy.
// The resolved web lives in state.galaxy (session only), never in the save.

import { GALAXY } from "../data/galaxy.js";
import { DEFAULT_PLACE, setPlaceCatalog } from "../data/places.js";
import { state } from "../state/state.js";
import { sanitizeSave } from "../state/profile.js";
import { generateGalaxy, recordSystemVisit } from "./galaxy.js";

/** Resolve a raw save's seed, install its catalog, sanitize and recover safely.
 *  Used by boot, slot load and import before applySave(). Throws on invalid
 *  author data rather than silently replacing the owner's galaxy. */
export function prepareGalaxySave(raw) {
  const rawWorld = raw?.profile && typeof raw.profile === "object" ? raw.world : raw;
  const seed = Number.isFinite(rawWorld?.galaxy?.seed) ? rawWorld.galaxy.seed >>> 0 : GALAXY.seed;
  const galaxy = generateGalaxy(seed);
  const previousGalaxy = state.galaxy;
  const previousRecovery = state.galaxyRecovery;
  const requested = typeof rawWorld?.place === "string" ? rawWorld.place
    : typeof rawWorld?.sector === "string" ? rawWorld.sector : null;
  // Check the id the save actually asked for. sanitizeSave deliberately falls
  // back to home for an unknown id, which would otherwise hide the recovery.
  const missingPocket = requested !== null && !Object.prototype.hasOwnProperty.call(galaxy.pocketsById, requested);
  // Old generated gate ids encode their system pair. Resolve the old seeded
  // catalog before sanitization so a removed gate can move to its own system's
  // ordinary pocket instead of stranding the player or losing their character.
  let recovery = null, input = raw;
  if (missingPocket) {
    const legacy = generateGalaxy(seed, { generator: "organic-web-v1", graph: { maxNeighbors: 4, extraChance: 0.35, extraRange: 300 } }, {});
    const old = legacy.pocketsById[requested];
    const local = old?.role === "gate" && galaxy.systemsById[old.parent]
      ? Object.values(galaxy.pockets).find(p => p.parent === old.parent && p.role !== "gate") : null;
    const to = local?.id || DEFAULT_PLACE;
    input = JSON.parse(JSON.stringify(raw));
    const inputWorld = input?.profile && typeof input.profile === "object" ? input.world : input;
    inputWorld.place = to;
    inputWorld.resume = null;
    recovery = { from: requested, to };
  }
  let save;
  try {
    // Validation must see the candidate seed's pockets. A bad save must not leave
    // that candidate installed behind the still-running old world.
    setPlaceCatalog(galaxy);
    save = sanitizeSave(input);
  } catch (error) {
    setPlaceCatalog(previousGalaxy);
    state.galaxy = previousGalaxy;
    state.galaxyRecovery = previousRecovery;
    throw error;
  }
  state.galaxyRecovery = recovery;
  // An old autosave may have been written during arrival before the destination
  // was cleared. Never resurrect a route that is already complete.
  const destination = save.world.destination;
  const here = galaxy.pocketsById[save.world.place];
  if (destination && (typeof destination === "string" ? here?.parent === destination : here?.id === destination.pocketId)) {
    save.world.destination = null;
  }
  save.world.galaxy.seed = seed;
  recordSystemVisit(galaxy, save.world.galaxy.knowledge, save.world.place);
  state.galaxy = galaxy;
  return save;
}

/** The live resolved web. Legacy headless callers may apply a save directly;
 *  only the boot/load/import paths need the full preparation above. */
export function liveGalaxy() {
  return state.galaxy;
}
