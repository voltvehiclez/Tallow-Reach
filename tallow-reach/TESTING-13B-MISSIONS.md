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
- [ ] **2.3** Script actions set saved per-place state, request a hostile wave and give the story item.
- [ ] **2.4** A trigger wait, a reach objective and a timed survive objective complete a parallel block.
- [ ] **2.5** Dialogue position, flags, mission counters, timers and per-place script state survive save/load.
- [ ] **2.6** Death, leaving the declared sector and the mission timeout apply the declared abandon outcome.

## 3. Scope note

The runtime checks intentionally do not replace the browser screen pass. The dialogue panel and
Mission log tab are covered by `TESTING-13C-SCREENS.md`. Do not tick all of Step 13 until the owner has
also played the 13a contract guide and the 13c screens.

## 4. Result

- [ ] **PASS** — all commands and checks worked. Reply: **“Step 13b runtime checks passed.”**
- [ ] **FAIL** — report the command, test name, expected result and actual result.
