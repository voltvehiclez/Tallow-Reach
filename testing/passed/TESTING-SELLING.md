# Testing: selling modules (spare parts)

Built file: `tallow-reach/game/tallow-reach.html`. **Run `npm run build` first**, then `npm test`
(which should say **141 passing**). Open the built file and click **Enter the hangar** if the intro
is showing. A new game has 600 cr, which is enough for this.

## What changed

Spare modules sell like any other item. A module's catalogue entry now carries a **sell value**:
60% of the shop price, never below 1 credit.

| Part | Shop price | Sells for |
| --- | --- | --- |
| Basic mining beam | 900 cr | 540 cr |
| Basic missiles (pod) | 1500 cr | 900 cr |
| The six standard parts | 1 cr | 1 cr |

A part **fitted in a bay** is still not for sale — it is bolted to your ship, not in a hold.

## 1. Sell a spare part from the Inventory tab

1. Click **Shop**, then buy **Basic mining beam** (900 cr). A green message says it is in the
   station inventory.
2. Click **Inventory**. The **Station** box shows **Basic mining beam x1**.
3. **Right-click** that tile. A small menu appears with **Sell** — it is no longer greyed out, and
   the old "Modules cannot be sold" tooltip is gone.
4. Click **Sell**. A small box opens headed **SELL BASIC MINING BEAM** with an amount field.
   Leave it and click **Sell**. A green message reads **Sold 1 Basic mining beam for 540 cr.** and
   your credits went up by 540, not 900.
5. Buy it again and sell only *some* of a stack (buy 3, sell 2): the box takes a whole number from
   1 to the number you hold, and refuses 0 or too many.

## 2. Sell a whole hold or the whole station (Base tab)

1. The Base tab's buttons now read **Sell hold … cr** and **Sell stored … cr**, and they count
   **ore and spare parts together** — the number on the button is what you will be paid.
2. Put a pod in the station (buy **Basic missiles**), then press **Sell stored**. The message reads
   e.g. **Sold 1 item for 900 cr.** (One part reads "item", several read "items".)
3. In flight, mine a little ore, dock, and press **Sell hold**. Ore **and** any spare parts in that
   ship's hold are sold together.
4. With nothing sellable, the buttons are greyed out; if you somehow press one, it says
   **Nothing in the station can be sold.**

## 3. Things that must NOT happen

1. A **fitted** module is never sold: fit the beam in a primary bay, then press **Sell stored** —
   the station's spare parts are sold, and the fitted beam stays fitted.
2. Your **loaded missiles** are not cargo: selling the missile *pod* takes the pod, and the missile
   count in the HUD stays what it was.
3. The **Refinery** bonus still applies: with a refinery level built, a 900 cr pod sells for 1035.

## What to tell me

- Did right-click **Sell** work on a MOD tile and pay 540 for the beam?
- Did the Base tab's Sell buttons take spare parts along with the ore, and say what they sold?
- Anything that looked wrong or felt off about the values.
