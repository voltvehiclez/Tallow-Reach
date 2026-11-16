# src/assets: artwork that ships inside the bundle

Images the game needs at runtime. Nothing here is loaded over the network: the build
(`build.mjs`, esbuild `loader: { ".webp": "dataurl" }`) inlines every file in this folder into
the single self-contained `game/tallow-reach.html` as a base64 `data:` URL, so the sandboxed
preview and a double-clicked download both see the picture.

Keep everything here small — it is weighed against the whole game's size. Rough guide:
pictures are shipped as **WebP, quality 90** where they are mostly dark and painterly (they
compress extremely well). Re-encode rather than commit a raw PNG; the source of `sky-shroud.webp`
(the owner's 2026-11-14 reference, 2880×1440 equirect, ~2.8 MB PNG) was deliberately not committed.

| File | What it is |
|---|---|
| `sky-rift.webp` | **History — no longer drawn** (owner 2026-11-15: cube maps only). The ordinary rift run (slice 14a/14b): the owner's teal maelstrom, 2880×1440 equirectangular, shipped byte-for-byte as he provided it (232 KB). Its look is `rift_chaos` in `skyboxes/`, regenerated as six cube faces. Kept as the owner's own artwork; do not delete without his word. |
| `sky-deeprift.webp` | **History — no longer drawn.** The deep rift's sky (slice 14a/14b): near-black space with one sable teal cluster, 2880×1440 equirectangular (69 KB). Kept as the owner's own artwork; nothing names it since 2026-11-15. |
| `sky-shroud.webp` | **History — no longer drawn.** The far side of a simple wormhole (slice 14c): a dark-grey nebula panorama, 2880×1440 equirectangular. Its look is `wormhole_grey` in `skyboxes/`, regenerated as six cube faces. Kept as the owner's own artwork; do not delete without his word. |

**`skyboxes/`** holds the *generated* skies, one folder per sky, six 2048×2048 faces each — `px.webp`, `nx.webp`,
`py.webp`, `ny.webp`, `pz.webp`, `nz.webp` — made by `tools/skybox/skybox.py` (recipe 24). Six square faces at 90° each,
in the OpenGL cube order, is what makes them a real cube map: a viewer other than this game can read them too.
Never add, edit or delete files there by hand: the tool writes the six faces, the recipe and the registry lines together
(`make … --install`, and `remove <id>` to take one out), and `tests/skybox.test.mjs` fails if they disagree.

Since 2026-11-15 every sky the game *wears* comes from this folder, and every one of them is a cube:
`normal_space` (ordinary pockets, `DEFAULT_SKY` in `data/places.js`), `rift_chaos` (both rift templates) and
`wormhole_grey` (the far side of a simple wormhole). The whole set is about 1 MB, all of it inlined into the page.
The three owner panoramas above are history: no template names one, `SKIES` has no builder that could draw one, and they
are kept only because they are the owner's own artwork. **Do not delete them without his word.**
