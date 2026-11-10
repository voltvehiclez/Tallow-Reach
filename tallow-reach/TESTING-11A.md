# Step 11A playtest — "nothing should look different" (organic starmap web built, not switched on)

For the owner. About 15–20 minutes. No coding needed.

**What this build is:** step 11A added the *engine* for the future starmap — an organic 2D web of
121 systems, one-peer gate pockets, editable travel rules — but it is **not wired into the live game
yet**. That happens in step 11B. So this playtest is a **regression check**: the game must look and
play **exactly** as it did after step 10. If anything feels different, that is a bug to report.

**The two things that must NOT have changed:**
- **M still warps directly** between Meridian Station and Kestrel Hollow. It must **not** open a map
  screen. (The clickable starmap is step 11B.)
- **Saves are still version 15.** Old saves and old export codes must still load.

**How to report:** tick the boxes. If something is wrong, tell me the **step number** and what you saw
(what you did, what you expected, what happened). A screenshot or the browser console text helps.

---

## Before you start

- [ ] **0.1** If you have an old build open: dock, open **Saves**, press **Export**, and copy the code
      into a text file. This is your backup. *(No old build handy? The two ready-made old codes in
      `TEST-OLD-CODES.txt` do the same job for section 6.)*
- [ ] **0.2** Open the **new** game:
      - **Live preview** (the "Tallow Reach game" panel), **or**
      - `game/tallow-reach.html` from the zip, **or**
      - in the project folder: `npm run build` then `node serve.mjs` and open `http://localhost:8080`.
- [ ] **0.3** **Save-test tip:** if you are using the embedded live preview and saves seem not to
      stick, open the preview in its **own browser tab** (or use the downloaded HTML). Some browsers
      block storage inside embedded frames; the game handles that quietly, but slot/resume tests need
      real storage. This is a browser limitation, not a game bug.
- [ ] **0.4** Remember: the station menu (with **Saves**) is only reachable while **docked**. **M**
      only works while **flying**.

---

## 1. Open and first look

- [ ] **1.1** The intro screen loads. It says you fly out of **Meridian Station**. The control text
      uses the words **pocket** and **system** (no "sector").
- [ ] **1.2** Press **Enter game**. In a fresh browser you start docked at the station menu. If this
      browser already has an autosave, you resume where you left off (docked, or flying at your saved
      spot) — both are correct.
- [ ] **1.3** The page loaded about as fast as before. There is no new long pause or "generating"
      message. *(The 121-system web is not generated at startup in this slice.)*
- [ ] **1.4** Open the browser console (**F12 → Console**). No red errors on load.

## 2. Flying is unchanged

- [ ] **2.1** Press **Launch**. You appear just off the station looking at the asteroid field.
      Top-left shows **Shield HP**, **Hull HP**, **Boost**; bottom centre shows the power block.
      Top-right of the HUD reads **Meridian Station**.
- [ ] **2.2** Mouse steers; **W/S** throttle, **A/D** strafe, **Space/C** up/down, **Q/E** roll,
      **Shift** boost, **X** stop, **Ctrl** brake. The ship feels heavy and smooth, same as before.
- [ ] **2.3** Hold **Left Alt** and move the mouse: the free camera orbits; scroll zooms. Release: it
      returns.
- [ ] **2.4** **P** or **Esc** pauses and freezes the game; press again to resume. The sound switch in
      the pause menu works.

## 3. Mining and combat are unchanged

*A brand-new game starts with 600 cr, cannons only — no mining beam and no missiles. Buy the beam
(900 cr) and missile pod (1500 cr) in the **Shop** when you can afford them, or import old code **A**
(section 6.8), which already has both fitted. Skip the beam/missile boxes until you own them.*

- [ ] **3.1** Fly to the asteroid field. Press **F** near a rock to target it, **F** again to release.
- [ ] **3.2** If you own the mining beam: press **2**, aim at a rock, hold left click: the bar fills, an
      ore is banked every few seconds with a chime, and the rock shrinks as it empties. Press **1** for cannons.
- [ ] **3.3** A **Newbie Raider** appears. Target with **F**, shoot with left click: it dies after about
      10 hits and drops crates. Fly into a crate to pick it up (pickup pip).
- [ ] **3.4** Let it shoot you: Shield HP drops first, then Hull HP. Incoming fire, explosions and sparks
      look and sound as before.
- [ ] **3.5** If you have missiles: hold a raider inside the dashed ring until it locks (two pips), right
      click to launch. The ring is the same size as before and disappears while warping.

## 4. Warp — the key 11A check

- [ ] **4.1** Press **M**. **Expect:** the usual ~2-second warp effect (throttle releases, turn eases
      back, white flash, weapons offline), then you arrive. **A map screen must NOT open.** If pressing
      M shows any kind of map/chart/chooser, that is a bug — report it.
- [ ] **4.2** The centre message reads **"Warp: Meridian Station to Kestrel Hollow. Empty space.
      Nothing out here yet."**
- [ ] **4.3** Top-right of the HUD reads **Kestrel Hollow**.
- [ ] **4.4** Press **M** again. Message: **"Warp: Kestrel Hollow to Meridian Station. Meridian Station
      and the asteroid belt."** Station, belt and planet are back.
- [ ] **4.5** Press **M** a few more times. It keeps cycling between exactly these **two** pockets. No
      third pocket, no gate pocket, no new destination appears. *(The generated gate pockets exist only
      in the new engine, not in the live cycle yet.)*

## 5. Kestrel Hollow is unchanged

- [ ] **5.1** Warp to Kestrel Hollow. It is **empty space**: no station, no asteroid field, no planet,
      no markers, no enemies, no resources.
- [ ] **5.2** Press **G** here. Nothing happens (there is no station to dock at) — correct.
- [ ] **5.3** Kestrel Hollow is **not** a gate and shows no gate behaviour. Warp back with **M**.
- [ ] **5.4** A rock you partly mined before warping is **still partly mined** when you return (the
      belt comes back as you left it within the session).

## 6. Saves are still version 15

- [ ] **6.1** **Resume in space:** warp to Kestrel Hollow, fly a little off the entry point, **reload
      the page** (F5), press **Enter game**. You are back at the **same spot, facing the same way**,
      stationary, in Kestrel Hollow.
- [ ] **6.2** **Resume in the belt:** warp back to Meridian Station, fly out into the asteroid belt well
      away from the station, **reload**, **Enter game**. You are **still out in the belt**, flying —
      **not** docked.
- [ ] **6.3** **No free repair:** let something shoot you (or boost a while) so shields/boost are
      part-used, then reload and **Enter game**. Shields and boost are **as you left them**, not refilled.
- [ ] **6.4** **Resume docked:** fly within **300 m** of the station, slow below **70 m/s**, press **G**
      to dock. **Reload**, **Enter game**. You go straight into the **station menu**, docked.
- [ ] **6.5** **Slot save/load:** docked, open **Saves**, press **Save** on **Slot 1** (it says "Saved
      to slot 1"). **Launch**, fly out, dock again, open **Saves**, press **Load** on Slot 1. You are
      docked with the credits and hold you had when you saved.
- [ ] **6.6** **The one-click load:** docked, note your credits, buy a 1 cr part in **Shop**, go to
      **Saves**, press **Load** on Slot 1. The credit number changes back **on that one click** with
      "Loaded slot 1" — no need to press Save first.
- [ ] **6.7** **Export/import round-trip:** in **Saves**, press **Export**, copy the `TR1:` code, change
      something (buy a part), paste the code into the box and press **Import**. Your progress returns to
      the exported state.
- [ ] **6.8** **Old code A (v12 flat):** paste code **A** from `TEST-OLD-CODES.txt` and press **Import**.
      Expect: loads cleanly, **4850 cr**, **2 ships** (Wasp + Prospector), **docked at Meridian Station**.
- [ ] **6.9** **Old code B (v13 split):** get back to Meridian first (**M** if needed), dock (**G**),
      then paste code **B** and press **Import**. Expect: loads cleanly, **4850 cr**, and you resume
      **flying in Kestrel Hollow** at the arrival point.
- [ ] **6.10** **Old slot:** if you have a save slot from before this build, press **Load** on it. It
      loads with credits, ships, modules, cargo and station storage intact.

## 7. Station business is unchanged

- [ ] **7.1** **Contracts:** accept one, complete it, collect the reward.
- [ ] **7.2** **Shop:** buy a part. **Inventory:** move items between station and hold (click,
      Shift-click for the whole stack); right-click an item to sell.
- [ ] **7.3** **Outfitting:** fit and unfit a module; drag/zoom the 3D ship. **Hangar:** switch ships.
      **Base:** upgrade something.
- [ ] **7.4** None of these mention "sector", and none of them change your pocket.

## 8. No errors, no slowdown

- [ ] **8.1** Open the console (**F12 → Console**). No red errors during any of the above. In
      particular, no error mentioning `galaxy`, `travel`, `PLACE_LINKS`, or `generateGalaxy`.
- [ ] **8.2** Frame rate and responsiveness feel the same as before. No new stutter when warping,
      docking or loading a save.

## F. Lose a ship (optional, on a disposable save)

- [ ] **F.1** Take the hull module off in **Outfitting**, launch, and let a raider shoot you once. The
      ship is destroyed, cargo is lost, a recovery fee is charged, and you are back at the station in
      another ship. Reload your backup save when finished.

---

**Result: PASS** — the owner reported the playtest passed on 2026-11-08; no bugs were reported.

**What is intentionally NOT in this build:** there is no clickable starmap (M still cycles pockets),
no generated gate pockets in the live world, no fuel or travel cost, and no fog. All of that arrives in
step 11B and later. Your position/heading are saved, but the world around you is not (enemies and crates
vanish and the belt is re-rolled on each page load) — persistent place memory is step 12.

**Outcome:** step 11A is confirmed safe. The next planned slice is 11B (the M starmap screen,
pocket chooser, legal direct-hop travel, and save v16); it is not started in this backup.
