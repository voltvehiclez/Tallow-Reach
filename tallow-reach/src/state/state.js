// Runtime state for the current session. Persistent progress lives in
// state.profile (see profile.js). Everything else is rebuilt on load.

import { newProfile } from "./profile.js";
import { neutralControls } from "./controls.js";
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
    gunCd: [],         // seconds until each fitted gun can fire again
    // (There is no `gunsOn` field: whether the trigger was held and the guns could
    // fire is local to one frame of sim/weapons.js. Nothing outside it read the
    // stored copy, and a stale value on a shared record would confuse co-op.)
    missileCd: 0,
    spawnT: 20,        // seconds until the next pirate check
    beamOn: false,
    beamT: 0,          // seconds of continuous contact toward the next ore; resets the moment contact stops
    mineFrac: 1,       // ore left in the rock being mined (drives hum pitch)
    coneAngle: 0,      // degrees: the missile lock cone, 0 when no ring is shown
  },

  // Ship power, rebuilt from the fitted modules (see sim/power.js).
  //   gen    MJ/s the powerplants make
  //   cap    MJ the cells hold
  //   stored MJ in the cells right now
  //   draw   MJ/s the whole ship is asking for, the sum of `use`
  //   use    who is asking for what: drive, shield, guns and beam
  power: { gen: 0, cap: 0, stored: 0, draw: 0, use: { drive: 0, shield: 0, guns: 0, beam: 0 } },

  // The ship's drive, rebuilt from the fitted thrusters (see sim/drive.js).
  //   spd    top speed in m/s       0 / 0 with an empty bay: the ship cannot move
  //   turn   turn rate multiplier (scaled again by FLIGHT.turn)
  //   bmax   boost fuel units the tank holds (player.enMax; sim/drive.js sizes it)
  //   buse   units a second burned while boosting
  //   bfill  units a second the tank refills at
  drive: { spd: 0, turn: 0 },

  // The guns fitted in the primary bays, in bay order (see sim/guns.js).
  guns: [],

  // The mining beams fitted in the primary bays, in bay order (see sim/guns.js).
  beams: [],
  // The missile launchers fitted in the secondary bays, in bay order (see sim/guns.js).
  missiles: [],

  // The ship's shields, rebuilt from the fitted shield module (see sim/shield.js).
  //   cap    Shield HP when full        0 means no shields fitted
  //   regen  Shield HP per second while recharging
  //   delay  seconds without a hit before recharging starts
  shield: { cap: 0, regen: 0, delay: 0 },

  // The ship's Hull HP, rebuilt from the fitted hull module (see sim/hull.js).
  //   cap    Hull HP when full            0 means no hull module fitted
  //           (any hit reaching the hull then destroys the ship)
  hull: { cap: 0 },

  freeCam: { on: false, yaw: 0, pitch: 0.25, dist: 14 },

  // What the local pilot is asking for this frame. `core/input.js` writes it from
  // the keyboard and mouse; `src/sim/` reads it and never touches the keyboard.
  // The shape (and the meanings of every field) is in state/controls.js. Step 8
  // moves this onto a per-player record; the network fills a guest's copy.
  controls: neutralControls(),

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

/** Show a hint for this frame only. Call every frame to keep it visible. */
export const say = text => {
  state.hud.prompt = text;
};

/** Show a centre-screen message for `secs` seconds. */
export const msg = (text, secs = 3) => {
  state.hud.msg = text;
  state.hud.msgT = secs;
};
