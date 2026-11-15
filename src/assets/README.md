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
| `sky-rift.webp` | The ordinary rift run (slice 14a/14b): the owner's teal maelstrom — dark black space torn up by a teal nebula, 2880×1440 equirectangular. `SKIES.shattered` in `render/scene.js` wraps it the same way (`BackSide`, unlit) and adds drifting rock debris. Shipped byte-for-byte as the owner provided it (232 KB). |
| `sky-deeprift.webp` | The deep rift's sky (slice 14a/14b): near-black space with sparse stars and one sable teal cluster right of centre — the owner's "slightly darker" deep rift, as its own image, 2880×1440 equirectangular (69 KB). Selected with `sky.variant: "deep"` in `data/instances.js`. |
| `sky-shroud.webp` | The far side of a simple wormhole (slice 14c): a dark-grey nebula panorama with few stars, 2880×1440 equirectangular. `SKIES.shroud` in `render/scene.js` wraps it around the inside of the sky sphere (`BackSide`, unlit) — an equirect image is exactly what a sphere's UV unwrap is, so it hangs level with no painter in between. **Not owner-playtested yet.** |

**`skyboxes/`** holds the *generated* 4096×2048 skies (`<id>.webp`, about 300 to 500 KB each) made by
`tools/skybox/skybox.py` (recipe 24). Never add, edit or delete files there by hand: the tool writes the image, the
recipe and the registry lines together, and `tests/skybox.test.mjs` fails if they disagree.
