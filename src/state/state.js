// Runtime state for the current session. Persistent progress lives in
// `state.profile` (portable character) and `state.worldState` (hosted world),
// packed together as `{ v, profile, world }` (see profile.js). Everything else
// is rebuilt on load.

import { newProfile, newWorld, newSave, newCampaignSave, newModeSave, SAVE_VERSION, cleanAway } from "./profile.js";
import { saveAutosave } from "./storage.js";
import { neutralControls } from "./controls.js";
import { DEFAULT_SHIP } from "../data/ships.js";
import { DEFAULT_PLACE, clearInstancePlaces, clearWormholePlaces } from "../data/places.js";

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
    guns: [], beams: [], missiles: [], ship: DEFAULT_SHIP, weapon: "1", missileStock: 0,
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

/** Find the pilot record in `state.players` that owns `target` (player or profile). */
export function playerOf(target = localPlayer()) {
  const local = localPlayer();
  if (!target || target === local || target === state.profile) return local;
  if (typeof target === "object" && state.players.includes(target)) return target;
  if (typeof target === "object") {
    for (const p of state.players) {
      if (p && p.profile === target) return p;
    }
  }
  return null;
}

/** Persistent world/station state belonging to `target` (guest's `guestWorld` or host `state.worldState`). */
export function worldOf(target = localPlayer(), fallback = state.worldState) {
  const player = playerOf(target);
  if (player && player.guestWorld) return player.guestWorld;
  if (player && player === localPlayer()) return state.worldState;
  return fallback;
}

/** Canonical mission/crate/wave owner id: `"host"` for local/unknown, or the visitor's `guestId`. */
export function ownerOf(target = localPlayer()) {
  const player = playerOf(target);
  if (player && player.guestId) return player.guestId;
  return "host";
}

/** Pilot record matching canonical `owner` id (`"host"` -> local pilot, guestId -> matching guest). */
export function playerByOwner(owner = "host") {
  if (!owner || owner === "host") return localPlayer();
  return state.players.find(p => p && p.guestId === owner) || null;
}

/** World/station record matching canonical `owner` id (`"host"` or guestId). */
export function worldByOwner(owner = "host", fallback = state.worldState) {
  const player = playerByOwner(owner);
  if (player && player.guestWorld) return player.guestWorld;
  return fallback;
}

/**
 * Record where the local pilot is right now, so the next load puts them back
 * there. Null while docked (or dead): loading then opens the station menu.
 * Inside a temporary run this is the pilot's own spot in it, so logging out
 * mid-rift comes back mid-rift; `captureInstances()` keeps the run itself alive.
 */
export function captureResume() {
  const P = localPlayer();
  if (!P || P.docked || P.dead) {
    state.worldState.resume = null;
    return null;
  }
  state.worldState.resume = { pos: P.pos.toArray(), quat: P.quat.toArray(), sh: P.sh, en: P.en };
  return state.worldState.resume;
}

/**
 * Snapshot every live temporary run into the world record (save v20). A run keeps
 * what a rebuild cannot work out for itself — its identity, its clock, whether its
 * objective is met, what is still inside its prize and the spot it was entered
 * from. The seed reproduces the rest, so one saved run always comes back as the
 * same run: same guardians, same rocks, same reward.
 */
export function captureInstances() {
  const runs = [];
  for (const record of state.instances.values()) {
    if (!record || record.gone || record.expired) continue;
    runs.push({
      id: record.id,
      template: record.template,
      seed: record.seed >>> 0,
      tier: record.tier,
      origin: record.origin,
      lifetime: Math.max(0, Number(record.lifetime) || 0),
      totalLifetime: Math.max(0, Number(record.totalLifetime) || 0),
      warned: !!record.warned,
      objectiveMet: !!record.objective?.met,
      mined: Math.max(0, Math.floor(Number(record.mined) || 0)),
      entry: record.entry
        ? {
            pos: record.entry.pos.toArray(),
            quat: record.entry.quat.toArray(),
            sh: record.entry.sh,
            en: record.entry.en,
          }
        : null,
      // The prize is saved as it stands — what the pilot has traded out of it stays out of it. Its
      // live form is a stock map (`{ itemId: count }`, the shape every container uses); the saved
      // form is the list of stacks slice 14b defined, and `restoreInstance` reads it back.
      ...(record.cache
        ? {
            cache: {
              stock: Object.keys(record.cache.stock || {}).map(i => ({ i, c: record.cache.stock[i] })),
              open: !!record.cache.open,
            },
          }
        : {}),
    });
  }
  state.worldState.instances = runs;
  return runs;
}

/**
 * Snapshot every live simple wormhole into the world record (save v21). A wormhole is the pocket
 * it spawned in plus the clock that runs from that spawn; the instance behind it is saved by
 * `captureInstances()`. Doomed (collapsed) wormholes only exist while somebody is still in them —
 * the wormhole module removes the others as soon as their clock ends — so whatever is live is
 * worth saving. The seed rebuilds the rest.
 */
export function captureWormholes() {
  const out = [];
  for (const record of state.wormholes.values()) {
    if (!record) continue;
    out.push({
      id: record.id,
      parent: record.parent,
      template: record.template,
      seed: record.seed >>> 0,
      tier: record.tier,
      lifetime: Math.max(0, Number(record.lifetime) || 0),
      totalLifetime: Math.max(0, Number(record.totalLifetime) || 0),
      doomed: record.doomed === true,
    });
  }
  state.worldState.wormholes = out;
  return out;
}

/**
 * Build a save-safe profile/world pair that restores any cursor-held inventory
 * stack back into its source container without cancelling an active live drag.
 */
function withHeldStackRestored(profile, world, held) {
  if (!held || !held.id || !(held.n > 0)) return { profile, world };
  const p = JSON.parse(JSON.stringify(profile));
  const w = JSON.parse(JSON.stringify(world));
  const putBack = (stock, slotMap, key, slotIdx) => {
    if (!stock) return;
    stock[held.id] = (stock[held.id] || 0) + held.n;
    if (slotMap && Array.isArray(slotMap[key])) {
      const list = slotMap[key];
      const idx = Number.isInteger(slotIdx) && slotIdx >= 0 ? slotIdx : -1;
      if (idx >= 0) {
        while (list.length <= idx) list.push(null);
        if (list[idx] === null) list[idx] = [held.id, held.n];
        else if (Array.isArray(list[idx]) && list[idx][0] === held.id) list[idx][1] += held.n;
        else list.push([held.id, held.n]);
      } else {
        list.push([held.id, held.n]);
      }
    }
  };
  if (held.kind === "station" && held.stationKey) {
    w.stationStores = w.stationStores || {};
    const stock = w.stationStores[held.stationKey] || (w.stationStores[held.stationKey] = {});
    putBack(stock, w.stationSlots, held.stationKey, held.slot);
  } else if (held.kind === "cache" && held.instanceId) {
    const run = Array.isArray(w.instances) ? w.instances.find(r => r.id === held.instanceId) : null;
    if (run) {
      run.prize = run.prize || {};
      run.prize[held.id] = (run.prize[held.id] || 0) + held.n;
    } else {
      const ship = held.ship && p.holds?.[held.ship] ? held.ship : p.ship;
      if (ship) {
        p.holds = p.holds || {};
        putBack(p.holds[ship] || (p.holds[ship] = {}), p.holdSlots, ship, -1);
      }
    }
  } else {
    const ship = held.ship && p.holds?.[held.ship] ? held.ship : p.ship;
    if (ship) {
      p.holds = p.holds || {};
      putBack(p.holds[ship] || (p.holds[ship] = {}), p.holdSlots, ship, held.slot);
    }
  }
  return { profile: p, world: w };
}

/**
 * Snapshot the local profile and hosted world as a combined save object.
 * Captures the live resume point and every temporary run first, so every save
 * path — autosave, slot and export code — records where the pilot actually is,
 * including inside a rift (and never drops a stack held on the cursor).
 */
export const isDualModeSave = save => !!(save && typeof save === "object" && save.open && save.campaign);

function captureActiveModeSave() {
  // Step 16 slice 4: **a pilot that is away is not captured from the runtime.**
  //
  // Its record is frozen, not idle. `checkOut` emptied its station stocks into the
  // suitcase, and the suitcase — not this runtime — is the only copy of what travelled.
  // The three captures below all fold LIVE facts into the save (where the ship is, what is
  // on its racks, a stack held on the cursor), and every one of them would either stamp
  // cargo that the suitcase also holds into the frozen record (L15: items moved, never
  // copied) or record a resume point for a pilot that is not here. Cycling a mode,
  // switching save slots or autosaving while visiting must hand the record through
  // unchanged, marker and all.
  if (state.away) {
    return {
      v: SAVE_VERSION,
      profile: state.guestHome?.profile || state.profile,
      world: state.guestHome?.worldState || state.worldState,
      away: cleanAway(state.away),
    };
  }
  captureResume();
  captureInstances();
  if (state.mode !== "campaign") captureWormholes();
  else state.worldState.wormholes = [];
  state.worldState.destination = state.ui.destination;
  const { profile, world } = withHeldStackRestored(state.profile, state.worldState, state.ui.invHeld);
  return {
    v: SAVE_VERSION,
    profile,
    world,
    // v29: where this pilot is. It is a fact about the pilot and the save, so it is
    // copied here rather than read from a runtime flag: a save made while the pilot
    // is visiting somebody must still say so when it is loaded again.
    away: cleanAway(state.away),
  };
}

export function currentSave() {
  return captureActiveModeSave();
}

const cloneModeSave = save => JSON.parse(JSON.stringify(save));

/** Snapshot both mode records. The active half is captured exactly as
 * `currentSave()` captures it; before either half leaves this function, the
 * inactive mode is synced to the active pilot. The two modes keep their own
 * world overlay (ship choice/locations, home, missions and flags), while the
 * fleet, cargo and hull records stay one pilot. */
export function currentRootSave() {
  const mode = state.mode === "campaign" ? "campaign" : "open";
  const other = mode === "open" ? "campaign" : "open";
  const modes = state.savedModes && typeof state.savedModes === "object" ? { ...state.savedModes } : {};
  modes[mode] = captureActiveModeSave();
  modes[other] = modes[other] && typeof modes[other] === "object" ? modes[other] : freshModeSave(other);
  modes[mode] = cloneModeSave(modes[mode]);
  modes[other] = cloneModeSave(modes[other]);
  // Each mode owns its pilot. The open world's fleet, credits and cargo do not
  // travel into a campaign act, and an act's rewards do not leak back.
  state.savedModes = { open: modes.open, campaign: modes.campaign };
  return { v: SAVE_VERSION, mode, open: modes.open, campaign: modes.campaign };
}

/** Produce a fresh dual-mode save for boot/reset. */
export function newRootSave() {
  const open = newSave();
  const campaign = newCampaignSave();
  return { v: SAVE_VERSION, mode: "open", open, campaign };
}

/** A full reset: BOTH modes wiped (the Saves tab's promise is "Wipe credits,
 * ships, base and contracts"), staying in the mode the pilot pressed Reset
 * from. The old per-mode wipe left the other mode's pilot — credits, ships,
 * the lot — alive, which read as "reset does not reset". */
export function resetAllSave() {
  const root = newRootSave();
  root.mode = state.mode === "campaign" ? "campaign" : "open";
  return root;
}

/** A fresh nested save for one half of the envelope. Exposed for root-aware preparation. */
export const freshModeSave = newModeSave;

/** Persist both mode halves in the active browser slot. */
export function saveCurrentGame() {
  if (state.away) return null;
  return saveAutosave(currentRootSave());
}

function installNestedSave(save) {
  state.ui.invHeld = null;
  state.profile = save.profile;
  state.worldState = save.world;
  // A pilot with a marker is visiting another world: its home copy is frozen until
  // it comes back through the suitcase (net/multiplayer.js). Every save older than
  // v29 has no marker and loads as "at home".
  state.away = cleanAway(save.away);
  if (!state.away) state.guestHome = null;
  // Chart presentation belongs to this runtime session, not a loaded save.
  state.ui.starmapMemory = null;
  state.ui.destination = save.world.destination || null;
  state.place = save.world.place || DEFAULT_PLACE;
  const local = localPlayer();
  if (local) {
    local.profile = state.profile;
    local.ship = state.profile.ship;
    local.weapon = state.profile.pw;   // "1" or "2" — the selected primary bay
    local.missileStock = state.profile.msl;
    local.place = state.place;
  }
  return save;
}

/** Install a validated nested mode save, or the selected half of a dual-mode root save. */
export function applySave(save) {
  if (isDualModeSave(save)) {
    const mode = save.mode === "campaign" ? "campaign" : "open";
    const other = mode === "open" ? "campaign" : "open";
    // The two halves are independent saves: each keeps its own pilot and world.
    save = { ...save, open: cloneModeSave(save.open), campaign: cloneModeSave(save.campaign) };
    state.mode = mode;
    state.savedModes = { open: save.open, campaign: save.campaign };
    return installNestedSave(save[mode]);
  }
  if (!state.savedModes || typeof state.savedModes !== "object") {
    state.savedModes = state.mode === "campaign" ? { campaign: save } : { open: save };
  } else {
    state.savedModes = { ...state.savedModes, [state.mode]: save };
  }
  return installNestedSave(save);
}

export const state = {
  profile: newProfile(),
  worldState: newWorld(),
  galaxy: null,         // resolved geography (session only; never saved)
  mode: "open",          // which independent progress half is active: "open" or "campaign"
  savedModes: null,      // the prepared inactive half of the dual-mode browser save
  galaxyRecovery: null, // { from, to } when a removed pocket required safe recovery
  away: null,           // v29: the marker while this pilot is visiting another world, else null
  multiplayer: false,   // step 16: true while this browser hosts/visits a world, so the card does not pause it
  guestHome: null,      // slice 8c (runtime only, never saved): { place, worldPlace } where this pilot was before visiting, so Go home can restore the sky (choice A: not persisted across reload — reload is a fresh start)
  players: [],         // player records, including their own controls
  localPlayerIndex: 0,  // which player this screen and its input follow
  // Step 16 slice 8a (playtest 23): the **mirror** of every other pilot this screen is drawing —
  // `[{ k: "p", id, name, ship, place, pos, quat, hull, shield, dead }]`, written wholesale once a
  // frame by `render/views.js` and read by `sim/targeting.js` (F, the N-list rows) and the HUD
  // (the lock's name and its hull/shield bars). It exists because a guest has no record for a
  // friend to lock: the only place a friend exists on that screen is the pose that was drawn. It
  // is never written back into a pilot, never saved, and never read by a rule — presentation only.
  otherPilots: [],
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
  aimOrigin: null, // camera origin for exact reticle picking, runtime only
  aimDirection: { x: 0, y: 0, z: -1 }, // last rendered camera direction, supplied by the frame loop
  /**
   * **What this browser's pilot is asking its ship to do, for the wire** (step 16 slice 8b).
   *
   * `core/input.js` is the only writer: it copies the local control record here at the end of
   * `syncControls()`, so a session can read one plain object without importing `core/` (the layers
   * point one way: `sim/` may not reach up, and `net/` may not either). Same shape as
   * `state/controls.js`'s `neutralControls()`, always fully populated, and it means nothing on a
   * screen that is not hosting or visiting — a guest sends it to the host, which writes it into its
   * own record of that pilot. See `data/multiplayer.js` `CONTROLS` for the rate and the stale rule.
   */
  localInput: neutralControls(),
  paused: false,
  time: 0,             // seconds of unpaused play
  // A line to prepend to the next death notice, or null. An instance's expiry says why the pilot
  // died ("The rift collapsed with your ship inside it.") before the ordinary death sentence.
  // Runtime only: never saved, and always consumed by the death it was set for.
  deathNotice: null,
  place: DEFAULT_PLACE,     // id from data/places.js: the pocket the local pilot is flying in
  // The local pilot's warp. Like state.flight, this is a compatibility alias;
  // every pilot owns their own warp on the player record.
  get warp() { const p = localPlayer(); return p ? p.warp : pendingWarp; },
  set warp(w) { const p = localPlayer(); if (p) p.warp = w; else pendingWarp = w; },
  places: new Map(),        // place id -> { id, loaded, entities } runtime containers (session only)
  // Temporary instances (step 14): instance place id -> { template, seed, tier, origin, entry,
  // lifetime, objective, exit, cache }. Session runtime only in slice 14a; slice 14b saves the one
  // the local pilot is inside so a run survives a quit.
  instances: new Map(),
  // Simple wormholes (slice 14c): spawned pocket id -> { id, parent, template, seed, tier,
  // lifetime, totalLifetime, doomed }. The pocket IS saved (it carries the 20-minute clock), so a
  // reload finds the wormhole still hanging in its system with the time it had left.
  wormholes: new Map(),

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
    campaign: false,   // the campaign chapter screen on the title (session only)
    campaignEnd: null, // "accomplished" | "failed" while an act's end card stops the world
    campaignChapter: null, // chapter id opened on the campaign screen (null = chapter boxes)
    controlHold: null, // the live control-lesson hold, published by sim/campaign-flight.js
    followDistance: null, // metres to the story ship while a chase reports it
    chaseRun: null, // the live run: { mission, gathering, gap, gather, maxGap }
    navigation: false, // the in-flight N pocket-object list; false while closed
    starmap: null,     // active chart; null while closed
    cargo: null,       // the in-flight ship inventory; null while closed
    cache: null,       // the rift-cache trade (ui/cache.js); null while closed
    multiplayer: false, // the multiplayer screen (ui/multiplayer.js); a modal while open
    // Raised only by a press on Open World, and only when the copy in a friend's world is
    // newer (owner, playtest 18 — before that, being away replaced the whole menu). Session
    // only: a reload is a fresh menu, and the marker itself is on the save.
    awayCard: false,
    // ...and whether that world holds newer work than this galaxy does. It changes what the
    // card SAYS, not whether it appears (owner, playtest 20: the press always asks).
    // Step 16 slice 5: the connection to the host is gone (`{ hostName, reason }`), so the
    // main menu carries "Lost connection to host" until the player dismisses it. Raised by the
    // connection (`mp-host-left`), never by a press, and cleared by its one button — it is
    // news, and news does not need asking for.
    lostHost: null,
    starmapMemory: null, // last chart presentation, session-only and never saved
    destination: null, // system id or { pocketId }, saved with the local world
    tab: "l",          // right station panel: l missions (accept), i inventory, b base, s saves
    leftPanel: "m",    // left station window: o outfitting, p shop, m mission log, or null
    invShip: null,     // the ship whose hold the Inventory tab shows (null = the one being flown)
    invView: "inv",    // docked Inventory sub-tab: "inv" (station & ship slots) or "assets" (My Assets)
    cargoView: "hold", // in-flight I sub-tab: "hold" (ship slots) or "assets" (My Assets)
    assetsOpen: {},    // expanded station pocket ids in My Assets (session-only)
    assetShipsOpen: {}, // expanded "placeId::shipId" ship cargo rows in My Assets (session-only)
    assetsSearchOpen: false, // whether the My Assets search box is expanded (session-only)
    assetsQuery: "",   // active My Assets prefix-search string (session-only)
    invHeld: null,     // stack currently held on the cursor (session-only; restored on close/save)
    shopOpen: {},      // expanded group/subgroup keys in the compact Shop tab (session-only)
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
      // Step 14: `rifts` are the wormhole doors floating in a pocket, and inside an instance `gates`
      // are the way out (its own portal object) and `caches` the canister holding the prize. All
      // three are plain records, drawn by render/views.js and lockable with F.
      entities: {
        enemies: [], asteroids: [], crates: [], bullets: [], missiles: [], fx: [],
        rifts: [], gates: [], caches: [],
      },
    };
    state.places.set(id, container);
  }
  return container.entities;
}

/** Forget every runtime place container (used when a whole save is replaced). */
export function resetPlaces() {
  state.places.clear();
  state.place = DEFAULT_PLACE;
  clearInstances();
  clearWormholes();
}

/** The runtime record of the instance a place id belongs to, or null for an ordinary pocket. */
export function instanceAt(id) {
  return (typeof id === "string" && state.instances.get(id)) || null;
}

/** The runtime record of the simple wormhole a pocket id belongs to, or null for an ordinary
 *  pocket. A wormhole record is the *door's* timer and parent system — the instance behind it is a
 *  separate record in `state.instances`. */
export function wormholeAt(id) {
  return (typeof id === "string" && state.wormholes.get(id)) || null;
}

/** True while this id is the pocket of a simple wormhole, live or faded. */
export function isWormholePocket(id) {
  return !!wormholeAt(id);
}

/** True while this pilot is inside a temporary instance rather than a pocket of the map. */
export function insideInstance(player = localPlayer()) {
  const P = player || localPlayer();
  return !!instanceAt(P ? P.place || state.place : state.place);
}

/** Drop every runtime instance record and its place registration (a load, a reset). */
export function clearInstances() {
  if (state.instances.size) state.instances.clear();
  clearInstancePlaces();
}

/** Drop every runtime wormhole record and its pocket registration (a load, a reset). */
export function clearWormholes() {
  if (state.wormholes.size) state.wormholes.clear();
  clearWormholePlaces();
}
