# Step 13a playtest — data missions and concurrent contracts

For the owner. About 20–30 minutes. No coding is needed.

Step 13a moves the three existing contract types onto one data-driven mission runner. Mine, hunt and
salvage contracts keep their existing wording, rewards, enemy selection, crate spawning and completion
behavior, but more than one can now be active at once. The runner also understands reach, deliver and
survive objective events for the later story slices. Dialogue, choices, scripts, branching, parallel
steps, a dialogue panel and a mission-log tab are **not** part of 13a; they remain Step 13b/13c work.

When everything passes, reply **“Step 13a playtest passed.”** If something fails, report the checklist
number, what you expected and what happened. Do not tick Step 13 until this playtest is passed.

---

## 0. Before you start

- [ ] **0.1** Open the current build and export a `TR1:` save code from the Saves tab. Keep this code
      safe as the old-save check in section 6.
- [ ] **0.2** From the project folder, run the automated checks:

      ```sh
      npm run build
      npm test
      ```

      The build must finish and all tests must pass. If a command fails, report its exact output rather
      than continuing with the browser pass.
- [ ] **0.3** Open the built game or live preview and check the browser console for red errors.

## 1. Accept more than one contract

- [ ] **1.1** Enter the game and open the station **Contracts** tab. The board should still show four
      offers with the familiar `Mine ...`, `Destroy ...` and `Recover ...` wording, threat tier and
      credit reward.
- [ ] **1.2** Accept one mine, hunt or salvage offer. The board should refresh as before, and the new
      offer should appear above it under **Active missions** with `Progress 0/N` and the same reward.
- [ ] **1.3** Accept a second offer before completing or abandoning the first. Both must remain listed
      as separate active missions. Accept a third only if it makes the next checks easier.
- [ ] **1.4** Launch. The flight HUD should still show the first active objective and its progress; the
      ship, controls, weapons, map, pause and docking behavior should be unchanged.

## 2. Mine and complete a mining mission

Do this section if a mining offer is active. If not, return to the station, refresh the board and accept
one.

- [ ] **2.1** Read the requested ore and count in the contract text. In an asteroid field, mine that ore
      until the HUD objective advances. The HUD count should increase once per unit, not every render
      frame, and mining another ore must not advance this mission.
- [ ] **2.2** Return to a station and open **Contracts**. The active mission should show the same
      progress seen in flight. Other active missions must keep their own progress.
- [ ] **2.3** Mine the remaining amount. The mission should become complete without disappearing.
- [ ] **2.4** Click **Collect reward** once. Credits and Contracts done should increase by the advertised
      amount, the completed mission should leave the active list, and clicking again must not pay twice.

## 3. Hunt and complete a hunt mission

Do this section if a hunt offer is active. If not, accept one and launch.

- [ ] **3.1** Confirm the objective names the requested hostile type as before. If the objective is a
      hunt for the default raider, the normal patrol should still appear; do not expect unrelated
      enemy types to satisfy a named hunt.
- [ ] **3.2** Kill one requested hostile. The active count should advance once and the kill should still
      credit the pilot's normal kill total and loot. A hostile of the wrong type, if encountered,
      must not advance a named hunt.
- [ ] **3.3** Finish the count, dock and collect the reward. Verify the advertised credit total and no
      duplicate payout. Missiles, cannons, targeting, loot and the death/recovery flow should remain
      normal.

## 4. Salvage and complete a salvage mission

Do this section if a salvage offer is active. If not, accept one before launching.

- [ ] **4.1** Launch with the salvage mission active. The field should contain enough derelict crates for
      the outstanding amount. Several active salvage missions may share one spawned group; it must not
      duplicate crates just because two missions are active.
- [ ] **4.2** Collect crates normally. The HUD progress should advance from pickup events, while cargo
      limits, pickup sound and item counts remain unchanged.
- [ ] **4.3** Finish the requested number, dock and open **Contracts**. The mission text should say
      `N crates required`, not `Progress N/N`. If the required `Salvage` items are missing from the
      current station and current ship, the action button must say **Abandon**, not **Collect reward**.
- [ ] **4.4** Put the required items in the current station or ship. The button should change to
      **Collect reward**. Click it: the required Salvage items should be removed from the station/ship
      inventory and the advertised reward should be paid once. The crates should not reappear merely
      because the mission was completed or the place was refreshed.
- [ ] **4.5** Abandon one unfinished active mission with its **Abandon** button. It should disappear
      silently and stop receiving progress; another active mission must remain intact.

## 5. Check save, reload and compatibility behavior

- [ ] **5.1** While one mission is partly complete and a second mission is active, export a new `TR1:`
      code. Import it. Both mission records, their separate counters, credits, cargo and the rest of the
      character should be unchanged.
- [ ] **5.2** Import the code saved in section 0, which was made before the v19 mission save. It should
      load as a v19 save without a crash, keep the old character/world data, and either show the old
      active contract as one active mission or show no mission if there was none. The old `TR1:` prefix
      and save slots remain unchanged.
- [ ] **5.3** If you can inspect the exported JSON through the save tools, the portable half should use
      `missions` and `flags`; the old singular `mission` field is only a compatibility view and is not
      required to appear in the saved JSON.

## 6. Baseline and scope check

- [ ] **6.1** Recheck launch, flight, boost, mining beam, cannons, missiles, targeting, docking, Shop,
      Inventory, Outfitting, starmap, route warp, pause, save/import and generated-pocket behavior.
- [ ] **6.2** Confirm there is no new dialogue panel or mission-log tab yet. That is expected for 13a,
      not a failure; those are 13b/13c.
- [ ] **6.3** Check the browser console after accepting, advancing, completing, abandoning, saving and
      importing missions. There should be no red errors.

## 7. Result

- [ ] **PASS** — all applicable checks worked. Reply: **“Step 13a playtest passed.”**
- [ ] **FAIL** — report the checklist number, exact steps, expected result and actual result. Include a
      screenshot or browser-console error if available. Do not tick Step 13 until the issue is fixed and
      this guide is repeated.
