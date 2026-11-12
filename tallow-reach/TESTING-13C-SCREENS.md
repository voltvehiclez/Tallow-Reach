# Step 13c browser playtest — dialogue and mission log

Step 13c adds the Mission log station tab and the live data-driven dialogue panel. The panel has a
portrait slot, speaker, text, choices and line controls. Dialogue does **not** pause the simulation by
default; only a mission step with `pause: true` may request that behavior.

Run this after the existing Step 13a/13b checks:

```bash
npm test
npm run build
```

The build must finish and all tests must pass. If a command fails, report its exact output rather than
continuing with the browser pass.

## 1. Open the Mission log

- [ ] **1.1** Open the built game or live preview and check the browser console for red errors.
- [ ] **1.2** Enter the game, dock at the home station and open the **Mission log** tab. It should show
      the active missions, their current objective and a **Next** instruction without exposing internal
      step or dialogue-line counts. Quantitative contracts may show a clearly labelled objective count.
      The existing **Contracts** tab remains available with its board,
      active rows, Accept, Refresh, Abandon and inventory-gated Collect reward actions.
- [ ] **1.3** The Mission log should list a **Story missions** section with **The Border Signal** when
      that story mission is not already active. Start it once. It should enter the active list without
      changing the existing contract board.
- [ ] **1.4** While flying, check the top-right HUD. Every active mission should show its title and a
      direct, spoiler-safe objective, such as **Investigate the signal in Kestrel Hollow** or
      **Stay with the signal in Kestrel Hollow**. It should not reveal an encounter before it happens.
      Multiple active missions must all remain
      visible. Then press **P** or **Esc** to open the pause overlay. **Resume** must be above
      **Exit to main menu**. Click **Exit to main menu** and confirm gameplay closes to the title screen,
      where **Campaign** is first and disabled and **Open World** is second. Click **Open World** and
      confirm it uses the existing flow, returning to the same station or flight resume point.

## 2. Use the dialogue panel

- [ ] **2.1** After starting The Border Signal, a dialogue panel should appear with a portrait slot,
      **Archivist Vale**, the first data-defined line and a `1 / 2` counter. The world should not be
      paused just because the panel is visible.
- [ ] **2.2** Click **Continue**. The second line should appear and the two data-defined choices,
      **I will investigate.** and **Not today.**, should replace Continue.
- [ ] **2.3** Choose either response. The panel should close or update as the story advances, the
      Mission log should show the changed objective, and no story text should be missing or replaced by
      a hard-coded placeholder.
- [ ] **2.4** If the station-contact dialogue is still open, launch and confirm the panel changes to
      **Redock to continue talking.** with no active Continue/choice control. Redock and confirm the
      conversation controls return. In-field dialogue, such as the beacon handoff, must remain actionable
      while flying. Warp away before clicking Close and confirm the mission remains active. Normal throttle,
      boost, mining/combat, docking and pause behavior must still work; the dialogue panel is an overlay and
      does not automatically pause flight.

## 3. Save and mission-log consistency

- [ ] **3.1** Leave a story dialogue on its second line or leave a story mission on an objective, save
      in the Saves tab, reload that slot, and return to the Mission log. The same current objective,
      dialogue line, choice state and Next instruction should be restored.
- [ ] **3.2** Confirm all active contracts and the story mission remain visible in the Mission log and
      the flight HUD. Completing or abandoning one must remove only that mission from the active list.
- [ ] **3.3** Choose **I will investigate.**, fly to Kestrel Hollow and destroy the two mission raiders.
      The final raider should automatically clear the wave wait. Because you are already in Hollow, the
      search step should start with its reach objective complete; the log should show the remaining
      hold-position objective and its progress instead of waiting forever for a second Hollow entry.
- [ ] **3.4** Complete the available dialogue branch far enough to reach an objective. Verify the log
      changes from the dialogue instruction to the objective instruction and the current progress bar
      follows the runner.

## 4. Result

- [ ] **PASS** — all commands and checks worked and the browser behavior above matched. Reply:
      **“Step 13c screens playtest passed.”**
- [ ] **FAIL** — report the checklist number, expected behavior, actual behavior, and any browser-console
      error. Do not tick all of Step 13 until the issue is fixed and replayed.
