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
      the active missions, their current step, progress and a **Next** instruction. The existing
      **Contracts** tab remains available with its board, active rows, Accept, Refresh, Abandon and
      inventory-gated Collect reward actions.
- [ ] **1.3** The Mission log should list a **Story missions** section with **The Border Signal** when
      that story mission is not already active. Start it once. It should enter the active list without
      changing the existing contract board.

## 2. Use the dialogue panel

- [ ] **2.1** After starting The Border Signal, a dialogue panel should appear with a portrait slot,
      **Archivist Vale**, the first data-defined line and a `1 / 2` counter. The world should not be
      paused just because the panel is visible.
- [ ] **2.2** Click **Continue**. The second line should appear and the two data-defined choices,
      **I will investigate.** and **Not today.**, should replace Continue.
- [ ] **2.3** Choose either response. The panel should close or update as the story advances, the
      Mission log should show the changed step, and no story text should be missing or replaced by a
      hard-coded placeholder.
- [ ] **2.4** If the dialogue is still open, launch and confirm normal throttle, boost, mining/combat,
      docking and pause behavior still work. A dialogue panel is an overlay, not an automatic pause.

## 3. Save and mission-log consistency

- [ ] **3.1** Leave a story dialogue on its second line or leave a story mission on an objective, save
      in the Saves tab, reload that slot, and return to the Mission log. The same mission step,
      dialogue line, choice state and Next instruction should be restored.
- [ ] **3.2** Confirm all active contracts and the story mission remain visible in the Mission log and
      the flight HUD. Completing or abandoning one must remove only that mission from the active list.
- [ ] **3.3** Complete the available dialogue branch far enough to reach an objective. Verify the log
      changes from the dialogue instruction to the objective instruction and the current progress bar
      follows the runner.

## 4. Result

- [ ] **PASS** — all commands and checks worked and the browser behavior above matched. Reply:
      **“Step 13c screens playtest passed.”**
- [ ] **FAIL** — report the checklist number, expected behavior, actual behavior, and any browser-console
      error. Do not tick all of Step 13 until the issue is fixed and replayed.
