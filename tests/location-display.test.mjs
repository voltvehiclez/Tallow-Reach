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
 registerInstancePlace({id:'location-test',kind:'instance',n:'Test run',parent:null,features:[]});
 try {assert.deepEqual(locationText('location-test'),{system:'Outside known systems',pocket:'Test run'});}
 finally {unregisterInstancePlace('location-test');}
});
