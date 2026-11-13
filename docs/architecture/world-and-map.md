# Architecture: World and map: places, the starmap, travel, place memory, where you log out

> Part of the code-architecture docs; the index and the layers are in [ARCHITECTURE.md](../ARCHITECTURE.md).
> This describes the code **as it is now**. When a change replaces a rule, rewrite it here.

## Conventions

- **The starmap web is resolved data, not UI geometry.** `data/galaxy.js` holds generation tuning,
  visibility policy, advisory tier rules, free local travel default, empty route costs/requirements,
  central-body chance/radii and `GALAXY_OVERRIDES`.
  `sim/galaxy.js` generates an organic 2D web through a replaceable generator registry, applies author
  patches/tombstones by stable id, prunes links to deleted pockets, assigns travel defaults, tiers and
  independent seeded visual cores, then validates policy-aware reachability. A gate pocket has exactly
  one external gate peer; internal link records remain for the route-only opt-out. `sim/travel.js` quotes
  free same-system hops unless `intraSystem: "links"` requires an enabled internal link; cross-system
  hops always require their explicit gate. Quotes return plain cost/mode/requirement results. Moving a system, deleting a pocket, promoting a pocket to a gate or replacing the generator
  must remain data/registry edits; do not put those rules in the map screen or warp animation.
  Step 11B installs the resolved web as the live place catalog (`setPlaceCatalog`) and keeps it in
  session `state.galaxy`. `sim/galaxy.js` also derives a deterministic per-system pocket layout
  (`systemPocketLayout`, author `mapPos` overrides win) for the zoomed-in chart: ordinary pockets orbit
  the visual core and gates sit farther out toward their peers. Core kind/name, policy and layout are
  resolved data, never saved. `ui/starmap.js` draws the galaxy web and system pocket map, omitting internal
  lines in free systems and retaining gate exit stubs toward visible peers. Its non-warpable core has a
  permanent two-line proper-name/type label, while `pocketLabelLayout` collision-checks pocket names and
  nearby dots, drawing a connector when a crowded label is nudged or moved to the clearer side. The click/right-click popup opens just to the right of
  the pointer with **Set destination** first; it emits a named travel action for **Warp to**, and `sim/sectors.js`
  requotes the same hop before running the unchanged warp sequence. Starmap and pocket-map charts do not render
  bottom status/refusal notices. `route-display.js` is shared by the HUD and starmap;
  an exact `{ pocketId: ... }` destination uses the pocket name in its route title and still gets a small parenthetical pocket name on the final system row.

## Known gaps

These are real, current limits. None of them is a bug in play today.

- **Where you logged out is saved** (`world.place` + `world.resume`, save v19). A save made while
  docked opens the station menu; a save made in flight returns you to the exact spot and heading,
  with shields and boost as you left them and zero speed. The pocket's arrival point is the fallback
  for older saves, a damaged position, or a ship with no thrusters that would be stranded. Generated
  pockets now resolve one of three data templates with tier-selected encounters: asteroid fields use
  stable field slots, static derelicts/caches become loot crates, and trade lanes can have a dockable
  friendly-trader station using an existing `SHOPS` entry. A field slot or cleared one-shot encounter
  is remembered in `world.placeMemory` and its slow timer advances only on simulation ticks; a
  `respawn-place` event can override it. Station-local inventory is keyed by the dockable station feature and persists in `world.stationStores`.
- **A warp takes the controls for about two seconds, but not the momentum.** The throttle is
  released and the stick eases to neutral (`WARP_COAST` in `data/sectors.js`), so the ship
  coasts down and unwinds its turn; weapons are offline for the whole sequence. Enemies keep
  shooting at you while it charges. Making the ship invulnerable during a warp, or letting
  enemies lose interest, is a deliberate design decision that has not been made yet.
- **The starmap is live and generated pockets are filled.** M opens `ui/starmap.js`: an organic
  system web with gate lines, current/selected markers and zoom/pan/labels; visited knowledge is retained
  without a separate light-blue visual style. Zooming into a selected system dot opens a derived pocket map:
  pockets orbit a visual-only star/black hole with a permanent two-line name/type label. Free systems omit
  internal lines; route-only systems retain them. Gate exit stubs point toward neighbouring systems with blue
  dashed lines and blue remote endpoint dots; their labels are clickable travel targets quoting the reciprocal
  gate pocket, and double-clicking either one opens that peer system map directly. Station pockets render as
  squares and generated trader features/station pockets use deterministic varied names; the right panel stays
  a compact name-only overview. Galaxy pan is bounded to 0.5–1 screen pixels per pointer pixel, increasing
  gently when zoomed out; core radii are map units so system zoom scales the graphic. Pocket names are laid
  out without collisions and crowded labels get a small connector back to their dot. An active destination
  draws solid orange overlays and small directional arrows on galaxy links and local pocket hops; only
  cross-system gate exit stubs are orange dashed, including an incoming stub highlighted in reverse when an
  intermediate system is viewed. Left-clicking a pocket-map pocket is inert; right-clicking a legal local/gate
  pocket or gate-neighbour label opens an adjacent popup with **Set destination** first and **Warp to** only
  when legal. The sim rechecks the quote and emits `travel-denied` on refusal; successful destinations do not
  add the generic bottom confirmation in either map mode. The shared route list shows a small destination
  pocket parenthetical on the final row only for pocket targets; route rows use distinct start, intermediate and
  destination markers, with a dark center, small orange tick and one dotted outer ring. Current/start and destination icons are about 20% smaller. The ship HUD renders every route row without an inner scrollbar. The chart never stops the clock: `sim/step.js`
  `isSimulationPaused()` counts only the pause card and the title screen, so the world (and its audio) keeps
  running behind the chart in every mode. It does release flight input and blocks the dock/lock/weapon/jump
  hotkeys while open.
  Generated gate traders are removed from gate pockets and receive their own station pocket/internal link;
  explicit `allowStation`, `stationPlacement: "gate"` or feature records can deliberately co-locate one.
  Generated pockets resolve `frontier`, `trade_lane` or `salvage_yard` templates; their tier selects hostile
  patrols, traders, derelicts and caches, and pocket descriptions use the selected template rather than the
  old empty placeholder. Non-empty travel costs are refused until a cost handler exists; fuel,
  activated/proximity gates and supercruise are not implemented.
- **Place memory is persistent simulation state.** `PLACE_DEFS` and generated templates carry station,
  field, spawner, planet and encounter data; runtime containers keep active entities. Stable asteroid
  slots and cleared one-shot encounter feature ids are recorded in `world.placeMemory` with remaining
  simulation seconds (save v19). `sim/place-memory.js` decrements them only from unpaused ticks and
  emits readiness events for `sim/places.js`; `respawn-place` is the future story/event override hook.
  Abandoned crates are still cleared on warp and are not counted as cleared until their encounter's
  final crate is collected.
