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
  generator: "organic-web-v1",
  systemCount: 121,
  homeSystem: "meridian",

  // Best-candidate scattering: organic positions, not rows and columns.
  layout: { radius: 1200, candidates: 24 },

  // A connected tree first, then a few short alternative routes.
  graph: { maxNeighbors: 4, extraChance: 0.35, extraRange: 300 },

  // Advisory only. Content may override a system's tier; no enemy is scaled by
  // this number in step 11. Variation is a whole-number +/- range.
  difficulty: { base: 1, perDistance: 0.004, variation: 1 },

  // Change to "discovered" later and supply per-system knowledge. The policy is
  // looked up in sim/galaxy.js; the UI must not hard-code "everything visible".
  visibility: { mode: "all" },

  // Empty cost/requirements today. A future fuel item or gate activation can be
  // added as data plus one requirement handler, without rewriting the map.
  travel: { mode: "warp", cost: {}, requires: [] },
};

/**
 * Author edits are applied after generation and before validation.
 *
 * Move a system:
 *   places: { "sys-004": { pos: [180, -260] } }
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
