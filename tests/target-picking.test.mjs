import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera, Group, Mesh, BoxGeometry, MeshBasicMaterial, TorusGeometry } from 'three';
import { pickLockSurface, tagLockView, LOCK_VIEW_KINDS } from '../src/render/target-picking.js';
import { readFileSync } from 'node:fs';
function setup() { return {scene:new Scene(), camera:new PerspectiveCamera(60,1,0.1,1000)}; }
function target(scene,k,z,size=2) {
 const g=new Group(), ref={k,o:{id:k+z}};
 const mesh=new Mesh(new BoxGeometry(size,size,size),new MeshBasicMaterial());
 g.position.z=z; g.add(mesh); tagLockView(g,ref);scene.add(g);return {g,ref,mesh};
}
for (const k of ['e','a','c','s','r','g','k']) test(`First rendered surface wins for lock kind ${k}`,()=>{
 const {scene,camera}=setup();const back=target(scene,'a',-40,20),front=target(scene,k,-10);
 assert.equal(pickLockSurface(scene,camera),front.ref);
 front.g.position.x=10; assert.equal(pickLockSurface(scene,camera),back.ref);
 front.g.position.x=0; front.g.visible=false; assert.equal(pickLockSurface(scene,camera),back.ref);
});
test('Station holes, live child transforms and invisible effects do not become sphere hits',()=>{
 const {scene,camera}=setup();const back=target(scene,'c',-20);
 const station=new Group(); station.position.z=-10;
 const ring=new Mesh(new TorusGeometry(4,0.5,8,24),new MeshBasicMaterial()); station.add(ring);
 tagLockView(station,{k:'s',o:{place:'reach',feature:'station'}});scene.add(station);
 assert.equal(pickLockSurface(scene,camera),back.ref);
 ring.position.x=4; assert.equal(pickLockSurface(scene,camera).k,'s');
 ring.visible=false;const glow=target(scene,'r',-5);glow.mesh.material.transparent=true;glow.mesh.material.opacity=0.1;
 assert.equal(pickLockSurface(scene,camera),back.ref);
 back.g.visible=false;assert.equal(pickLockSurface(scene,camera),null);
});
test('Registry covers all dynamic lockable kinds; preview only rotates via manual input',()=>{
 assert.deepEqual(Object.values(LOCK_VIEW_KINDS).sort(),['a','c','e','g','k','r']);
 const src=readFileSync('src/render/shipviewer.js','utf8');
 const render=src.slice(src.indexOf('export function renderShip'));
 assert.doesNotMatch(render,/rotation|spin \*|SPIN/);
 assert.match(src,/turntable.rotation.y.*dx/);
 const camera=readFileSync('src/data/camera.js','utf8');
 assert.match(camera,/yaw: Math.PI \* 3 \/ 4, pitch: Math.atan\(1 \/ Math.sqrt\(2\)\)/);
});
