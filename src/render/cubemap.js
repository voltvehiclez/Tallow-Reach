// The six faces of a cube map, and the one place where three.js and the OpenGL cube convention
// disagree about them.
//
// `tools/skybox/skybox.py` writes each sky as six `face x face` WebP faces in the order every engine
// uses — +X, -X, +Y, -Y, +Z, -Z (px, nx, py, ny, pz, nz) — and each face's pixels are laid out by the
// OpenGL cube-map rules (`FACE_AXES` in that file): the first column is the face's left, the top row
// is its up. That is what makes the six files a real cube map, readable by any tool as well as by this
// game, so the files stay in that convention and the game adapts to them here.
//
// `BoxGeometry` already groups its faces in that order, and four of its six UV frames match the OpenGL
// rules exactly. Its top (+Y) and bottom (-Y) frames do not: they run v the other way up, so a face
// drawn on them arrives upside down. Flipping those two images as they are loaded is the whole
// correction — no rotation, no mirroring, nothing per-sky.
//
// `tests/skybox.test.mjs` proves this end to end: it reads `FACE_AXES` out of the generator, rebuilds
// `BoxGeometry`'s frames in node with three.js, applies this table, and fails if any face's texel stops
// pointing the way the generator painted it. Hand-editing the table is therefore a test failure, not a
// quiet regression in the sky.

/** The six faces, in three.js cube order — also `BoxGeometry`'s material-group order. */
export const CUBE_FACES = ["px", "nx", "py", "ny", "pz", "nz"];

/** True for a face whose image must be flipped vertically to sit right way up on `BoxGeometry`. */
export const CUBE_FACE_FLIP = { px: false, nx: false, py: true, ny: true, pz: false, nz: false };

/**
 * Point one face texture at one face of a `BoxGeometry`, flipping it if that frame needs it.
 * `index` is the face's place in `CUBE_FACES`; the texture is changed in place and returned.
 */
export function orientFace(texture, index) {
  if (CUBE_FACE_FLIP[CUBE_FACES[index]]) {
    // v -> 1 - v. With clamp-to-edge there is nothing outside [0, 1] to smear in.
    texture.repeat.y = -1;
    texture.offset.y = 1;
    texture.needsUpdate = true;
  }
  return texture;
}
