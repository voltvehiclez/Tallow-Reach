# Testing: Outfitting, modules in bays, and ship power

Built file: `tallow-reach/game/tallow-reach.html` (576 KB). Open it in your browser.
You should already be docked at Meridian Outpost; if the intro is showing, click
**Enter the hangar**.

## 1. The tab is there

1. The tab row reads **Contracts · Hangar · Outfitting · Shop · Base · Saves**. Click
   **Outfitting**.
2. The panel widens to the middle of the screen and your ship appears in a 3D window in the
   centre, turning slowly.
3. Drag to spin it, scroll to zoom, double click to reset.

## 2. The module bays

Four cards on the left, four on the right. Counts and bays:

| Group | Count | What each bay says |
| --- | --- | --- |
| Powerplant | **1 / 1** | **Basic powerplant** — solid bay, `10 MJ/s` |
| Power cells | **1 / 1** | **Basic power cell** — solid bay, `100 MJ` |
| Thrusters | 0 / 1 | Empty |
| Shields | 0 / 1 | Empty |
| Primary weapons | 0 / 2 | Empty, Empty |
| Secondary weapons | 0 / 1 | Empty |
| Hull | 0 / 1 | Empty |
| Appearance | 0 / 2 | Primary, Secondary (paint, still empty) |

## 3. Opening a bay — the new part

1. **Click the Powerplant bay.** A rectangle should open under the card, under the bays and
   above the description. It has a heading `POWERPLANT · BAY 1`, a **Close** button, and
   inside:
   - **No modules in storage.** — because nothing is stored yet
   - **Unequip Basic powerplant to storage** — because that bay is full
2. The open bay itself should light up with a pale blue edge.
3. Click the bay again: the rectangle closes. Click it once more and use **Close**: same thing.
4. Click the **Shields** bay: the picker moves to that card, shows **No modules in storage.**
   and no Unequip button (the bay is empty). Only one picker is ever open.
5. Click an **empty** power bay equivalent on another hull later — same behaviour everywhere.

## 4. Unequipping and fitting back

1. With the Powerplant bay open, click **Unequip Basic powerplant to storage**.
2. Expected: a green message at the top of the panel, the bay turns dashed and says
   **Empty**, the card count reads **0 / 1**, and the picker now shows **one square**:
   `Basic powerplant` with `10 MJ/s` under it.
3. Click that square. The part goes back into the bay, the count returns to **1 / 1**, and
   the square disappears (storage is empty again).
4. Try the same with the **Power cells** bay: unequip it, see the square, fit it back.
5. Unequip power **and** cell, then dock/launch: the ship still flies, the power readout shows
   `No power cell` and `Using 0 of 0 MJ/s`. Fit them back before flying if you want the bar.

## 5. Power in flight

1. Click **Launch**.
2. Bottom centre, just above `Throttle 0% 0 m/s`: a **Power cell** bar (full, pale blue),
   **100 / 100 MJ**, and **Using 0 of 10 MJ/s**.
3. It should not change, because nothing draws power yet. That is correct.
4. Fly back, dock (**G**), unequip the powerplant in Outfitting, launch again: the same bar
   now reads **Using 0 of 0 MJ/s** (no plant). Refit it and the 10 MJ/s comes back.
5. Narrow the window below about 900 px: the power block lifts above the controls list
   instead of printing over it.

## 6. It survives a reload

1. Unequip the power cell, so storage holds it and the bay is empty.
2. Reload the page (F5) and open **Outfitting** again.
3. The cell bay should still be **Empty**, the picker should still contain the
   `Basic power cell` square, and your credits, ships and contracts should be unchanged.
4. Fit it back, reload again, and confirm it stayed fitted.

## 7. Other ships, and old saves

1. **Hangar → Fly** another hull (or buy one), then **Outfitting**: the new ship comes with
   its own basic powerplant and cell fitted, and its own store — storage is shared, bays are
   per ship.
2. If this browser has a save from before this update, it loads with the fitted parts intact
   and an empty store. Nothing asks you to start again.
3. Open the browser console (F12): no errors, and no "Too many active WebGL contexts"
   warning while you stay on the Outfitting tab.

## If something looks wrong

Tell me what you clicked, what you expected and what you got. The parts of this update are
`src/sim/fitting.js` (the rules), the bay buttons and picker in `src/ui/screens.js`, the
`slot`/`fit`/`unfit` actions in `src/ui/menu.js`, and `profile.modules` in
`src/state/profile.js`.
