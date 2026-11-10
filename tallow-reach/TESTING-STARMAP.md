# Step 11B playtest — free local warp, central bodies, starmap and save v16

For the owner. About 20–30 minutes. No coding needed.

**What changed in this follow-up:** inside an open-world system you can still **warp to any pocket**,
including a gate, without following an internal route. Optional internal blue lines remain gone from the
**system map only**; the main galaxy still shows its explicit gate routes. Each system has a central
**star (95% chance) or black hole (5%)** with a **permanent two-line label** below it: the proper name,
then `(Star)` or `(Black hole)`. The small native hover tooltips on pockets and central bodies are gone,
but the blue/orange **click popups remain**. Galaxy panning now follows the pointer at a restrained speed and pans
a little farther when zoomed out. System-map star/black-hole graphics now scale with zoom. Gate
pocket names sit clear of the orange exit stubs, and the neighbouring-system name at a stub is clickable.

**M opens the starmap** while flying; zoom into a system dot to open its pocket map. **Click or
right-click a pocket** and choose **Warp to …** to run the existing warp sequence. Gate stubs point to the
exact neighbouring system; clicking that system's name opens the same travel popup for its reciprocal
gate pocket. The right panel stays compact (system name, current pocket, pocket names), with no warp
buttons or scrolling. Saves remain **version 16**: seed plus compact discovery/visit notes, not the
generated map, cores or layout. Old saves and `TR1:` codes still load.

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
      - a compact right panel: system name, **Current pocket**, and the selected system's pocket names
        as plain rows — no tier, descriptions, gate-peer text, warp buttons or scrolling.
- [ ] **1.3** While the map is open, the ship does not move, weapons do not fire, and the engine
      sound is suspended. Press **M** again: the map closes and flight resumes.
- [ ] **1.4** Hold **W** to build throttle, then press **M** without releasing W. The map opens and
      the ship freezes. Close the map, then release W: the ship must not keep thrusting as if the key
      were stuck. Tap W again to confirm normal throttle returns.
- [ ] **1.5** Open the map and press **Esc**. It closes without opening the pause menu. Open it again
      and press **P**: the map closes and the normal **Paused** overlay appears. Press P/Esc to resume.
- [ ] **1.6** While the map is open, holding **Left Alt** does not start the free camera, and
      **G/F/1/2** do not dock, lock or switch weapons. After closing the map, those controls work again.

## 2. Inspect, zoom into a system, and pan

- [ ] **2.1** Click a few system dots, or use the **Inspect** dropdown. A ring marks the selection and
      the right panel shows only the system name, **Current pocket**, and that system's pocket names in
      compact rows. There are no **Advisory tier**, description, gate-peer or travel-button cards.
- [ ] **2.2** Press **All names** on the galaxy chart. Every visible system gets a label; press
      **Fewer names** to return to the quieter view. Current and selected systems keep their labels.
- [ ] **2.3** Use **+**, **−** and the mouse wheel over the galaxy chart to zoom. **Fit** returns to the
      whole web. Drag an empty part of the chart to pan; dragging must not select a system by accident.
      At maximum, middle and minimum zoom, try short and long drags: the map should move smoothly,
      never farther than the pointer moves on screen. Zooming out makes it pan a little farther;
      repeat after resizing the browser or using a different viewport shape.
- [ ] **2.3a** With the galaxy web visible, press **M** twice: it reopens as the galaxy web with its
      previous zoom/pan. Open a system's pocket map, zoom/pan, then press **M** twice: the same system
      and framing return. The popup and old notices should not reopen.
- [ ] **2.4** Open a **system map**: select a system dot, then scroll up several times (or press **+**
      until it opens), or simply **double-click** the dot. Expect a short zoom transition into a map of
      that system's pockets: a central star/black hole, ordinary pocket dots spread around it, and gate
      dots farther out with dashed stubs toward the labelled neighbouring system. The central body keeps
      its name/type label visible without hovering, and pocket names do not sit on the orange stubs or peer
      labels. There are **no internal pocket-to-pocket blue lines** in the default free-warp systems.
      **Back to galaxy** returns with the reverse transition. If your browser/OS prefers reduced motion,
      the switch may be instant.
- [ ] **2.5** Inside a system map, drag to pan, use **+**/**−** to zoom, and **Fit** to frame the pockets.
      Zoom in: the central star/black hole graphic must grow with the map, not stay constant or shrink.
      Pocket dots and text stay readable. Scrolling out at the fitted system view (or pressing
      **Back to galaxy**) returns to the galaxy web.
- [ ] **2.6** Keyboard check: Tab to a system dot and press Enter/Space to select it; the zoom buttons and
      Close are reachable by keyboard. Inside a system map, Tab to a pocket dot or a neighbouring-system
      gate label and press Enter/Space (or Shift+F10 / the Context Menu key) to open its popup.
      **Esc closes the popup first**, not the chart.
- [ ] **2.7** Select a far-away system and zoom into its pocket map. Click or right-click one of its
      pockets, or a neighbouring-system name at a gate stub: the popup explains **No direct route.
      Travel through connected pockets first.** and has no clickable **Warp to**. You cannot warp there
      in one jump.
- [ ] **2.8** Open Meridian's system map. Its centre shows a star with the permanent label **Meridian**
      and, on the next row, **(Star)** — not an extra pocket row. Hovering does not show a small native
      tooltip box; the ring/glow may still highlight. Tab to the star and check the same label/highlight by
      keyboard focus. Click, right-click or press Enter/Space on it: no warp popup or travel must occur.
      Hover a pocket dot: no native tooltip box; clicking it still opens the usual popup.
- [ ] **2.9** Return to the galaxy and open **Duskdrift** (`sys-001`, Meridian's first neighbour on the
      default seed). Its centre is a dark **black hole** with a bright ring and the permanent label
      **Duskdrift** / **(Black hole)**. It is also absent from the pocket list and cannot be warped to. Other systems may have
      either body; the 5% chance is per system, not a guaranteed exact count in every small sample.
- [ ] **2.10** Return to the main galaxy chart: its system-to-system gate lines are still present. Only the
      optional internal lines inside free-warp system maps were removed.

## 3. Legal direct-hop travel by click or right-click

- [ ] **3.1** Open the **Meridian System** pocket map while in **Meridian Station**. The right panel lists
      **Meridian Station** (highlighted), **Kestrel Hollow**, and the **Gate to …** pockets as plain rows.
      On the chart, click or right-click the **Kestrel Hollow** dot: a popup offers **Warp to Kestrel Hollow**.
      Clicking/right-clicking your current pocket says **You are here** and offers no warp.
- [ ] **3.2** Click **Warp to Kestrel Hollow**. The map closes and the usual ~2-second warp runs: throttle
      releases, turn eases back, white flash, weapons offline. Arrival message: **“Warp: Meridian Station
      to Kestrel Hollow. Empty space. Nothing out here yet.”**
- [ ] **3.3** Press **M** again. The Meridian pocket map should reopen as before; click/right-click
      **Meridian Station** to warp back.
      Message: **“Warp: Kestrel Hollow to Meridian Station. Meridian Station and the asteroid belt.”**
      Station, belt and planet return.
- [ ] **3.4** From **Kestrel Hollow**, click/right-click **Gate to Duskdrift** and warp **directly** to it:
      no return to Meridian Station or internal route is needed. It is empty space. Open Meridian's system
      map there: the gate pocket's name sits inward, clear of the dashed orange stub, and the stub points
      toward **Duskdrift**. Click the neighbouring-system name **Duskdrift**: the popup offers
      **Warp to Duskdrift** and sends you to the reciprocal **Gate to Meridian System** pocket in Duskdrift
      (an empty generated pocket, not a station or belt). From an ordinary Meridian pocket such as
      Meridian Station or Kestrel Hollow, clicking a neighbouring-system name such as **Lumenveil** or
      **Duskdrift** instead says **No direct route** and offers no warp. You can also cross via the galaxy's
      reciprocal gate pocket. A gate never sends you to an arbitrary neighbouring system.
- [ ] **3.4a** After crossing into Duskdrift in 3.4, press **M**: the pocket map should now show
      Duskdrift, not Meridian. Inside one system, warping to another pocket keeps that system's framing.
      Return to the galaxy web, close it, cross a gate, then reopen: it should stay at galaxy level.
- [ ] **3.5** Open the map after arriving in the generated system. The header names the pocket you entered.
      Zoom into that system to see its central body and gate stubs. After you leave, its galaxy dot keeps the
      visited colour. You can hop back through the same gate.
- [ ] **3.6** Kestrel Hollow is still an ordinary empty pocket, **not** a gate. In the Meridian system map
      it sits around the central star and has no outward gate stub or internal blue line. You can warp from
      it to any Meridian pocket, but not directly into another system's ordinary pocket.
- [ ] **3.7** Credits do not change when warping. Travel is free in this slice.
- [ ] **3.8** Automated opt-out check (no manual data editing needed): a system with
      `intraSystem: "links"` requires its internal routes again, draws those routes on its system map, and
      refuses disconnected local hops. This is the future temporary-instance option; ordinary open-world
      systems remain free. The main galaxy's explicit gate routes are unaffected by either policy.

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


## Cannon visual regression check

- [ ] In open space, hold fire with basic cannons while thrusting forward and turning left, then right.
      Watch both barrels: new bolts should appear at the gun muzzles rather than visibly offset to one side.
      Repeat while stationary and while flying straight. Fired bolts still inherit ship velocity, so they
      may drift after leaving the guns during a turn. Check that shooting and damage still work normally.
