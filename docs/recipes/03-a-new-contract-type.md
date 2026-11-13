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
A contract that hands in an item also needs `handIn.objective`: the sentence shown while the goods are still owed. The
runner shows it instead of claiming the contract is complete, and the linter rejects a missing one. Wording says
"Contract", never "Mission", and never uses the words complete/accomplished as guidance.

**Where it is handed in.** A contract is handed in at the station that gave it out, which the runner records when the
pilot accepts it — you write nothing. Use `{station}` in the objective and the hand-in sentence so the text follows that
station instead of a hard-coded name. Only set `handIn.station: "<pocket id>"` if the contract must be handed in somewhere
else (a job that starts at one station and ends at another); the linter checks the pocket has a station. The reward is
refused anywhere else, so a contract can never be paid at the wrong counter.

```js
// src/data/contracts.js
export const CONTRACT_TYPES = ["mine", "hunt", "salvage", "cores"];
// ... inside CONTRACT:
cores: tier => {
  const n = 1 + tier;
  return { n, r: n * 400 + 100 * tier };
},
// ... inside DESCRIBE (board offer and mission title):
cores: m => `Recover ${m.n} reactor cores`,
// ... a step in CONTRACT_MISSION_TEMPLATES:
cores: {
  id: "contract.cores", title: "Cores contract", kind: "contract", requires: [],
  steps: [{ id: "objective", kind: "collect", item: "core", objective: "Recover {remaining} reactor cores for delivery to {station}." }],
  handIn: { objective: "Deliver {count} reactor cores to {station}." },
  rewards: { credits: "$reward" }, fails: { abandon: "abandoned" },
},

// src/sim/contracts.js (bottom of the file)
on("pickup", ({ item }) => progress("cores", () => item === "core"));
```

Making the thing *exist in the world* is separate code. A hunt contract names the enemy it
wants with `e` in `data/contracts.js` and the spawner in `sim/ai.js` brings that enemy in.
Salvage crates are placed in `launch()` in `sim/session.js`.

Which events can drive progress: `mined`, `pickup`, `enemy-killed`, `docked`, `launched`
(payloads are listed at the top of `src/util/events.js`).
