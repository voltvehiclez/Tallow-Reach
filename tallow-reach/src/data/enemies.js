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
  },
};

/** What the spawner falls back to when nothing else says otherwise. */
export const DEFAULT_ENEMY = "raider";

/** The def for `id`, falling back to the default enemy (an unknown id never crashes a spawn). */
export const enemyDef = id => ENEMIES[id] || ENEMIES[DEFAULT_ENEMY];
