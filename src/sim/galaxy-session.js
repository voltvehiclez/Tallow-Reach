// Adapter between a compact saved world and the live place catalog (step 11B).
// profile.js validates saves without importing generation; this module resolves
// the saved seed first, then validates the pocket id against that actual galaxy.
// The resolved web lives in state.galaxy (session only), never in the save.

import { GALAXY } from "../data/galaxy.js";
import { CAMPAIGN_GALAXY, CAMPAIGN_GALAXY_SEED, CAMPAIGN_HOME_POCKET } from "../data/campaign/galaxy.js";
import { DEFAULT_PLACE, setPlaceCatalog, registerWormholePlace } from "../data/places.js";
import { state, clearWormholes, isDualModeSave, currentRootSave, applySave } from "../state/state.js";
import { sanitizeSave, newModeSave, separateCampaignPilot, SAVE_VERSION } from "../state/profile.js";
import { generateGalaxy, recordSystemVisit } from "./galaxy.js";
import { installUncharted } from "./uncharted.js";
import { registerWormholePlaces } from "./wormholes.js";

/** Resolve one mode's raw save's seed, install its catalog, sanitize and recover safely.
 *  Used by boot, slot load and import before applySave(). Throws on invalid
 *  author data rather than silently replacing the owner's galaxy. */
function prepareModeSave(raw, mode = "open") {
  const campaign = mode === "campaign";
  const rawWorld = raw?.profile && typeof raw.profile === "object" ? raw.world : raw;
  const defaultSeed = campaign ? CAMPAIGN_GALAXY_SEED : GALAXY.seed;
  const seed = Number.isFinite(rawWorld?.galaxy?.seed) ? rawWorld.galaxy.seed >>> 0 : defaultSeed;
  const galaxy = generateGalaxy(seed, campaign ? CAMPAIGN_GALAXY : GALAXY);
  if (!campaign) installUncharted(galaxy, rawWorld);
  const previousGalaxy = state.galaxy;
  const previousRecovery = state.galaxyRecovery;
  const requested = typeof rawWorld?.place === "string" ? rawWorld.place
    : typeof rawWorld?.sector === "string" ? rawWorld.sector : null;
  // A pilot can be inside a temporary run (step 14b), which is a place that is in no galaxy: it is
  // registered at runtime by `sim/instances.js` from the run list this same save carries. Without
  // this, a save made inside a rift looked like a pocket that had been removed, and the pilot was
  // "recovered" home — out of the run they were standing in.
  const runs = Array.isArray(rawWorld?.instances) ? rawWorld.instances : [];
  const savedRun = typeof requested === "string" && runs.some(run => run && run.id === requested);
  // Check the id the save actually asked for. sanitizeSave deliberately falls
  // back to home for an unknown id, which would otherwise hide the recovery.
  const missingPocket = requested !== null && !savedRun &&
    !Object.prototype.hasOwnProperty.call(galaxy.pocketsById, requested);
  // Old generated gate ids encode their system pair. Resolve the old seeded
  // catalog before sanitization so a removed gate can move to its own system's
  // ordinary pocket instead of stranding the player or losing their character.
  const homePocket = campaign ? CAMPAIGN_HOME_POCKET : DEFAULT_PLACE;
  let recovery = null, input = raw;
  if (missingPocket) {
    const legacy = generateGalaxy(seed, { generator: "organic-web-v1", graph: { maxNeighbors: 4, extraChance: 0.35, extraRange: 300 } }, {});
    const old = legacy.pocketsById[requested];
    const local = old?.role === "gate" && galaxy.systemsById[old.parent]
      ? Object.values(galaxy.pockets).find(p => p.parent === old.parent && p.role !== "gate") : null;
    const to = campaign ? CAMPAIGN_HOME_POCKET : local?.id || DEFAULT_PLACE;
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
    // Simple wormholes (slice 14c) are open-world content. A campaign half is
    // never given standing wormhole pockets or the open-world named systems.
    clearWormholes();
    if (!campaign) {
      registerWormholePlaces(rawWorld, galaxy);
      for (const p of Object.values(galaxy.pockets)) if (p.connection) registerWormholePlace(p);
    }
    save = sanitizeSave(input);
  } catch (error) {
    setPlaceCatalog(previousGalaxy);
    state.galaxy = previousGalaxy;
    state.galaxyRecovery = previousRecovery;
    clearWormholes();
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

/** Resolve a raw save's seed, install its catalog, sanitize and recover safely.
 *  v26 browser/slot/import saves may carry both independent mode records; the
 *  inactive half is prepared first and the selected half last so the live catalog
 *  always belongs to the mode the UI is about to show. A plain pre-v26 save remains
 *  an open-world save and is wrapped with a fresh campaign half. */
export function prepareGalaxySave(raw) {
  // v25 and older top-level saves: open-world half only. The campaign half is
  // created lazily on the next dual-mode save/reset, keeping this entry point
  // compatible with callers that expect one active nested save.
  if (!isDualModeSave(raw)) return prepareModeSave(raw, "open");
  // v27 ends pilot sharing: an act has its own pilot, fleet and credits. A v26
  // save was written while the two halves shared one pilot, so its campaign side
  // is rebuilt as a fresh campaign pilot. What the pilot *finished* is kept.
  if ((Number.isFinite(raw.v) ? raw.v : 0) < 27 && raw.campaign && typeof raw.campaign === "object") {
    raw = { ...raw, campaign: { ...raw.campaign, profile: separateCampaignPilot(raw.campaign.profile) }, v: SAVE_VERSION };
  }
  const clean = { v: SAVE_VERSION, mode: raw.mode === "campaign" ? "campaign" : "open", open: null, campaign: null };
  const active = clean.mode, inactive = active === "open" ? "campaign" : "open";
  clean[inactive] = prepareModeSave(raw[inactive] && typeof raw[inactive] === "object" ? raw[inactive] : newModeSave(inactive), inactive);
  clean[active] = prepareModeSave(raw[active] && typeof raw[active] === "object" ? raw[active] : newModeSave(active), active);
  return clean;
}

/** Switch the independent story mode. The active half is captured first; the other is prepared and installed.
 * Returns true when the selected mode changed. The caller handles UI/session cleanup afterwards. */
export function switchGameMode(mode) {
  const next = mode === "campaign" ? "campaign" : "open";
  if (state.mode === next) return false;
  const root = currentRootSave();
  root.mode = next;
  const prepared = prepareGalaxySave(root);
  applySave(prepared);
  return true;
}

/** The live resolved web. Legacy headless callers may apply a save directly;
 *  only the boot/load/import paths need the full preparation above. */
export function liveGalaxy() {
  return state.galaxy;
}
