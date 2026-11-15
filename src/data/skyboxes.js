// The generated skyboxes: which 4K space panoramas exist, as plain data (no images imported here, so
// the node tests can read this file).
//
// A skybox is made by `tools/skybox/skybox.py` (read `tools/skybox/README.md`): the tool renders the
// WebP into `src/assets/skyboxes/<id>.webp`, saves its recipe in `tools/skybox/specs/<id>.json` and
// adds ONE LINE to the block below. **Do not edit the lines between the markers by hand**: the tool
// rewrites them (and the matching import lines in `render/skyboxes.js`) every time it installs one.
//
//   n        the human name
//   preset   the look it was made from (`python3 tools/skybox/skybox.py presets`)
//   seed     with the preset and the spec file, it makes the same picture again
//   size     width in pixels (the picture is size x size/2, equirectangular)
//   tint     the colour of the nebula, as 0xrrggbb: the rock drifting in front of it catches a breath
//            of it (`render/scene.js`, `SKIES.panorama`), so an ember sky is not lit teal
//
// A place uses one with `sky: { kind: "panorama", skybox: "<id>", shards: 30 }` (`data/instances.js`).
// `npm test` (tests/skybox.test.mjs) fails if an id here has no image, no import, or no recipe, or if a
// template names an id that is not here.

export const SKYBOXES = {
  // BEGIN GENERATED (tools/skybox/skybox.py maintains these lines; do not edit by hand)
  teal_black_test: { n: "Teal Black (kept for later)", preset: "void", seed: 3, size: 4096, tint: 0x2cb4c2 },
  // END GENERATED
};
