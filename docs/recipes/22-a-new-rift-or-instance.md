# Recipe 22: A new rift, instance or wormhole run

> One of the step-by-step recipes indexed in [HOW_TO_ADD.md](../HOW_TO_ADD.md). Read the checklist there first.
> Kind of work: **data only** for a new run, a new door or a new sky colour; **data + one function** for a new
> objective, exit rule, expiry outcome or sky **kind**.

An **instance** is a generated place that exists only while a run is live. It is not on the starmap, not
a pocket of any system and not warpable: it is a place record registered at runtime with
`kind: "instance"` and `parent:` the system the pocket it was opened from belongs to. A **rift** is a door
the pilot carries and opens; a **wormhole** is a door the world spawns (slice 14c). Vocabulary lives in
`src/data/instances.js`, behaviour in `src/sim/instances.js`, and neither imports `ui/`, `render/` or `core/`.

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
  objective: {
    kind: "destroy-guardians",
    n: "Destroy the rift guardians",          // the HUD's line, and the pilot's hint
    done: "The last rift guardian breaks up.", // said once, when it is met
  },
  exit: {
    n: "Rift gate",                           // a wormhole's is "Stable wormhole"
    pos: [0, 10, 500],                        // where the way out hangs: a thing in the world
    r: 26,                                    // how big it is drawn, in metres
    requires: [
      { type: "objective-done", message: "The way out is sealed until the guardians are destroyed." },
    ],
  },
  onExpire: { kind: "kill", message: "The rift collapsed with your ship inside it." },
  cache: { n: "Salvage cache", loot: "rift_cache", pos: [0, -30, -560], r: 10 },
  enter: { pos: [0, 0, 320] },
  sky: { kind: "shattered", col: 0x1a0c06, glow: 0xff7a2a, cracks: 0xffb267, shards: 26 },
  features: [
    { kind: "asteroidField", id: "field", n: "Rift debris", pos: [900, 60, -700], radius: 480,
      height: 170, count: 28, ore: "rift_rock", respawnSec: 420, stable: true,
      rock: { rMin: 20, rMax: 72, orePerR: 1.9 }, salvage: { spread: [500, 120, 500] } },
  ],
},
```

Rules the framework enforces, and `tests/step14-instances.test.mjs` checks:

- Every word must already exist: `guardians.enemy` in `data/enemies.js`; `cache.loot` and a field's
  `ore` in `data/loot.js`; `objective.kind` in `OBJECTIVE_KINDS`; `exit.requires[].type` in
  `EXIT_REQUIREMENT_TYPES`; `onExpire.kind` in `EXPIRY_OUTCOME_TYPES`; `sky.kind` in `SKY_KINDS`. Each
  of the last four also needs a handler (see §4 and §5).
- `features` must contain **no `planet` and no `spawner`**. A run is somewhere else, so nothing in it is
  copied from the space outside (owner decision 2026-11-14): the sky is its own, and the wave is
  `guardians`, spawned once when the run is built, with `encounter: null` so it writes no place memory
  and can never trip a mission trigger.
- Put the **way out where the pilot can see it from the arrival point** (`exit.pos` within
  `RIFT.exitRange` of `enter.pos`), and the canister far enough away that it has to be flown to.
- `objective.n`, `objective.done`, `exit.n`, every `requires[].message` and `onExpire.message` are the
  pilot's words. The HUD prints only these (LESSONS L11): never a rule name, an id or a bare number.
- A field uses `stable: true`, so its rocks are derived from the instance's seed and the run leaves
  no trace in `world.placeMemory`.
- `lifetimeSec` runs from **entry** for a rift. A wormhole's 20 minutes belong to the pocket that
  spawned in normal space (slice 14c), so its instance declares `lifetimeSec: 0` and its
  `exit.requires` is `[]` — the way out must never have a clock of its own.
- `cache` is optional; without it there is no prize to open.

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
("That rift is already open here."), because the same seed is the same run and its prize is one-time.

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

## 5. A new sky (a look, never a rule)

A template's `sky` is read by `render/scene.js` alone. Colours and counts are data; a **kind** is one
builder in the `SKIES` registry there:

```js
// render/scene.js — one entry per kind, listed in data/instances.js `SKY_KINDS`
SKIES.ember = sky => {
  const object = new THREE.Group();
  /* … meshes built from sky.col / sky.glow, jittered with cosmeticRandom() only … */
  return { object, spins: [{ object, rate: 0.004 }], dispose() { /* free every geometry and material */ } };
};
```

Rules: `dispose` must free everything the builder made (a run ends and `forgetPlace(id)` calls it);
jitter comes from `cosmeticRandom()`, never `Math.random()` in `sim/` or `data/`; a place with a sky
hides the ordinary starfield (`showPlace`), and the sky follows the camera (`updateScenery`). Add the
kind to `SKY_KINDS` in `src/data/instances.js` in the same change.

## 6. What you get for free

`createInstance(templateId, seed, { origin, entry, tier })` builds and registers the record:

- **Identity**: `instanceIdFor(templateId, seed)`, so one seed is always one instance — the same
  rocks, the same wave, the same prize, metre for metre.
- **Seeded streams**: the wave uses `streamRng(seed, 1)` and the canister's stock `streamRng(seed, 2)`;
  nothing in `sim/` calls `Math.random()`.
- **Place**: registered `kind: "instance"` (never `pocket`, so `pocketsIn` and the starmap cannot see
  it), with its `sky`, and `placeAt` falls back to `DEFAULT_PLACE` for an id that has been destroyed.
  `loadPlace` builds its features through the ordinary loader.
- **Three objects in the world**, all F-lockable and all labelled in the HUD at all times
  (`sim/targeting.js` kinds `r` rift door, `g` way out, `k` canister): the **door** a pilot opens
  (`kind: "rift"`), the **way out** (`kind: "gate"`, `record.exitPos`) and the **prize canister**
  (`kind: "cache"`, `record.cache.entity`). The door and the gate are drawn by one shared anomaly
  builder in `render/views.js`, so a way out always looks like the way in; the canister is a drum with
  a lamp that is red while sealed and green once open.
- **The prize is opened by the pilot, never spilled** (LESSONS L6): `completeObjective` unlocks the
  canister, and `openCache(record, player, profile)` moves its stacks into the pilot's own hold one
  unit at a time — what fits comes aboard, what does not stays inside and waits for the next **R**
  inside `RIFT.cacheRange`. Every answer is a sentence the pilot sees.
- **Difficulty**: `sim/ai.js` multiplies an enemy's hp and damage by `instanceAt(place).difficulty`.
- **Ticks**: `updateInstances(dt)` runs the clock, the warning, the objective, both objects' spin and
  lock state, and the prompt; `updateRifts(dt, placeId)` turns each door and offers "Press R to enter …".
- **Input**: `R` is bound in `core/input.js` and dispatched in `main.js` through `riftAction`; there is
  no menu for it.
- **HUD**: `instanceHtml` in `ui/hud.js` shows the authored objective, the countdown, the canister line
  and the exit line; `ui/cargo.js` offers **Use** and `ui/screens.js` labels the tile.
- **Death**: `sim/session.js` emits `dying` before the ship and hold go, and `sim/instances.js`
  listens to despawn the run the pilot died in and put them back at their entry spot, so the ordinary
  death rules then apply unchanged.
- **Events** (documented in `util/events.js`): `rift-opened`, `rift-entered`, `rift-left`,
  `instance-closed { reason }` (`left | expiry | death | refused | reset`), `instance-expired { kind }`,
  `instance-warning`, `instance-objective-done`, `instance-cache-open`, `instance-restored`,
  `instances-forgotten`.

## 7. Saves (slice 14b, save v20)

A run **is** saved. `world.instances` keeps one entry per live run — template, seed, tier, remaining
lifetime, `warned`, whether the objective is met, the canister's remaining stock and open flag, and the
entry spot — written by `captureInstances()` in `state/state.js` and validated by `cleanInstanceRuns`
in `state/profile.js`. `captureResume()` saves the pilot's own spot inside the run, `enterPlace` names
the run as the current place and `destroyInstance` names the pocket again on the way out.

A load rebuilds through `restoreInstances()` (records and place registrations) and
`populateInstances()` (the wave, the canister and the gate), both called by `resumeFromSave()`; boot
calls `restoreInstances()` before `loadPlace`. **The rule for anything you add to a run: it must either
come out of the template and the seed, or be added to both `captureInstances` and `cleanInstanceRuns`** —
a saved run is rebuilt, never deserialised. An id `instanceIdFor` would not produce is dropped, and a
pilot whose saved place is then nowhere is sent home. Known and deliberate: the wave comes back at full
strength (a save carries the run, not each guardian's damage), and an emptied canister stays empty, so
reloading can never farm a prize twice. Slice **14c** saves a spawned wormhole pocket with its remaining
time (v21). See "Save compatibility" in [ARCHITECTURE.md](../ARCHITECTURE.md).

## 8. Tests to run

`npm test`. The instance rules live in `tests/step14-instances.test.mjs` (template completeness and the
registries, the weighted roll, seeded determinism, clearance margins, one use, entering and leaving by
R, the gate and canister as objects in the world, F-locks and their labels, the sealed exit, opening the
canister with a full hold, both expiry outcomes, fail-closed rules, reset, two reload round trips, the
v19 migration and a run that cannot be rebuilt); `tests/layers.test.mjs` pins the entity kinds and
forbids `sim/` from reaching `ui/`, `render/` or `core/`; `tests/views.test.mjs` counts the registered
views; `tests/docs.test.mjs` insists this recipe is indexed and that every new `src/<folder>/*.js` is
named in that folder's `README.md`.
