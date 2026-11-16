// Triangle-mesh collision, in plain data — the sim owns nothing renderer-side.
//
// Every solid thing in the game builds one of these at the same moment its mesh is built
// (render layer bakes the triangles into world or local space and registers them here); this
// module only stores triangle soup and does closest-point-on-triangle maths. No three.js here,
// so the sim can import it freely and tests can run it headless.
//
// Three shapes of collider:
//   world-space soup   static scenery — baked once at build, tested as-is.
//   local-space soup   rocks — one soup per asteroid shape; each rock carries its own
//                      position/rotation/non-uniform scale, applied per vertex at test time.
//   moving soup        any part of a structure that turns or travels (a station's arms, a
//                      rotating ring). The soup is baked ONCE in the part's own space and the
//                      collider carries a live `mover` transform that the render layer refreshes
//                      each frame from the part's world matrix. Tests carry the segment / sphere
//                      into the part's space instead of re-baking triangles, so a moving part is
//                      exactly as precise as a still one and costs the same to test. This is the
//                      default for anything the render layer spins — see docs/GLB_MODELS.md.
//
// A collider may opt out per node inside a GLB (a node named `noclip`) or per feature in data
// (`collide: false` — e.g. a glow shell the pilot should fly through).
//
// Three kinds of thing hit these: ships (`collideRockAt` / `collideSphereAt`, pushed out of the
// surface), and — since 2026-11-15 — every projectile, through `sweepColliders`, which walks the
// segment a shot or a missile covered in one tick. A projectile is stopped by whatever a ship is
// stopped by: the same triangles, the same opt-outs, no separate idea of "shootable".

const EMPTY = [];
const placeColliders = new Map();   // placeId -> [collider]
const rockSoups = new Array(6).fill(null);
const builtInRockCache = new Array(6).fill(null);

/** Ship hull radius used for collision (the old asteroid code used 4). */
export const SHIP_RADIUS = 4;

/**
 * The built-in rock shape geometry, in plain data. `render/models.js` builds the drawn mesh
 * from exactly these floats (BufferGeometry + computeVertexNormals), so the mesh a pilot can
 * see and the soup they collide with are the same lumps — a GLB can still override both.
 * Replicates three.js' IcosahedronGeometry(1, 1): 12 base icosahedron vertices, each face
 * subdivided once and projected onto the unit sphere, then the sinusoidal lump jitter.
 */
export function builtInRockPositions(shape) {
  const k = Math.abs(Math.floor(shape)) % 6;
  if (builtInRockCache[k]) return builtInRockCache[k];
  const t = (1 + Math.sqrt(5)) / 2;
  const base = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  const indices = [
    0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11,
    1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9,
    4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
  ];
  const lerp = (a, c, f) => [a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f, a[2] + (c[2] - a[2]) * f];
  const lerpV = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  const out = [];
  const push = v => out.push(v[0], v[1], v[2]);
  // Mirrors PolyhedronGeometry.subdivideFace(a, b, c, 1) vertex-for-vertex.
  for (let f = 0; f < indices.length; f += 3) {
    const a = base[indices[f]], b = base[indices[f + 1]], c = base[indices[f + 2]];
    const cols = 2, v = [];
    for (let i = 0; i <= cols; i++) {
      v[i] = [];
      const aj = lerp(a, c, i / cols), bj = lerp(b, c, i / cols);
      const rows = cols - i;
      for (let j = 0; j <= rows; j++) v[i][j] = j === 0 && i === cols ? aj : lerpV(aj, bj, j / rows);
    }
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < 2 * (cols - i) - 1; j++) {
        const kk = Math.floor(j / 2);
        if (j % 2 === 0) { push(v[i][kk + 1]); push(v[i + 1][kk]); push(v[i][kk]); }
        else { push(v[i][kk + 1]); push(v[i + 1][kk + 1]); push(v[i + 1][kk]); }
      }
    }
  }
  // applyRadius(1): project every vertex onto the unit sphere.
  for (let i = 0; i < out.length; i += 3) {
    const l = Math.hypot(out[i], out[i + 1], out[i + 2]) || 1;
    out[i] /= l; out[i + 1] /= l; out[i + 2] /= l;
  }
  // The lump jitter the built-in rocks carry, per shape index.
  for (let i = 0; i < out.length; i += 3) {
    const x = out[i], y = out[i + 1], z = out[i + 2];
    const s = 1 + 0.28 * Math.sin(x * 5.1 + k) * Math.sin(y * 4.3 + k * 2) + 0.2 * Math.sin(z * 6.2 + k);
    out[i] = x * s; out[i + 1] = y * s; out[i + 2] = z * s;
  }
  builtInRockCache[k] = out;
  return out;
}

/** Build a triangle-soup record from raw vertex data (xyz triples, three per triangle). */
/** Triangle soup from a flat Float32Array of xyz triples. Space-agnostic: the caller decides
 *  whether these are world coordinates (static scenery) or the part's own (a `mover`). */
export function makeSoup(positions) {
  const len = positions.length;
  const n = (len / 9) | 0;                    // triangles = floor(floats / 9)
  const pos = positions.slice(0, n * 9);
  let minX = Infinity, minY = Infinity, minZ = Infinity,
      maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
  }
  // Bounding sphere: centre of the bbox, actual max distance from it — tight, not the
  // bbox half-diagonal (which is ~1.7x too big for a sphere, and free to compute here).
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  let maxR2 = 0;
  for (let i = 0; i < pos.length; i += 3) {
    const dx = pos[i] - cx, dy = pos[i + 1] - cy, dz = pos[i + 2] - cz,
      d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > maxR2) maxR2 = d2;
  }
  return {
    pos,
    count: n,
    damage: 0,
    center: { x: cx, y: cy, z: cz },
    radius: Math.sqrt(maxR2),
  };
}

/** Store the local-space soup for asteroid shape `index` (0..5), overriding the built-in lump. */
export function setRockSoup(index, soup) {
  rockSoups[index] = soup;
}

/** The local-space soup for asteroid shape `index`, or null when no `.glb` rocks and no built-in lump exist. */
export function rockSoupAt(index) {
  const k = Math.abs(Math.floor(index)) % rockSoups.length;
  return rockSoups[k] || (rockSoups[k] = makeSoup(builtInRockPositions(k)));
}

/** Register (or replace) a world-space collider for a place. */
/**
 * A collider for a part that moves: same record as any other, plus
 *
 *   mover = { pos: {x,y,z}, quat: {x,y,z,w}, scale: {x,y,z}, object }
 *
 * where `soup` is baked in the part's OWN space (not the world) and `mover` says where that space
 * is right now. The render layer refreshes `mover` from the part's live transform; the sim does the
 * rest. `object` is the three.js node the transform is read from — render layer only, the sim never
 * touches it. Registering the same `id` again replaces the record, so a mover is registered once
 * and never re-baked.
 */
export function registerPlaceCollider(placeId, collider) {
  if (!collider?.soup) return;
  const list = placeColliders.get(placeId) || [];
  // A rebuilt place (e.g. after an instance despawns) replaces its own records only.
  const unrelated = list.filter(c => c.id !== collider.id);
  unrelated.push(collider);
  placeColliders.set(placeId, unrelated);
}

/** Forget every world-space collider for a place (a destroyed instance, `render/forgetPlace`). */
export function clearPlaceColliders(placeId) {
  placeColliders.delete(placeId);
}

/**
 * Reflect a velocity off a surface normal, keeping the tangent intact and scaling the
 * normal part: restitution 0 = stop dead against the surface, 1 = full bounce,
 * 0.4 = the game's house style (the old rock bounce). `v` is duck-typed {x,y,z} and
 * mutated in place. `vn >= 0` (already separating) leaves `v` untouched.
 */
export function reflectVelocity(v, nx, ny, nz, restitution = 0.4) {
  const vn = v.x * nx + v.y * ny + v.z * nz;
  if (vn >= 0) return;
  v.x -= (1 + restitution) * vn * nx;
  v.y -= (1 + restitution) * vn * ny;
  v.z -= (1 + restitution) * vn * nz;
}

export function placeCollidersOf(placeId) {
  return placeColliders.get(placeId) || EMPTY;
}

/* ------------------------------------------------------------------------- */
/* Closest point on a triangle (Ericson, Realtime Collision Detection 5.1.5)  */
/* ------------------------------------------------------------------------- */

function closestPointTriangle(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz, out) {
  const abx = bx - ax, aby = by - ay, abz = bz - az,
    acx = cx - ax, acy = cy - ay, acz = cz - az,
    apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz,
    d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { out.set(ax, ay, az); return out; }
  const bpx = px - bx, bpy = py - by, bpz = pz - bz,
    d3 = abx * bpx + aby * bpy + abz * bpz,
    d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) { out.set(bx, by, bz); return out; }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    out.set(ax + v * abx, ay + v * aby, az + v * abz);
    return out;
  }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz,
    d5 = abx * cpx + aby * cpy + abz * cpz,
    d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) { out.set(cx, cy, cz); return out; }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    out.set(ax + w * acx, ay + w * acy, az + w * acz);
    return out;
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    out.set(bx + w * (cx - bx), by + w * (cy - by), bz + w * (cz - bz));
    return out;
  }
  // Face-interior hit: project onto the triangle's plane.
  //
  // (This used to bail out to vertex A here. The guard multiplied a normal by `ac` again, a triple
  // product that is identically zero, so `denom === 0` was ALWAYS true: every query landing inside
  // a triangle — which is most of them, for a hull or a shot against a broad face — reported
  // vertex A as the closest point. Penetration was then measured from a far corner, so hulls were
  // pushed out along a wrong normal and by the wrong depth. Fixed 2026-11-15 alongside the moving
  // parts, whose thin arms made it obvious: the arm's flat top face is exactly where it showed.)
  const nx = aby * acz - abz * acy,
    ny = abz * acx - abx * acz,
    nz = abx * acy - aby * acx,
    len2 = nx * nx + ny * ny + nz * nz;
  if (len2 === 0) { out.set(ax, ay, az); return out; }   // a degenerate (zero-area) triangle
  const t = (nx * apx + ny * apy + nz * apz) / len2;
  out.set(px - nx * t, py - ny * t, pz - nz * t);
  return out;
}

const _cp = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };

/**
 * Push a sphere out of every registered world-space collider for `placeId` (or local rock soups).
 * Returns { x, y, z, depth, damage } for the single deepest penetration, or null when clear.
 */
/** The largest component of a scale triple (movers are allowed non-uniform scale). */
function _maxScale(scale) {
  if (!scale) return 1;
  const ax = Math.abs(scale.x), ay = Math.abs(scale.y), az = Math.abs(scale.z);
  return ax > ay ? (ax > az ? ax : az) : (ay > az ? ay : az);
}

/** Rotate a vector by a quaternion, in place into `out`. Identity when `q` is missing. */
function _quatRotate(x, y, z, q, out) {
  const qx = q?.x || 0, qy = q?.y || 0, qz = q?.z || 0, qw = q?.w ?? 1;
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  out.x = x + qw * tx + (qy * tz - qz * ty);
  out.y = y + qw * ty + (qz * tx - qx * tz);
  out.z = z + qw * tz + (qx * ty - qy * tx);
  return out;
}

/** Carry one world point into a mover's own space, written into `out`. */
function _moverLocal(p, m, out) {
  const s = m.scale || _unitScale;
  const vx = p.x - m.pos.x, vy = p.y - m.pos.y, vz = p.z - m.pos.z;
  // inverse rotation is the conjugate
  const qx = -(m.quat?.x || 0), qy = -(m.quat?.y || 0), qz = -(m.quat?.z || 0), qw = m.quat?.w ?? 1;
  const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
  out.x = (vx + qw * tx + (qy * tz - qz * ty)) / (s.x || 1);
  out.y = (vy + qw * ty + (qz * tx - qx * tz)) / (s.y || 1);
  out.z = (vz + qw * tz + (qx * ty - qy * tx)) / (s.z || 1);
  return out;
}

/**
 * A collider's soup as it stands in the world right now: static soups are already world-space,
 * a mover's are carried out of its own space by its live transform. `out` is a Float32Array of at
 * least `soup.pos.length`, reused by the caller so nothing allocates per frame.
 */
function _moverWorldPositions(collider, out) {
  const soup = collider.soup, m = collider.mover, pos = soup.pos;
  const s = m.scale || _unitScale;
  for (let i = 0; i < pos.length; i += 3) {
    _quatRotate(pos[i] * s.x, pos[i + 1] * s.y, pos[i + 2] * s.z, m.quat, _mo);
    out[i] = _mo.x + m.pos.x;
    out[i + 1] = _mo.y + m.pos.y;
    out[i + 2] = _mo.z + m.pos.z;
  }
  return out;
}

const _mo = { x: 0, y: 0, z: 0 };
const _mv = { x: 0, y: 0, z: 0 };  // the query sphere in a mover's own space
const _ml = { x: 0, y: 0, z: 0 };
const _mn = { x: 0, y: 0, z: 0 };
const _ma = { x: 0, y: 0, z: 0 };  // segment endpoints in a mover's own space
const _mb = { x: 0, y: 0, z: 0 };
const _mk = { x: 0, y: 0, z: 0 };
const _bounds = { x: 0, y: 0, z: 0, r: 0 };

/** Where a collider's soup sits in the world right now: its bounding centre and radius. */
function colliderBounds(collider) {
  const soup = collider.soup, m = collider.mover;
  if (!m) {
    _bounds.x = soup.center.x; _bounds.y = soup.center.y; _bounds.z = soup.center.z;
    _bounds.r = soup.radius;
    return _bounds;
  }
  _quatRotate(soup.center.x * (m.scale?.x || 1), soup.center.y * (m.scale?.y || 1),
    soup.center.z * (m.scale?.z || 1), m.quat, _bounds);
  _bounds.x += m.pos.x; _bounds.y += m.pos.y; _bounds.z += m.pos.z;
  _bounds.r = soup.radius * _maxScale(m.scale);
  return _bounds;
}

export function collideSphereAt(colliders, cx, cy, cz, radius) {
  let hit = null;
  for (const collider of colliders) {
    const soup = collider.soup;
    const b = colliderBounds(collider);
    const dx = cx - b.x, dy = cy - b.y, dz = cz - b.z;
    if (dx * dx + dy * dy + dz * dz > (b.r + radius) * (b.r + radius)) continue;
    const pos = soup.pos;
    // Where to test from: a mover's soup lives in the part's own space, so the query point is
    // carried in once here rather than every triangle being carried out. A non-uniform scale also
    // stretches the sphere, so the radius is scaled the same way and the comparison stays honest.
    let px = cx, py = cy, pz = cz;
    let rLoc = radius;            // the sphere's radius, in this soup's own units
    if (collider.mover) {
      _mv.x = cx; _mv.y = cy; _mv.z = cz;
      _moverLocal(_mv, collider.mover, _ml);
      px = _ml.x; py = _ml.y; pz = _ml.z;
      rLoc = radius / (_maxScale(collider.mover.scale) || 1);
    }
    const r2 = rLoc * rLoc;
    for (let i = 0; i < pos.length; i += 9) {
      closestPointTriangle(px, py, pz,
        pos[i], pos[i + 1], pos[i + 2],
        pos[i + 3], pos[i + 4], pos[i + 5],
        pos[i + 6], pos[i + 7], pos[i + 8], _cp);
      const ex = px - _cp.x, ey = py - _cp.y, ez = pz - _cp.z;
      const d2 = ex * ex + ey * ey + ez * ez;
      if (d2 >= r2) continue;
      const d = Math.sqrt(d2);
      // `d` and `rLoc` are in the part's own space; report the push-out in world metres.
      const depth = radius - (d * (rLoc / radius));
      if (!hit || depth > hit.depth) {
        let nx, ny, nz;
        if (d > 1e-9) { nx = ex / d; ny = ey / d; nz = ez / d; }
        else {
          // Centre on a triangle: use the geometric normal, away from the push direction.
          const abx = pos[i + 3] - pos[i], aby = pos[i + 4] - pos[i + 1], abz = pos[i + 5] - pos[i + 2];
          const acx = pos[i + 6] - pos[i], acy = pos[i + 7] - pos[i + 1], acz = pos[i + 8] - pos[i + 2];
          nx = aby * acz - abz * acy; ny = abz * acx - abx * acz; nz = abx * acy - aby * acx;
          const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          nx /= len; ny /= len; nz /= len;
        }
        if (collider.mover) {
          // The normal was found in the part's own space; the caller pushes the ship out in world
          // space, so it turns with the part.
          _quatRotate(nx, ny, nz, collider.mover.quat, _mn);
          nx = _mn.x; ny = _mn.y; nz = _mn.z;
        }
        hit = { x: nx, y: ny, z: nz, depth, damage: collider.damage || soup.damage || 0 };
      }
    }
  }
  return hit;
}

const _a = [0, 0, 0], _b = [0, 0, 0], _c = [0, 0, 0];

/**
 * Sphere vs one rock: broadphase by the rock's own bounding (`rock.r * maxScale + radius`), then
 * per-triangle against its shape soup with the rock's position / rotation / non-uniform scale.
 * Vertex transforms reuse three module-scope scratch arrays — nothing allocates per frame.
 */
export function collideRockAt(shape, origin, quat, scale, cx, cy, cz, radius) {
  const soup = rockSoupAt(shape);
  if (!soup) return null;
  const maxS = Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
  const touch = soup.radius * maxS + radius;
  const ddx = cx - origin.x, ddy = cy - origin.y, ddz = cz - origin.z;
  if (ddx * ddx + ddy * ddy + ddz * ddz > touch * touch) return null;

  const qx = quat?.x ?? 0, qy = quat?.y ?? 0, qz = quat?.z ?? 0, qw = quat?.w ?? 1;
  const pos = soup.pos;
  let hit = null;
  for (let i = 0; i < pos.length; i += 9) {
    // local vertex -> world: scale, then rotate, then translate (once per vertex).
    tx(pos, i, qx, qy, qz, qw, scale, origin, _a);
    tx(pos, i + 3, qx, qy, qz, qw, scale, origin, _b);
    tx(pos, i + 6, qx, qy, qz, qw, scale, origin, _c);
    closestPointTriangle(cx, cy, cz, _a[0], _a[1], _a[2], _b[0], _b[1], _b[2], _c[0], _c[1], _c[2], _cp);
    const ex = cx - _cp.x, ey = cy - _cp.y, ez = cz - _cp.z;
    const d2 = ex * ex + ey * ey + ez * ez;
    if (d2 >= radius * radius) continue;
    const d = Math.sqrt(d2), depth = radius - d;
    if (!hit || depth > hit.depth) {
      let nx, ny, nz;
      if (d > 1e-9) { nx = ex / d; ny = ey / d; nz = ez / d; }
      else { nx = ex + 1; ny = ey; nz = ez; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; }
      hit = { x: nx, y: ny, z: nz, depth, damage: 1 };
    }
  }
  return hit;
}

/** v' = v + 2 q.w (q × v) + 2 q × (q × v), scaled per axis first, then translated; result written into `out`. */
function tx(pos, i, qx, qy, qz, qw, scale, origin, out) {
  const vx = pos[i] * scale.x, vy = pos[i + 1] * scale.y, vz = pos[i + 2] * scale.z;
  const tx_ = 2 * (qy * vz - qz * vy),
    ty_ = 2 * (qz * vx - qx * vz),
    tz_ = 2 * (qx * vy - qy * vx);
  out[0] = origin.x + vx + qw * tx_ + (qy * tz_ - qz * ty_);
  out[1] = origin.y + vy + qw * ty_ + (qz * tx_ - qx * tz_);
  out[2] = origin.z + vz + qw * tz_ + (qx * ty_ - qy * tx_);
  return out;
}

/* ------------------------------------------------------------------------- */
/* Projectiles vs colliders: the segment a shot covered this tick            */
/* ------------------------------------------------------------------------- */

/**
 * The first point where a segment from `a` to `b` meets one world-space collider's triangles.
 * Returns `{ t, x, y, z }` with `t` the fraction along the segment (0 at `a`, 1 at `b`) and
 * `x, y, z` the impact point, or null when the segment misses.
 *
 * A shot is a point moving in a straight line and a tick is short, but not short enough to test
 * the end point alone: the basic cannon's bolt covers 15 m in one 60 Hz tick and the fastest gun
 * 900 m/s covers the same, so a thin thing (a station's spoke, a small rock) can sit entirely
 * between two ticks. Walking the segment is what makes a hit certain rather than lucky.
 *
 * The test is segment-vs-triangle (Moller-Trumbore, two-sided — a collider is solid from any
 * side, since a rock's soup has no reliable winding). The broadphase sphere is the soup's own
 * bounding sphere, so a segment that misses it costs one distance test, not a triangle loop.
 */
export function segmentColliderHit(a, b, collider) {
  const soup = collider?.soup;
  if (!soup) return null;
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const lenSq = dx * dx + dy * dy + dz * dz;
  if (lenSq <= 0) return null;
  // Broadphase against where the soup actually is right now (a mover's bounds travel and turn
  // with the part): closest approach of the segment to that centre, against its radius.
  const bd = colliderBounds(collider);
  let t0 = ((bd.x - a.x) * dx + (bd.y - a.y) * dy + (bd.z - a.z) * dz) / lenSq;
  t0 = t0 < 0 ? 0 : t0 > 1 ? 1 : t0;
  const qx = a.x + dx * t0 - bd.x, qy = a.y + dy * t0 - bd.y, qz = a.z + dz * t0 - bd.z;
  if (qx * qx + qy * qy + qz * qz > bd.r * bd.r) return null;

  // A mover's soup is in the part's own space: the segment is carried in once, and `t` (which is
  // a fraction along the segment) survives the change of space untouched.
  let ax = a.x, ay = a.y, az = a.z;
  let ex2 = dx, ey2 = dy, ez2 = dz;
  if (collider.mover) {
    _ma.x = a.x; _ma.y = a.y; _ma.z = a.z;
    _mb.x = b.x; _mb.y = b.y; _mb.z = b.z;
    _moverLocal(_ma, collider.mover, _ml);
    _moverLocal(_mb, collider.mover, _mk);
    ax = _ml.x; ay = _ml.y; az = _ml.z;
    ex2 = _mk.x - ax; ey2 = _mk.y - ay; ez2 = _mk.z - az;
  }

  const pos = soup.pos;
  let best = Infinity;
  for (let i = 0; i < pos.length; i += 9) {
    // Moller-Trumbore, both sides: `det` of either sign is a valid crossing.
    const e1x = pos[i + 3] - pos[i], e1y = pos[i + 4] - pos[i + 1], e1z = pos[i + 5] - pos[i + 2];
    const e2x = pos[i + 6] - pos[i], e2y = pos[i + 7] - pos[i + 1], e2z = pos[i + 8] - pos[i + 2];
    const px = ey2 * e2z - ez2 * e2y, py = ez2 * e2x - ex2 * e2z, pz = ex2 * e2y - ey2 * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (det > -1e-12 && det < 1e-12) continue;            // parallel to this triangle
    const inv = 1 / det;
    const tx = ax - pos[i], ty = ay - pos[i + 1], tz = az - pos[i + 2];
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx2 = ty * e1z - tz * e1y, qy2 = tz * e1x - tx * e1z, qz2 = tx * e1y - ty * e1x;
    const v = (ex2 * qx2 + ey2 * qy2 + ez2 * qz2) * inv;
    if (v < 0 || u + v > 1) continue;
    const t = (e2x * qx2 + e2y * qy2 + e2z * qz2) * inv;
    if (t >= 0 && t <= 1 && t < best) best = t;
  }
  if (best === Infinity) return null;
  return { t: best, x: a.x + dx * best, y: a.y + dy * best, z: a.z + dz * best };
}

/**
 * The nearest thing a segment from `a` to `b` runs into, across every registered collider for a
 * place and every rock in its field: `{ t, x, y, z, damage, id }`, or null for a clear path.
 *
 * This is the projectile counterpart of `collideSphereAt` and it reads exactly the same sources —
 * `placeCollidersOf` for scenery (a station's ring and hub, a planet, a GLB cave — anything with a
 * baked collider and no `collide: false`) and the rock soups for an asteroid field. So a projectile
 * stops on whatever stops the ship, and `noclip` nodes and `collide: false` features stay
 * fly-through for bullets too, which is the point of them.
 *
 * `rocks` is the place's asteroid list (plain rock records: `shape`, `pos`, `quat`, `scale`); pass
 * an empty array when only scenery is wanted.
 */
export function sweepColliders(colliders, rocks, a, b) {
  let best = null;
  for (const collider of colliders) {
    const hit = segmentColliderHit(a, b, collider);
    if (hit && (!best || hit.t < best.t)) {
      const soup = collider.soup;
      best = { t: hit.t, x: hit.x, y: hit.y, z: hit.z, id: collider.id, damage: collider.damage || soup.damage || 0 };
    }
  }
  if (rocks && rocks.length) {
    // A rock's soup lives in its own local space, so the segment is carried into the rock instead
    // of every vertex being carried out: same maths, one transform per rock rather than per vertex.
    for (const rock of rocks) {
      const hit = segmentRockHit(rock, a, b);
      if (hit && (!best || hit.t < best.t)) best = hit;
    }
  }
  return best;
}

/**
 * A segment against one rock, transformed into the rock's model space with the rock's own
 * position / rotation / non-uniform scale. `t` is still the fraction along the *world* segment.
 */
export function segmentRockHit(rock, a, b) {
  const soup = rock?.soup || rockSoupAt(rock?.shape || 0);
  if (!soup) return null;
  const scale = rock.scale || _unitScale;
  const maxS = Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
  const touch = soup.radius * maxS;
  // Broadphase in world space first, against the rock's own centre.
  const cx = rock.pos.x, cy = rock.pos.y, cz = rock.pos.z;
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const lenSq = dx * dx + dy * dy + dz * dz;
  if (lenSq <= 0) return null;
  let t0 = ((cx - a.x) * dx + (cy - a.y) * dy + (cz - a.z) * dz) / lenSq;
  t0 = t0 < 0 ? 0 : t0 > 1 ? 1 : t0;
  const qx = a.x + dx * t0 - cx, qy = a.y + dy * t0 - cy, qz = a.z + dz * t0 - cz;
  if (qx * qx + qy * qy + qz * qz > touch * touch) return null;

  // World -> model: undo the rotation, then divide by the scale (zero-safe).
  const qx0 = rock.quat?.x ?? 0, qy0 = rock.quat?.y ?? 0, qz0 = rock.quat?.z ?? 0, qw0 = rock.quat?.w ?? 1;
  const ia = _rockLocal(a, cx, cy, cz, qx0, qy0, qz0, qw0, scale, _la);
  const ib = _rockLocal(b, cx, cy, cz, qx0, qy0, qz0, qw0, scale, _lb);
  const hit = segmentColliderHit(ia, ib, { soup });
  if (!hit) return null;
  // `hit.x/y/z` are model-space; the caller only needs the fraction, which the linear map preserves.
  return { t: hit.t, x: a.x + dx * hit.t, y: a.y + dy * hit.t, z: a.z + dz * hit.t, id: rock.id, damage: 1 };
}

const _unitScale = { x: 1, y: 1, z: 1 };
const _la = { x: 0, y: 0, z: 0 };
const _lb = { x: 0, y: 0, z: 0 };

/** A world point in one rock's model space, written into `out`. */
function _rockLocal(p, cx, cy, cz, qx, qy, qz, qw, scale, out) {
  const vx = p.x - cx, vy = p.y - cy, vz = p.z - cz;
  // inverse rotation: conjugate
  const tx_ = 2 * (-qy * vz + qz * vy), ty_ = 2 * (-qz * vx + qx * vz), tz_ = 2 * (-qx * vy + qy * vx);
  const rx = vx - qw * tx_ + (-qy * tz_ + qz * ty_);
  const ry = vy - qw * ty_ + (-qz * tx_ + qx * tz_);
  const rz = vz - qw * tz_ + (-qx * ty_ + qy * tx_);
  out.x = rx / (scale.x || 1);
  out.y = ry / (scale.y || 1);
  out.z = rz / (scale.z || 1);
  return out;
}
