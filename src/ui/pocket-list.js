// Browser preferences, not pilot save data; unavailable storage is harmless.
export const POCKET_FILTERS = ['Ship','Station','Asteroid','Asteroid field','Planet','Cargo','Rift','Gate','Cache','Projectile','Missile','Scenery','Other'];
export function pocketType(kind) {
  return ({Hostile:'Ship',station:'Station',asteroidField:'Asteroid field',planet:'Planet',scenery:'Scenery'})[kind] || (POCKET_FILTERS.includes(kind) ? kind : 'Other');
}
const KEY = 'tr-pocket-filters';
export function readPocketFilters(storage) {
  try {
    const value = JSON.parse(storage.getItem(KEY));
    return Object.fromEntries(POCKET_FILTERS.map(k=>[k, typeof value?.[k] === 'boolean' ? value[k] : true]));
  } catch { return Object.fromEntries(POCKET_FILTERS.map(k=>[k,true])); }
}
export function savePocketFilters(storage, filters) {
  try { storage.setItem(KEY, JSON.stringify(filters)); } catch { /* Browsing still works. */ }
}
export function sortedPocketRows(rows, filters, sort = 'distance', direction = 1) {
  return rows.filter(row=>filters[pocketType(row.kind)] !== false).sort((a,b)=>{
    const delta = sort === 'name' ? a.name.localeCompare(b.name) : sort === 'type' ? pocketType(a.kind).localeCompare(pocketType(b.kind)) : a.distance-b.distance;
    return direction * (delta || a.name.localeCompare(b.name) || a.distance-b.distance);
  });
}
