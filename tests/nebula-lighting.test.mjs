import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NEBULA_FILL, nebulaFillFor } from '../src/data/lighting.js';
import { SKYBOXES } from '../src/data/skyboxes.js';
const sky = id => ({kind:'cube',skybox:id});
test('Default fill is faint and automatically follows the installed sky tint',()=>{
 const cyan=nebulaFillFor(sky('normal_space')), grey=nebulaFillFor(sky('wormhole_grey'));
 assert.equal(cyan.intensity,0.1); assert.notEqual(cyan.color,grey.color);
 assert.ok((cyan.color&255)>((cyan.color>>16)&255));
 for(const id of Object.keys(SKYBOXES)) {
  assert.equal(nebulaFillFor(sky(id),{...NEBULA_FILL,tintStrength:1}).color,SKYBOXES[id].tint);
 }
});
test('Custom tint overrides work globally, per sky and per place without editing generated data',()=>{
 const settings={...NEBULA_FILL,tint:0xff0000,tintStrength:1,skies:{normal_space:{tint:0x00ff00}}};
 assert.equal(nebulaFillFor(sky('wormhole_grey'),settings).color,0xff0000);
 assert.equal(nebulaFillFor(sky('normal_space'),settings).color,0x00ff00);
 assert.equal(nebulaFillFor({...sky('normal_space'),ambient:{tint:0x0000ff}},settings).color,0x0000ff);
 assert.equal(nebulaFillFor({...sky('normal_space'),ambient:{tint:null}},settings).color,SKYBOXES.normal_space.tint);
});
test('Disabling, invalid settings and absent sky are safe; no stale colour leaks between places',()=>{
 assert.equal(nebulaFillFor({...sky('normal_space'),ambient:{intensity:0}}).intensity,0);
 for(const value of [null,{},sky('not-installed')]) assert.equal(nebulaFillFor(value).intensity,0);
 const invalid=nebulaFillFor({...sky('normal_space'),ambient:{intensity:NaN,tintStrength:NaN,tint:'invalid'}});
 assert.deepEqual(invalid,nebulaFillFor(sky('normal_space')));
 assert.equal(nebulaFillFor({...sky('normal_space'),ambient:{intensity:-1}}).intensity,0);
 const original=JSON.stringify(SKYBOXES);nebulaFillFor(sky('wormhole_grey'));nebulaFillFor(sky('normal_space'));
 assert.equal(JSON.stringify(SKYBOXES),original);
});
test('Flight scene updates a single ambient light on place switches without changing the key light',()=>{
 const source=readFileSync('src/render/scene.js','utf8');
 assert.equal((source.match(/new THREE.AmbientLight/g)||[]).length,1);
 const show=source.slice(source.indexOf('export function showPlace'),source.indexOf('const _mvPos'));
 assert.match(show,/nebulaFillFor\(skyFor\(skyDef\)\)/);
 assert.match(show,/nebulaFill.color.setHex\(fill.color\)/);
 assert.match(show,/nebulaFill.intensity = fill.intensity/);
 assert.match(show,/sun.intensity = light.intensity/);
});
