import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newSave} from '../src/state/profile.js';
import {state,applySave,currentSave,placeWorld,resetPlaces} from '../src/state/state.js';
import {prepareGalaxySave} from '../src/sim/galaxy-session.js';
import {restoreWormholes,updateWormholes} from '../src/sim/wormholes.js';
import {clearWorldObjects} from '../src/sim/world.js';
import {enterPlace} from '../src/sim/places.js';
import {enterRift} from '../src/sim/instances.js';
import {createPlayer} from '../src/sim/player.js';
import {configurePlayer} from '../src/sim/session.js';
import {locationText} from '../src/ui/location-display.js';
import {visibleSystems,pocketConnections} from '../src/ui/starmap.js';
import {chartGalaxy} from '../src/ui/chart-lines.js';
import {systemLightFor} from '../src/render/systemsky.js';
import {isPocket} from '../src/data/places.js';

test('v24 migrates; a two-way connection renews without losing the occupied pocket or system on reload',()=>{
 const old=newSave(); delete old.world.connections; old.v=old.world.v=old.profile.v=24;
 applySave(prepareGalaxySave(old)); restoreWormholes();
 const p=configurePlayer(createPlayer(),state.profile); p.docked=false;
 const here='S0001', outside=`${here}-0-outside`, inside=`${here}-0-inside`;
 const door=id=>placeWorld(id).rifts.find(d=>d.peer);
 enterPlace(outside,p); p.pos.set(0,0,0);
 assert.equal(enterRift(door(outside),p),true); assert.equal(p.place,inside);
 assert.equal(locationText(inside).system,here); assert.ok(systemLightFor(inside));
 const chart=chartGalaxy(state.galaxy);
 assert.ok(!visibleSystems(chart).some(s=>s.id===here)); assert.ok(pocketConnections(chart,here).nodes.length>=3);
 clearWorldObjects(inside); enterPlace(`${here}-Belt`,p); enterPlace(inside,p);
 p.pos.set(0,0,0); assert.equal(enterRift(door(inside),p),true); assert.equal(p.place,outside);
 p.pos.set(0,0,0); enterRift(door(outside),p);
 state.worldState.connections[0].lifetime=0.5; updateWormholes(1);
 assert.equal(p.place,inside); assert.ok(!door(inside)); assert.ok(!isPocket(outside));
 const snap=structuredClone(currentSave()); resetPlaces(); applySave(prepareGalaxySave(snap));restoreWormholes();
 assert.equal(state.place,inside); assert.equal(locationText(inside).system,here);assert.ok(!door(inside));
 assert.equal(state.worldState.connections[0].epoch,1);
 const replacement=`${here}-1-inside`; enterPlace(replacement,p);p.pos.set(0,0,0);
 assert.equal(enterRift(door(replacement),p),true);assert.equal(p.place,`${here}-1-outside`);
 updateWormholes(1);assert.ok(!isPocket(inside));
});

test('five-system v25 saves gain S0006–S0030 without resetting existing links',()=>{
 const save=newSave();
 assert.ok(save.world.connections.length >= 30);
 const original=Array.from({length:5},(_,i)=>({epoch:i+1,lifetime:100+i}));
 save.world.connections=original;
 const restored=prepareGalaxySave(save);
 assert.deepEqual(restored.world.connections.slice(0,5),original);
 for(let i=0;i<30;i++) {
   const id=`S${String(i+1).padStart(4,'0')}`;
   const epoch=original[i]?.epoch ?? 0;
   assert.ok(state.galaxy.systemsById[id]?.uncharted);
   assert.equal(state.galaxy.pockets[`${id}-${epoch}-outside`].peer,`${id}-${epoch}-inside`);
 }
});

test('off-chart endpoints share the grey sky and obey the four-link cap in both directions',async()=>{
 const {placeAt}=await import('../src/data/places.js');
 const {nebulaFillFor}=await import('../src/data/lighting.js');
 applySave(prepareGalaxySave(newSave())); restoreWormholes();
 const world=state.galaxy;
 for(let round=0;round<2;round++) {
   for(const sys of Object.values(world.systemsById).filter(s=>s.uncharted)) {
     const pockets=Object.values(world.pockets).filter(p=>p.parent===sys.id);
     const exits=pockets.filter(p=>p.peer);
     assert.ok(exits.length>=2 && exits.length<=4);
     const peers=exits.map(p=>world.pockets[p.peer]);
     assert.ok(peers.some(p=>world.systemsById[p.parent].uncharted));
     assert.ok(peers.some(p=>!world.systemsById[p.parent].uncharted));
     for(const p of peers) assert.equal(world.pockets[p.peer].parent,sys.id);
     for(const p of pockets) {
       const sky=placeAt(p.id).sky;
       assert.equal(sky.skybox,'wormhole_grey'); const c=nebulaFillFor(sky).color;
       assert.equal(c>>16,(c>>8)&255); assert.equal(c>>16,c&255);
     }
   }
   state.worldState.connections[0].lifetime=0.1; updateWormholes(1);
 }
});

test('named systems use the wormhole black-hole odds and only their black holes scale up',async()=>{
 const {systemSkyContext}=await import('../src/render/systemsky.js');
 const {seededCoreKind}=await import('../src/sim/galaxy.js');
 applySave(prepareGalaxySave(newSave()));
 for(const s of Object.values(state.galaxy.systemsById).filter(s=>s.uncharted)) {
   const {spatial}=systemSkyContext(`${s.id}-Belt`);
   assert.equal(spatial.starKind,seededCoreKind(state.galaxy.seed,s.id,0.8));
   assert.equal(spatial.system.core.radiusScale,spatial.starKind==='blackHole'?2:1);
 }
});

test('simple wormhole sites resolve the shared environment through the actual sky reader', async()=>{
 const {WORMHOLE_SITE_POOL,WORMHOLE_SYSTEMS}=await import('../src/data/instances.js');
 const {createInstance}=await import('../src/sim/instances.js');
 const {systemSkyContext}=await import('../src/render/systemsky.js');
 const {placeAt}=await import('../src/data/places.js');
 const {seededCoreKind}=await import('../src/sim/galaxy.js');
 applySave(prepareGalaxySave(newSave()));
 for(const {id} of WORMHOLE_SITE_POOL){
   for(const seed of [10,20,30]){
     const run=createInstance(id,seed,{origin:'reach'});
     assert.equal(placeAt(run.id).sky,WORMHOLE_SYSTEMS.environment.sky);
     const core=systemSkyContext(run.id).spatial.core;
     assert.equal(core.kind,seededCoreKind(state.galaxy.seed,run.id,0.8));
     assert.equal(core.radiusScale,core.kind==='blackHole'?2:1);
   }
 }
});
