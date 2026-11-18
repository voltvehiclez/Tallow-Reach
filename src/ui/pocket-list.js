// Browser preferences, not pilot save data; unavailable storage is harmless.
import { markerClasses, markerStyle } from './target-display.js';

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
const escRow = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
export function pocketRowsHtml(rows, isSelected = () => false) {
  if (!rows.length) return '<li class="pocket-empty">No matching objects.</li>';
  return rows.map((row, index) => {
    const selected = Boolean(isSelected(row, index));
    const type = pocketType(row.kind);
    const cls = selected ? ' class="selected"' : '';
    const { tone, color } = markerStyle(row.kind, row.object);
    const iconCls = markerClasses('pocket-icon', tone);
    const iconStyle = color ? ` style="--marker-color:${escRow(color)}"` : '';
    return `<li${cls}><button type="button"${cls} data-pocket-row="${index}" aria-pressed="${selected}" title="${escRow(row.name)} (${type})"><span class="pocket-label"><i class="${iconCls}"${iconStyle} aria-hidden="true"></i><span class="pocket-name">${escRow(row.name)} <small>(${type})</small></span></span><span>${(row.distance / 1000).toFixed(2)} km</span></button></li>`;
  }).join('');
}
