# Recipe 24: a new skybox (the sky of a new instance, rift or wormhole)

**Kind of work: run one tool, then one line of data.** The full instructions for the tool, written for AI assistants,
are in [`tools/skybox/README.md`](../../tools/skybox/README.md): read it before you run anything. This recipe is the
checklist that wraps it.

A skybox is a **cube map**: six square 2048×2048 faces of 90° each (nebula, dust, stars, optional Milky Way band), in
the OpenGL cube order `px, nx, py, ny, pz, nz`, made by `tools/skybox/skybox.py`. Never make a sky any other way: no
painting in code, no downloaded images, no edits to `src/assets/skyboxes/` or to the `GENERATED` blocks in
`src/data/skyboxes.js` and `src/render/skyboxes.js`.

Why a cube and not a panorama (owner 2026-11-15): a 4096×2048 equirectangular image wastes its pixels near the poles
and has to stretch them across the horizon, so on a 4K monitor the sky was magnified and smeared exactly where the
camera looks. Six equal faces put the same texel density in every direction, so there is nothing to stretch.

1. Pick the look from what the owner said (the table in `tools/skybox/README.md`), e.g. `--preset ember`.
2. Preview without installing: `python3 tools/skybox/skybox.py make crimson_pit --preset ember --preview`.
   It takes about 4 minutes at 2048 per face. The report's last line must be `OK: dark, seamless and within budget` —
   that line is the seam check (all 24 cube edges, mean difference per 255) and the darkness check. If you can see
   images, open `skybox-out/crimson_pit.preview.jpg`: it shows the six faces as a cube net plus four pilot's-eye views.
3. Install: the same command plus `--install`. This writes `src/assets/skyboxes/crimson_pit/` (six faces), the recipe
   `tools/skybox/specs/crimson_pit.json`, and one line in each registry.
4. Use it: in the template in `src/data/instances.js` (recipe 22) set
   `sky: { kind: "cube", skybox: "crimson_pit", shards: 30 }`.
5. `npm test` (`tests/skybox.test.mjs` checks the six faces, the six imports, the recipe and the template's name), then
   `npm run build`.
6. Add the `docs/CHANGELOG.md` entry: the skybox name, its preset and seed, which place wears it, and its file size.

Rules: dark space only (the tool enforces a mood); change a sky by re-making it with the same name (a recipe is saved
in `tools/skybox/specs/`, so `--spec` reproduces it exactly); **never hand-paint or hand-flip a face** — the game turns
the top and bottom over itself in `src/render/cubemap.js`, because `BoxGeometry` frames those two differently.
Face size is the owner's call: `--face 4096` is one flag away, but it is about 4× the pixels, ~4× the file size and
~13 minutes instead of ~4, so do not raise it without asking him. How the picture is made, and how to add a look: the
end of `tools/skybox/README.md`.
