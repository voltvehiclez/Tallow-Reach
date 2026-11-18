import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state, resetPlaces } from '../src/state/state.js';
import { newProfile } from '../src/state/profile.js';
import { createPlayer, flight } from '../src/sim/player.js';
import { configurePlayer } from '../src/sim/session.js';
function setup(energy=100) {
 resetPlaces();state.players.length=0;state.localPlayerIndex=0;state.place='hollow';state.profile=newProfile();state.warp=null;state.freeCam.on=false;
 const p=configurePlayer(createPlayer(),state.profile);p.docked=false;p.pos.set(0,0,5000);p.thr=0.2;p.en=p.enMax;p.power.stored=energy;p.controls.boost=true;return p;
}
test('Boost cannot grant full throttle on a tap or before paid ignition',()=>{
 const p=setup(),before=p.power.stored;
 flight(0.1,p);assert.equal(p.thr,0.2);assert.equal(p.power.stored,before);
 p.controls.boost=false;flight(0.2,p);assert.equal(p.thr,0.2);
 p.controls.boost=true;flight(0.39,p);assert.equal(p.thr,0.2);
 flight(0.02,p);assert.equal(p.boost,true);assert.equal(p.thr,1);assert.equal(p.power.stored,before-p.drive.ignite);
 p.controls.thrust=-1;flight(0.02,p);assert.ok(p.thr<1,'held boost does not continuously pin throttle');
});
test('Insufficient ignition MJ or fuel never grants full throttle',()=>{
 for(const mode of ['power','fuel']) {
  const p=setup(mode==='power'?0:100);if(mode==='fuel')p.en=0;
  flight(0.1,p);assert.equal(p.thr,0.2);assert.equal(p.boost,false);
 }
});
