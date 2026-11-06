# Testing: Outfitting, the first modules, and ship power

Built file: `tallow-reach/game/tallow-reach.html` (572 KB). Open it in your browser.
You should already be docked at Meridian Outpost; if the intro is showing, click
**Enter the hangar**.

## 1. The tab is there

1. Look at the row of tabs across the top of the outpost panel:
   **Contracts · Hangar · Outfitting · Shop · Base · Saves**.
2. Click **Outfitting**.
3. The panel should widen to the middle of the screen (up to about 1180 px), and a dark
   framed window should appear in the centre with your ship in it, turning slowly.
4. The title in the top-left corner of that window should be your ship's name and its
   one-line description.

## 2. Admiring the ship

1. **Drag** across the ship window with the left mouse button: the ship turns, and it
   stops turning on its own for about three seconds after you let go.
2. Drag **up and down**: the camera looks from lower or higher.
3. **Scroll** while the cursor is over the ship window: the ship gets closer and further
   away, and the panel behind does **not** scroll.
4. **Double click** the window: the view returns to the starting angle.

## 3. The module bays — the power parts are fitted

Around the ship window there are seven module groups, four cards on the left and four on
the right (six groups plus the Appearance card). Check each group's count and what its
bays say:

| Group | Count | What each bay shows |
| --- | --- | --- |
| Powerplant | **1 / 1** | **Basic powerplant** — solid bay, `10 MJ/s` |
| Power cells | **1 / 1** | **Basic power cell** — solid bay, `100 MJ` |
| Thrusters | 0 / 1 | Empty |
| Shields | 0 / 1 | Empty |
| Primary weapons | 0 / 2 | Empty, Empty |
| Secondary weapons | 0 / 1 | Empty |
| Hull | 0 / 1 | Empty |
| Appearance | 0 / 2 | Primary, Secondary (paint, still empty) |

Fitted bays should look **solid** with a slightly lighter background and their number in
pale blue; empty bays stay **dashed** and dim. Order on the right is still
**Primary weapons → Secondary weapons → Hull → Appearance**.

## 4. Power in flight (the new part)

1. Click **Launch** (bottom of the panel).
2. Bottom centre of the screen, just above `Throttle 0% 0 m/s`, there should be:
   - a **Power cell** bar, full, pale blue
   - **100 / 100 MJ** on the right of that line
   - **Using 0 of 10 MJ/s** underneath
3. The bar should stay full and the numbers should not change, because nothing draws
   power yet. That is correct for this update.
4. Fly, fire, mine, take a hit: the power line must not flicker or break (the shield and
   hull bars are the ones that move).
5. Fly back and dock (**G**), then launch again: the cells are full again (the outpost
   fills them).
6. Make the window narrow (below about 900 px wide): the power block should lift itself
   above the controls list in the bottom-left corner instead of printing over it.

## 5. It follows your ship

1. Dock and click **Hangar**.
2. If you own another ship, click **Fly** on it (or buy one you can afford).
3. Click **Outfitting**: the window shows the new hull, and the **Powerplant** and
   **Power cells** cards still read **1 / 1** with the basic parts — every hull is
   delivered with them.
4. Launch: the power bar is still 100 / 100. All three hulls have the same bay layout for
   now; that is deliberate.

## 6. Leaving and coming back, and your old save

1. Click **Launch**, fly, dock again, and click **Outfitting**: the window comes back with
   the same ship.
2. **Old saves keep working.** If this browser has a game from before this update, it
   loads with the basic powerplant and cell already fitted, credited ships and contracts
   untouched. Nothing should ask you to start again.
3. Reload the page (F5): credits, ships, contracts and the fitted parts are all still
   there.
4. Open the browser console (F12): there should be no errors, and no "Too many active
   WebGL contexts" warning while you stay on the Outfitting tab.

## If something looks wrong

Tell me what you clicked, what you expected and what you got. The parts of this update
are `src/data/modules.js` (the two modules), `src/data/outfitting.js` (per-hull bays),
`src/state/profile.js` (saving the fit), `src/sim/power.js` (the power budget) and the
power block in `src/ui/hud.js` / `src/index.html`.
