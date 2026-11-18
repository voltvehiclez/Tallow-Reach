import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state, resetPlaces } from '../src/state/state.js';
import { newProfile, newWorld } from '../src/state/profile.js';
import { createPlayer } from '../src/sim/player.js';
import { configurePlayer, die } from '../src/sim/session.js';
import { toggleLock } from '../src/sim/targeting.js';
import { makeSoup } from '../src/sim/colliders.js';
import { V } from '../src/util/math.js';
function setup() {
 resetPlaces(); state.players.length=0; state.localPlayerIndex=0;
 state.profile=newProfile(); state.worldState=newWorld(); state.place='hollow';
 const p=configurePlayer(createPlayer(),state.profile); p.pos.set(0,0,0); p.docked=false;
 state.aimOrigin={x:0,y:3,z:10}; state.aimDirection={x:0,y:0,z:-1}; return p;
}
function rock(z,size,x=0) {
 return {pos:V(x,3,z), r:size*2, scale:V(1,1,1), soup:makeSoup(new Float32Array([-size,-size,0,size,-size,0,0,size,0])), type:'iron', ore:100};
}
test('F selects the first surface under the rendered reticle, not the largest angular rock',()=>{
 const p=setup(), small=rock(-30,5), large=rock(-90,60);
 state.world.asteroids.push(large,small); toggleLock(p);
 assert.equal(p.flight.lock?.o,small); toggleLock(p); assert.equal(p.flight.lock,null);
});
test('A bounding sphere miss on an irregular foreground rock must not hide a real surface hit',()=>{
 const p=setup(), miss=rock(-30,5,8), hit=rock(-90,20);
 state.world.asteroids.push(miss,hit); toggleLock(p); assert.equal(p.flight.lock?.o,hit);
});
test('A pilot with credits but no surviving hull receives a complete loaner',()=>{
 const p=setup(); state.profile.cr=100000; die();
 assert.deepEqual(state.profile.ships,['wasp']); assert.ok(state.profile.loadout.wasp);
 assert.equal(p.docked,true);
});
test('Rendered non-rock reference wins and repeats unlock; stale references cannot acquire',()=>{
 const p=setup(), large=rock(-20,10), crate={pos:V(20,3,-30),id:'crate',kind:'crate'};
 state.world.asteroids.push(large);state.world.crates.push(crate);
 toggleLock(p,{k:'c',o:crate});assert.equal(p.flight.lock.o,crate);
 toggleLock(p,{k:'c',o:crate});assert.equal(p.flight.lock,null);
 state.world.crates.length=0;toggleLock(p,{k:'c',o:crate});assert.notEqual(p.flight.lock?.o,crate);
});
