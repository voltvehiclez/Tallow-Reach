import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pocketMarkerMarkup, pocketIconKind, flightRouteRows } from '../src/ui/route-display.js';
import { UNDOCK_SOUND } from '../src/data/audio.js';
import { SHIP_PREVIEW } from '../src/data/camera.js';
import { missionLogHtml } from '../src/ui/missionlog.js';
import { newProfile } from '../src/state/profile.js';
import { missionFromContract } from '../src/data/contracts.js';
test('Approved current ring, orange destination and right-hand pocket shape remain',()=>{
 const station={features:[{kind:'station'}]}; assert.equal(pocketIconKind(station),'station');
 assert.match(pocketMarkerMarkup(station,true),/nav-current-ring/); assert.match(pocketMarkerMarkup(station,true),/<rect/);
 assert.doesNotMatch(pocketMarkerMarkup(station),/nav-current-ring/);
 assert.equal((pocketMarkerMarkup({role:'belt'}).match(/<circle/g)||[]).length,3);
 const rows=flightRouteRows([{system:'Home',pockets:[{current:true}],destination:true,destinationPocket:'Station',destinationKind:'station'}]);
 assert.match(rows,/route-marker-start/); assert.match(rows,/icon-station/); assert.doesNotMatch(rows,/destination-tick/);
 assert.ok(rows.indexOf('Home</')<rows.indexOf('icon-station') || rows.indexOf('Home <small>')<rows.indexOf('icon-station'));
});
test('Preview reset gives a front/top/left isometric view',()=>{
 // Camera transformed into the ship frame: front=-Z, left=-X, up=+Y.
 const horizontal=Math.cos(SHIP_PREVIEW.pitch);
 const direction=[-Math.sin(SHIP_PREVIEW.yaw)*horizontal,Math.sin(SHIP_PREVIEW.pitch),Math.cos(SHIP_PREVIEW.yaw)*horizontal];
 assert.ok(direction[0]<0 && direction[1]>0 && direction[2]<0);
 assert.ok(Math.abs(Math.abs(direction[0])-direction[1])<1e-10);
 assert.ok(Math.abs(Math.abs(direction[2])-direction[1])<1e-10);
 assert.match(readFileSync('src/render/shipviewer.js','utf8'),/pitch = SHIP_PREVIEW.pitch/);
});
test('Mechanical undock keeps low tones and multiple scheduled noise layers',()=>{
 assert.ok(UNDOCK_SOUND.filter(l=>l.noise).length>=3);
 assert.ok(UNDOCK_SOUND.some(l=>l.frequency<=105));
 assert.ok(Math.max(...UNDOCK_SOUND.map(l=>l.delay+l.duration))>=0.8);
});
test('Mission summary has keyboard-accessible native Details and untruncated full guidance',()=>{
 const p=newProfile();
 p.missions=[missionFromContract({type:'hunt',tier:1,n:6,p:3,r:100,e:'raider'})];
 const html=missionLogHtml(p);
 assert.match(html,/<details class="mission-log-details"><summary>Details<\/summary>/);
 assert.match(html,/mission-log-full/); assert.match(html,/data-a="drop"/);
 assert.equal((html.match(/<strong>Next:<\/strong>/g)||[]).length,2);
});
