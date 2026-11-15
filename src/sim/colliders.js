// Triangle-mesh collision, in plain data — the sim owns nothing renderer-side.
//
// Every solid thing in the game builds one of these at the same moment its mesh is built
// (render layer bakes the triangles into world or local space and registers them here); this
// module only stores triangle soup and does closest-point-on-triangle maths. No three.js here,
// so the sim can import it freely and tests can run it headless.
//
// Two shapes of collider:
//   world-space soup   scenery (station, planet) — baked once at build, static, tested as-is.
//   local-space soup   rocks — one soup per asteroid shape; each rock carries its own
//                      position/rotation/non-uniform scale, applied per vertex at test time.
//
// A collider may opt out per node inside a GLB (a node named `noclip`) or per feature in data
// (`collide: false` — e.g. a glow shell the pilot should fly through).

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
  // Face-interior hit: project onto the plane.
  const denom = (abx * (acy * abz - abz * acz) - aby * (acx * abz - abz * acx) + abz * (acx * acy - acy * acx));
  if (denom === 0) { out.set(ax, ay, az); return out; }
  const nx = (aby * acz - abz * acy),
    ny = (abz * acx - abx * acz),
    nz = (abx * acy - aby * acx),
    inv = 1 / (nx * nx + ny * ny + nz * nz);
  const t = (nx * apx + ny * apy + nz * apz) * inv;
  out.set(px - nx * t, py - ny * t, pz - nz * t);
  return out;
}

const _cp = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };

/**
 * Push a sphere out of every registered world-space collider for `placeId` (or local rock soups).
 * Returns { x, y, z, depth, damage } for the single deepest penetration, or null when clear.
 */
export function collideSphereAt(colliders, cx, cy, cz, radius) {
  let hit = null;
  for (const collider of colliders) {
    const soup = collider.soup;
    const dx = cx - soup.center.x, dy = cy - soup.center.y, dz = cz - soup.center.z;
    if (dx * dx + dy * dy + dz * dz > (soup.radius + radius) * (soup.radius + radius)) continue;
    const pos = soup.pos;
    for (let i = 0; i < pos.length; i += 9) {
      closestPointTriangle(cx, cy, cz,
        pos[i], pos[i + 1], pos[i + 2],
        pos[i + 3], pos[i + 4], pos[i + 5],
        pos[i + 6], pos[i + 7], pos[i + 8], _cp);
      const ex = cx - _cp.x, ey = cy - _cp.y, ez = cz - _cp.z;
      const d2 = ex * ex + ey * ey + ez * ez;
      if (d2 >= radius * radius) continue;
      const d = Math.sqrt(d2);
      const depth = radius - d;
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
