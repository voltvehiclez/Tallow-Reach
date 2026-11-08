# Step 10 playtest — systems, pockets and the saved place (save v14)

For the owner. About 20 minutes. No coding needed.

**What should be different:** only the names (system / pocket / Meridian Station) and the fact that
the pocket you are in is remembered when you load. Everything else must feel exactly as before.

**How to report:** tick the boxes. If something is wrong, tell me the **step number** and what you saw.

---

## Before you start

- **0.1** If you still have the **old** build open in a browser: dock, open **Saves**, press **Export**,
  and copy the code into a text file. Note which slot (1–3) holds an old save. This is your own old
  code for steps 7.1–7.2. *(No old build handy? Use the two ready-made old codes in
  `TEST-OLD-CODES.txt` instead — they do the same job.)*
- **0.2** Open the **new** game: the live preview, or `game/tallow-reach.html` from the zip.
- **0.3** Keep in mind: the station menu (with the **Saves** tab) is only reachable while **docked**.
  **M** only works while **flying**.

---

## 1. Names

- [ ] **1.1** Intro screen: it says you fly out of **Meridian Station** — not "Meridian Outpost".
- [ ] **1.2** Intro control text uses the words **pocket** and **system**. The word "sector" is gone.
- [ ] **1.3** Press **Enter game**, then **Launch**.
- [ ] **1.4** Top-right of the HUD, first line reads **Meridian Station**.
- [ ] **1.5** The station's on-screen marker reads **Meridian Station**.

## 2. Normal flying is unchanged

- [ ] **2.1** Mouse steers; **W/S** throttle, **A/D** strafe, **Space/C** up/down, **Q/E** roll,
      **Shift** boost, **X** stop. Feel is identical to before.
- [ ] **2.2** Hold **Left Alt** and move the mouse to orbit; scroll to zoom. Release to return.
- [ ] **2.3** **P** or **Esc** pauses; the sound switch and Resume work.
- [ ] **2.4** Fly to the asteroid field, press **2** for the mining beam, hold left click on a rock.
      Ore goes into your hold and the rock shrinks.
- [ ] **2.5** **F** locks a target, **F** again releases. Cannons (key **1**, left click) kill a raider;
      it drops a crate you can pick up.

## 3. Warping between pockets

- [ ] **3.1** Note a mineable rock you have partly mined (or mine one now).
- [ ] **3.2** Press **M**. The warp takes about 2 seconds: throttle releases, your turn eases back to
      straight, white flash, then control returns. Weapons are offline during it.
- [ ] **3.3** The centre message reads **"Warp: Meridian Station to Kestrel Hollow."**
- [ ] **3.4** In Kestrel Hollow: **empty space**. No station, no asteroid field, no planet, no markers.
      Top-right of the HUD reads **Kestrel Hollow**.
- [ ] **3.5** Press **G** here. Nothing happens (there is no station to dock at) — that is correct.
- [ ] **3.6** Press **M** again. Message: **"Warp: Kestrel Hollow to Meridian Station."**
      Station, belt and planet are all back.
- [ ] **3.7** The rock from 3.1 is **still partly mined** — the belt comes back as you left it.

## 4. The pocket you are in is remembered (the main new thing)

- [ ] **4.1** Press **M** to go to **Kestrel Hollow**. Now **reload the page** (F5) and press
      **Enter game**. **Expect:** you resume **flying in Kestrel Hollow**, HUD says Kestrel Hollow,
      empty space around you, ship stationary. You are **not** docked and **not** back at Meridian.
- [ ] **4.1b** Sound works straight away in Kestrel Hollow (engine hiss when you thrust). Press **Esc**
      and flip the sound switch off and on — it must actually mute and unmute. *(This was bug 1.)*
- [ ] **4.1c** Press **M** to Meridian, then dock with **G**. **Expect:** the **station menu**
      (Contracts, Hangar, Outfitting, …) — **not** the "Enter game" start screen. *(This was bug 2.)*
- [ ] **4.2** Press **M** to return to **Meridian Station**. Fly within **300 m** of the station and
      slow below **70 m/s** (the hint tells you), then press **G** to dock.
- [ ] **4.3** **Reload the page** again and press **Enter game**. **Expect:** you go straight into the
      **station menu at Meridian Station**, docked, exactly as before.
- [ ] **4.4** While docked, open **Saves** and press **Save** on **Slot 1**.
- [ ] **4.5** **Launch**, press **M** to Kestrel Hollow, **reload**, **Enter game** (flying in Hollow).
      Press **M** to Meridian, dock with **G**, open **Saves**, press **Load** on **Slot 1**.
      **Expect:** docked at Meridian Station, credits/hold as saved.
- [ ] **4.6** **The save-load check that failed before (bug 3).** Docked, note your credits. Buy
      something cheap in the **Shop** so the number changes (e.g. a 1 cr part). Go to **Saves** and
      press **Load** on Slot 1. **Expect:** the credit number changes back **immediately, on that one
      click**, and the message "Loaded slot 1" appears. You must **not** have to press Save to make it
      take effect.

## 5. Old save slot still loads

- [ ] **5.1** Docked at Meridian, open **Saves**. If you have an old slot from before this version,
      press **Load** on it.
- [ ] **5.2** **Expect:** it loads with no error, and credits, ships, fitted modules, cargo and station
      storage are intact.
- [ ] **5.3** **Expect:** if that old save was made at the station you open **docked**; if it was made
      away from the station you resume **flying** at that pocket's arrival point.

## 6. Old export code still loads

- [ ] **6.1** Docked, open **Saves**. In the text box under **Export and import**, paste your **old
      export code** (from step 0.1, or code **A** in `TEST-OLD-CODES.txt`). Press **Import**.
- [ ] **6.2** **Expect:** "Save imported." and your progress is intact. With code **A** you should see
      **4850 cr**, **2 ships**, and be **docked at Meridian Station**.
- [ ] **6.3** Now paste code **B** from `TEST-OLD-CODES.txt` and press **Import**.
      **Expect:** it loads and you resume **flying in Kestrel Hollow** — that old save was made away
      from the station, so it puts you back out there.
- [ ] **6.4** Get back to Meridian (M), dock (G), open **Saves**, press **Export**, then press
      **Import** with that same new code still in the box. **Expect:** loads cleanly, nothing lost.

## 7. Station business is unchanged

- [ ] **7.1** **Contracts**: accept one, complete it, collect the reward.
- [ ] **7.2** **Shop**: buy a part. **Inventory**: move items between station and hold (click, and
      Shift-click for the whole stack). Right-click an item to sell.
- [ ] **7.3** **Outfitting**: fit and unfit a module; drag/zoom the ship. **Hangar**: switch ships.
      **Base**: upgrade something.
- [ ] **7.4** None of these mention "sector", and none of them change your pocket.

## 8. No errors

- [ ] **8.1** Open the browser console (**F12 → Console**). No red errors during any of the above.

---

**Result:** pass / fail — and if fail, the step number plus what you saw.

Notes on what is *intentionally* not in this version: there is no map screen (M just cycles pockets —
the map is step 11); exact position, speed, shield and boost are not saved, so an away save puts you at
the pocket's arrival point rather than exactly where you were; mined rocks reset when you reload the
page (persistent place memory is step 12).
