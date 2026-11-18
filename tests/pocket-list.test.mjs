import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { POCKET_FILTERS, pocketType, readPocketFilters, savePocketFilters, sortedPocketRows } from '../src/ui/pocket-list.js';
import { state, resetPlaces, placeWorld } from '../src/state/state.js';
import { createPlayer } from '../src/sim/player.js';
import { newProfile } from '../src/state/profile.js';
import { configurePlayer } from '../src/sim/session.js';
import { selectPocketObject, pruneLock, lockPosition } from '../src/sim/targeting.js';
import { V } from '../src/util/math.js';
import { pocketObjects } from '../src/sim/flight-instruments.js';
import { syncControls, pointer, keys } from '../src/core/input.js';
import { emit } from '../src/util/events.js';
function setup() {
 resetPlaces();state.players.length=0;state.localPlayerIndex=0;state.place='reach';state.profile=newProfile();state.warp=null;
 const p=configurePlayer(createPlayer(),state.profile);p.docked=false;return p;
}
test('Filters persist every tick including all-off and survive denied/corrupt storage',()=>{
 let data=null; const storage={getItem:()=>data,setItem:(key,value)=>data=value};
 let f=readPocketFilters(storage);assert.ok(POCKET_FILTERS.every(k=>f[k]));
 f.Asteroid=false;savePocketFilters(storage,f);assert.equal(readPocketFilters(storage).Asteroid,false);
 f=Object.fromEntries(POCKET_FILTERS.map(k=>[k,false]));savePocketFilters(storage,f);assert.deepEqual(readPocketFilters(storage),f);
 data='broken';assert.equal(readPocketFilters(storage).Ship,true);
 assert.doesNotThrow(()=>savePocketFilters(null,f));assert.equal(readPocketFilters(null).Station,true);
 assert.equal(pocketType('Hostile'),'Ship');assert.equal(pocketType('station'),'Station');assert.equal(pocketType('new-feature'),'Other');
});
test('Sorting by name/type/distance is stable, reversible and independent of source rows',()=>{
 const rows=[{name:'Zinc',kind:'Asteroid',distance:2},{name:'Alpha',kind:'Hostile',distance:3},{name:'Port',kind:'station',distance:1}];
 assert.deepEqual(sortedPocketRows(rows,{},'name').map(r=>r.name),['Alpha','Port','Zinc']);
 assert.deepEqual(sortedPocketRows(rows,{},'distance').map(r=>r.distance),[1,2,3]);
 assert.deepEqual(sortedPocketRows(rows,{},'distance',-1).map(r=>r.distance),[3,2,1]);
 assert.equal(sortedPocketRows(rows,{},'type')[0].kind,'Asteroid');
 assert.equal(sortedPocketRows(rows,{Asteroid:false}).length,2);assert.equal(rows[0].name,'Zinc');
});
test('Click targets use F records, toggle off, reject stale rows and track extra object classes',()=>{
 const p=setup(),w=placeWorld('reach');
 for(const [list,k] of [['enemies','e'],['asteroids','a'],['crates','c'],['rifts','r'],['gates','g'],['caches','k']]) {
  const obj={pos:V(1,2,3),n:list,hp:10};w[list].push(obj);
  assert.equal(selectPocketObject(obj,p),true);assert.equal(p.flight.lock.k,k);assert.equal(p.flight.lock.o,obj);
  selectPocketObject(obj,p);assert.equal(p.flight.lock,null);
  w[list].pop();assert.equal(selectPocketObject(obj,p),false);
 }
 const station=pocketObjects(p).find(r=>r.kind==='station').object;
 selectPocketObject(station,p);assert.equal(p.flight.lock.k,'s');assert.equal(p.flight.lock.o.feature,station.id);
 const bullet={pos:V(5,6,7)};w.bullets.push(bullet);selectPocketObject(bullet,p);assert.equal(p.flight.lock.k,'n');
 bullet.pos.x=10;pruneLock(p);assert.equal(lockPosition(p.flight.lock).x,10);
 w.bullets.pop();pruneLock(p);assert.equal(p.flight.lock,null);
});
test('Browsing zeros mouse steering/fire while preserving keyboard throttle and resets pointer on close',()=>{
 const p=setup();state.ui.navigation=true;pointer.x=1;pointer.y=-1;keys.fire=keys.sec=1;keys.KeyW=1;
 syncControls();assert.equal(p.controls.steer.x,0);assert.equal(p.controls.steer.y,0);assert.equal(p.controls.fire,false);assert.equal(p.controls.thrust,1);
 state.ui.navigation=false;emit('navigation-input');assert.equal(pointer.x,0);assert.equal(p.controls.fire,false);keys.KeyW=0;syncControls();
});
test('Compact rows fit 35 at 720p; overlay and lower HUD geometry have explicit constraints',()=>{
 const css=readFileSync('src/styles.css','utf8');
 assert.match(css,/#pocket-object-rows button \{[^}]*height: 16px/);
 assert.ok(Math.floor((720-20-24-64)/16)>=35);
 assert.match(css,/body.navigation-open #tr \{ visibility: hidden/);
 assert.match(css,/--weapon-bottom: calc\(123.2px - 25px - var\(--weapon-size\)\)/);
 assert.match(css,/#bc \{[^}]*bottom: calc\(var\(--weapon-bottom\) - 6px - 24px\)/);
 const weaponBottom=123.2-25-44,throttleBottom=weaponBottom-6-24;
 assert.equal(Math.round((weaponBottom-(throttleBottom+24))*10)/10,6);
 assert.equal(weaponBottom+25+44,123.2);
});
