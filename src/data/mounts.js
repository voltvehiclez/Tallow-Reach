// Hull-local weapon mounts. The z offsets retain the historical hull-scale
// adjustment; playerLocal applies the model's scale separately. A future hull
// can provide its own table without involving the renderer in gameplay.
const DEFAULT_MOUNTS = {
  gun: { x: -1.8, spacing: 3.6, y: -0.2, z: -5 },
  missile: { x: 0, y: -1.2, z: -5 },
  beam: { x: 0, y: -1, z: -6 },
};
export const HULL_MOUNTS = { wasp: DEFAULT_MOUNTS, prospector: DEFAULT_MOUNTS, bulwark: DEFAULT_MOUNTS };

// `bay` selects a single gun's position; linked barrels remain centred.
export function mountOffset(hull, name, scale, bay = 0, barrel = 0, count = 1) {
  const mount = (HULL_MOUNTS[hull] || DEFAULT_MOUNTS)[name];
  if (!mount) throw new Error(`Unknown mount: ${name}`);
  const x = name === "gun" ? (count > 1 ? (barrel - (count - 1) / 2) * mount.spacing : mount.x + mount.spacing * bay) : mount.x;
  return { x, y: mount.y, z: mount.z * scale };
}
