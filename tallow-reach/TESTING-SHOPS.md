# Testing: the Shop (refactor step 5)

Built file: `tallow-reach/game/tallow-reach.html`. **Run `npm run build` first**, then `npm test`
(which should say **131 passing**). Open the built file in your browser. If the intro is showing,
click **Enter the hangar**.

You need credits. A new game has 600 cr, which is enough for everything here; the beam and the
missiles need 2400 cr, so sell some ore first if you want to try those two.

## What changed, in one line

The Shop is now **data** (`src/data/shops.js`) and one purchase serves every counter — and, as you
asked, the six standard parts are now on sale for **1 cr** each so a part can always be bought back.
Nothing else about the game changed.

## 1. The Shop still looks and behaves the way it did

1. Click **Shop**. The heading is still **Weapons shop** and the same explanatory line is under it.
2. The first line is still **Autocannons — Primary. Standard issue. — Owned**.
3. The next two rows are exactly as before: **Basic mining beam**, 2 m³, **Buy 900 cr**; and
   **Basic missiles**, 2 m³, **Buy 1500 cr**. With a new game's 600 cr both buttons are greyed out.
4. Buy the beam (if you have 900 cr). A green message reads
   **Basic mining beam in the station inventory. Fit it in a primary bay to use it.**
   The row now says **You own 1.** and the button is still there. Buy it twice more: you own 3 and
   your credits went down by exactly 2700.
5. Buy **Basic missiles** once. The message ends **8 missiles included.** and the HUD in flight
   shows `missiles 8`. Buy a second pod: this time there is no "8 missiles included", and the count
   stays 8 (a purchase tops the rack up, it never takes missiles away).

## 2. The six standard parts are on sale for 1 cr (the new rows)

1. Below the missiles you now see six more rows, each **Buy 1 cr**:
   **Basic powerplant** (3 m³), **Basic power cell** (3 m³), **Basic thrusters** (4 m³),
   **Basic shields** (3 m³), **Basic cannons** (2 m³), **Basic hull** (4 m³).
2. They do **not** say "You own N" — that count would have included the parts fitted to ships you
   have not bought.
3. Buy **Basic powerplant** for 1 cr. The message is
   **Basic powerplant in the station inventory. Fit it in a power bay to use it.**
   Your credits went down by 1, and the Inventory tab's Station box now holds it.
4. **The point of these rows:** take something off your ship. In **Outfitting**, open the **Power**
   group and click the powerplant's bin/unequip button, then buy it back here for 1 cr and fit it
   again. A pilot can no longer strand themselves with no powerplant or no hull.

## 3. Nothing else moved

1. **Inventory**: move a part between the Station and a hold as usual; the picker in Outfitting
   still shows how many of a part you have.
2. **Outfitting > Services**: Hull repairs and Missile restock still work and still show their
   prices.
3. **Base, Hangar, Contracts, Saves**: look and behave as before.
4. Fly out, mine, shoot a raider and dock again: nothing about flight, mining or combat changed.

## 4. Old saves

1. **Saves** tab: load the save you were playing before this update (or an exported code).
   It opens normally, with the same credits, ships and stock; the save version is still 12.
2. Nothing about a save changed in this step, so an old save is *not* converted — it just works.

## What to tell me

- Did the Shop show the six new 1-cr rows, and did buying one put it in the station?
- Did the beam and missile messages match the wording above?
- Anything else in the three checks above that looked different from before.

## Not built yet (deliberately, and recorded in the docs)

- **Restocking.** A row can be made to run out (`max: 3` in `src/data/shops.js`) and the screen will
  show `N left` and grey the button out at zero, but **no shop row uses it yet** and nothing
  restocks. A restock timer, event or random roll later calls `setShopStock()` in `sim/economy.js`;
  how much is left is session state, not saved. Say the word when you want that built.
- A second trader or station shop: the code takes a shop id everywhere, so it is a data entry plus
  pointing the counter at it. There is only one station today.
