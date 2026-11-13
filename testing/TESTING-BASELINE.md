# Testing: the 10-minute "is the whole game still fine?" check

Use this **before** you start a refactor step (to know the game works) and **after** it (to
prove nothing changed). It covers every system the game has today. If a step adds a feature, the
AI also gives you a step-specific checklist; this one is the safety net underneath.

**Setup:** in the project folder run `npm install` (once), then `npm test` (should say all tests
pass; the number is in `docs/HANDOFF.md`) and `npm run build`. Open `game/tallow-reach.html`. If the
intro shows, click **Enter the hangar**. Use a **new game** (Saves tab) the first time, and keep a
second run with an **old save** to check old saves still load.

Write down anything odd with what you did, what you expected and what happened. Send that to the AI.

## A. Launch and fly (2 min)

1. Click **Contracts**, accept any contract, then launch. You appear 200 m from the outpost
   looking at the asteroid field. The top-left shows **Shield HP**, **Hull HP** and **Boost**, and
   the bottom centre shows the power block.
2. Mouse steers; **W** speeds up, **S** slows, **X** stops, **A/D** strafe, **Space/C** up/down,
   **Q/E** roll, **Shift** boost. The ship should feel heavy and smooth, the same as before.
3. Hold **Left Alt** and move the mouse: the free camera orbits. Release: it returns.
4. Press **P**: the pause menu opens and the game freezes. **Resume is the top button and Exit to
   main menu the bottom one.** Press **P** again: it resumes.
5. Dock at a station, then press **M**: the starmap opens over the station screen (plot a route; the
   warp itself waits until you launch). Press **M** again to close it, then press **P** and **Esc**:
   the pause menu opens and closes while docked too.
6. Press **P**, then **Exit to main menu**. Expected: the engine roar **fades out** over about two
   seconds instead of cutting off or droning on, and the title screen shows the station turning with
   its planet behind it. Fly somewhere else, quit to the menu again: the background is the same view.

## B. Mine and fight (3 min)

1. Fly to the asteroid field (about 2 km away). Press **F** near a rock to target it.
2. If you own the mining beam, press **2**, aim at a rock and hold left click: a bar fills and an
   ore is banked every 4 seconds (a chime plays). Press **1** to go back to the cannons.
3. Wait for a **Newbie Raider** (a dark ship). Target it with **F**, shoot it with left click.
   It dies after about 10 hits; crates drop. Fly into a crate to pick it up.
4. Get shot a few times: Shield HP drops first, then Hull HP.
5. If you own missiles: hold the target inside the dashed ring until it locks, right click.

**Sounding right (step 6a).** The game should sound exactly as it did. Ten sounds, and each one
should arrive at the moment described — nothing missing, nothing doubled:

| What you do | What you hear |
| --- | --- |
| Left click with cannons fitted | a short falling blip, about three a second |
| **Shift** boost igniting (a full tank) | a soft exhaust gulp, once |
| An ore banked while mining | a rising three-note chime, once per ore |
| Fly into a loot crate | a quick two-note pickup pip |
| Take a hit from a raider | a sharp noise burst, once per hit |
| A raider fires close to you | a low sawtooth zap, from them, not you |
| A ship or rock explodes | a rumble — loud ones only; small puffs are silent |
| Missile lock completes | two pips, a beat apart |
| Right click to launch a missile | a hiss and a falling growl |
| Press **M** to warp | a rising whine, then an arrival slam and shimmer |

Mute (**P**, then the sound button) still silences all of it.

**The controls (checked and signed off at step 6b, 2026-11-08).** The game reads a *control
record* instead of the keyboard directly. The owner played this table and found no problems; it is
kept here as the reference for any later change that touches input:

| Key or mouse | Must do |
| --- | --- |
| **W** / **S** | throttle up / down (the bar-less feel is unchanged: heavy, smooth) |
| **X** | throttle snaps to zero |
| **Ctrl** (held) | throttle bleeds off |
| **A** / **D** | strafe left / right |
| **Space** / **C** | lift up / down |
| **Q** / **E** | roll left / right |
| **Shift** | boost (snaps the throttle to full once, then the tank drains) |
| Mouse | steers; **Left Alt** + mouse orbits the camera and releasing returns it |
| Left click | guns (or the beam, on slot 2) |
| Right click | missiles, and the dashed lock ring must be the **same size as before** |

Two things worth a close look, because they are the parts that genuinely moved:

1. **The missile lock ring.** Fit a missile launcher, point at a raider until it locks: the dashed
   ring should be exactly the size it was, and it should still disappear while warping. Try it in a
   **small browser window** and a maximised one — the ring scales with the window, as before.
2. **Free camera.** Hold **Left Alt**, orbit, let go. Then hold **Left Alt** and resize the window,
   or click into another window while a key is held: the ship must **stop** responding when the
   window loses focus (a small improvement — before, a held key could stick).

## C. Warp (1 min)

1. Press **M**: about two seconds of warp effect, then the message names the new sector
   (Kestrel Hollow, empty). Press **M** again to come back to Tallow Reach.

## D. Dock, sell, repair, fit (3 min)

1. Fly back within 300 m of the outpost and press **G**. The outpost panel opens.
2. **Inventory** tab: ore you mined is in the ship's hold; move it to the station and sell it
   (right click a stack, **Sell**). Credits go up.
3. **Contracts**: finish a contract if you completed one; you are paid.
4. **Outfitting**: the 3D ship shows; click a bay, swap a module, click again to unequip it and
   see it in storage.
5. **Shop**: buy something cheap (if you have the credits). **Base**: look only.
6. **Hangar**: check the ship list.

## E. Saves (1 min)

1. **Saves** tab: save to slot 1. Reload the browser page, then load slot 1. Credits, ship and
   fitted modules are as you left them.
2. Click **Export**, copy the code, load it again with the import box.
3. Load an **old save** from before the step (if you have one): it loads, nothing is missing.

## F. Lose a ship (optional, 1 min)

Take the hull module off in Outfitting, launch, and let a raider shoot you once: the ship is
destroyed, cargo is lost, a recovery fee is charged, and you are back at the outpost in another ship.

## G. Step 7b: the things that moved are drawn, not missing (2 min)

Step 7b moved every bullet, missile, crate, spark, rock and the player's own ship out of the sim
and into the drawing code. Nothing should look or play any differently — this section exists to
check that nothing was left behind. Run it straight after **A** and **B**, while you are flying.

1. **Your ship is there.** In flight it sits in the middle of the screen, nose pointing where you
   steer, same size and colour as before. In Outfitting the 3D viewer still shows it, and docking
   hides the in-flight one (the screen does not show two ships).
2. **Your shots are there,** and they leave from the guns: fire while turning hard — each bolt
   should start at the gun it came from, not from where the gun was a moment ago.
3. **Enemy shots are there:** red bolts still fly at you.
4. **Explosions** still burst into a handful of coloured sparks that fade out, and they do not
   linger after the wreck is gone.
5. **Crates** still spin, drift, glow in their item's colour, and vanish when you fly through
   them (the pickup chime plays).
6. **Rocks** are the same lumpy shapes and sizes as before, they twinkle no differently, and when
   you mine one it **shrinks as it empties** — and, importantly, you stop being able to fly into
   the part that has gone: the smaller the rock, the closer you can get.
7. **The mining beam** is still a thin line from the nose of your ship to the point on the rock it
   is cutting, and it disappears the moment you stop firing or look away.
8. **Missiles** still launch from under the ship, smoke, home in and burst.
9. **Warp:** press **M** — the crates and sparks you left behind are cleared, the rocks of the
   sector you arrive in are there, and nothing from the old sector is left floating. Press **M**
   again to come back.

**Pass:** every item above behaves as written, and `npm test` is green.

## H. Step 7c: hull mounts, lock and sector scenery

1. In the project folder run `npm install`, `npm test`, then `npm run build`. Open
   `game/tallow-reach.html` and click **Enter the hangar**. Load an existing save or start a new game.
2. Launch and fire the cannons: both bolts should leave the usual left and right nose positions.
   If available, select the mining beam with **2** and mine a rock; its beam should start at the
   ship as before. Try other owned hulls from **Outfitting** if available.
3. With missiles fitted, keep a raider inside the dashed ring until it locks, then right click.
   Check the missile leaves the ship and homes as before. Hold **Left Alt** to orbit: the missile
   should not acquire a lock in free camera; release and check it can lock again.
4. Press **M** to warp to Kestrel Hollow. Meridian and the asteroid field should disappear.
   Warp back: they should return. Also dock after returning and launch again; the scenery should
   still be correct. If destroyed while in Kestrel Hollow, check the outpost scenery returns on
   respawn. Report any differences before marking 7c complete.

## I. Step 7d: entity view registry cleanup

1. Launch and fly to the asteroid field. Check rocks appear normally; if you have the mining beam,
   mine a rock and check it shrinks and disappears when emptied.
2. Fire the cannons at a raider. Check your shots and the raider's shots appear and disappear on
   impact or expiry. Destroy it: the raider should vanish, sparks should fade, and loot crates
   should appear. Fly into a crate and check it vanishes when picked up.
3. If you have missiles, lock a raider and fire one: it should appear, fly, and disappear on impact.
4. Press **M** to warp away and back. Check scenery and rocks match the sector, and that no shots,
   raiders, crates or sparks are left floating after the warp. Dock with **G** when back at Meridian,
   then launch again and check the ship and asteroid field look normal.

## J. Step 8a: fixed-tick flight and combat

1. Open the 8a build, click **Enter the hangar** and launch. Fly forward, turn, strafe, reverse,
   brake and boost; compare the feel and camera movement with your 7d baseline. Look for visible
   judder, especially on a high-refresh screen. Press **P**, wait several seconds and resume:
   the ship, enemies and projectiles should not jump forward from the paused time.
2. Fly to the asteroid field; check rocks, hints and the mining beam if you have it. Fight a raider:
   cannons, incoming fire, hits, explosions, loot and shields should work as before. If fitted,
   acquire a missile lock and launch a missile; check the lock ring and its target.
3. Press **M** to warp away and back, then dock with **G**. Check the scenery and flight. Launch
   again and load an older save from the Saves tab; check the ship and equipment are still there.
4. If you have a way to cap your display at 30, 60 and 144 frames per second, repeat the flight
   and combat checks at each rate. If not, ordinary playtesting is useful too. Report anything
   different, especially judder or inconsistent missile lock; the camera and asteroid respawn
   are not yet proven frame-rate independent.

## K. Step 8b: the local player and their controls

1. Open the 8b build, click **Enter the hangar**, and load a familiar save if you have one.
   Launch. Check the ship appears and the camera follows it normally.
2. Use **W/S**, **A/D**, **Space/C**, **Q/E**, mouse steering, **X**, **Ctrl** and **Shift**.
   The ship should respond as it did in 8a. Hold **Left Alt** to orbit, then release it and steer.
3. Shoot a raider with left click. If you have the mining beam or missiles fitted, use **2** to
   mine and right-click after a missile lock. Check the HUD and weapon controls as before.
4. Press **M** to warp away and back, then **G** to dock. Launch again, and check the ship and
   controls still work. Press **P** to pause and resume. Report any differences.

This slice does not add co-op or a second controllable ship; the automated tests check that two
player records and their controls are independent. Step 8c is still needed for player-aware rules.

## L. Step 8c: final single-player regression playtest

Make a backup or copy of a save first: the last check deliberately destroys a ship and can cost
credits and cargo. This is a single-player playtest; the second player is tested automatically,
not exposed in the game, and no co-op connection has been added.

1. Open the freshly built game, click **Enter the hangar**, and load a familiar save. Launch.
   Fly forward and backwards, turn, strafe, brake and boost. Check the camera, speed, power and
   shield bars feel and look the same as before.
2. Fly to the asteroid field. Fire the cannons while moving and turning; bolts should leave the
   ship. Fight a raider and check incoming hits, shield recharge, hull damage, explosions and loot.
   If fitted, select the mining beam with **2** and mine an asteroid; check ore enters the hold.
3. If a missile launcher is fitted, aim at a raider, wait for the lock and right-click. Check the
   lock ring, missile launch, tracking and impact. Press **F** to lock and release another target.
4. Return to Meridian; press **G** in docking range at low speed. Check the outpost appears, then
   launch again and check the ship, weapons and controls. Optionally press **M** to warp away and back.
5. On your disposable/copy save, deliberately let a raider destroy your ship. Check the death
   message, lost ship/cargo and recovery fee, return to the outpost, and launch the replacement
   if one is available. Reload your backed-up save when finished.
6. If practical, repeat flight and combat with display rates capped at 30, 60 and 144 fps. Report
   any judder or missile-lock differences; the complete game's frame-rate independence remains
   unproven because camera aim, asteroid respawn timing and view interpolation are still open.

## M. Step 9: split saves (`profile` + `world`, save v13)

Step 9 splits every save into your **pilot profile** (credits, ships, holds, loadouts, hull damage,
missiles, active contract, stats) and the **station world** (station storage, base upgrades,
contract offer board) inside the same save slots and `TR1:` codes. Single-player gameplay should
feel identical.

1. **Build and open:** in the `tallow-reach` folder run `npm test` (should report **225 pass, 0 fail**)
   and `npm run build`, then open `game/tallow-reach.html`.
2. **Old save migration:** if you already had an autosave or a saved slot from version 12, check on
   opening (and by clicking **Load** on an existing slot in the **Saves** tab) that your credits,
   owned ships, fitted modules, ship hold cargo, **Station storage** items (**Inventory** tab), and
   **Base** upgrade levels are all exactly as you left them.
3. **Contract board & station persistence:** open **Contracts** and note the four offers on the
   board; accept one, move an item between **Station storage** and your **Ship hold** in
   **Inventory**, then open **Saves** and click **Save** on Slot 1. Reload the browser page (`F5`):
   check that your active contract, the remaining offers on the board, your station storage, and
   your ship hold all come back unchanged.
4. **Export / Import code round-trip:** in **Saves**, click **Export save code**, copy the `TR1:...`
   code, click **New game** (or change credits by buying a 1 cr part in **Shop**), then paste the
   code into the import box and click **Import**: check both your pilot (credits, ship, hold) and
   the station (storage, base levels, contract board) return to the exported state. Also paste any
   older pre-step-9 `TR1:` code if you kept one — it should import cleanly too.
5. **Quick flight, mine, fight and dock check:** launch, mine 1 ore or pick up 1 loot crate from a
   raider, fire a missile if fitted, fly back within 300 m of Meridian and press **G** to dock.
   Check your mined/picked-up item is in your ship's hold, missile count updated, hull damage (if
   any) shows in **Outfitting > Services**, and selling cargo on **Base** or **Inventory** adds the
   expected credits (including any Refinery bonus).

## N. Missions belong to a station, and the docked panel keeps up

The owner reported that a Meridian mission could be read from another station's Mission log, and that
closing the Border Signal's final dialogue left the card offering **Abandon** while the beacon was
already aboard.

1. **Build:** `npm run build`, then `npm test` (should report **482 pass, 0 fail**). Open
   `game/tallow-reach.html` and play with a save that has missions in it.
2. **One station's board:** dock at Meridian, open **Contracts**, note the four offers. Launch, warp
   to another station (open **Starmap** to pick one), dock, open **Contracts**: the four offers there
   are that station's own, not Meridian's. Accept one and it stays in your Mission log and Contracts
   tab at every station you dock at (progress follows the pilot); only a station with no active
   missions says "No active missions here.", with no explanation of where other work is.
   Press **Refresh** on one station's board: the other station's offers are unchanged when you
   return. Hand-in guidance names the station that takes the cargo.
3. **Story offers stay home, the mission does not:** Meridian offers **The Border Signal**; the log at
   any other station does not offer it and nothing can start it there. Accept it at Meridian, then dock
   elsewhere: the mission is still listed with its progress, its hand-in button names Meridian and is
   disabled, and Abandon still works. If its current step is a conversation with Archivist Vale, the
   dialogue card is read-only and says "Return to Meridian Station to continue talking."
4. **No messages that move the panel (new):** accept a contract, sell the hold, unfit a module. The panel
   must not grow a line at the top or shift its rows; nothing appears for these confirmations. A refusal
   (e.g. a bad save code) appears at the bottom of the screen in a small fixed notice that does not move
   anything, and the red "Mission failed" alert still behaves as before.
5. **The redraw (the reported bug):** play the Border Signal to its final conversation, open the
   **Mission log** tab with the dialogue still up, then close the last line. Expected: the card under
   the dialogue changes to **Hand in cargo** immediately — no tab switch, no re-dock needed. Also
   check the flight-side version: with the beacon aboard and the dialogue open, the log's button
   should never stay on **Abandon** once the objectives are done.
6. **Old saves:** load a save from before this change. Its home board is intact, missions keep their
   hand-in station, and no mission disappeared from the log.
