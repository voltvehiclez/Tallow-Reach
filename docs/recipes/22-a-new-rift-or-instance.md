# Recipe 22: A new rift, instance or wormhole run

> One of the step-by-step recipes indexed in [HOW_TO_ADD.md](../HOW_TO_ADD.md). Read the checklist there first.
> Kind of work: **data only** for a new run or a new door; **data + one function** for a new objective,
> exit rule or expiry outcome.

An **instance** is a generated place that exists only while a run is live. It is not on the starmap, not
a pocket of any system and not warpable: it is a place record registered at runtime with
`kind: "instance"` and `parent:` the pocket it was opened from. A **rift** is a door the pilot carries
and opens; a **wormhole** is a door the world spawns (slice 14c). Vocabulary lives in
`src/data/instances.js`, behaviour in `src/sim/instances.js`, and the two never import `ui/`, `render/`
or `core/`.

## 1. A new kind of run (data only)

One entry in `INSTANCE_TEMPLATES`:

```js
// src/data/instances.js
salvage_rift: {
  n: "Salvage rift",
  d: "A torn pocket with a wreck still warm.",
  tier: 5,                                    // advisory, above the map's 1..3
  lifetimeSec: 1200,                          // 0 = no clock of its own
  difficulty: { hp: 1.8, dmg: 1.6 },          // every hostile inside is this much harder
  guardians: { enemy: "raider", count: 5, spawnDist: [800, 1200] },
  objective: { kind: "destroy-guardians", n: "Destroy the rift guardians" },
  exit: {
    n: "Rift gate",                           // a wormhole's is "Stable wormhole"
    requires: [
      { type: "objective-done", message: "The way out is sealed until the guardians are destroyed." },
    ],
  },
  onExpire: { kind: "kill", message: "The rift collapsed with your ship inside it." },
  cache: { n: "Salvage cache", loot: "rift_cache", pos: [0, -30, -560] },
  enter: { pos: [0, 0, 320] },
  features: [
    { kind: "asteroidField", id: "field", n: "Rift debris", pos: [900, 60, -700], radius: 480,
      height: 170, count: 28, ore: "rift_rock", respawnSec: 420, stable: true,
      rock: { rMin: 20, rMax: 72, orePerR: 1.9 }, salvage: { spread: [500, 120, 500] } },
    { kind: "planet", id: "planet", pos: [-5200, -1400, -8600], radius: 2000, atmosphere: 2140,
      col: 0x3b2f45, atmoCol: 0x7d5f96, spin: 0.0022 },
  ],
},
```

Rules the framework enforces, and `tests/step14-instances.test.mjs` checks:

- Every word must already exist: `guardians.enemy` in `data/enemies.js`; `cache.loot` and a field's
  `ore` in `data/loot.js`; `objective.kind` in `OBJECTIVE_KINDS`; `exit.requires[].type` in
  `EXIT_REQUIREMENT_TYPES`; `onExpire.kind` in `EXPIRY_OUTCOME_TYPES`. Each of the last three also
  needs a handler in `sim/instances.js` (see §4).
- `features` must not contain a `spawner`. The wave is `guardians`, spawned once when the run is
  built, with `encounter: null` so it writes no place memory and can never trip a mission trigger.
- `objective.n`, `exit.n`, every `requires[].message` and `onExpire.message` are the pilot's words.
  The HUD prints only these (LESSONS L11): never a rule name, an id or a bare number.
- A field uses `stable: true`, so its rocks are derived from the instance's seed and the run leaves
  no trace in `world.placeMemory`.
- `lifetimeSec` runs from **entry** for a rift. A wormhole's 20 minutes belong to the pocket that
  spawned in normal space (slice 14c), so its instance declares `lifetimeSec: 0` and its
  `exit.requires` is `[]` — the way out must never have a clock of its own.
- `cache` is optional; without it there is no locked prize.

Then make it reachable: add `{ id: "salvage_rift", w: <weight> }` to a `RIFTS` pool (§2), or to a new
rift kind. The pool is a weighted roll, so the odds are data.

## 2. A new door the pilot buys and carries

1. **`RIFTS.<riftId>`** in `src/data/instances.js`: `{ n, templates: [{ id, w }] }`. `n` is what the
   item and the door are called; `templates` is the weighted pool `rollRiftTemplate(riftId, rng)`
   draws from. A pool of unknown ids or of zero weights opens nothing rather than guessing.
2. **The item** in `src/data/items.js`: `cat: "consumable"`, `use: "spawn-rift"`, `rift: "<riftId>"`,
   `vol`, `st`, and `v` at 60 % of its shop price, never more (`tests/selling.test.mjs`).
3. **A shop row** in `src/data/shops.js` (recipe 4). `tests/shops.test.mjs` counts the rows and
   checks the category allow-list, so update both when you add one.
4. A consumable is **one use**: `useItem` takes exactly one unit, and only when the action returned
   `{ text }`. A refusal returns a string, spends nothing and is shown word for word.

`openRift` also refuses when there is already a door for that template and seed in the pocket
("That rift is already open here."), because the same seed is the same run and its cache is one-time.

## 3. A new thing a consumable does

One entry in `USE_ACTIONS` (`src/sim/consumables.js`), plus the `use: "<id>"` field on the item:

```js
// Illustrative: the shape every handler has.
"deploy-beacon": ({ id, player, profile }) => {
  const refusal = beaconClearance(player);       // your own rule, returning a sentence or true
  if (refusal !== true) return refusal;          // a string: nothing is spent, the sentence is shown
  deployBeacon(player, profile);
  return { text: `A ${itemName(id)} is drifting behind you.` };
},
```

The handler is given `{ id, where, count, player, profile }`. Return `{ text }` on success or a
string to refuse. Never change the world and then refuse, and never return nothing: the flight card,
the right-click menu and the inventory grid need no changes for a new action.

**Use** is offered in the flight card only (`ui/cargo.js`); the station's Inventory tab has **Sell** and
**Discard**. That is where the owner put it, and a rift cannot be opened while docked anyway — so a
consumable that could only be used at a station needs the station menu extended first (`ui/menu.js`).

## 4. A new objective, exit rule or expiry outcome

Data declares the word, `sim/instances.js` implements it — one function each, no `if (id === ...)`
branches anywhere else:

```js
// sim/instances.js
export const OBJECTIVES = {
  // true when it is done; anything else (including an unknown kind) counts as not done.
  "destroy-guardians": record => !!record.spawned && !placeWorld(record.id).enemies.length,
  "mine-ore": record => (record.mined || 0) >= (record.objective.need || 1),   // new
};

export const EXIT_REQUIREMENTS = {
  // (record, requirement) -> true when the exit may be used, or the sentence the pilot is shown.
  "objective-done": (record, requirement) =>
    objectiveDone(record) || requirement.message || "The way out is sealed until the objective is complete.",
  "hold-item": (record, requirement) =>                                        // new
    countOf(state.profile.ship, requirement.item) > 0 || requirement.message,
};

export const EXPIRY_OUTCOMES = {
  kill(record) { /* the pilot dies; the run and its door despawn at once */ },
  collapse(record) { /* only the way in goes; the exit keeps working */ },
};
```

Add the new word to `OBJECTIVE_KINDS`, `EXIT_REQUIREMENT_TYPES` or `EXPIRY_OUTCOME_TYPES` in
`src/data/instances.js` in the same change, and keep the two lists in step.

**Never fail open.** `exitDenial` refuses a requirement type nobody wrote ("…cannot be checked") so a
typo can never let a pilot walk out of a sealed run, and `expireInstance` puts the pilot out of the
place if an outcome is unknown, so a typo can never trap them in a dead one. Both are tested.

## 5. What you get for free

`createInstance(templateId, seed, { origin, entry, tier })` builds and registers the record:

- **Identity**: `instanceIdFor(templateId, seed)`, so one seed is always one instance — the same
  rocks, the same wave, the same cache spill, metre for metre.
- **Seeded streams**: the wave uses `streamRng(seed, 1)` and the cache `streamRng(seed, 2)`; nothing
  in `sim/` calls `Math.random()`.
- **Place**: registered `kind: "instance"` (never `pocket`, so `pocketsIn` and the starmap cannot see
  it), `parent: origin`, and `placeAt` falls back to `DEFAULT_PLACE` for an id that has been
  destroyed. `loadPlace` builds its features through the ordinary loader.
- **Difficulty**: `sim/ai.js` multiplies an enemy's hp and damage by `instanceAt(place).difficulty`.
- **Ticks**: `updateInstances(dt)` runs the clock, the warning, the objective, the cache's spin and
  the exit prompt; `updateRifts(dt, placeId)` turns each door and offers "Press R to enter …".
- **Views**: `render/views.js` draws the `rift` and `cache` entity kinds from their records
  (recipe 19 for a third kind).
- **Input**: `R` is bound in `core/input.js` and dispatched in `main.js`; there is no menu for it.
- **HUD**: `instanceHtml` in `ui/hud.js` shows the authored objective, the countdown and the exit
  line; `ui/cargo.js` offers **Use** and `ui/screens.js` labels the tile.
- **Death**: `sim/session.js` emits `dying` before the ship and hold go, and `sim/instances.js`
  listens to despawn the run the pilot died in and put them back at their entry spot, so the ordinary
  death rules then apply unchanged.
- **Events** (documented in `util/events.js`): `rift-opened`, `rift-entered`, `rift-left`,
  `instance-closed { reason }` (`left | expiry | death | refused | reset`), `instance-expired { kind }`,
  `instance-warning`, `instance-objective-done`, `instance-cache-open`.

## 6. Saves

Slice 14a: an instance is session runtime. `captureResume()` redirects a save made inside one to the
pocket it was opened from plus the spot the pilot entered at, so a reload never lands in a place that
no longer exists. Slice **14b** saves the run itself (`SAVE_VERSION` 20, a migration and an old-save
test); slice **14c** saves a spawned wormhole pocket with its remaining time (21). See "Save
compatibility" in [ARCHITECTURE.md](../ARCHITECTURE.md).

## 7. Tests to run

`npm test`. The instance rules live in `tests/step14-instances.test.mjs` (template completeness and
the registries, the weighted roll, seeded determinism, clearance margins, one use, entering and
leaving by R, the sealed exit, the cache's spill, both expiry outcomes, fail-closed rules, reset);
`tests/layers.test.mjs` pins the entity kinds and forbids `sim/` from reaching `ui/`, `render/` or
`core/`; `tests/views.test.mjs` counts the registered views; `tests/docs.test.mjs` insists this recipe
is indexed and that every new `src/<folder>/*.js` is named in that folder's `README.md`.
