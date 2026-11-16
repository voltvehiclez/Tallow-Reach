// The generated skyboxes: which cube-map skies exist, as plain data (no images imported here, so the
// node tests can read this file).
//
// A skybox is made by `tools/skybox/skybox.py` (read `tools/skybox/README.md`): the tool renders six
// WebP faces into `src/assets/skyboxes/<id>/` (px, nx, py, ny, pz, nz), saves its recipe in
// `tools/skybox/specs/<id>.json` and adds ONE LINE to the block below. **Do not edit the lines between
// the markers by hand**: the tool rewrites them (and the matching import lines in
// `render/skyboxes.js`) every time it installs or removes one.
//
//   n        the human name
//   preset   the look it was made from (`python3 tools/skybox/skybox.py presets`)
//   seed     with the preset and the spec file, it makes the same picture again
//   face     pixels per side of each of the six faces (the sky is six `face x face` images)
//   tint     the colour of the nebula, as 0xrrggbb: the rock drifting in front of it catches a breath
//            of it (`render/scene.js`, `SKIES.cube`), so an ember sky is not lit teal
//
// A place uses one with `sky: { kind: "cube", skybox: "<id>", shards: 30 }` (`data/instances.js`;
// ordinary pockets use `DEFAULT_SKY` in `data/places.js`). `npm test` (tests/skybox.test.mjs) fails if
// an id here has a missing face, import or recipe, or if a template names an id that is not here.

export const SKYBOXES = {
  // BEGIN GENERATED (tools/skybox/skybox.py maintains these lines; do not edit by hand)
  normal_space: { n: "Normal Space", preset: "void", seed: 3, face: 2048, tint: 0x2cb4c2 },
  rift_chaos: { n: "Rift (chaotic teal)", preset: "maelstrom", seed: 23, face: 2048, tint: 0x2cb4c2 },
  wormhole_grey: { n: "Wormhole (dark grey)", preset: "ash", seed: 5, face: 2048, tint: 0x7f8a9c },
  // END GENERATED
};
