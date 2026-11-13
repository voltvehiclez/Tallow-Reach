# Recipe 14: A new pocket or system

> One of the step-by-step recipes indexed in [HOW_TO_ADD.md](../HOW_TO_ADD.md). Read the checklist there first.
> Kind of work: data only.


Places live in `src/data/places.js`. A **system** is a non-flyable grouping record
`{ id, kind: "system", n, parent: null }`. A **pocket** is a flyable place
`{ id, kind: "pocket", def, parent, n, d, enter, leave }`; `def` names an entry in `PLACE_DEFS`,
`parent` is the system it belongs to, and `enter.pos` is the arrival point. Generic player-facing
nouns live in `src/data/terms.js` (`mapNode`, `flyable`); proper names live on the place records.

1. Add the pocket to `PLACES` with `parent` set to its system id. A default `intraSystem: "free"` system
   can warp to it without an internal link; a route-only (`intraSystem: "links"`) system needs a connected
   internal link in `PLACE_LINKS` or `GALAXY_OVERRIDES.links`. The zoomed system map draws every pocket and
   the compact right panel lists their names; there is no fixed pocket count. Generation fails plainly if
   the new pocket is unreachable under its system's policy. `npm test` checks fields and connectivity.
2. Point `def` at `PLACE_DEFS.empty` for empty space, or copy `PLACE_DEFS.meridian` and edit its
   features. A definition is a list of features: `station` (position, keep-out, dock range/speed,
   launch point, shop id), `asteroidField` (position, radius, height, count, ore table, respawn,
   rock sizes, salvage spread), `spawner` (enemy id, anchor feature, distances, interval, chance,
   count) and `planet` (scenery position/radius/colour/spin). The generic loader (`sim/places.js`)
   builds the entities; `render/scene.js` builds station/planet scenery from the same definition.
3. The station is a **feature inside a pocket**, not a child place. Its `shop` names a `SHOPS` entry
   (`data/shops.js`); the station heading and dock prompt use the feature's `n`.
4. Do not hard-code positions in sim/render code. Read `featureOf(placeId, kind)` /
   `featuresOf(placeId, kind)` / `featureById(placeId, featureId)`. Entities live in per-place
   containers (`placeWorld(id)` in `state/state.js`); `state.world` is only the local pilot's alias.
5. A new system is one `kind: "system"` record; give it pockets with `parent` set to its id. The
   starting pocket is `DEFAULT_PLACE` and must contain a station feature (you dock there on boot).
6. The warp itself is timed by `WARP` in `data/sectors.js` and about two seconds long. The visuals
   follow those numbers: the 3D streaks (`render/warpfx.js`) and the overlay (`ui/warpflash.js`) read
   the local pilot's `state.warp.fx` / `state.warp.flash` every frame. Keep the overlay to plain
   gradients; a masked gradient across the whole screen halves the frame rate.
7. `WARP_COAST.steer` is how long the ship takes to stop turning once a warp starts, and
   `warpSteerEase(t)` is the curve (1 -> 0). The throttle is released instantly, so the speed bleeds
   off through the normal drag model in `sim/player.js`.
8. Internal place ids are save ids (`world.place`). Keep existing ids stable; old saves and export
   codes migrate through `sanitizeWorld`/`prepareGalaxySave`. Deleting a pocket that a save was in
   recovers the pilot to the home station without losing character/cargo.
