# Recipe 5: A new base module

> One of the step-by-step recipes indexed in [HOW_TO_ADD.md](../HOW_TO_ADD.md). Read the checklist there first.
> Kind of work: data + small code.


1. `src/data/station.js`: add the module to `BASE_MODULES` (`n d max cost`) and give it a
   starting level in `BASE_DEFAULT`.
2. `src/state/profile.js`: add it to the `s.base = { ... }` block in `sanitizeProfile` so the
   level survives saving. Raise `SAVE_VERSION` and add a "Version history" line.
3. Give it an effect. The Base screen and `upgradeBase()` are generic, but a module does
   nothing until some rule reads its level (as `storageCap()` and `valueOf()` in `sim/economy.js` do).
4. The content test fails if step 2 is forgotten.
