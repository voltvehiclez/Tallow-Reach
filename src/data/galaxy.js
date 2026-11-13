// Starmap tuning and author edits. The generator reads this table; the map UI
// and travel rules read the resolved records it returns. Nothing here assumes a
// square grid, a fixed pocket count, fog, or a fuel item.
//
// `systemCount` and `graph.maxNeighbors` are generation targets, not engine
// limits. Author overrides below can move a system, patch a pocket/link, or
// tombstone a pocket/link by its stable id. Removing a pocket also removes every
// link that names it, so a deleted place cannot leave a dangling route.

export const GALAXY = {
  seed: 11082026,
  generator: "organic-web-v2",
  systemCount: 121,
  homeSystem: "meridian",

  // Best-candidate scattering: organic positions, not rows and columns.
  layout: { radius: 1200, candidates: 24 },

  // A sparse connected tree, with long paths to the outer reaches.
  graph: { maxNeighbors: 4, extraChance: 0, extraRange: 300, depthRadiusFraction: 0.08 },

  // Generated trader pockets use these data-defined name styles. The generator
  // picks a stable style from the pocket id and avoids every name already in the
  // resolved catalog, so several stations in one system still read differently.
  stationNameStyles: [
    "Station", "Outpost", "Hideout", "Trading Hub", "Waystation", "Depot",
    "Exchange", "Relay", "Freeport", "Refuge", "Harbor", "Lookout",
    "Rest", "Enclave", "Landing", "Market",
  ],

  // Advisory only. Content may override a system's tier; no enemy is scaled by
  // this number in step 11. Variation is a whole-number +/- range.
  difficulty: { base: 1, perDistance: 0.004, variation: 1 },

  // Change to "discovered" later and supply per-system knowledge. The policy is
  // looked up in sim/galaxy.js; the UI must not hard-code "everything visible".
  visibility: { mode: "all" },

  // Open-world systems allow free warp between any two pockets in the same
  // system. Set a system's `intraSystem: "links"` (author override or future
  // instance) to require explicit internal routes again. Cross-system gate
  // routes always stay explicit. Empty cost/requirements today; a future fuel
  // item or gate activation can be added as data plus one requirement handler.
  travel: { mode: "warp", cost: {}, requires: [], intraSystem: "free" },

  // Flat chart presentation only; radii are screen pixels at every zoom level.
  // Zooming in on the selected system past systemEntryZoom opens its pocket map.
  // panSpeed is the maximum screen-pixel travel per pointer pixel (at minZoom).
  // Galaxy drag increases smoothly from half speed at maxZoom; system panning is unchanged.
  // None of these numbers affect travel rules.
  map: {
    padding: 90, nodeRadius: 5, homeRadius: 8, minZoom: 0.6, maxZoom: 5, zoomStep: 1.25,
    panSpeed: 1, systemEntryZoom: 2.5, transitionMs: 260,
    context: { width: 240, height: 112, margin: 8, offsetX: 8, anchorY: 42 },
  },

  // The zoomed-in map of one system. A visual-only star/black hole sits at the
  // centre; pockets orbit it. Pockets may carry an authored 2D `mapPos`;
  // otherwise ordinary pockets spread around the core and gate pockets sit
  // outward toward their peer system. Layout radii are map units, not flight
  // coords. Core radii are map units too, so the body grows with system zoom;
  // pocket dots and label text stay screen-sized for readability.
  systemMap: {
    padding: 130, pocketRadius: 7, ordinaryRadius: 140, gateRadius: 280,
    exitLength: 120, minSeparation: 78, minZoom: 1, maxZoom: 3,
    blackHoleChance: 0.05, coreRadius: 26, blackHoleRadius: 20,
    coreLabelOffset: 14, coreLabelLineHeight: 14, labelGap: 8,
  },
};

/**
 * Author edits are applied after generation and before validation.
 *
 * Move a system:
 *   places: { "sys-004": { pos: [180, -260] } }
 *
 * Require internal routes in a temporary instance (keep/add its internal links):
 *   places: { "sys-004": { intraSystem: "links" } }
 *
 * Author its visual-only central body (never a pocket or warp destination):
 *   places: { "sys-004": { core: { kind: "blackHole", n: "Emberfall" } } }
 *   Core kinds are "star" and "blackHole"; omit n to use the system's proper name.
 *
 * Move a pocket on its system's zoomed-in map (2D map units, not flight pos):
 *   places: { "hollow": { mapPos: [-130, 90] } }
 *
 * Delete a pocket (its links are pruned automatically):
 *   removedPlaces: ["hollow"]
 *
 * Promote a pocket to a gate: patch its role AND add one gate link naming its
 * peer. A gate pocket must have exactly one external gate link; validation says
 * plainly when an edit forgets the peer or disconnects the web.
 *
 * Add an alternative route:
 *   links: { "my-route": { kind: "internal", a: "reach", b: "some-pocket" } }
 */
export const GALAXY_OVERRIDES = {
  places: {},
  links: {},
  removedPlaces: [],
  removedLinks: [],
};

// Proper-name building blocks. Ids never depend on these names, so renaming a
// system cannot break a save or a route.
export const SYSTEM_NAME_PARTS = {
  prefixes: [
    "Ash", "Brindle", "Cinder", "Dusk", "Ember", "Fallow", "Gale", "Harrow",
    "Ivory", "Jade", "Kestrel", "Lumen", "Morrow", "Nether", "Orchid", "Pale",
    "Quill", "Rime", "Sable", "Thorn",
  ],
  suffixes: [
    "fall", "mere", "reach", "vault", "drift", "hollow", "watch", "rest",
    "gate", "field", "cross", "veil",
  ],
};
