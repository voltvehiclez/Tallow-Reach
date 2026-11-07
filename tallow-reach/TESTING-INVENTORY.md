# Testing: Inventory, buying several modules, and station and ship room

Built file: `tallow-reach/game/tallow-reach.html`. **Run `npm run build` first** (and `npm test`,
which should say 121 passing). Open the built file in your browser. If the intro is showing, click
**Enter the hangar**. Start from a new game or a save you do not mind changing (Saves tab).

You need credits for this. If you are short, the numbers below assume at least 6000 cr.

## 1. The new tab

1. The tab row now reads **Contracts · Hangar · Outfitting · Inventory · Shop · Base · Saves**.
   Click **Inventory**.
2. At the top you see **Station** with `0 / 250 m³` (or more if you have stored ore) and
   **Empty** if nothing is in it.
3. Below it, a bar with arrows and your ship's name, e.g. **Wasp (flying)**, `1 of 1 in the
   hangar`, then **Wasp hold** with `0 / 20 m³`.

## 2. Buy more than one module (this was the bug)

1. Click **Shop**. Under **Basic mining beam** click **Buy 900 cr**. A green message says it is in
   the station inventory.
2. The row now says **You own 1** and **the Buy button is still there**. Click it twice more.
   You own 3 and your credits went down by 2700 in total.
3. Do the same with **Basic missiles** (1500 cr each). Only the first one adds 8 missiles to your stock.

## 3. Station and ship inventory

1. Click **Inventory**. The Station box lists **Basic mining beam x3** and **Basic missiles x2**,
   each `Module, 2 m³ each`, and the Station reads `10 / 250 m³`.
2. On the beam row click **down-arrow 1**. The Station beams drop to 2, and the **Wasp hold** now shows
   one beam with `2 / 20 m³`.
3. Click **down-arrow all** on the missiles row: both move to the Wasp, hold `6 / 20 m³`.
4. In the Wasp hold click **up-arrow all** on a row: the things return to the Station.
5. Fill the hold: keep moving things until the arrows go grey. They are disabled when the hold has no
   room for even one more of that item (a 2 m³ module needs 2 free m³).

## 4. Equip everything stored in the station

1. Click **Outfitting**, then click the second **Primary weapons** bay (Bay 2, empty).
2. The picker shows **Basic mining beam x3** as one square (if all three are in the station). Click it.
   The bay is now filled and the square says **x2**.
3. Click Bay 1 (the cannon), pick **Basic mining beam** again: the cannon goes back into the station
   and the picker shows it.
4. Anything sitting in a ship's hold (not the station) does not appear in the picker. Move it back
   in the Inventory tab first.

## 5. Ships have their own holds

1. In the Hangar buy a second ship (you need hangar level 2 in Base if you only have the Wasp's berth).
2. In **Inventory** use the arrows to look at the other ship: its hold is empty and shows its own
   size (Bulwark 30 m³, Prospector 70 m³). Move some ore or a module into it.
3. Switch back to the Wasp with the arrows: its hold is unchanged. Looking at another ship does
   not change which ship you fly (the name says **(flying)** only on the one you fly).
4. Click **Hangar** and **Fly** the other ship: no cargo refusal any more. The cargo stays in the ship you left.

## 6. Flying with a loaded hold

1. Launch with a module or two in your hold. The top right says `Hold N/20 m³` and N includes them.
2. Mine ore with the beam: ore stops when the hold is full (modules count).
3. Dock, then **Base**: **Store hold** moves the ore into the station and leaves modules in the hold.

## 7. Limits (the message you should see)

(Optional, it takes a lot of mining by hand; the automated tests already cover it.)

1. Fill the station with ore until it is nearly full (Base: Store hold, repeatedly), then try to buy
   a module in the Shop: the Buy button is greyed and the row says **No room in the station's
   storage**. If you force it, the message says so and no credits are taken.
2. In Outfitting, taking a part off a ship with the station full says **No room in the station**.

## 8. Old saves (this is the new part in step 4)

The save changed shape in this version, so this is the section to do if you only do one.

1. Load a save slot or a code made **before** this update (Saves tab). It loads with no error and
   nothing is lost: the ore you were carrying is in the ship you were flying, the station still has
   its ore **and** its spare parts, credits and fitted modules are untouched.
2. Open **Inventory** and look at the tiles: the same items, in the same order, with the same
   `ORE` / `MOD` labels, the same m³ numbers and the same click behaviour as before.
3. **Base**: the "in hold / stored / cr each" lines and the two Sell buttons show the same credits
   as before.
4. **Shop**: buying the beam and the missiles costs what it did, and the row still counts how many
   you own.
5. If you use an exported code (`TR1:...`), an old one still imports. Note the other way round does
   not work: a save written by this version cannot be opened by an older build, so keep your old
   export somewhere if you might go back.

Under the hood the save is `{ itemId: count }` per place instead of separate ore and part lists.
You should not be able to tell from playing, and that is the point — if you *can* tell, say what
you saw.

## What to tell me

Anything that looks wrong, any button that does nothing, any number that does not add up, and
anything you expected to be able to do here that you cannot.
