// Modules that go in the Outfitting bays. The basic set below is fitted to
// every hull from the start; nothing else is sold yet (the shop sells the
// beam and the missiles).
//
//   g       the module group it fits (an id from data/outfitting.js)
//   n       name, shown in the bay and (later) in the shop
//   vol     m³ the part takes up in a ship's hold or in the station's storage
//           (a fitted part takes no space; only parts being carried or stored do)
//   d       one line
//   mjps    powerplant: energy made per second
//   mj      power cell: energy it holds when full
//   spd     thruster: top speed in m/s (boost is 2x, as it always was)
//   turn    thruster: turn rate multiplier
//   draw    thruster: MJ/s used while the throttle is off centre (any amount)
//   boost   thruster: extra MJ/s used while the boost is actually burning
//   ign     thruster: MJ spent once, each time the boost lights
//   bmax    thruster: boost fuel units the tank holds
//   buse    thruster: boost fuel units burned per second while boosting
//   bfill   thruster: boost fuel units the tank regains per second
//   dmg     primary: damage per shot, before the hull's dmg multiplier
//   rate    primary: shots per second, per barrel
//   bspd    primary: bullet speed in m/s
//   draw    primary: MJ/s used while the trigger is held
//   barrels primary: linked barrels fired together per shot (default 1)
//   period  beam: seconds of continuous contact per ore (before the hull's mine multiplier)
//   range   beam: metres it reaches
//   cap     secondary: missiles the launcher carries
//   cd      secondary: seconds between launches
//   hp      hull: Hull HP the hull has (no hull module fitted means none at all)
//   sh      shield: Shield HP it holds when full
//   regen   shield: Shield HP per second once it starts recharging
//   delay   shield: seconds without a hit before recharging starts again
//   draw    shield: MJ/s the shields use, flat, all the while they are up
//   drain   shield: Shield HP a second lost when the ship cannot supply `draw`
//
// A module may only have the stats its group uses. When thrusters, shields and
// weapons arrive they add fields here (top speed, Shield HP, damage) and the
// systems that read those fields, the way sim/power.js reads mjps and mj.
//
// Keep the keys short, like the other data tables.

export const MODULES = {
  power_basic: { g: "power", vol: 3, n: "Basic powerplant", d: "Standard reactor.", mjps: 10 },
  cell_basic: { g: "cell", vol: 3, n: "Basic power cell", d: "Standard storage bank.", mj: 100 },
  // The reference drive: 150 m/s and turn 1.2 are the Wasp's old hull figures,
  // so a Wasp with these fitted flies exactly as it did before modules existed.
  // Every hull flies on these now; hull differences come later.
  // 2 MJ/s whenever the throttle is off centre, whatever the setting, and 1 MJ/s
  // more while the boost burns. Lighting the boost is the hungry bit: 20 MJ in one
  // go, like a car ignition. Filling the boost meter again afterwards is free.
  //
  // The boost tank holds 10 units: boosting burns 2 a second (5 seconds of boost
  // from full) and the tank refills at 1 a second when you are not boosting.
  thruster_basic: {
    g: "thruster",
    vol: 4,
    n: "Basic thrusters",
    d: "Reference drive. Sets top speed and turn rate.",
    spd: 150,
    turn: 1.2,
    draw: 2,
    boost: 1,
    ign: 20,
    bmax: 10,
    buse: 2,
    bfill: 1,
  },
  // 10 Shield HP, 1 a second once it starts, and it will not start until the ship
  // has gone 4 seconds without being hit. Keeping the shields up costs a flat
  // 2 MJ/s, whatever they are doing; if the ship cannot supply that, the shields
  // bleed away at 1 point a second until they are flat. No trickle under fire:
  // that is a feature for a later shield module (see sim/shield.js).
  shield_basic: {
    g: "shield",
    vol: 3,
    n: "Basic shields",
    d: "Standard deflectors. Recharges after a lull in the fighting.",
    sh: 10,
    regen: 1,
    delay: 4,
    draw: 2,
    drain: 1,
  },
  // The starting gun: 1 damage a shot and three shots a second per barrel, drawn
  // at 2 MJ/s while the trigger is held. Two linked barrels (barrels: 2) put one
  // twin-linked pair of bolts downrange per shot from whichever primary bay it
  // sits in — the way cannons fired before they were a module. The rate and the
  // power draw are the same as with one barrel; only the bolt count doubled.
  cannon_basic: {
    g: "primary",
    vol: 2,
    n: "Basic cannons",
    d: "Standard autocannons. Twin-linked, one damage a shot, three a second each.",
    dmg: 1,
    rate: 3,
    bspd: 900,
    draw: 2,
    barrels: 2,
  },
  // The mining beam as a module (it replaces the old shop beam): fits either
  // primary bay like a gun, and key 2 puts the ship in beam mode. One ore per
  // `period` seconds of uninterrupted contact with the rock (scaled by the hull's
  // mine multiplier); two seconds without contact and the progress toward the
  // next ore is lost — the count starts over. It draws `draw` MJ/s only while it
  // is cutting. Bought in the Shop, not standard issue.
  beam_basic: {
    g: "primary",
    vol: 2,
    n: "Basic mining beam",
    d: "Standard mining laser. One ore per 4 seconds in continuous contact.",
    period: 4,
    range: 340,
    draw: 2,
  },
  // The hull as a module (it replaces the hull's built-in Hull HP): the
  // fitted module decides how many Hull HP the ship has, exactly like shields.
  // No module in the hull bay means the ship has no Hull HP at all — any
  // hit that reaches the hull then destroys it, because a ship at 0 or fewer
  // Hull HP dies on the first damage that lands. Not a gun, no other stats.
  // Standard issue, like the shields and the cannons.
  hull_basic: {
    g: "hull",
    vol: 4,
    n: "Basic hull",
    d: "Standard armour plating. 10 Hull HP.",
    hp: 10,
  },
  // The missile launcher as a module (it replaces the old shop launcher): fits
  // the secondary bay, fired with right click. The missile itself works the way
  // it always has (data/weapons.js MISSILE); what the module decides is the
  // payload, the stock and the reload — 8 damage a hit, a 12-missile stock
  // bought at the shop, 4 seconds between launches. Bought in the Shop.
  missile_basic: {
    g: "secondary",
    vol: 2,
    n: "Basic missiles",
    d: "Standard missile pod. 8 damage a missile, 12 capacity, 4 seconds between launches.",
    dmg: 8,
    cap: 12,
    cd: 4,
  },
};

// What a hull is delivered with, bay by bay: group id -> module ids in bay
// order. Bays with no entry are delivered empty. Used for new games, for old
// saves that had no loadout, and for a ship bought in the Hangar.
export const STOCK_FIT = {
  power: ["power_basic"],
  cell: ["cell_basic"],
  thruster: ["thruster_basic"],
  shield: ["shield_basic"],
  primary: ["cannon_basic"],     // one gun in the first primary bay, the other left empty
  hull: ["hull_basic"],          // the standard armour, 10 Hull HP
};
