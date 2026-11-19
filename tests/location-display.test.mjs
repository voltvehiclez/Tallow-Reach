import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locationText } from '../src/ui/location-display.js';
import { placeAt, registerInstancePlace, unregisterInstancePlace } from '../src/data/places.js';
test('Location lines resolve actual system and pocket names without icons',()=>{
 assert.deepEqual(locationText('reach'),{system:placeAt('meridian').n,pocket:placeAt('reach').n});
 assert.equal(locationText('hollow').system,placeAt('meridian').n);
 assert.equal(locationText('hollow').pocket,placeAt('hollow').n);
});
test('Instances do not falsely display Meridian as their current system',()=>{
 registerInstancePlace({id:'location-test',kind:'instance',n:'Test run',parent:'meridian',features:[]});
 try {assert.deepEqual(locationText('location-test'),{system:'Uncharted Space',pocket:'Test run'});}
 finally {unregisterInstancePlace('location-test');}
});

test('an isolated run lights from its own repeatable core, not the entrance system', async () => {
 const { systemSkyContext, systemLightFor } = await import('../src/render/systemsky.js');
 const seen = new Set();
 for (let i = 0; i < 200; i++) {
   const id = `rift-test-${i}`;
   registerInstancePlace({id, kind:'instance', parent:'meridian', features:[]});
   try {
     const ctx = systemSkyContext(id);
     seen.add(ctx.spatial.starKind);
     const toward = ctx.here.pos.map(x => -x / Math.hypot(...ctx.here.pos));
     const light = systemLightFor(id);
     assert.ok(light.direction.toArray().every((x,i) => Math.abs(x-toward[i]) < 1e-10));
     assert.deepEqual(systemSkyContext(id), ctx);
   } finally { unregisterInstancePlace(id); }
 }
 assert.deepEqual(seen, new Set(['star','blackHole']));
});
