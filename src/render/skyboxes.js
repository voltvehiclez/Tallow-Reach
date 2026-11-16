// The image of every generated skybox, keyed by id (`data/skyboxes.js` lists them as data).
//
// `npm run build` inlines each import below as a base64 `data:` URL (esbuild `dataurl` loader), exactly
// like the owner's panoramas in `src/assets/`, so the game stays one self-contained file. Both blocks
// are written by `tools/skybox/skybox.py ... --install`: **do not edit between the markers by hand**.
// Only `render/scene.js` reads `SKYBOX_URLS` (`SKIES.panorama`).

// BEGIN GENERATED (imports)
import sky_normal_space from "../assets/skyboxes/normal_space.webp";
import sky_rift_chaos from "../assets/skyboxes/rift_chaos.webp";
import sky_wormhole_grey from "../assets/skyboxes/wormhole_grey.webp";
// END GENERATED

/** id -> data URL of that skybox's equirectangular WebP. */
export const SKYBOX_URLS = {
  // BEGIN GENERATED (map)
  normal_space: sky_normal_space,
  rift_chaos: sky_rift_chaos,
  wormhole_grey: sky_wormhole_grey,
  // END GENERATED
};
