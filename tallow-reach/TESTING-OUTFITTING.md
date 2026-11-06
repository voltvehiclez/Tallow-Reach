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
| Shields | **1 / 1** | **Basic shields** — solid bay, `10 shields` |
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

## 6. Power in flight — the thrusters and the shields drink it

1. Click **Launch**. Bottom centre, just above `Throttle 0% 0 m/s`: a **Power cell** bar
   (full, pale blue), **100 / 100 MJ**, and **Using 2 of 10 MJ/s** — that is the shields' flat
   2 MJ/s. Keeping them up is never free, whatever they are doing.
2. Hold **W**. The readout becomes **Using 4 of 10 MJ/s** and stays there: 2 for the thrusters
   (any throttle off centre) plus 2 for the shields. Try **S** for reverse, or ease off to 1% —
   still 4. **X** (throttle exactly 0) drops the thrusters' share, leaving **2 MJ/s**.
3. **Light the boost.** Hold **Shift** while flying: after the half-second spool-up the screen
   shakes and the cell bar drops by **20 MJ in one go** (100 → 80), then climbs back at about
   5 MJ a second while you boost. That slug of 20 MJ is the ignition — one big gulp, like
   starting a car.
4. While the boost is actually burning the readout says **Using 5 of 10 MJ/s** (3 for the drive,
   2 for the shields); let go of Shift and it drops back to **4 MJ/s**.
5. **Watch the Boost line**, top left under Shield and Hull. It reads like **`Boost 8.4 / 10`**
   next to the bar: 10 units is a full tank. Hold **Shift** and the number falls **2 a second**
   (about five seconds of boost from full); let go and it climbs back **1 a second**. The bar
   fills as the number does, and the number is the exact fuel left.
6. **Filling the boost tank is free.** Boost once, then stop and watch it refill with the power
   readout at `Using 2 of 10 MJ/s` (shields only) and the cell bar untouched. Nothing is spent on
   refilling the tank.
7. **The boost needs 20 MJ in the cells to light.** Dock, unequip the powerplant (keep the
   cell), launch, fly until the cell bar is below a fifth, then hold **Shift**: nothing happens
   — no shake, no boost — until the cells are back above 20 MJ.
8. The cell stays near full with the basic fit, because the plant makes 10 MJ/s and the ship only
   asks for 2 to 5. That is correct: the cell is a reserve.
9. **Run it dry**: with the powerplant still out, hold **W**. The bar falls by about 4 MJ a
   second; when it reaches **0 / 100 MJ** the ship stops accelerating and the speed winds down on
   its own (about 50 m/s → 5 m/s within four seconds). The shields start to **bleed away** at
   1 point a second, and the readout keeps saying `Using 4 of 0 MJ/s`: it is asking for power it
   has not got. If you stay out long enough for them to reach 0, they stay at 0.
10. Dock and fit the powerplant back: full thrust and shield recharge return. Narrow the window
   below about 900 px and the power block lifts above the controls list instead of printing over
   it.

## 7. Basic cannons in flight

You are delivered with **one** Basic cannons module in the first primary bay (the second
primary bay is empty), so every step below starts from the stock ship.

1. Click **Launch**, then **hold the left mouse button**. Orange bolts leave the ship
   **three a second** (count the muzzle flashes: three pips a second) and the shot sound ticks
   with them. Each bolt does **1 damage**. Let go and they stop at once.
2. **Watch the power readout**, bottom centre. Sitting still it says **Using 2 of 10 MJ/s**
   (the shields). Hold the left button and it says **Using 4 of 10 MJ/s** — 2 more while the
   guns are firing. Let go and it drops back to 2. Hold **W** and fire at the same time and it
   says **6 of 10** (thrusters 2 + shields 2 + guns 2).
3. **Fly at a Newbie Raider** and hold the left button on it. It takes **10 hits** to kill:
   that is its 10 hull points, and it has no shields, so every hit counts. With one gun and
   3 shots a second a raider should die in something over three seconds.
4. **Press F** with a raider near the crosshair. The lock, centre screen, now reads
   **`Locked Newbie Raider 100%`**, and the percentage falls as you hit it (30% = 3 hull points
   left). Previously it said `hostile 100%`.
5. **Move the gun to the other bay.** Dock (**G**), open **Outfitting**, click the first
   **Primary weapons** bay (it reads `Basic cannons` / `1 dmg, 3/s`), then click
   **Unequip Basic cannons to storage**. Now click the **second** bay and click the
   **Basic cannons** square. Launch and hold left click: it still fires exactly as before, only
   from the other side of the nose. Either bay works the same way.
6. **Take the gun off entirely.** Dock, unequip it from both bays, launch and hold left click:
   nothing happens, no sound, and the power readout stays at **2 of 10 MJ/s**. Left click is
   silent with no guns fitted. The line at the top right of the screen changes too: `Cannons`
   while the gun is fitted, `No guns` once both bays are empty (and `Cannons x2` if you ever have
   both bays filled).
7. **Run the guns dry.** Dock, unequip the **powerplant** (keep the power cell), fit the cannon,
   launch, then hold left click until the cell bar reaches 0 (about 50 seconds at 2 MJ/s). The
   guns stop firing by themselves and the readout keeps asking for `4 of 0 MJ/s`. Dock and fit
   the powerplant back to carry on.
8. The **mining beam** still works as before: press **2**, aim at a rock and hold left click.
   Press **1** to go back to cannons.

## 8. Shields in flight

1. Launch. Top left, the **Shield** bar starts **full** — the basic shields hold 10 points, and
   the outpost fills them whenever you dock.
2. Find a pirate and let it shoot you. Each cannon hit takes **1 point**: the shield bar drops a
   tenth per shot and the **Hull** bar does not move until the shield bar is empty (ten hits).
3. Break off and stop being hit. The shield bar **stays put for 4 seconds**, then climbs at
   **1 point a second** — about ten seconds from empty — until it is full again. If a pirate hits
   you during those four seconds, the bar stops where it is and the four seconds start again.
   The power readout does not move while this happens: the shields cost a flat **2 MJ/s** whether
   they are full, filling or under fire.
4. In Outfitting, the **Shields** bay shows **Basic shields** with **10 shields** under it.
   Unequip it, launch, and let a pirate shoot: there is no shield bar left to lose, and every hit
   goes straight to the hull. Fit them back and the shield bar returns.
5. Reload the page: the fit sticks, and a save made before this update loads with basic shields
   already in the bay (the bay was empty because shields did not exist yet).

## 9. It survives a reload

1. Unequip the power cell, so storage holds it and the bay is empty.
2. Reload the page (F5) and open **Outfitting** again.
3. The cell bay should still be **Empty**, the picker should still contain the
   `Basic power cell` square, and your credits, ships and contracts should be unchanged.
4. Fit it back, reload again, and confirm it stayed fitted.

## 10. Other ships, and old saves

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
