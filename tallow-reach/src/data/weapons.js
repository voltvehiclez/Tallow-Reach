// Secondary weapons (right click). Missiles and guns are modules now: see
// missile_basic in data/modules.js for the missile's damage, capacity and reload
// time, and SHOP_WEAPONS for the purchase. The mining beam is a module too
// (beam_basic in data/modules.js); it is not a separate weapon any more.

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

export const SHOP_WEAPONS = {
  beam: {
    n: "Basic mining beam",
    d: "Primary. Cuts ore from asteroids. Fit it in a primary bay, then press 2 in flight.",
    price: 900,
    module: "beam_basic",   // buying it puts the module in storage, not a flag
    bay: "primary",
  },
  msl: {
    n: "Basic missiles",
    d: "Secondary. Lock a hostile inside the dashed ring to guide the missile, or fire unguided. 8 damage, a 12-missile stock, 4 seconds between launches. Includes 8 missiles.",
    price: 1500,
    module: "missile_basic",  // buying it puts the module in storage, like the mining beam
    bay: "secondary",
    startStock: 8,            // missiles included with the module
  },
};
