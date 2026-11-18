// Pure flight hotbar markup. Family icons are shared by every module variant.
import { MODULES } from '../data/modules.js';
import { layoutFor } from '../data/outfitting.js';

const ICONS = {
  cannon: '<circle cx="12" cy="12" r="8"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
  missile: '<g transform="rotate(45 12 12)"><path d="M9 9Q9 4 12 2Q15 4 15 9V20H9ZM9 14L6 17V20L9 18M15 14L18 17V20L15 18M9 9H15M9 11H15M9 17H15"/></g>',
  mining: '<path d="m13 2-10 12h8l-1 8 11-13h-8z"/>',
  empty: '<path d="M12 5v14M5 12h14"/>',
};
const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function weaponFamily(module) {
  if (!module) return 'empty';
  if (ICONS[module.weaponFamily]) return module.weaponFamily;
  return module.period ? 'mining' : module.g === 'secondary' ? 'missile' : 'cannon';
}
export function weaponSlotsHtml(profile) {
  const fit=profile.loadout?.[profile.ship] || {}, layout=layoutFor(profile.ship);
  return ['primary','secondary'].map(group=>{
    const secondary=group==='secondary', selected=Number(secondary?profile.sw || '1':profile.pw || '1')-1;
    const buttons=Array.from({length:5},(_,index)=>{
      const key=String((index+(secondary?6:1))%10), available=index<(layout[group]||0);
      const module=available ? MODULES[fit[group]?.[index]] : null;
      const family=weaponFamily(module), active=selected===index;
      const name=module?.n || (available?'Empty weapon slot':'No fitted bay');
      const ammo=family==='missile' ? ` · ${profile.msl || 0} missiles` : '';
      return `<button type="button" class="weapon-slot${active?' selected':''}${module?' fitted':''}${available?'':' unavailable'}" data-weapon-action="${group}:${index+1}" title="${esc(`${key}: ${name}${ammo}`)}" aria-label="${esc(`${key}: ${name}${ammo}`)}" aria-pressed="${active}"><span class="weapon-key">${key}</span><svg viewBox="0 0 24 24" aria-hidden="true" data-family="${family}">${ICONS[family]}</svg><i class="weapon-fitted-mark" aria-hidden="true"></i></button>`;
    }).join('');
    const selectedModule = selected < (layout[group] || 0) ? MODULES[fit[group]?.[selected]] : null;
    const selectedName = selectedModule?.n || 'Empty slot';
    const selectedAmmo = weaponFamily(selectedModule) === 'missile'
      ? ` · ${Math.max(0, Math.floor(profile.msl || 0))} missiles` : '';
    return `<section class="weapon-bank ${group}" aria-label="${secondary?'Secondary':'Primary'} weapon slots"><div class="weapon-bank-label">${secondary?'SECONDARY':'PRIMARY'}</div><div class="weapon-bank-name" title="${esc(selectedName + selectedAmmo)}">${esc(selectedName)}${selectedAmmo ? `<span class="weapon-ammo">${esc(selectedAmmo)}</span>` : ""}</div><div class="weapon-bank-slots">${buttons}</div></section>`;
  }).join('');
}
