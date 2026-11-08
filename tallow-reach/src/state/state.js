// Runtime state for the current session. Persistent progress lives in
// state.profile (see profile.js). Everything else is rebuilt on load.

import { newProfile } from "./profile.js";
import { neutralControls } from "./controls.js";
import { DEFAULT_SHIP } from "../data/ships.js";
import { DEFAULT_SECTOR } from "../data/sectors.js";

// Before the local ship exists, input can still be prepared for it. Once created,
// every pilot owns its own controls; legacy aliases expose the selected local pilot.
let pendingControls = neutralControls();
const copyControls = c => ({ ...c, steer: { ...c.steer } });

// Per-pilot runtime values. Profile, inventory and lifecycle remain local-only
// until step 9; these fields are transient and never written into the save.
export function createPlayerRuntime() {
  return {
    flight: { lock: null, missileLock: { target: null, t: 0, locked: false },
      gunCd: [], missileCd: 0, spawnT: 20, beamOn: false, beamStart: null,
      beamEnd: null, beamT: 0, mineFrac: 1, coneAngle: 0 },
    power: { gen: 0, cap: 0, stored: 0, draw: 0, use: { drive: 0, shield: 0, guns: 0, beam: 0 } },
    drive: { spd: 0, turn: 0 }, shield: { cap: 0, regen: 0, delay: 0 }, hullSpec: { cap: 0 },
    guns: [], beams: [], missiles: [], ship: DEFAULT_SHIP, weapon: "cannon", missileStock: 0,
    aimDirection: null, warp: null, configured: false,
  };
}

const initialRuntime = createPlayerRuntime();

/** The player followed by the local screen, or null before it is created. */
export const localPlayer = () => state.players[state.localPlayerIndex] || null;

export const state = {
  profile: newProfile(),
  players: [],         // player records, including their own controls
  localPlayerIndex: 0,  // which player this screen and its input follow
  // Local-player compatibility alias for the local UI and step 9 systems.
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
  sector: DEFAULT_SECTOR,   // id from data/sectors.js: the region you are flying in
  warp: null,               // { from, to, t, fx, flash, switched, steer } while a warp runs; see sim/sectors.js

  world: {
    enemies: [],       // hostile ships
    asteroids: [],     // mineable rocks
    crates: [],        // floating loot
    bullets: [],
    missiles: [],
    fx: [],            // short-lived particles
  },

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
    board: [],         // contract offers
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
  // first use and stamped from the shop's `max` (data/shops.js). Only shops with
  // a `max` on a row are ever in here: an unlimited row has no entry. Session
  // state, not saved — a restock timer, event or roll later resets it through
  // `setShopStock()` in sim/economy.js, and save step 9 moves it into the world.
  shops: {},
};

// Compatibility aliases for the existing local UI and local-only step 9 systems.
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
