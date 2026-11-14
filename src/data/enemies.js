// Enemies: every hostile that can spawn, keyed by a string id.
//
// An enemy is a data entry. `sim/ai.js` spawns it with `spawnEnemy(id, pos)` and
// runs the behaviour its `ai` field names; nothing about one enemy is written in
// code. Adding a second enemy is a new entry here plus (if it needs a completely
// new way of fighting) one behaviour function in `AI_BEHAVIOURS` in `sim/ai.js`.
//
// Keys (short, like the other data tables):
//   n          name, shown on the HUD's target lock
//   pl         plural name, used in contract wording ("Destroy 3 pirate raiders")
//   hp         Hull HP (no shields: enemies have no shield pool)
//   col        hull colour, see `mkShip` in render/models.js
//   scale      model scale
//   f          faction id from data/factions.js
//   ai         behaviour id from AI_BEHAVIOURS in sim/ai.js ("chase" today)
//   turn       how fast it swings around to face you (per-second slerp factor)
//   spdFar     speed closing in from far away (m/s)
//   spdNear    speed once it is near the player (m/s)
//   spdOrbit   speed it slides sideways with while circling (m/s)
//   circleAt   distance (m) at which it stops closing in and starts circling
//   fireRange  distance (m) it will open fire at
//   lostRange  distance (m) beyond which it is removed from the game
//   hearRange  distance (m) its shots are close enough to make a sound
//   fireDelay  seconds after it arrives before it may fire the first shot
//   fireGap    [min, max] seconds between shots
//   dmg        damage a shot
//   bspd       bullet speed (m/s)
//   spawnDist  [min, max] distance (m) a new one appears at
//   loot       what it leaves behind: a table id from data/loot.js
//
// `npm test` (tests/content.test.mjs) fails if an entry is missing a field or
// names a faction that does not exist.

export const ENEMIES = {
  raider: {
    n: "Newbie Raider",
    pl: "pirate raiders",
    hp: 10,
    col: 0x3a2420,
    scale: 1.2,
    f: "pirates",
    ai: "chase",
    turn: 1.4,
    spdFar: 125,
    spdNear: 25,
    spdOrbit: 45,
    circleAt: 260,
    fireRange: 750,
    lostRange: 4000,
    hearRange: 600,
    fireDelay: 2,
    fireGap: [0.4, 0.8],
    dmg: 1,
    bspd: 520,
    spawnDist: [800, 1000],
    loot: "raider",
  },

  // A smuggler's escort in a smuggling site (step 14c): a gun for hire working the smugglers'
  // route. Its own hostile — not a raider — so a hunt contract for the map's pirates is never paid
  // by a fight the contract never asked for, the same rule the rift guardians follow.
  // Tunable.
  smuggler: {
    n: "Smuggler",
    pl: "smugglers",
    hp: 12,
    col: 0x332e2a,             // worn charcoal: a working gun, not a raider's chrome
    scale: 1.15,
    f: "pirates",
    ai: "chase",
    turn: 1.5,
    spdFar: 120,
    spdNear: 24,
    spdOrbit: 44,
    circleAt: 240,
    fireRange: 720,
    lostRange: 9000,           // a closed pocket: nothing in it is ever far enough to drop
    hearRange: 600,
    fireDelay: 1.6,
    fireGap: [0.4, 0.8],
    dmg: 1,
    bspd: 510,
    spawnDist: [700, 1100],    // spawned by the site's wave, never by a wanderer
    loot: "smuggler",
  },

  // A smuggler's escort: raiders fly with them, so the escort can stay a raider. This is the
  // prize of the smuggling site (step 14c): a slow, tough freighter hauling illegal goods, armed
  // only enough to be in the way. It never flees and never surrenders — it is in the way and it
  // shoots back. Tunable.
  freighter: {
    n: "Smuggling Freighter",
    pl: "smuggling freighters",
    hp: 46,
    col: 0x2b2b30,             // dull gunmetal: a working smuggler's ship, not a raider's chrome
    scale: 2.1,
    f: "pirates",
    ai: "chase",
    turn: 0.9,
    spdFar: 55,
    spdNear: 16,
    spdOrbit: 18,
    circleAt: 380,
    fireRange: 600,
    lostRange: 9000,           // a closed pocket: nothing in it is ever far enough to drop
    hearRange: 650,
    fireDelay: 2.5,
    fireGap: [0.9, 1.6],
    dmg: 2,
    bspd: 500,
    spawnDist: [400, 600],     // spawned by the site's wave, never by a wanderer
    loot: "freighter",
  },

  // The hostile that holds a hive-type wormhole site (step 14c): the same shape of fight as a
  // rift guardian — heavier than the map, quick to turn, defending something — and it pays well
  // for it. That is the whole reward there: no canister hangs in a hive (owner, 2026-11-14).
  // Tunable.
  hiveguardian: {
    n: "Hive Guardian",
    pl: "hive guardians",
    hp: 26,
    col: 0x39421e,             // hive umber-green: organic, not rift metal
    scale: 1.5,
    f: "rift",
    ai: "chase",
    turn: 1.9,
    spdFar: 145,
    spdNear: 38,
    spdOrbit: 58,
    circleAt: 230,
    fireRange: 720,
    lostRange: 9000,           // a closed pocket: nothing in it is ever far enough to drop
    hearRange: 720,
    fireDelay: 1.2,
    fireGap: [0.45, 0.85],
    dmg: 2.2,
    bspd: 580,
    spawnDist: [800, 1200],
    loot: "hiveguardian",
  },

  // The hostiles that hold a rift shut (step 14). They used to *be* raiders, so the target lock
  // read "Newbie Raider", a hunt contract was paid by a rift run, and the fight was the tutorial
  // fight wearing a harder multiplier (owner bug report 2026-11-14). They are their own hostile
  // now: their own name, hull, numbers and drop. The numbers are the ones the playtested wave
  // already had — a raider's 10 Hull HP and 1 damage a shot, times the rift's 1.6 / 1.5 — so
  // changing who they are did not change how hard they hit.
  riftguardian: {
    n: "Rift Guardian",
    pl: "rift guardians",
    hp: 16,
    col: 0x6d2f10,             // ember hull, lit from inside by the rift: no pirate red on it
    scale: 1.15,
    f: "rift",
    ai: "chase",
    turn: 1.8,                 // it is defending a pocket, not running a raid: it swings round fast
    spdFar: 140,
    spdNear: 34,
    spdOrbit: 55,
    circleAt: 220,
    fireRange: 700,
    lostRange: 9000,           // a rift is a closed pocket: nothing in it is ever far enough to drop
    hearRange: 700,
    fireDelay: 1.4,
    fireGap: [0.5, 0.9],
    dmg: 1.5,
    bspd: 560,
    spawnDist: [800, 1100],
    loot: "riftguardian",
  },

  // The deeper collapse's guardian: the same shape of fight, heavier — 10 Hull HP and 1 damage
  // times that run's 2.2 / 2, which is what the deep rift's wave already did.
  deepguardian: {
    n: "Deep Rift Guardian",
    pl: "deep rift guardians",
    hp: 22,
    col: 0x3d1552,             // void violet: the rare ore's colour, so the deep run reads colder
    scale: 1.4,
    f: "rift",
    ai: "chase",
    turn: 2,
    spdFar: 155,
    spdNear: 40,
    spdOrbit: 62,
    circleAt: 240,
    fireRange: 780,
    lostRange: 9000,
    hearRange: 760,
    fireDelay: 1.1,
    fireGap: [0.45, 0.8],
    dmg: 2,
    bspd: 600,
    spawnDist: [900, 1300],
    loot: "deepguardian",
  },
};

/** What the spawner falls back to when nothing else says otherwise. */
export const DEFAULT_ENEMY = "raider";

/** The def for `id`, falling back to the default enemy (an unknown id never crashes a spawn). */
export const enemyDef = id => ENEMIES[id] || ENEMIES[DEFAULT_ENEMY];
