// The mining beam and secondary weapons (right click). Guns are modules now: see
// cannon_basic in data/modules.js for damage, fire rate, bullet speed and the
// power they draw while firing.

export const PRIMARY = {
  beam: {
    n: "Mining beam",
    range: 340,          // metres
    rate: 4,             // ore per second before the ship's mine multiplier
    price: 900,
  },
};

export const MISSILE = {
  price: 1500,
  startStock: 8,        // missiles included with the launcher
  unitPrice: 35,        // restock price per missile
  cap: 12,              // max missiles carried
  sp0: 140,             // launch speed
  max: 480,             // top speed
  acc: 300,             // acceleration
  life: 7,              // seconds before it self-destructs
  turn: 5.5,            // homing turn rate
  dmg: 80,
  cd: 0.9,              // seconds between launches
  range: 2500,          // lock-on range
  lock: 2.34,           // seconds inside the ring to acquire a lock
  cone: 20,             // lock cone half-angle (degrees)
};

export const SHOP_WEAPONS = {
  beam: {
    n: "Mining beam",
    d: "Primary. Cuts ore from asteroids. Press 2 in flight to equip it.",
    price: PRIMARY.beam.price,
  },
  msl: {
    n: "Missile launcher",
    d: "Secondary. Keep a hostile inside the dashed ring to lock on, or fire without a lock. Includes 8 missiles.",
    price: MISSILE.price,
  },
};
