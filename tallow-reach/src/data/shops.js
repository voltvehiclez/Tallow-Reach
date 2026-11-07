// What each shop sells and what it charges. A shop is a list of rows; a row is
// an item id (from data/items.js), a price in credits and, if the shop can run
// out, how many it has.
//
//   n      the shop's name, shown as the screen's heading
//   d      the line of explanation under the heading
//   kit    parts every pilot already has, shown as "Owned". They are not for
//          sale; the line is there so the screen says what the ship flies with.
//   stock  the rows for sale, top to bottom in the order written here:
//            id     item id from data/items.js (a module's stats are in data/modules.js)
//            price  credits for one
//            n, d   how the row is sold: its name and its sales pitch. Kept here,
//                   not in data/modules.js, so a trader can word things its own
//                   way and two shops can price the same part differently.
//            max    OPTIONAL. The most this shop has of the item. Leave it out
//                   and the shop never runs out (that is how Meridian works).
//                   A number means it runs out: the screen shows "N left", the
//                   Buy button greys out at zero, and `buyItem()` refuses.
//            own    OPTIONAL. `false` hides the "You own N" count on the row.
//                   Parts every hull is delivered with need it: the count would
//                   include the stock fit of hulls you have not bought.
//
// **Stock is not saved yet.** How much is left of a limited row lives in
// session state (`state.shops`, `shopStock()` / `setShopStock()` in
// sim/economy.js) and resets when a save is loaded or a new game starts. That is
// deliberate: a restock timer, a restock event or a random roll later only has
// to call `setShopStock()`, and when save step 9 splits the save into profile
// and world, a world's shop stock moves into the world half. Nothing is written
// into the save today, so the save version is unchanged.
//
// A new trader is one entry here plus the shop's id where the player docks.
// Add a row to an existing shop with one line. See docs/HOW_TO_ADD.md recipe 4.

export const SHOPS = {
  meridian: {
    n: "Weapons shop",
    d:
      "Left click fires your primary weapon (keys 1 and 2 switch). Right click fires your secondary weapon. Everything you buy goes into the station inventory, as many as you like: fit it in Outfitting or move it to a ship in Inventory.",
    // Standard issue: every hull is delivered with these fitted, and they are
    // not sold here (the autocannons are shown so the screen says so).
    kit: [{ n: "Autocannons", d: "Primary. Standard issue." }],
    stock: [
      {
        id: "beam_basic",
        price: 900,
        n: "Basic mining beam",
        d: "Primary. Cuts ore from asteroids. Fit it in a primary bay, then press 2 in flight.",
      },
      {
        id: "missile_basic",
        price: 1500,
        n: "Basic missiles",
        d: "Secondary. Lock a hostile inside the dashed ring to guide the missile, or fire unguided. 8 damage, a 12-missile stock, 4 seconds between launches. Includes 8 missiles.",
      },
      // The six standard parts, one credit each: a pilot who takes a powerplant
      // or a hull off a ship (or loses one with the ship) can always buy it back.
      // The two parts above stay at their real prices, so the only things that
      // really cost money at the outpost are the beam and the missile pod.
      {
        id: "power_basic",
        price: 1,
        own: false,
        n: "Basic powerplant",
        d: "Power. Standard reactor: 10 MJ/s for the whole ship.",
      },
      {
        id: "cell_basic",
        price: 1,
        own: false,
        n: "Basic power cell",
        d: "Power. Standard storage bank: holds 100 MJ.",
      },
      {
        id: "thruster_basic",
        price: 1,
        own: false,
        n: "Basic thrusters",
        d: "Thrusters. The reference drive: 150 m/s and 69 deg/s, with a boost tank.",
      },
      {
        id: "shield_basic",
        price: 1,
        own: false,
        n: "Basic shields",
        d: "Shields. Standard deflectors: 10 Shield HP, one a second back after a 4-second lull.",
      },
      {
        id: "cannon_basic",
        price: 1,
        own: false,
        n: "Basic cannons",
        d: "Primary. Standard autocannons. Twin-linked, one damage a shot, three a second each.",
      },
      {
        id: "hull_basic",
        price: 1,
        own: false,
        n: "Basic hull",
        d: "Hull. Standard armour plating: 10 Hull HP.",
      },
    ],
  },
};

/** Every shop id, in the order written above. */
export const SHOP_IDS = Object.keys(SHOPS);

/** What `shopDef()` returns for an id that is not in SHOPS. */
export const DEFAULT_SHOP = SHOP_IDS[0];

/** The shop at the outpost the player docks at. Meridian is the only station
 *  today; when sectors become data (step 10) this becomes a field on the sector. */
export const OUTPOST_SHOP = "meridian";

export const isShop = id => Object.prototype.hasOwnProperty.call(SHOPS, id);

/** A shop's definition, or Meridian's when the id is unknown (a screen never blanks). */
export const shopDef = id => (isShop(id) ? SHOPS[id] : SHOPS[DEFAULT_SHOP]);

/** The row a shop sells item `id` under, or null when this shop does not sell it. */
export const shopRow = (shopId, id) => (shopDef(shopId).stock || []).find(r => r.id === id) || null;
