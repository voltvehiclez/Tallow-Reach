import {test} from 'node:test';
import assert from 'node:assert/strict';
import {beltLabelGroups} from '../src/ui/target-display.js';

test('HUD groups a chain of frontier sections but keeps detached and vertically distant belts separate',()=>{
 const fields=[0,1600,3200,4800,12000,0].map((x,i)=>Object.freeze({id:`f${i}`,n:i?`Outer ${i}`:'Frontier belt',pos:[x,i===5?5000:0,0],coreRadius:900,radius:2250,height:220}));
 const groups=beltLabelGroups(Object.freeze(fields));
 assert.deepEqual(groups.map(g=>g.main),[fields[0],fields[4],fields[5]]);
 assert.deepEqual(groups[0].members,fields.slice(0,4));
});
