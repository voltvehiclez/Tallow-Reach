# Embedded Draco decoder

`draco-decoder.txt` is the unmodified JavaScript glTF decoder from
`three@0.128.0/examples/js/libs/draco/gltf/draco_decoder.js` (Draco, Apache 2.0;
see LICENSE.txt). The `.txt` extension lets esbuild inline its source without
executing it in the main thread. `render/gltf.js` gives DRACOLoader an embedded
URL and runs it in a worker, with no CDN or sidecar downloads. If three.js is
upgraded, update this decoder from that same version and re-run asset tests.

Used by the owner's `heavyfighter-compressed.glb`, stored as
`models/ship.testship.glb`. This decoder is not a second model asset.
