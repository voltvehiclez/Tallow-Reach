# Testing: the Outfitting screen

Built file: `tallow-reach/game/tallow-reach.html` (568 KB). Open it in your browser.
You should already be docked at Meridian Outpost; if the intro is showing, click
**Enter the hangar**.

## 1. The tab is there

1. Look at the row of tabs across the top of the outpost panel:
   **Contracts · Hangar · Outfitting · Shop · Base · Saves**.
2. Click **Outfitting**.
3. The panel should widen to the middle of the screen (up to about 1180 px), and a dark
   framed window should appear in the centre with your ship in it, turning slowly.
4. The title in the top-left corner of that window should be your ship's name and its
   one-line description (a Wasp says "Light interceptor. Fast, fragile.").

## 2. Admiring the ship

1. **Drag** across the ship window with the left mouse button: the ship turns, and it
   stops turning on its own for about three seconds after you let go.
2. Drag **up and down**: the camera looks from lower or higher, without ever going under
   the floor or over the top.
3. **Scroll** while the cursor is over the ship window: the ship gets closer and further
   away, and the panel behind does **not** scroll.
4. **Double click** the window: the view returns to the starting three-quarter angle.
5. The gold ring under the ship should stay still while the ship turns on it.

## 3. The module bays

Around the ship window there are seven module groups. Four on the left, four cards on the
right (the seventh group plus the Appearance card). Each has a name, a `0 / slots` count,
one dashed bay box per slot, and a line saying what that group will decide. Check the
counts:

| Group | Bays |
| --- | --- |
| Powerplant | 1 |
| Power cells | 1 |
| Thrusters | 1 |
| Shields | 1 |
| Primary weapons | **2** (Bay 1 and Bay 2 side by side) |
| Secondary weapons | 1 |
| Hull | 1 |
| Appearance — Primary (paint) | 1 |
| Appearance — Secondary (paint) | 1 |

Order matters on the right: **Primary weapons, Secondary weapons, Hull, then Appearance**
last, directly under the Hull card.

Every bay should say **Empty** and every count should read **0 / n**. There are no
modules or paints in the game yet, so nothing here is clickable: that is expected.
The Appearance card's two bays are labelled **Primary** and **Secondary** and it reads
`0 / 2`.

## 4. It follows your ship

1. Click **Hangar**.
2. If you own another ship, click **Fly** on it (if not, buy one you can afford, or skip
   this step and check it later).
3. Click **Outfitting** again. The window should now show the new hull, with the title
   updated. A Prospector shows its mining drill.
4. In the Hangar, **Fly** your original ship back, and confirm the window follows.

## 5. Leaving and coming back

1. Click **Launch**. The panel closes and you fly as before, with no slowdown.
2. Fly back and dock (**G**), then click **Outfitting** again: the window comes back,
   same ship, and the angle resets to the start.
3. Turn the ship to a nice angle, click **Contracts**, then click **Outfitting** again:
   the ship keeps the angle you left it at (it is the same canvas being re-mounted).
4. Resize the browser window, or make it much narrower than 900 px: the ship window moves
   to the top and the bay cards sit below it in two columns, Appearance included. Nothing
   should be cropped or squashed.

## 6. Nothing else changed

1. Every other tab (Contracts, Hangar, Shop, Base, Saves) looks and works exactly as it
   did, and the tabs now wrap onto a second row if the panel is narrow.
2. Press **P** or **Esc** mid-flight, resume, fire, warp with **M**: unchanged.
3. Open the browser console (F12). There should be **no errors**, in particular no
   "Too many active WebGL contexts" warning while you stay on the Outfitting tab.
4. Reload the page: your credits, ships and contracts are all still there (the save
   format did not change).

## If something looks wrong

Tell me what you clicked, what you expected and what you got. The two files that draw
this screen are `src/ui/outfitting.js` (page, drag/zoom) and `src/render/shipviewer.js`
(the 3D window); bay groups come from `src/data/outfitting.js`.
