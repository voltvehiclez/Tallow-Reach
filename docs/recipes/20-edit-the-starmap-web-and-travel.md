# Recipe 20: Edit the starmap web and travel rules

> One of the step-by-step recipes indexed in [HOW_TO_ADD.md](../HOW_TO_ADD.md). Read the checklist there first.
> Kind of work: steps 11A/11B.


The live M key opens `src/ui/starmap.js`. The resolved web and travel rules are data-driven:
`data/galaxy.js` holds tuning and author overrides, `sim/galaxy.js` resolves/validates the web,
`sim/galaxy-session.js` installs the saved seed as the live place catalog, and `sim/travel.js` answers
direct-hop questions for both the chart and `startWarp`. Edit data/registries, not the map screen or
warp animation.

**Move a system.** In `GALAXY_OVERRIDES.places` in `src/data/galaxy.js`:

```js
places: { "sys-004": { pos: [180, -260] } },
```

Ids, pockets and routes stay stable; the system position and derived tier guidance change. The UI may
nudge the displayed dot away from unrelated straight edges, without changing the authored position.

**Move a pocket on its system's zoomed-in map.** Add a 2D `mapPos` (map units, not flight coordinates):

```js
places: { "hollow": { mapPos: [-130, 90] } },
```

Without `mapPos`, `systemPocketLayout` leaves the centre to the visual star/black hole, spreads ordinary
pockets around it at `systemMap.ordinaryRadius`, and places gates farther out at `gateRadius` toward their
peer system. A stable seed/system-id hash rotates each orbit; authored positions remain fixed obstacles.
An authored gate `mapPos` moves the dot but its exit stub still points toward the peer. Layout is derived
and never saved.

**Choose local travel rules.** `GALAXY.travel.intraSystem` defaults to `"free"`: any pocket in the same
system is a legal free warp, including a gate. Cross-system travel still needs the exact enabled gate link.
For a future route-only temporary instance, author the system with:

```js
places: { "sys-004": { intraSystem: "links" } },
```

Keep/add connected internal links for every pocket in that system. The opt-out restores internal route
lines on its system map and the normal enabled/mode/cost/requirement checks for local hops. It does not
remove gate lines from the main galaxy. Free local hops ignore optional internal-link restrictions and
costs; put cross-system restrictions on the gate link. Validation and `findRoute` understand both policies.

**Author a central star/black hole.** Each system gets an independent seeded core roll: the default
`systemMap.blackHoleChance: 0.05` means 5% black holes / 95% stars, not an exact quota. The core's name strips
the generic `term("mapNode")` suffix case-insensitively (Meridian System → Meridian; Duskdrift stays Duskdrift).
To override it, patch the system, not the pocket table:

```js
places: { "sys-004": { core: { kind: "blackHole", n: "Emberfall" } } },
```

Use `kind: "star"` or `"blackHole"`; omit `n` to derive the proper name. Invalid kinds fail validation.
The core is a focusable SVG image with a permanent two-line name/type label, not a `data-pocket` target, button, link endpoint
or saved place. Warping to/near it is not implemented. Core rolls do not consume the generator or gameplay
RNG streams, so existing system/pocket/link ids and v16 saves stay stable.

**Delete a pocket.** Add its id to `GALAXY_OVERRIDES.removedPlaces`. Every link naming it is pruned.
If the deletion disconnects the web or leaves a gate without its one peer, generation fails with a
plain validation error instead of shipping a broken map. A save that was in the deleted pocket
recovers to the home station with the whole character/cargo intact.

**Promote a pocket to a gate.** Patch its `role: "gate"` and add one `kind: "gate"` link naming its
peer pocket in another system. The peer must also be a gate pocket and may have no other external gate
link. Keep an internal link from the system's ordinary pocket to the gate for the route-only opt-out;
free systems can already reach it, but retaining the link makes a later policy change safe.

**Place a station near a generated gate.** By default, a friendly trader selected by a gate template is
removed from that gate's resolved features and gets a generated `${gateId}-station` pocket with an internal
link to the system hub. Generated trader features and station pockets receive stable varied names from
`GALAXY.stationNameStyles`; the generator avoids duplicates, while an authored station `n` remains unchanged.
To deliberately co-locate a station in a gate pocket, add an explicit station feature through the pocket
override's `features`/`extraFeatures` array, or set `allowStation: true` or `stationPlacement: "gate"`; those
are author choices and are not detached.

**Add an alternative route.** Add a link record to `GALAXY_OVERRIDES.links` (or `PLACE_LINKS` in
`src/data/places.js` for authored pockets): `{ id, kind, a, b, mode: "warp", cost: {}, requires: [],
enabled: true }`. `kind` is `internal` inside one system or `gate` between two gate pockets. Internal
lines are drawn only in a links-policy system; gate lines remain explicit on the galaxy in either policy.

**Chart interaction.** On the galaxy web, click a system to select it; scroll up / press **+** past
`map.systemEntryZoom`, or double-click the dot, to open its pocket map. **Back to galaxy** or scrolling out
at the fitted system view returns. In the pocket map, click/right-click a pocket dot or neighbouring-system
gate label (or focus it and press Enter/Space/Shift+F10) for the **Warp to** popup; only a legal hop gets the
button. Double-clicking the gate pocket or its neighbouring-system label opens that peer system map directly.
A gate-neighbour label quotes the reciprocal gate pocket, never the remote system/core. The right panel
is a read-only overview, not a travel button list. The central body keeps a permanent name/type label and
cannot open a warp popup. Native hover tooltips are absent from pockets/core; click popups remain. The compact
panel must not gain fixed-count rows, per-row metadata or scrolling.

**Change generation or chart settings.** Edit `GALAXY` in `src/data/galaxy.js`: `systemCount`,
`graph.maxNeighbors`, `graph.depthRadiusFraction`, `graph.extraChance`, `layout`, `difficulty`, `visibility.mode`, `travel` defaults, `map`
(padding, screen-pixel radii, zoom limits/step, `panSpeed`, `systemEntryZoom`, `transitionMs`, popup `context`) and
`systemMap` (padding, pocket radius, ordinary/gate orbital radii, exit length, minimum separation, zoom
limits, `blackHoleChance`, map-unit `coreRadius`/`blackHoleRadius`, `coreLabelOffset`, `coreLabelLineHeight`, `labelGap`).
To replace the layout algorithm, register a function in `GALAXY_GENERATORS` (`src/sim/galaxy.js`) with the
same `(seed, tuning, rng)` contract and name it in `GALAXY.generator`. The resolved record contract stays
the same, so travel rules and the map UI do not change. Changing graph links may remove old generated gate
pockets: `prepareGalaxySave` uses the retained v1 generator to recover those saves in their original system.

**Change visibility.** `visibility.mode: "all"` shows the whole web. `"discovered"` uses the compact
`world.galaxy.knowledge` flags; home is always discovered/visited and each local arrival records a
visit. Add a new policy to `VISIBILITY_POLICIES` rather than hard-coded fog in the UI.

**Future costs/requirements.** Keep defaults in `GALAXY.travel` and per-route overrides on links.
Register a requirement handler in `TRAVEL_REQUIREMENTS` (`src/sim/travel.js`) as
`({ req, link, from, to, context }) => true | "refusal reason"`. The chart and warp pass the same
pilot/profile/world context. These checks apply to gate links and to internal links in route-only systems;
default free local warp has no link cost/requirement. Costs are returned as plain data; until a cost handler is implemented,
`startWarp` refuses any non-empty cost rather than silently charging or ignoring it. Fuel, gate
activation and supercruise are not implemented yet.

**Saves.** v18 stores only `{ seed, knowledge }` for generated geography in `world.galaxy`, plus
`world.destination` and positive remaining simulation-second entries in `world.placeMemory`. Boot, slot
load and import call `prepareGalaxySave(raw)` before `applySave`; it regenerates the seed, validates ids
against that live catalog and recovers removed pockets. Never save generated systems/pockets/links, core
assignments or chart geometry.

Run `npm test` (`tests/step11a-galaxy.test.mjs` and `tests/step11b-starmap.test.mjs`) after any edit.
They check determinism, reachability, one-peer gates, move/delete/promote examples, visibility, tier
guidance, live catalog lookup, map interaction, direct-hop refusal, pause and save migration/recovery.
