# Recipe 24: a new skybox (the sky of a new instance, rift or wormhole)

**Kind of work: run one tool, then one line of data.** The full instructions for the tool, written for AI assistants,
are in [`tools/skybox/README.md`](../../tools/skybox/README.md): read it before you run anything. This recipe is the
checklist that wraps it.

A skybox is a dark, realistic 4096×2048 equirectangular WebP (nebula, dust, stars, optional Milky Way band) made by
`tools/skybox/skybox.py`. Never make a sky any other way: no painting in code, no downloaded images, no edits to
`src/assets/skyboxes/` or to the `GENERATED` blocks in `src/data/skyboxes.js` and `src/render/skyboxes.js`.

1. Pick the look from what the owner said (the table in `tools/skybox/README.md`), e.g. `--preset ember`.
2. Preview without installing: `python3 tools/skybox/skybox.py make crimson_pit --preset ember --preview`.
   The last line of the report must be `OK`. If you can see images, open `skybox-out/crimson_pit.preview.jpg`.
3. Install: the same command plus `--install`. This writes `src/assets/skyboxes/crimson_pit.webp`, the recipe
   `tools/skybox/specs/crimson_pit.json`, and one line in each registry.
4. Use it: in the template in `src/data/instances.js` (recipe 22) set
   `sky: { kind: "panorama", skybox: "crimson_pit", shards: 30 }`.
5. `npm test` (`tests/skybox.test.mjs` checks the image, import, recipe and the template's name), then `npm run build`.
6. Add the `docs/CHANGELOG.md` entry: the skybox name, its preset and seed, which place wears it, and its file size.

Rules: dark space only (the tool enforces a mood); one installed sky per place that uses it (each adds about 400 KB to
the game); change a sky by re-making it with the same name; `--size 8192` only when the owner asks for more sharpness.
How the picture is made, and how to add a look: the end of `tools/skybox/README.md`.
