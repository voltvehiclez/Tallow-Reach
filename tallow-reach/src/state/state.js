// Runtime state for the current session. Persistent progress lives in
// state.profile (see profile.js). Everything else is rebuilt on load.

import { newProfile } from "./profile.js";
import { DEFAULT_SECTOR } from "../data/sectors.js";

export const state = {
  profile: newProfile(),
  player: null,        // the flying ship (created in sim/player.js)
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

  flight: {
    lock: null,                                   // { k: "e"|"a"|"c"|"s", o } or null
    missileLock: { target: null, t: 0, locked: false },
    fireCd: 0,
    missileCd: 0,
    spawnT: 20,        // seconds until the next pirate check
    beamOn: false,
    mineFrac: 1,       // ore left in the rock being mined (drives hum pitch)
    coneRadius: 0,     // px radius of the missile lock ring, 0 when hidden
  },

  // Ship power, rebuilt from the fitted modules (see sim/power.js).
  //   gen    MJ/s the powerplants make
  //   cap    MJ the cells hold
  //   stored MJ in the cells right now
  //   draw   MJ/s the ship is asking for; the thrusters set it (sim/player.js)
  //   draw   MJ/s the whole ship is asking for, the sum of `use`
  //   use    who is asking for what: drive (sim/drive.js) and shield (sim/shield.js)
  power: { gen: 0, cap: 0, stored: 0, draw: 0, use: { drive: 0, shield: 0 } },

  // The ship's drive, rebuilt from the fitted thrusters (see sim/drive.js).
  //   spd    top speed in m/s       0 / 0 with an empty bay: the ship cannot move
  //   turn   turn rate multiplier (scaled again by FLIGHT.turn)
  drive: { spd: 0, turn: 0 },

  // The ship's shields, rebuilt from the fitted shield module (see sim/shield.js).
  //   cap    shield points when full        0 means no shields fitted
  //   regen  points per second while recharging
  //   delay  seconds without a hit before recharging starts
  shield: { cap: 0, regen: 0, delay: 0 },

  freeCam: { on: false, yaw: 0, pitch: 0.25, dist: 14 },

  ui: {
    intro: true,
    tab: "m",          // m contracts, h hangar, p shop, b base, s saves
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
};

/** Show a hint for this frame only. Call every frame to keep it visible. */
export const say = text => {
  state.hud.prompt = text;
};

/** Show a centre-screen message for `secs` seconds. */
export const msg = (text, secs = 3) => {
  state.hud.msg = text;
  state.hud.msgT = secs;
};
