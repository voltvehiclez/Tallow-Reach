# Step 11B playtest — clickable starmap, direct-hop travel and save v16

For the owner. About 20–30 minutes. No coding needed.

**What changed:** **M now opens a starmap** while flying. It no longer warps immediately. You inspect
systems and pockets, then press **Warp here · Free** on a directly linked pocket to run the existing
warp sequence. Saves are now **version 16**: they keep the galaxy seed and compact discovery/visit
notes, not the generated map itself. Old saves and `TR1:` codes still load.

**What has not changed:** flight feel, mining, combat, docking, shops, the warp animation/timing, and
the hulls' hold-only differences. Generated systems are still empty placeholders. Fuel, activated
gates and supercruise are not implemented.

**How to report:** tick the boxes. If something is wrong, tell me the **step number** and what you saw
(what you did, what you expected, what happened). A screenshot or browser console text helps. When
everything passes, say **“11B playtest passed”** so step 11 can be ticked.

---

## Before you start

- [ ] **0.1** Back up your current progress: dock, open **Saves**, press **Export**, and copy the
      `TR1:` code into a text file. Importing a test code later replaces the current game.
- [ ] **0.2** Open the **new** build:
      - the live preview panel, **or**
      - `game/tallow-reach.html` from the delivered project, **or**
      - in the project folder: `npm run build`, then `node serve.mjs`, then open `http://localhost:8080`.
- [ ] **0.3** If saves do not stick in the embedded preview, open the preview in its **own browser
      tab** or use the downloaded HTML. Some browsers block storage inside frames; the game handles
      that quietly, but slot/resume checks need real storage.
- [ ] **0.4** Open the browser console (**F12 → Console**). There should be no red game errors on
      load. A blocked font or network request in an embedded preview is not a gameplay error.
- [ ] **0.5** Remember: **M only opens the map while flying**. It does nothing on the intro screen,
      while docked, while paused, or during a warp.

## 1. Open, close and pause

- [ ] **1.1** Press **Enter game**, then **Launch** if you are docked. You are flying near Meridian
      Station. The HUD hint says **M starmap**.
- [ ] **1.2** Press **M**. A full-screen **Starmap** opens. Expect:
      - an irregular web of dots and connecting lines, not a square grid;
      - **121 systems** in the header on the default seed;
      - your current system marked in amber and your current pocket named in the header;
      - a selected-system panel on the right;
      - the status line says single-player flight is paused while the map is open.
- [ ] **1.3** While the map is open, the ship does not move, weapons do not fire, and the engine
      sound is suspended. Press **M** again: the map closes and flight resumes.
- [ ] **1.4** Hold **W** to build throttle, then press **M** without releasing W. The map opens and
      the ship freezes. Close the map, then release W: the ship must not keep thrusting as if the key
      were stuck. Tap W again to confirm normal throttle returns.
- [ ] **1.5** Open the map and press **Esc**. It closes without opening the pause menu. Open it again
      and press **P**: the map closes and the normal **Paused** overlay appears. Press P/Esc to resume.
- [ ] **1.6** While the map is open, holding **Left Alt** does not start the free camera, and
      **G/F/1/2** do not dock, lock or switch weapons. After closing the map, those controls work again.

## 2. Inspect, zoom and pan

- [ ] **2.1** Click a few system dots. A ring marks the selection and the right panel changes to that
      system's name, **Advisory tier**, and its full pocket list. The tier is guidance only; generated
      placeholders are empty.
- [ ] **2.2** Use the **Inspect** dropdown to choose a system by name. It selects the same system as
      clicking its dot.
- [ ] **2.3** Press **All names**. Every visible system gets a label; press **Fewer names** to return
      to the quieter view. Current and selected systems keep their labels.
- [ ] **2.4** Use **+**, **−** and the mouse wheel over the chart to zoom. Use **Fit** to return to the
      whole web. Drag an empty part of the chart to pan; dragging must not select a system by accident.
- [ ] **2.5** Keyboard check: Tab to a system dot or the Inspect dropdown; Enter/Space activates a
      focused dot/button. The close button is reachable by keyboard.
- [ ] **2.6** Select a far-away system. Its pockets are listed, but their travel buttons are
      **Unavailable** with a reason such as **No direct route. Travel through connected pockets
      first.** You cannot warp there in one jump.

## 3. Legal direct-hop travel

- [ ] **3.1** Select **Meridian System** while in **Meridian Station**. Expect pocket cards for:
      - **Meridian Station** — marked **You are here**, travel disabled;
      - **Kestrel Hollow** — **Warp here · Free** enabled;
      - one or more **Gate to …** pockets — enabled, each showing its gate peer.
- [ ] **3.2** Press **Warp here · Free** on **Kestrel Hollow**. The map closes and the usual
      ~2-second warp runs: throttle releases, turn eases back, white flash, weapons offline. Arrival
      message: **“Warp: Meridian Station to Kestrel Hollow. Empty space. Nothing out here yet.”**
- [ ] **3.3** Press **M** again. The current location is now Kestrel Hollow / Meridian System.
      Travel back to **Meridian Station** the same way. Message: **“Warp: Kestrel Hollow to Meridian
      Station. Meridian Station and the asteroid belt.”** Station, belt and planet return.
- [ ] **3.4** From Meridian Station, warp to a **Gate to …** pocket. It is empty space. Open the map
      there: the gate card names its **Gate peer** in the neighbouring system. Select that neighbouring
      system, then press **Warp here · Free** on the peer gate pocket. Expect an empty generated
      pocket, not a station or belt.
- [ ] **3.5** Open the map after arriving in the generated system. The current-location header names
      the pocket you entered. After you leave that system, its dot keeps the visited colour. You can
      hop back through the same gate.
- [ ] **3.6** Kestrel Hollow is still an ordinary empty pocket, **not** a gate. It has no gate peer.
- [ ] **3.7** Credits do not change when warping. Travel is free in this slice.

## 4. Saves, old codes and safe recovery

- [ ] **4.1** Fly to a non-arrival spot in Kestrel Hollow or a generated pocket. You cannot open
      **Saves** while flying away from home, so use the autosave: wait about 30 seconds, or hide/close
      the tab and reopen the game. Expect the same pocket and exact spot/heading, stationary, with
      shields/boost as left.
- [ ] **4.2** Return to Meridian Station and dock, save to a slot, launch and warp somewhere else,
      then return and dock again and load that slot. Expect the saved docked state, character, cargo
      and fittings back. The autosave in 4.1 is the flying-resume check.
- [ ] **4.3** Export a `TR1:` code, change something small, then import the code. The exported state
      returns. The code prefix is still `TR1:`; slots are still the usual three.
- [ ] **4.4** Import old code **A** from `TEST-OLD-CODES.txt`. Expect 4850 cr, Wasp + Prospector,
      docked at Meridian Station, cargo/fittings/mission preserved.
- [ ] **4.5** Import old code **B**. Expect 4850 cr and flying in Kestrel Hollow at the arrival point.
- [ ] **4.6** Import old code **C** (the pre-11B v15 regression code). Expect 4850 cr and flying in
      Kestrel Hollow at the saved spot, not the arrival point. Cargo, fittings, mission and station
      storage are preserved. Exporting again produces a current v16 code.
- [ ] **4.7** Removed-pocket recovery is covered by the automated tests: a save whose pocket was
      deleted returns the pilot to **Meridian Station docked**, keeps the whole character/cargo, and
      shows a safe-recovery notice on intro/load/import. No manual data editing is needed for this
      playtest. If a future update removes a pocket you were in, that notice is the expected behaviour.

## 5. Regression checks

- [ ] **5.1** Flight feels the same: mouse steer, W/S throttle, A/D strafe, Space/C up/down, Q/E roll,
      Shift boost, X stop, Ctrl brake. Left Alt free camera and scroll zoom work when the map is closed.
- [ ] **5.2** Mining, cannons, missiles, target lock, raider spawns, loot crates and pickup sounds
      behave as before. A fresh game still starts with 600 cr and cannons only.
- [ ] **5.3** **G** docks only within 300 m of Meridian Station and below 70 m/s. Docking opens the
      station menu, not the intro screen. Launch, shop, hangar, outfitting, inventory and base tabs work.
- [ ] **5.4** P/Esc pause freezes the game when the map is closed; the pause menu sound switch works.
- [ ] **5.5** No red game errors appear in the console after opening/closing the map, warping,
      docking, saving, loading and importing.

## 6. Result

- [ ] **PASS** — everything above worked. Reply: **“11B playtest passed.”**
- [ ] **FAIL** — note the step number and what happened. Do not tick step 11 yet.

After a pass, step 11 can be marked complete in `docs/ROADMAP.md` and `docs/REFACTOR_PLAN.md`.
The next planned refactor is step 12 (encounters, place templates and place memory), which starts by
asking the remaining VISION questions.
