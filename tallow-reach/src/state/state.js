// Runtime state for the current session. Persistent progress lives in
// `state.profile` (portable character) and `state.worldState` (hosted world),
// packed together as `{ v, profile, world }` (see profile.js). Everything else
// is rebuilt on load.

import { newProfile, newWorld, SAVE_VERSION } from "./profile.js";
import { neutralControls } from "./controls.js";
import { DEFAULT_SHIP } from "../data/ships.js";
import { DEFAULT_PLACE } from "../data/places.js";

// Before the local ship exists, input can still be prepared for it. Once created,
// every pilot owns its own controls; legacy aliases expose the selected local pilot.
let pendingControls = neutralControls();
let pendingWarp = null;
const copyControls = c => ({ ...c, steer: { ...c.steer } });

// Per-pilot runtime values. Transient fields are never written into the save;
// `profile` points to the pilot's persistent profile once configured.
export function createPlayerRuntime() {
  return {
    flight: { lock: null, missileLock: { target: null, t: 0, locked: false },
      gunCd: [], missileCd: 0, spawnT: 20, beamOn: false, beamStart: null,
      beamEnd: null, beamT: 0, mineFrac: 1, coneAngle: 0 },
    power: { gen: 0, cap: 0, stored: 0, draw: 0, use: { drive: 0, shield: 0, guns: 0, beam: 0 } },
    drive: { spd: 0, turn: 0 }, shield: { cap: 0, regen: 0, delay: 0 }, hullSpec: { cap: 0 },
    guns: [], beams: [], missiles: [], ship: DEFAULT_SHIP, weapon: "cannon", missileStock: 0,
    aimDirection: null, place: DEFAULT_PLACE, warp: null, profile: null, configured: false,
  };
}

const initialRuntime = createPlayerRuntime();

/** The player followed by the local screen, or null before it is created. */
export const localPlayer = () => state.players[state.localPlayerIndex] || null;

/**
 * Persistent profile for `player`: `state.profile` for the local pilot (or when
 * `player` is omitted), `player.profile` for any non-local pilot.
 */
export function profileOf(player = localPlayer()) {
  if (!player || player === localPlayer()) return state.profile;
  return player.profile || null;
}

/**
 * Record where the local pilot is right now, so the next load puts them back
 * there. Null while docked (or dead): loading then opens the station menu.
 */
export function captureResume() {
  const P = localPlayer();
  state.worldState.resume = !P || P.docked || P.dead
    ? null
    : { pos: P.pos.toArray(), quat: P.quat.toArray(), sh: P.sh, en: P.en };
  return state.worldState.resume;
}

/**
 * Snapshot the local profile and hosted world as a combined save object.
 * Captures the live resume point first, so every save path — autosave, slot and
 * export code — records where the pilot actually is.
 */
export function currentSave() {
  captureResume();
  return {
    v: SAVE_VERSION,
    profile: state.profile,
    world: state.worldState,
  };
}

/** Install a validated `{ v, profile, world }` save into runtime state. */
export function applySave(save) {
  state.profile = save.profile;
  state.worldState = save.world;
  state.place = save.world.place || DEFAULT_PLACE;
  const local = localPlayer();
  if (local) {
    local.profile = state.profile;
    local.ship = state.profile.ship;
    local.weapon = state.profile.pw;
    local.missileStock = state.profile.msl;
    local.place = state.place;
  }
  return save;
}

export const state = {
  profile: newProfile(),
  worldState: newWorld(),
  players: [],         // player records, including their own controls
  localPlayerIndex: 0,  // which player this screen and its input follow
  // Local-player compatibility alias for the local UI and single-player callers.
  get player() { return localPlayer(); },
  set player(player) {
    const previous = localPlayer();
    if (!player) {
      if (previous) {
        pendingControls = copyControls(previous.controls);
        this.players.splice(this.localPlayerIndex, 1);
      }
      return;
    }
    if (!player.controls) player.controls = copyControls(previous?.controls || pendingControls);
    // Legacy local UI reads state.power/flight/etc. Preserve those live values
    // when the local ship record is replaced; other players have fresh records.
    if (!player.configured) {
      for (const [alias, field] of Object.entries(runtimeFields)) player[field] = this[alias];
    }
    this.players[this.localPlayerIndex] = player;
  },
  aimDirection: { x: 0, y: 0, z: -1 }, // last rendered camera direction, supplied by the frame loop
  paused: false,
  time: 0,             // seconds of unpaused play
  place: DEFAULT_PLACE,     // id from data/places.js: the pocket the local pilot is flying in
  // The local pilot's warp. Like state.flight, this is a compatibility alias;
  // every pilot owns their own warp on the player record.
  get warp() { const p = localPlayer(); return p ? p.warp : pendingWarp; },
  set warp(w) { const p = localPlayer(); if (p) p.warp = w; else pendingWarp = w; },
  places: new Map(),        // place id -> { id, loaded, entities } runtime containers (session only)

  // The local pilot's place entities. Existing UI/tests read state.world; sim
  // systems that act on another pilot pass an explicit place id instead.
  get world() { return placeWorld(this.place); },

  // Local compatibility aliases are redirected to the selected player below.
  flight: initialRuntime.flight,
  power: initialRuntime.power,
  drive: initialRuntime.drive,
  guns: initialRuntime.guns,
  beams: initialRuntime.beams,
  missiles: initialRuntime.missiles,
  shield: initialRuntime.shield,
  hull: initialRuntime.hullSpec,

  freeCam: { on: false, yaw: 0, pitch: 0.25, dist: 14 },

  // Temporary compatibility alias: there is no separate global control record.
  get controls() { return localPlayer()?.controls || pendingControls; },
  set controls(controls) {
    const player = localPlayer();
    if (player) player.controls = controls;
    else pendingControls = controls;
  },

  ui: {
    intro: true,
    tab: "m",          // m contracts, h hangar, o outfitting, i inventory, p shop, b base, s saves
    invShip: null,     // the ship whose hold the Inventory tab shows (null = the one being flown)
    toast: "",         // green message at the top of the panel
    get board() {
      return state.worldState.board;
    },
    set board(v) {
      state.worldState.board = Array.isArray(v) ? v : [];
    },
    confirmReset: false,
    fit: null,         // the open picker: { kind: "module", g, i } or { kind: "paint", k }
    xcode: "",         // last exported or pasted save code
  },

  hud: {
    prompt: "",        // one-frame hint text, rebuilt every frame
    msg: "",           // timed centre-screen message
    msgT: 0,
  },

  // How much a limited shop row has left: `{ "shopId:itemId": count }`, made on
  // first use and stamped from the shop's `max` (data/shops.js). Session state,
  // not saved — a restock timer, event or roll later resets it through
  // `setShopStock()` in sim/economy.js.
  shops: {},
};

// Compatibility aliases for the existing local UI and single-player callers.
// The authoritative live runtime values belong to the selected player record.
const runtimeFields = { flight: "flight", power: "power", drive: "drive", shield: "shield",
  hull: "hullSpec", guns: "guns", beams: "beams", missiles: "missiles" };
const pendingRuntime = {};
for (const [alias, field] of Object.entries(runtimeFields)) {
  pendingRuntime[alias] = state[alias];
  Object.defineProperty(state, alias, {
    enumerable: true, configurable: true,
    get() { return localPlayer()?.[field] || pendingRuntime[alias]; },
    set(value) { const p = localPlayer(); if (p) p[field] = value; else pendingRuntime[alias] = value; },
  });
}

/** Show a hint until the next simulation tick. */
export const say = text => {
  state.hud.prompt = text;
};

/** Show a centre-screen message for `secs` seconds. */
export const msg = (text, secs = 3) => {
  state.hud.msg = text;
  state.hud.msgT = secs;
};

/** Runtime entity lists belonging to place `id` (created on first use). */
export function placeWorld(id) {
  let container = state.places.get(id);
  if (!container) {
    container = {
      id,
      loaded: false,
      entities: { enemies: [], asteroids: [], crates: [], bullets: [], missiles: [], fx: [] },
    };
    state.places.set(id, container);
  }
  return container.entities;
}

/** Forget every runtime place container (used when a whole save is replaced). */
export function resetPlaces() {
  state.places.clear();
  state.place = DEFAULT_PLACE;
}
