// Pure flight hotbar markup. Family icons are shared by every module variant.
import { MODULES } from '../data/modules.js';
import { layoutFor } from '../data/outfitting.js';

const ICONS = {
  cannon: '<circle cx="12" cy="12" r="8"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
  missile: '<path d="M9 15c-1-5 4-11 12-12 0 8-6 13-12 12Zm0-5-5 1-2 5 6-1m5 1-1 6 5-2 1-5M7 17l-4 4"/><circle cx="16" cy="8" r="2"/>',
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
      return `<button type="button" class="weapon-slot${active?' selected':''}${module?' fitted':''}${available?'':' unavailable'}" data-weapon-action="${group}:${index+1}" title="${esc(`${key}: ${name}${ammo}`)}" aria-label="${esc(`${key}: ${name}${ammo}`)}" aria-pressed="${active}"><span class="weapon-key">${key}</span><svg viewBox="0 0 24 24" aria-hidden="true" data-family="${family}">${ICONS[family]}</svg>${family==='missile'?`<small class="weapon-ammo">${Math.max(0,Math.floor(profile.msl||0))}</small>`:''}<i class="weapon-fitted-mark" aria-hidden="true"></i></button>`;
    }).join('');
    return `<section class="weapon-bank ${group}" aria-label="${secondary?'Secondary':'Primary'} weapon slots"><div class="weapon-bank-label">${secondary?'SECONDARY':'PRIMARY'}</div><div class="weapon-bank-slots">${buttons}</div></section>`;
  }).join('');
}
