# Recipe 21: Add a place-template encounter

> One of the step-by-step recipes indexed in [HOW_TO_ADD.md](../HOW_TO_ADD.md). Read the checklist there first.
> Kind of work: Step 12.


Generated pocket content is data. Do not add a new `if (placeId === ...)` branch to a sim file.
The current registries are `src/data/place-templates.js` and `src/data/encounters.js`.

**Add another instance of an existing encounter kind.** Add an entry to `ENCOUNTERS` in
`src/data/encounters.js`, then reference its id in a template tier in `PLACE_TEMPLATES`:

```js
// src/data/encounters.js
rescue_cache: {
  kind: "resourceCache",
  n: "Rescue cache",
  d: "A sealed emergency cache.",
  item: "cobalt",
  count: [2, 5],
  respawnSec: 420,
},

// src/data/place-templates.js
frontier: {
  // ...existing fields...
  tiers: {
    1: ["hostile_patrol", "resource_cache", "rescue_cache"],
    2: ["hostile_patrol", "derelict", "rescue_cache"],
    3: ["hostile_patrol", "derelict", "resource_cache", "rescue_cache"],
  },
},
```

Use the fields belonging to the kind:

- `hostilePatrol`: `enemy`, `faction`, `count`, `interval`, `chance`, `nearRadius`,
  `farFromStation`, `spawnDist`, `maxActive`, `once`, `respawnSec`.
- `friendlyTrader`: `shop` must be an existing id in `src/data/shops.js`; `station` contains the
  dock/launch tuning. The station feature receives a stable `${placeId}:${featureId}` inventory key;
  it reuses the named shop's rows/economy but never another station's stock.
- `derelict`: `loot` must be a `kind: "drops"` table in `src/data/loot.js`.
- `resourceCache`: `item` must be a real `ITEMS` id and `count` is an inclusive `[min, max]` range.

A template's `tiers` table is selected by the highest tier not above the pocket's derived tier. Add
positions to `encounterPositions` when the default placement is not suitable. Asteroid fields use
`stable: true`, `respawnSec` and a field `id`; stable slots are stored as keys such as `field:3` in
`world.placeMemory`.

The existing generic code handles every instance of these four kinds: `placeDef()` expands the
features, `sim/ai.js` spawns patrols, `sim/encounters.js` builds static loot, and
`sim/place-memory.js` decrements cooldowns in simulation seconds. `emit("respawn-place", { placeId,
kind, id })` is the event hook for a future story or world event to force one cooldown early. Run
`npm test`; `tests/content.test.mjs` checks every encounter/template/loot/shop/item reference and
`tests/step12-places.test.mjs` checks generated filling, hunt behavior, persistence, pause safety and
forced respawn.
