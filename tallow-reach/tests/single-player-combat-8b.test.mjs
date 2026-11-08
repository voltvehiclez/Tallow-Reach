// Recorded from 8b commit 6496516f: mining, combat, missile, dock and death.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { state } from '../src/state/state.js';
import { createPlayer, setShip, hurt } from '../src/sim/player.js';
import { newProfile } from '../src/state/profile.js';
import { refillPower } from '../src/sim/power.js';
import { refreshDrive } from '../src/sim/drive.js';
import { refreshShield } from '../src/sim/shield.js';
import { refreshHull } from '../src/sim/hull.js';
import { refreshGuns } from '../src/sim/guns.js';
import { spawnEnemy } from '../src/sim/ai.js';
import { dock, launch } from '../src/sim/session.js';
import { stepSim } from '../src/sim/step.js';
import { setSeed } from '../src/util/rng.js';
import { V, Q } from '../src/util/math.js';
test("8b mining, combat, missiles, docking and recovery match", () => {
const oldRandom = Math.random;
try {
Math.random=()=>0.5; setSeed(728);
state.profile=newProfile(); state.profile.msl=8; state.profile.loadout.wasp.primary=['cannon_basic','beam_basic']; state.profile.loadout.wasp.secondary=['missile_basic',null];
createPlayer();setShip('wasp');refillPower();refreshDrive();refreshShield();refreshHull();refreshGuns();state.player.docked=false;state.player.pos.set(0,0,0);state.sector='hollow';state.flight.spawnT=1e9;state.aimDirection={x:0,y:0,z:-1};
state.world.asteroids.push({kind:'rock',pos:V(0,0,-200),quat:Q(),r:20,scale:V(20,20,20),s0:V(20,20,20),ore:500,max:500,type:'ferrite'});
spawnEnemy('raider', V(80,0,-550));
const snapshots=[];
for(let i=0;i<900;i++){
 state.profile.pw=i<300?'beam':'cannon'; state.controls.fire=i<500; state.controls.sec=i===320; state.controls.thrust=i>=400&&i<450?1:0;
 if(i===520)hurt(4); if(i===600){dock();launch();state.flight.spawnT=1e9;} if(i===750)hurt(100);
 stepSim(1/60);
 if(i%30===0||i===899){const p=state.player;const w=state.world;snapshots.push({i,p:p.pos.toArray(),q:p.quat.toArray(),v:p.v.toArray(),thr:p.thr,en:p.en,sh:p.sh,hull:p.hull,docked:p.docked,power:structuredClone(state.power),cd:[...state.flight.gunCd],beam:state.flight.beamOn,beamT:state.flight.beamT,ml:state.flight.missileLock.t,shots:w.bullets.map(x=>x.pos.toArray()),missiles:w.missiles.map(x=>x.pos.toArray()),enemies:w.enemies.map(x=>({p:x.pos.toArray(),hp:x.hp})),rocks:w.asteroids.map(x=>x.ore),profile:{kills:state.profile.kills,msl:state.profile.msl,holds:structuredClone(state.profile.holds),hp:structuredClone(state.profile.hp),cr:state.profile.cr,ships:[...state.profile.ships]}});}
}
const expected = JSON.parse(readFileSync(new URL("./fixtures/step8b-combat-lifecycle.json", import.meta.url), "utf8"));
assert.deepEqual(snapshots, expected);
assert.equal(snapshots.find(x => x.i === 270).profile.holds.wasp.ferrite, 1, "actually mined ore");
assert.equal(snapshots.find(x => x.i === 330).profile.msl, 7, "actually launched a missile");
assert.equal(snapshots.find(x => x.i === 750).docked, true, "actually died and docked");
} finally { Math.random = oldRandom; }
});
