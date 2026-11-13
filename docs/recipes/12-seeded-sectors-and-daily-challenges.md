# Recipe 12: Seeded sectors and daily challenges

> One of the step-by-step recipes indexed in [HOW_TO_ADD.md](../HOW_TO_ADD.md). Read the checklist there first.
> Kind of work: see below.


All gameplay randomness already goes through `util/rng.js` (refactor step 2), so this is now just
using it:

1. Call `setSeed(n)` at the start of a run to make the whole game reproducible, and
   `setSeed(null)` to go back to ordinary play.
2. For anything that must regenerate from its own seed — a sector, a wormhole instance, a daily
   challenge — build a generator with `makeRng(seed)` and pass it in. Do **not** use the shared
   `random()` for that: it depends on how many dice the rest of the game rolled first, so the same
   sector seed would give a different sector in a different run.
3. `tests/rng.test.mjs` fails and names the file and line if anything in `src/sim/` or `src/data/`
   calls `Math.random()` directly. `R(a, b)` from `util/math.js` is the shared stream in a range.
