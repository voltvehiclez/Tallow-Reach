// Fixed seeded oracle recorded from 8b commit 6496516f; catches single-player regressions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { state } from '../src/state/state.js';
import { neutralControls } from '../src/state/controls.js';
import { createPlayer, setShip } from '../src/sim/player.js';
import { refreshDrive } from '../src/sim/drive.js';
import { refreshShield } from '../src/sim/shield.js';
import { refreshHull } from '../src/sim/hull.js';
import { refreshGuns } from '../src/sim/guns.js';
import { refillPower } from '../src/sim/power.js';
import { stepSim } from '../src/sim/step.js';
import { setSeed } from '../src/util/rng.js';
import { startWarp } from '../src/sim/sectors.js';
test('12-second flight, firing and warp script matches the 8b build exactly', () => {
state.sector='hollow'; state.controls=neutralControls(); createPlayer(); setShip(state.profile.ship); refillPower(); refreshDrive(); refreshShield(); refreshHull(); refreshGuns(); state.player.docked=false; state.player.en=state.drive.bmax; state.player.pos.set(0,0,400); state.flight.spawnT=1e9; setSeed(234);
const results=[];
for(let i=0;i<720;i++) {
 state.controls.thrust=i<240 ? 1 : i<300 ? -1 : 0;
 state.controls.steer.x=i<300 ? 0.4 : -0.2;
 state.controls.steer.y=i<300 ? -0.3 : 0.2;
 state.controls.boost=i>=120 && i<180;
 state.controls.strafe=i>=300 && i<400 ? 1 : 0;
 state.controls.fire=i>=200 && i<500;
 if(i===500) startWarp();
 stepSim(1/60);
 if(i%60===0 || i===719) { const p=state.player; results.push({p:p.pos.toArray(),q:p.quat.toArray(),v:p.v.toArray(),thr:p.thr,en:p.en,boost:p.boost,energy:state.power.stored,sector:state.sector,warp:state.warp?.t ?? null,bullets:state.world.bullets.map(b=>b.pos.toArray())}); }
}
const expected = JSON.parse(readFileSync(new URL("./fixtures/step8b-single-player.json", import.meta.url), "utf8"));
assert.deepEqual(results, expected);
});
