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
// Objective colours reach an inline style, so only a plain colour value passes.
const SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla)\([0-9.,%\s/]+\)|var\(--[a-z0-9-]+\))$/;
const safeColor = value => (typeof value === 'string' && SAFE_COLOR.test(value.trim()) ? value.trim() : '');
export function pocketRowsHtml(rows, isSelected = () => false, objectiveFor = null) {
  if (!rows.length) return '<li class="pocket-empty">No matching objects.</li>';
  return rows.map((row, index) => {
    const selected = Boolean(isSelected(row, index));
    const objColor = safeColor(typeof objectiveFor === 'function' ? objectiveFor(row, index) : '') ||
      safeColor(row.objectiveColor);
    const type = pocketType(row.kind);
    const rowCls = markerClasses(selected ? 'selected' : '', objColor ? 'objective' : '');
    const cls = rowCls ? ` class="${rowCls}"` : '';
    const rowStyle = objColor ? ` style="--objective-color:${escRow(objColor)}"` : '';
    const { tone, color } = markerStyle(row.kind, row.object);
    const iconCls = markerClasses('pocket-icon', tone, objColor ? 'obj' : '');
    const styleParts = [
      color ? `--marker-color:${escRow(color)}` : '',
      objColor ? `--objective-color:${escRow(objColor)}` : '',
    ].filter(Boolean).join(';');
    const iconStyle = styleParts ? ` style="${styleParts}"` : '';
    return `<li${cls}${rowStyle}><button type="button"${cls} data-pocket-row="${index}" aria-pressed="${selected}" title="${escRow(row.name)} (${type})"><span class="pocket-label"><i class="${iconCls}"${iconStyle} aria-hidden="true"></i><span class="pocket-name">${escRow(row.name)} <small>(${type})</small></span></span><span>${(row.distance / 1000).toFixed(2)} km</span></button></li>`;
  }).join('');
}
