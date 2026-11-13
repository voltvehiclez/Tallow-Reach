# Step 13b headless playtest — story mission runtime

Step 13b adds the story-side mission runtime. The dialogue panel and Mission log tab are now the
Step 13c screen slice, tested separately in `TESTING-13C-SCREENS.md`. The worked data mission is `The Border Signal` in
`src/data/missions/story.js`.

## 1. Run the checks

From the project folder (`tallow-reach/`):

```bash
node --test tests/step13b-missions.test.mjs
npm test
npm run build
```

- [ ] **1.1** The 13b test passes its data-reference and reachability checks.
- [ ] **1.2** The full suite passes with no failures.
- [ ] **1.3** The generated bundle builds successfully.

## 2. What the headless story test covers

- [ ] **2.1** Dialogue lines advance and the help choice jumps through the named branch.
- [ ] **2.2** The decline choice reaches a different dialogue step and sets the remembered flag.
- [ ] **2.3** Script actions set saved per-place state and request a hostile wave; the wave leaves one physical, mission-tagged **Beacon** at the carrier's defeat position, while ordinary salvage loot remains separate.
- [ ] **2.4** A trigger wait, a reach objective and a timed survive objective complete a parallel block, then flying into the physical Beacon advances the retrieval step.
- [ ] **2.5** Dialogue position, flags, mission counters, timers and per-place script state survive save/load.
- [ ] **2.6** Death, leaving the declared sector and the mission timeout apply the declared abandon outcome.
- [ ] **2.7** The mission crate remains in Hollow across a warp and v19 save/load, restores at its saved
      position without duplicating, and is not recreated after pickup. A full hold leaves it in space until
      the pilot makes room and physically returns to it.
- [ ] **2.8** After the Border Signal final dialogue is closed, leaving Kestrel Hollow must not reset the
      completed mission. It should remain active and claimable at the home station; a missing Beacon must
      not pay or remove it, and a later claim must consume exactly one Beacon. Unrelated scripted item
      hand-offs must still wait rather than silently consuming a blocked step.

## 3. Scope note

The runtime checks intentionally do not replace the browser screen pass. The dialogue panel and
Mission log tab are covered by `TESTING-13C-SCREENS.md`. Do not tick all of Step 13 until the owner has
also played the 13a contract guide and the 13c screens.

## 4. Result

- [ ] **PASS** — all commands and checks worked. Reply: **“Step 13b runtime checks passed.”**
- [ ] **FAIL** — report the command, test name, expected result and actual result.
