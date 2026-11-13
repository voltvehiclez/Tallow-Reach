# Recipe 1: A new ship

> One of the step-by-step recipes indexed in [HOW_TO_ADD.md](../HOW_TO_ADD.md). Read the checklist there first.
> Kind of work: data only.


File: `src/data/ships.js`. Copy an existing entry and give it a new key. All of these
fields are required (the test checks them): `n d cargo dmg mine sc price col`.
Every hull is the same ship apart from its `cargo` (the hold, in m³: one cargo unit = 1 m³) —
`dmg`, `mine`, `sc` and `price` are the same on all of them and a test enforces it. Hull HP
come from the fitted hull module (`hull_basic`, `sim/hull.js`), not from the hull.
Ship-specific bonuses will come later as new hull attributes.

The Hangar, the purchase rules, repairs and saves all read `SHIPS`, so the new ship
appears automatically. It uses the standard hull model coloured by `col` and sized by `sc`.

Optional: a visible add-on (like the Prospector's drill) goes in `buildPlayerShip(id)` in
`src/render/models.js`.
