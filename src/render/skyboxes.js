// The six faces of every generated skybox, keyed by id (`data/skyboxes.js` lists them as data).
//
// `npm run build` inlines each import below as a base64 `data:` URL (esbuild `dataurl` loader), so the
// game stays one self-contained file. Both blocks are written by `tools/skybox/skybox.py ... --install`:
// **do not edit between the markers by hand**.
//
// A sky is six faces in three.js cube order — px, nx, py, ny, pz, nz — which is also BoxGeometry's
// face order, so `render/scene.js` (`SKIES.cube`) hands the array straight to `CubeTextureLoader` and
// no face can end up in the wrong place. Only `render/scene.js` reads `SKYBOX_URLS`.

// BEGIN GENERATED (imports)
import sky_normal_space_px from "../assets/skyboxes/normal_space/px.webp";
import sky_normal_space_nx from "../assets/skyboxes/normal_space/nx.webp";
import sky_normal_space_py from "../assets/skyboxes/normal_space/py.webp";
import sky_normal_space_ny from "../assets/skyboxes/normal_space/ny.webp";
import sky_normal_space_pz from "../assets/skyboxes/normal_space/pz.webp";
import sky_normal_space_nz from "../assets/skyboxes/normal_space/nz.webp";
import sky_rift_chaos_px from "../assets/skyboxes/rift_chaos/px.webp";
import sky_rift_chaos_nx from "../assets/skyboxes/rift_chaos/nx.webp";
import sky_rift_chaos_py from "../assets/skyboxes/rift_chaos/py.webp";
import sky_rift_chaos_ny from "../assets/skyboxes/rift_chaos/ny.webp";
import sky_rift_chaos_pz from "../assets/skyboxes/rift_chaos/pz.webp";
import sky_rift_chaos_nz from "../assets/skyboxes/rift_chaos/nz.webp";
import sky_wormhole_grey_px from "../assets/skyboxes/wormhole_grey/px.webp";
import sky_wormhole_grey_nx from "../assets/skyboxes/wormhole_grey/nx.webp";
import sky_wormhole_grey_py from "../assets/skyboxes/wormhole_grey/py.webp";
import sky_wormhole_grey_ny from "../assets/skyboxes/wormhole_grey/ny.webp";
import sky_wormhole_grey_pz from "../assets/skyboxes/wormhole_grey/pz.webp";
import sky_wormhole_grey_nz from "../assets/skyboxes/wormhole_grey/nz.webp";
// END GENERATED

/** id -> [px, nx, py, ny, pz, nz] data URLs of that skybox's six faces. */
export const SKYBOX_URLS = {
  // BEGIN GENERATED (map)
  normal_space: [sky_normal_space_px, sky_normal_space_nx, sky_normal_space_py, sky_normal_space_ny, sky_normal_space_pz, sky_normal_space_nz],
  rift_chaos: [sky_rift_chaos_px, sky_rift_chaos_nx, sky_rift_chaos_py, sky_rift_chaos_ny, sky_rift_chaos_pz, sky_rift_chaos_nz],
  wormhole_grey: [sky_wormhole_grey_px, sky_wormhole_grey_nx, sky_wormhole_grey_py, sky_wormhole_grey_ny, sky_wormhole_grey_pz, sky_wormhole_grey_nz],
  // END GENERATED
};
