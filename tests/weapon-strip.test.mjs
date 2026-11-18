import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { state, resetPlaces } from '../src/state/state.js';
import { newProfile, sanitizeProfile } from '../src/state/profile.js';
import { createPlayer, createPlayerRecord } from '../src/sim/player.js';
import { configurePlayer } from '../src/sim/session.js';
import { setWeapon, setSecondaryWeapon, updatePrimary, updateMissiles } from '../src/sim/weapons.js';
import { weaponSlotsHtml, weaponFamily } from '../src/ui/weapon-slots.js';
import { MODULES } from '../src/data/modules.js';
import { BINDINGS } from '../src/core/input.js';
function setup() {
 resetPlaces();state.players.length=0;state.localPlayerIndex=0;state.place='hollow';state.profile=newProfile();state.warp=null;state.freeCam.on=false;
 state.profile.loadout.wasp.primary=['cannon_basic',null,null,null,'cannon_basic'];
 state.profile.loadout.wasp.secondary=['missile_basic','missile_basic',null,null,'missile_basic'];state.profile.msl=8;
 const p=configurePlayer(createPlayer(),state.profile);p.docked=false;p.pos.set(0,0,100);return p;
}
test('All ten keys map to the matching ordered bay in independent banks',()=>{
 for(let i=1;i<=5;i++) {
  assert.equal(BINDINGS[`Digit${i}`],`primary:${i}`);
  assert.equal(BINDINGS[`Digit${(i+5)%10}`],`secondary:${i}`);
 }
 const p=setup();setWeapon(4,p);setSecondaryWeapon(1,p);
 assert.equal(state.profile.pw,'5');assert.equal(state.profile.sw,'2');
 p.controls.fire=true;updatePrimary(1/60,p);assert.equal(state.world.bullets.length,2);
 setWeapon(2,p);p.flight.gunCd.fill(0);updatePrimary(1/60,p);assert.equal(state.world.bullets.length,2);
 assert.equal(state.profile.sw,'2');
});
test('Secondary firing uses the selected bay, never falls back, and switching preserves reload',()=>{
 const p=setup();p.missiles[1].dmg=123;p.controls.sec=true;
 setSecondaryWeapon(1,p);updateMissiles(0,p,false);
 assert.equal(state.world.missiles[0].dmg,123);assert.equal(state.profile.msl,7);
 const cd=p.flight.missileCd;setSecondaryWeapon(4,p);assert.equal(p.flight.missileCd,cd);
 updateMissiles(0,p,false);assert.equal(state.profile.msl,7);
 p.flight.missileCd=0;setSecondaryWeapon(2,p);updateMissiles(0,p,false);assert.equal(state.profile.msl,7);
 assert.equal(p.flight.missileLock.target,null);
});
test('Selection persists with safe defaults and remains independent between pilots',()=>{
 const p=setup();setWeapon(4,p);setSecondaryWeapon(4,p);
 const saved=sanitizeProfile(JSON.parse(JSON.stringify(state.profile)));
 assert.equal(saved.pw,'5');assert.equal(saved.sw,'5');
 const legacy=newProfile();delete legacy.sw;assert.equal(sanitizeProfile(legacy).sw,'1');
 legacy.sw='100';assert.equal(sanitizeProfile(legacy).sw,'1');
 const guestProfile=newProfile(), guest=configurePlayer(createPlayerRecord(),guestProfile);
 setWeapon(2,guest);setSecondaryWeapon(1,guest);assert.equal(guestProfile.pw,'3');assert.equal(guestProfile.sw,'2');
 assert.equal(state.profile.pw,'5');assert.equal(state.profile.sw,'5');
});
test('Strip has ten numbered boxes, shared family icons and no redundant top-right weapon line',()=>{
 const profile=newProfile();profile.loadout.wasp.primary=['beam_basic','cannon_basic'];profile.loadout.wasp.secondary=['missile_basic'];profile.msl=8;
 const html=weaponSlotsHtml(profile);
 assert.equal((html.match(/data-weapon-action=/g)||[]).length,10);
 assert.match(html,/data-weapon-action="primary:1"/);assert.match(html,/data-weapon-action="secondary:5"/);
 assert.match(html,/data-family="mining"/);assert.match(html,/data-family="cannon"/);assert.match(html,/data-family="missile"/);
 assert.match(html,/weapon-ammo"> · 8 missiles/);
 assert.equal(weaponFamily({...MODULES.cannon_basic,n:'Future cannon'}),'cannon');
 assert.equal(weaponFamily({...MODULES.beam_basic,n:'Future beam'}),'mining');
 assert.equal(weaponFamily({...MODULES.missile_basic,n:'Future missile'}),'missile');
 assert.equal((html.match(/aria-pressed="true"/g)||[]).length,2);
 const hud=readFileSync('src/ui/hud.js','utf8');assert.doesNotMatch(hud,/\$\{primary\}/);
 assert.match(hud,/weaponSlots\?\.addEventListener\("mousedown", e => e.stopPropagation\(\)\)/);
});

test('Compact strip fits between unchanged meter pairs at desktop and narrower widths',()=>{
 const css=readFileSync('src/styles.css','utf8');
 assert.match(css,/#hud > #weapon-slots \{ left: calc\(50% \+ 28px\); bottom: var\(--weapon-bottom\)/);
 assert.match(css,/width: min\(480px, calc\(100vw - 220px\)\)/);
 assert.match(css,/width: min\(540px, calc\(100vw - 160px\)\)/);
 assert.match(css,/\.weapon-slot \{[^}]*height: var\(--weapon-size\); width: 100%/);
 assert.match(css,/#weapon-slots::after \{[^}]*bottom: 0; height: var\(--weapon-size\)/);
 assert.match(css,/\.weapon-bank-label \{ color: #fff/);
 assert.match(css,/\.vital-track \{[^}]*height: 44px; width: 100%/);
 assert.match(css,/right: calc\(100% \+ 8px\)/);
 for(const viewport of [480,640,900,1280,1920]) {
  const centres=Math.min(540,viewport-160), strip=Math.min(480,viewport-220);
  assert.equal(centres-strip,60,'strip leaves 30px each side before inner track centres');
  const width=(strip-16-8*3)/10, height=Math.min(44,(viewport-260)/10);
  assert.ok(Math.abs(width-height)<1e-9,'each box and its divider share the square height');
 }
});

test('Monochrome square slots show selected names and ammo only for ammo weapons',()=>{
 const p=newProfile();p.loadout.wasp.primary=['beam_basic','cannon_basic'];p.loadout.wasp.secondary=['missile_basic'];p.msl=8;
 const html=weaponSlotsHtml(p);
 assert.match(html,/weapon-bank-name[^>]*>Basic mining beam/);
 assert.match(html,/weapon-bank-name[^>]*>Basic missiles/);
 assert.equal((html.match(/class="weapon-ammo"/g)||[]).length,1);
 p.sw='2';assert.doesNotMatch(weaponSlotsHtml(p),/class="weapon-ammo"/);
 const css=readFileSync('src/styles.css','utf8');
 assert.match(css,/\.weapon-slot \{[^}]*border-radius: 0/);
 assert.match(css,/\.weapon-slot.selected \{ border-color: #fff/);
 const index=readFileSync('src/index.html','utf8');
 assert.doesNotMatch(index,/id="hint"|id="warp-hint"/);
 assert.match(index,/<strong id="system-name"><\/strong><span id="pocket-name">/);
 const hud=readFileSync('src/ui/hud.js','utf8');assert.doesNotMatch(hud,/pocketMarkerMarkup/);
});

test('Selection uses the slot HUD without redundant centre messages; bank headings align with names',()=>{
 const source=readFileSync('src/sim/weapons.js','utf8');
 assert.doesNotMatch(source.slice(source.indexOf('export function setWeapon'),source.indexOf('/** Primary fire:')),/\bmsg\(/);
 const css=readFileSync('src/styles.css','utf8');
 assert.match(css,/\.weapon-bank-label \{[^}]*letter-spacing: 0; padding: 0/);
 assert.match(css,/\.weapon-bank.secondary \.weapon-bank-label \{ text-align: right; \}/);
});

test('Interaction prompts sit above weapon slots in white, with mining progress below them',()=>{
 const css=readFileSync('src/styles.css','utf8');
 assert.match(css,/#pr \{[^}]*bottom: calc\(184px - 18px\);[^}]*color: #fff/);
 assert.match(css,/#bm \{[^}]*bottom: calc\(158px - 18px\)/);
 const profile=newProfile(); profile.loadout.wasp.secondary=['missile_basic'];
 const html=weaponSlotsHtml(profile);
 assert.doesNotMatch(html,/rotate\(45 12 12\)/);
 assert.match(html,/M9 9Q9 4 12 2/);
 assert.doesNotMatch(html,/<circle cx="16" cy="8"/);
});
