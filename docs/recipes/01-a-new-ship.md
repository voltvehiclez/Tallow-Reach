# Recipe 1: A new ship

> One of the step-by-step recipes indexed in [HOW_TO_ADD.md](../HOW_TO_ADD.md). Read the checklist there first.
> Kind of work: data only.


File: `src/data/ships.js`. Copy an existing entry and give it a new key. All of these
fields are required (the test checks them): `n d cargo dmg mine sc price col`.
Every baseline hull is the same ship apart from its `cargo` (the hold, in m³: one cargo unit = 1 m³) —
`dmg`, `mine`, `sc` and `price` are the same on all of them and a test enforces it. The one
deliberate exception is the Test Ship (2026-11-15: `dmg: 10`, `hpMul: 100`, `price: 1`); it
skips that assertion, and no other hull may. Hull HP
come from the fitted hull module (`hull_basic`, `sim/hull.js`), not from the hull, optionally
multiplied by the hull's `hpMul` (via `effectiveHullOf`; `hullOf` returns raw module HP).
`dmg` multiplies EVERYTHING the ship fires: cannons (`sim/weapons.js`) and missiles
(`sim/missile.js`); the mining beam deals no damage, and collision/ram damage is physics, not
output — it is not scaled. Ship-specific bonuses beyond these are new hull attributes when
they arrive.

The Hangar, the purchase rules, repairs and saves all read `SHIPS`, so the new ship
appears automatically. It uses the standard hull model coloured by `col` and sized by `sc`,
or its own `ship.<class>.glb` dropped into `src/assets/models/` (see [GLB_MODELS.md](../GLB_MODELS.md)) — the Test Ship flies
the owner's `ship.testship.glb`.

Optional: a visible add-on (like the Prospector's drill) goes in `buildPlayerShip(id)` in
`src/render/models.js`.
