# Step 12 playtest — generated pocket content and persistent place memory

For the owner. About 20–30 minutes. No coding is needed.

Step 12 fills generated pockets instead of leaving them as empty placeholders. Three data templates
(`frontier`, `trade_lane`, `salvage_yard`) select content by generated tier. You will see asteroid
fields, static derelicts/resource caches, generic hostile patrols and, in trade-lane pockets, a
**dockable trader station** that reuses the existing Meridian shop. Mining and clearing are remembered
in the world save. The default cooldown is seven minutes of **simulation time**; pausing does not
advance it. A future event can force a rock or encounter back early.

When everything passes, reply **“Step 12 playtest passed.”** Do not edit or delete a save while testing
unless the checklist tells you to export it first.

---

## 0. Before you start

- [ ] **0.1** Export your current save from the Saves tab and keep the `TR1:` code somewhere safe.
- [ ] **0.2** Open the new build. If you are starting from source, run `npm run build` first, then
      open the generated game or the live preview. Open the browser console and check for no red game
      errors.
- [ ] **0.3** Run the automated checks from the project folder:

      ```sh
      npm run build
      npm test
      ```

      The build must finish and all tests must pass. If a command fails, report the exact output rather
      than continuing with a browser pass.

## 1. Reach a generated pocket

- [ ] **1.1** Enter the game, launch from Meridian Station, and press **M** while flying. The map still
      opens, pauses single-player simulation and closes with **M** or **Esc** as in the Step 11 guide.
- [ ] **1.2** Use the galaxy map to choose a directly reachable gate, warp there, and then warp into
      the generated pocket on the far side. The exact route may differ by seed; use the legal **Warp to**
      popup rather than trying to fly through a gate.
- [ ] **1.3** On arrival, open the map and confirm the pocket is no longer described or presented as
      empty in the pocket information. Close the map and look around: there should be an asteroid field
      with several visible rocks. Do not expect the three templates to have identical scenery.
- [ ] **1.4** Fly to another generated pocket when convenient. Confirm that its field position, planet
      or station arrangement, and amount/type of content can differ from the first pocket. The map and
      warp animation should otherwise feel unchanged.

## 2. Mine a rock and check the pause-safe cooldown

- [ ] **2.1** In a generated asteroid field, fit/use the mining beam and mine one rock until it is
      depleted. Confirm ore enters the hold and the rock disappears rather than instantly returning.
- [ ] **2.2** Press **P** to pause. Wait at least 30 seconds in real time. Resume and verify that the
      mined rock has not returned merely because wall-clock time passed.
- [ ] **2.3** While still in the pocket, mine another rock, dock/warp away, and wait at least 30 seconds
      while paused or on the map. Return to the pocket. The mined slot should still be absent; visiting
      the pocket must not reset its memory.
- [ ] **2.4** Save/export after mining, reload/import that save, and return to the same generated pocket.
      The mined slot should remain absent. Other rocks should remain available. This checks that the
      cooldown belongs to the world, not the portable pilot profile.
- [ ] **2.5** If you have time, unpause and play normally for several minutes. The cooldown is about
      seven minutes of active simulation time, not seven minutes of browser time. The exact rock slot
      should return only after that simulation time has elapsed. Do not wait seven minutes if the rest of
      the checklist is complete; the automated test covers the full timer.

## 3. Static derelict and resource-cache encounters

- [ ] **3.1** Search the generated pockets you visited for loose salvage/ore crates away from the
      station. A derelict/cache is represented by its loot in this slice; there is no separate derelict
      ship model yet.
- [ ] **3.2** Pick up all crates belonging to one group. Confirm normal cargo pickup, item names and
      pickup sound still work. The final crate should leave that encounter empty rather than causing
      duplicate crates on the next place refresh.
- [ ] **3.3** Warp away and back, or leave and re-enter the pocket. The cleared encounter should remain
      absent. Other encounter groups and the asteroid field should not be cleared just because this one
      was collected.
- [ ] **3.4** Save/export while the encounter is cleared, then reload/import and revisit. It should
      remain absent with the cooldown still running. Existing character credits, cargo, fittings and
      mission progress must be unchanged apart from the items you actually collected.

## 4. Trader station proof

- [ ] **4.1** Find a generated pocket with a visible station ring. Trade-lane pockets have the highest
      chance; inspect another generated pocket if the first one has no trader.
- [ ] **4.2** Fly within the station ring, slow below the displayed docking speed and press **G**. The
      HUD/menu should dock at the generated trader, not send you back to Meridian or show the intro.
- [ ] **4.3** Open **Shop**. Its rows and prices should be the existing Meridian `SHOPS` stock, and a
      purchase should use the normal station storage/economy flow. This slice intentionally does not
      create independent storage for each station.
- [ ] **4.4** Launch from the generated station. The ship should appear at that station's launch point,
      not at Meridian, and the local asteroid field/planet scenery should remain in the same pocket.

## 5. Generic patrol and hunt contract regression

- [ ] **5.1** Fly far enough from a generated station and near its asteroid field for a patrol to appear.
      Hostile ships should still approach and shoot using the existing enemy behaviour; this is no longer
      a raider-only special-case spawner internally.
- [ ] **5.2** Accept or use a normal hunt contract and confirm its requested enemy type and kill progress
      still work. The generic ambient encounter layer must not change the wording, target or reward of the
      hunt contract.
- [ ] **5.3** Clear a one-shot patrol group if one appears, then leave and return. Its members should not
      immediately respawn. Ordinary repeatable authored Meridian patrol behaviour must remain normal.

## 6. Save and regression checks

- [ ] **6.1** Open **Saves** while docked and export a current `TR1:` code. The game still uses the same
      autosave/slot keys and code prefix. A current save is version 18 internally; you do not need to
      edit the code or inspect the JSON to play.
- [ ] **6.2** Import the old code you saved in section 0. The old character, ships, cargo, fittings,
      station storage and route data should load. An old save starts with no place-memory cooldowns,
      which is expected; it must not crash or lose the profile.
- [ ] **6.3** Recheck the baseline: flight, boost, mining beam, cannons, missiles, targeting, docking,
      launch, Shop, Inventory, Outfitting, contracts, starmap and pause all still work.
- [ ] **6.4** Check the console after entering/leaving generated pockets, mining, collecting crates,
      docking at a trader, saving and importing. There should be no red game errors.

## 7. Result

- [ ] **PASS** — all applicable checks worked. Reply: **“Step 12 playtest passed.”**
- [ ] **FAIL** — report the checklist number, what you did, what you expected and what happened.
      Include a screenshot or browser-console error if available. Do not tick Step 12 until the issue is
      fixed and the playtest is repeated.
