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
| Thrusters | **1 / 1** | **Basic thrusters** — solid bay, `150 m/s` |
| Shields | 0 / 1 | Empty |
| Primary weapons | 0 / 2 | Empty, Empty |
| Secondary weapons | 0 / 1 | Empty |
| Hull | 0 / 1 | Empty |
| Appearance | 0 / 2 | **Primary** and **Secondary** — two dashed paint boxes, side by side, clickable like module bays |

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
6. **Click a paint bay on the Appearance card** (Primary or Secondary). A rectangle opens
   under that card with a heading like `APPEARANCE · PRIMARY`, a **Close** button and the
   message **No colours in storage.** — there are no paints in the game yet, so that is the
   whole list. Clicking the bay again or Close shuts it.
7. With the paint picker open, click a module bay: the paint rectangle closes and the module
   one opens. Only one rectangle is ever open on the screen.

## 4. Unequipping and fitting back

1. With the Powerplant bay open, click **Unequip Basic powerplant to storage**.
2. Expected: a green message at the top of the panel, the bay turns dashed and says
   **Empty**, the card count reads **0 / 1**, and the picker now shows **one square**:
   `Basic powerplant` with `10 MJ/s` under it.
3. Click that square. The part goes back into the bay, the count returns to **1 / 1**, and
   the square disappears (storage is empty again).
4. Try the same with the **Power cells** and **Thrusters** bays: unequip each, see its square,
   fit it back.
5. Unequip power **and** cell, then dock/launch: the ship still flies, the power readout shows
   `No power cell` and `Using 0 of 0 MJ/s`. Fit them back before flying if you want the bar.

## 5. Speed in flight — every hull flies the same

1. Click **Launch** and hold **W** for a few seconds: the bottom-centre speed should settle at
   **150 m/s**, and **Shift** should take it to about **300 m/s**.
2. Turn (mouse held over): about **69 deg/s** at full stick, the same Wasp feel as before.
3. Dock, **Hangar → Fly** the Prospector, launch: the same 150 m/s and the same turn rate. The
   Bulwark too. They are identical on purpose — hull differences come later.
4. Back in Outfitting, **unequip the thrusters** from the Bulwark (or any hull), then launch.
   The ship **cannot move at all**: hold **W**, **S**, **A**, **D**, **Space**, **C**, **Shift**
   or move the mouse and nothing happens. Bottom centre stays `Throttle 0%  0 m/s`, the boost
   bar never drains, and the engines do not glow.
5. Press **W** (or any of those controls): a warning appears in the middle of the screen saying
   **Equip thrusters to move**. Keep holding and it comes back every few seconds; let go and it
   clears. The mouse does it too — push it into a corner.
6. Just after undocking the centre of the screen also says **No thrusters fitted: the ship cannot
   move. Press G to dock and fit one.**, and the small hint line keeps repeating **No thrusters
   fitted: press G to dock and fit one.**
7. Press **G** right away: undocking leaves you only 200 m out, inside docking range, so docking
   works and you can fit the thrusters back in Outfitting.
8. Fit them back and launch: **150 m/s** and normal turning return. No warning appears. Reload
   the page and check the fit stuck.

## 6. Power in flight — the thrusters drink it

1. Click **Launch**. Bottom centre, just above `Throttle 0% 0 m/s`: a **Power cell** bar
   (full, pale blue), **100 / 100 MJ**, and **Using 0 of 10 MJ/s** — you are stopped and the
   boost meter starts full, so nothing is being used.
2. Hold **W**. The readout becomes **Using 2 of 10 MJ/s** and stays there: the thrusters draw
   2 MJ/s whenever the throttle is off centre. Try **S** for reverse, or ease off to 1% — it is
   still 2 MJ/s. Only **X** (throttle exactly 0) drops the draw back to 0. Boost once, let go,
   and at a standstill you will see **Using 1 of 10 MJ/s** until the boost meter has refilled.
3. Hold **Shift** to boost: the draw stays at **2 MJ/s** while the boost is burning, then reads
   **Using 3 of 10 MJ/s** while the meter refills as you fly (2 for flying, 1 for charging), and
   drops to 2 when the meter is full. Each time the boost *lights up* it costs a flat **1 MJ**
   — with the basic plant the bar refills too fast to see, which is fine.
4. The cell stays full at 100 MJ the whole time, because the basic plant makes 10 MJ/s and the
   thrusters only use 2 or 3. That is correct: the cell is a reserve.
5. **Run it dry**: dock (**G**), Outfitting, **unequip the powerplant** (keep the cell), launch
   and hold **W**. The bar falls by 2 MJ a second; when it reaches **0 / 100 MJ** the ship stops
   accelerating and the speed winds down on its own (about 50 m/s → 5 m/s within four seconds).
   The readout keeps saying `Using 2 of 0 MJ/s`: it is asking for power it has not got.
6. With the cells empty, **Shift** does nothing (no boost, no shake, the meter does not drain).
7. Dock and fit the powerplant back: full thrust returns.
8. Narrow the window below about 900 px: the power block lifts above the controls list
   instead of printing over it.

## 7. It survives a reload

1. Unequip the power cell, so storage holds it and the bay is empty.
2. Reload the page (F5) and open **Outfitting** again.
3. The cell bay should still be **Empty**, the picker should still contain the
   `Basic power cell` square, and your credits, ships and contracts should be unchanged.
4. Fit it back, reload again, and confirm it stayed fitted.

## 8. Other ships, and old saves

1. **Hangar → Fly** another hull (or buy one), then **Outfitting**: the new ship comes with
   its own basic powerplant, cell and thrusters fitted, and its own store — storage is shared,
   bays are per ship.
2. If this browser has a save from before this update, it loads with the fitted parts intact,
   **the basic thrusters included** (the bay did not exist before), and an empty store.
   Nothing asks you to start again.
3. Open the browser console (F12): no errors, and no "Too many active WebGL contexts"
   warning while you stay on the Outfitting tab.

## If something looks wrong

Tell me what you clicked, what you expected and what you got. The parts of this update are
`src/sim/fitting.js` (the rules), the bay buttons and picker in `src/ui/screens.js`, the
`slot`/`fit`/`unfit` actions in `src/ui/menu.js`, and `profile.modules` in
`src/state/profile.js`.
