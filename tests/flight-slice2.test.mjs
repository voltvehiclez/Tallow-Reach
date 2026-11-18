import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { V } from '../src/util/math.js';
import { state, resetPlaces, placeWorld } from '../src/state/state.js';
import { newProfile } from '../src/state/profile.js';
import { createPlayer, flight } from '../src/sim/player.js';
import { configurePlayer } from '../src/sim/session.js';
import { pocketObjects, interceptPoint, flightSpeed } from '../src/sim/flight-instruments.js';
import { registerPlaceCollider, clearPlaceColliders } from '../src/sim/colliders.js';
import { colliderFromObject } from '../src/render/collideModel.js';
import { BINDINGS } from '../src/core/input.js';
function setup(place='hollow') {
 resetPlaces(); state.players.length=0; state.localPlayerIndex=0; state.place=place;
 state.profile=newProfile(); state.warp=null; state.freeCam.on=false;
 const p=configurePlayer(createPlayer(),state.profile); p.docked=false; p.pos.set(0,0,0); return p;
}
test('N inventory includes distant objects of every runtime class and spatial landmarks; sensor policy is optional',()=>{
 const p=setup('reach'), w=placeWorld('reach');
 for(const key of ['enemies','asteroids','crates','rifts','gates','caches','bullets','missiles']) w[key].push({pos:V(0,0,1e6),n:key});
 const rows=pocketObjects(p);
 for(const key of ['enemies','asteroids','crates','rifts','gates','caches','bullets','missiles']) assert.ok(rows.some(r=>r.name===key));
 assert.ok(rows.some(r=>r.kind==='station')); assert.ok(rows.some(r=>r.kind==='asteroidField'));
 assert.ok(pocketObjects(p,r=>r.distance<100).every(r=>r.distance<100));
 assert.equal(BINDINGS.KeyN,'navigation');
 p.place='hollow';assert.equal(pocketObjects(p).length,0);
});
test('Ballistic interception accounts for transverse motion and inherited shooter velocity',()=>{
 const origin=V(), target=V(0,0,-100), velocity=V(10,0,0);
 const aim=interceptPoint(origin,V(),target,velocity,100);
 assert.ok(aim.x>10);assert.equal(aim.z,-100);
 assert.deepEqual(interceptPoint(origin,velocity,target,velocity,100),target);
 assert.equal(interceptPoint(origin,V(),target,V(0,0,-200),100),null);
 assert.equal(interceptPoint(origin,V(),target,V(),100,0.5),null);
 assert.equal(interceptPoint(origin,V(),target,V(),0),null);
 assert.ok(interceptPoint(origin,V(),target,V(0,0,100),100));
 const hud=readFileSync('src/ui/hud.js','utf8');
 assert.match(hud,/if \(!gun\) return/);assert.match(hud,/lock\?\.k !== 'e'/);
});
test('Displacement speed includes scenery push with zero engine velocity, never teleport distance',()=>{
 const p=setup();
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(10,10,10));mesh.position.set(6,0,0);mesh.updateMatrixWorld(true);
 const collider=colliderFromObject(mesh,{damage:0});registerPlaceCollider('hollow',collider);
 try {
  const start=p.pos.clone();flight(1/60,p);
  assert.ok(p.pos.distanceTo(start)>0);assert.ok(p.measuredSpeed>0);
  assert.ok(Math.abs(p.measuredSpeed-start.distanceTo(p.pos)*60)<1e-6);
 } finally {clearPlaceColliders('hollow');}
 p.pos.set(1e6,0,0);p.v.set(0,0,0);flight(1/60,p);assert.equal(p.measuredSpeed,0);
 assert.equal(flightSpeed(V(),V(100,0,0),0),0);
 assert.equal(flightSpeed(V(),V(100,0,0),1,false),0);
});
test('Lower HUD translates uniformly while missile points straight up',()=>{
 const css=readFileSync('src/styles.css','utf8');
 for(const bottom of [184,158]) assert.ok(css.includes(`bottom: calc(${bottom}px - 18px)`));
 assert.doesNotMatch(readFileSync('src/ui/weapon-slots.js','utf8'),/rotate\(45/);
});

test('Navigation action executes with the event helpers actually imported by main',async()=>{
 const main=readFileSync('src/main.js','utf8');
 const imports=main.match(/import \{([^}]+)\} from "\.\/util\/events.js"/)[1].split(',').map(s=>s.trim());
 const events=await import('../src/util/events.js');
 const action=main.match(/case "navigation":([\s\S]*?)break;/)[1];
 let calls=0;events.on('navigation-toggle',()=>calls++);
 try {
  const run=new Function(...imports,'playing','repeat',action);
  run(...imports.map(key=>events[key]),true,false);assert.equal(calls,1);
  run(...imports.map(key=>events[key]),true,true);assert.equal(calls,1);
  run(...imports.map(key=>events[key]),false,false);assert.equal(calls,1);
 } finally { /* Event listeners are confined to this test process. */ }
});

test('Status frame bottoms align with throttle without changing X positions or track geometry',()=>{
 const css=readFileSync('src/styles.css','utf8');
 assert.match(css,/#ship-vitals \{[^}]*left: calc\(50% \+ 28px\); bottom: calc\(24px \+ 13.2px \+ 64px - 44px\)/);
 const baseline=24+13.2+64-44;
 assert.ok(Math.abs((baseline+44-13.2-64)-24)<1e-9);
 assert.match(css,/\.vital-column \{[^}]*width: 28px; font-size: 11px; line-height: 1.2/);
 assert.match(css,/\.vital-left \{ left: -7px/);assert.match(css,/\.vital-right \{ right: -7px/);
});
test('Lead prediction shares the rendered target and player poses instead of raw tick positions',()=>{
 const hud=readFileSync('src/ui/hud.js','utf8');
 assert.match(hud,/const pose = renderPlayerPose\(P\)/);
 assert.match(hud,/interceptPoint\(origin, pose.v, interpolatedPos\(lock.o\), interpolatedVelocity\(lock.o\)/);
 assert.doesNotMatch(hud,/interceptPoint\(origin, P.v, lock.o.pos/);
});

test('Throttle shares the weapon strip horizontal centre without resizing',()=>{
 const css=readFileSync('src/styles.css','utf8');
 assert.match(css,/#bc \{\s*left: calc\(50% \+ 28px\);/);
 assert.match(css,/#hud > #weapon-slots \{ left: calc\(50% \+ 28px\);/);
 assert.match(css,/#throttle-track \{[^}]*width: 210px; height: 24px;/);
});
