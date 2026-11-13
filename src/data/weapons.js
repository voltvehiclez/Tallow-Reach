// Secondary weapons (right click). Missiles and guns are modules now: see
// missile_basic in data/modules.js for the missile's damage, capacity and reload
// time, and data/shops.js for what a shop sells and charges. The mining beam is a
// module too (beam_basic in data/modules.js); it is not a separate weapon any more.

// How the missile itself works: its flight and lock-on mechanics. What the
// launcher module adds and what the shop sells are separate (data/modules.js).
export const MISSILE = {
  unitPrice: 35,        // restock price per missile
  sp0: 140,             // launch speed
  max: 480,             // top speed
  acc: 300,             // acceleration
  life: 7,              // seconds before it self-destructs
  turn: 5.5,            // homing turn rate
  range: 2500,          // lock-on range
  lock: 2.34,           // seconds inside the ring to acquire a lock
  cone: 20,             // lock cone half-angle (degrees)
};
