# Recipe 3: A new contract type

> One of the step-by-step recipes indexed in [HOW_TO_ADD.md](../HOW_TO_ADD.md). Read the checklist there first.
> Kind of work: data + small code.


Contracts count progress through events. Example: "Recover N reactor cores".

1. `src/data/contracts.js`
   - add `"cores"` to `CONTRACT_TYPES`
   - add a generator to `CONTRACT` that returns `{ n, r }` (count and reward in credits)
   - add a line to `DESCRIBE` (see the code below)
2. `src/sim/contracts.js`: add a listener at the bottom (see the code below).
3. The board, the saved-game loader and the Contracts screen read the list, so no other file needs the type.

```js
// src/data/contracts.js
export const CONTRACT_TYPES = ["mine", "hunt", "salvage", "cores"];
// ... inside CONTRACT:
cores: tier => {
  const n = 1 + tier;
  return { n, r: n * 400 + 100 * tier };
},
// ... inside DESCRIBE:
cores: m => `Recover ${m.n} reactor cores`,

// src/sim/contracts.js (bottom of the file)
on("pickup", ({ item }) => progress("cores", () => item === "core"));
```

Making the thing *exist in the world* is separate code. A hunt contract names the enemy it
wants with `e` in `data/contracts.js` and the spawner in `sim/ai.js` brings that enemy in.
Salvage crates are placed in `launch()` in `sim/session.js`.

Which events can drive progress: `mined`, `pickup`, `enemy-killed`, `docked`, `launched`
(payloads are listed at the top of `src/util/events.js`).
