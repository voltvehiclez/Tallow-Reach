import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { meterHeight } from '../src/ui/vitals.js';
import { state } from '../src/state/state.js';
import { on } from '../src/util/events.js';
import { installInput, clearControls } from '../src/core/input.js';

test('Vertical meters safely represent empty, full, absent and out-of-range pools',()=>{
 for(const [v,m,want] of [[25,100,'25%'],[100,100,'100%'],[0,100,'0%'],[-2,100,'0%'],[200,100,'100%'],[5,0,'0%'],[NaN,5,'0%']]) assert.equal(meterHeight(v,m),want);
 const html=readFileSync('src/index.html','utf8');
 assert.ok(html.indexOf('id="b2"')<html.indexOf('id="pw"'));
 assert.ok(html.indexOf('id="b1"')<html.indexOf('id="pw"'));
 assert.ok(html.indexOf('id="b3"')>html.indexOf('id="pw"'));
 for(const id of ['b1','b2','b3','hull-val','sh-val','boost-val','pwbar','hud-route']) assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1);
 const hud=readFileSync('src/ui/hud.js','utf8');
 for(const meter of ['shield','hull','boost']) assert.match(hud,new RegExp(`el.${meter}.style.height = meterHeight`));
 assert.match(hud,/el.powerBar.style.height = meterHeight/);
 assert.ok(html.indexOf('id="b1"')<html.indexOf('id="b2"'));
 assert.match(html,/<span>Power<\/span><div class="vital-track"><i id="pwbar"/);
 assert.doesNotMatch(html,/Hull HP|Shield HP|pw-line/);
 const css=readFileSync('src/styles.css','utf8');
 assert.match(css,/left: calc\(50% \+ 28px\)/);
 assert.match(css,/width: min\(540px, calc\(100vw - 160px\)\)/);
 assert.match(css,/\.vital-pair \{[^}]*gap: 8px/);
 assert.match(css,/\.vital-left \{ right: calc\(100% - 7px\)/);
 assert.match(css,/\.vital-right \{ left: calc\(100% - 7px\)/);
});
test('Left Alt toggles once per press, not on release/repeat; modal and blur are safe',()=>{
 const handlers={}, previous=globalThis.addEventListener;
 globalThis.addEventListener=(name,fn)=>{handlers[name]=fn;};
 const off=on('freecam',enabled=>{state.freeCam.on=enabled;});
 try {
  state.ui.starmap=state.ui.cargo=state.ui.cache=null;state.freeCam.on=false;
  installInput();
  const key=(type,code='AltLeft',repeat=false,tagName='BODY')=>handlers[type]({code,repeat,target:{tagName},preventDefault(){}});
  key('keydown');assert.equal(state.freeCam.on,true);
  key('keyup');assert.equal(state.freeCam.on,true);
  key('keydown','AltLeft',true);assert.equal(state.freeCam.on,true);
  key('keydown');assert.equal(state.freeCam.on,false);
  key('keydown','AltRight');assert.equal(state.freeCam.on,false);
  key('keydown','AltLeft',false,'INPUT');assert.equal(state.freeCam.on,false);
  state.ui.cargo={};key('keydown');assert.equal(state.freeCam.on,false);state.ui.cargo=null;
  key('keydown');handlers.blur();assert.equal(state.freeCam.on,false);
  key('keydown');clearControls();assert.equal(state.freeCam.on,false);
 } finally {if(typeof off==='function')off();globalThis.addEventListener=previous;state.ui.cargo=null;state.freeCam.on=false;}
});

test('Current-only values, percentages and throttle fill retain safe boundary behaviour', async()=>{
 const {meterValue,meterPercent}=await import('../src/ui/vitals.js');
 assert.equal(meterValue(10,10,' HP'),'10 HP');
 assert.equal(meterValue(10,10,' U'),'10 U');
 const source=readFileSync('src/ui/hud.js','utf8');
 assert.ok(source.includes('meterValue(P.sh, P.shMax, " HP")'));
 assert.ok(source.includes('meterValue(P.hull, P.hullMax, " HP")'));
 assert.ok(source.includes('meterValue(P.en, P.enMax, " U")'));assert.equal(meterPercent(10,10),'100%');
 assert.equal(meterValue(100,200,' MJ'),'100 MJ');assert.equal(meterPercent(100,200),'50%');
 assert.equal(meterValue(4,0),'0');assert.equal(meterPercent(4,0),'0%');
 for(const [v,expected] of [[0,'0%'],[0.5,'50%'],[1,'100%'],[-1,'0%'],[2,'100%']]) assert.equal(meterHeight(v,1),expected);
 const html=readFileSync('src/index.html','utf8');
 for(const id of ['sh-pct','hull-pct','pw-pct','boost-pct','throttle-track','throttle-label','throttle-fill','speed']) assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1);
 assert.ok(html.indexOf('id="pw-flow"')<html.indexOf('vital-boost'));
 const css=readFileSync('src/styles.css','utf8');
 assert.match(css,/first-child > span \{ right: 0;/);assert.match(css,/last-child > span \{ left: 0;/);
 assert.match(css,/#pw-flow \{[^}]*right: 0/);
 const hud=readFileSync('src/ui/hud.js','utf8');assert.match(hud,/el.throttleFill.style.width = meterHeight\(P.thr, 1\)/);
 assert.doesNotMatch(hud,/el.bottomCenter.textContent/);
});
