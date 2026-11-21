// Recorded from 8b commit 6496516f: mining, combat, missile, dock and death.
// Re-recorded once, when death recovery started handing out a COMPLETE spare Wasp: every
// snapshot before the death at i=750 is byte-identical, and from i=750 on the runtime ship
// has the power, shields, hull, gun and empty hold that a real hull has (it used to come back
// as a bare id with no fit, which is why nothing could be equipped afterwards).
//
// Re-recorded 2026-11-15, when projectiles started stopping on colliders (owner: shots went
// through Meridian Station). The scenario fires at a raider past a rock at z=-200, so the
// difference is the whole point and it is worth reading before "fixing" it:
//   * shots die at the rock instead of flying on through it (shots are shorter-lived, and the
//     i=240 snapshot's shot is a different one entirely)
//   * the player keeps the shield it used to lose — the raider's fire at the player was passing
//     through that same rock, and now the rock stops it (10 instead of 9, 8, 7, 6, 4, 3, 2, 1, 0)
//   * with the shields intact the ship survives, so hull stays 10 rather than 6, and the
//     saved profile hp is 1 rather than 0.6
// Re-recorded 2026-11-16 when the home field moved out to [9000, 1400, -13000] (the
// universe-generation rework): the launch heading now points at the field's new place, so
// every snapshot from i=600 on carries a different quaternion. Nothing else moved:
// every player position, velocity, power reading, gun cooldown, missile, ore count,
// credit and docked flag in the run is byte-identical.
// Density follow-up: restored the original home-field position and launch quaternions.
// Re-recorded for individual fighter AI: enemy paths, projectile timing, missile locks
// and damage taken change. Mining, missile launch, recovery and final profile remain checked.
// Re-recorded for the shared flight model (every ship flies the player's maths;
// NPCs get Wasp stats) plus the owner's "turning takes a third longer". Diffed
// against the previous recording per LESSONS L17: the player's own pos/quat/v
// are identical in all 31 snapshots; only enemies, their shots, and the shield,
// hull, missile-lock and profile state downstream of enemy flight differ —
// exactly the behaviour that was meant to change, nothing else.
// Re-recorded again 2026-11-21 for the axis rates (yaw 40%, roll 250%): only
// enemies, their shots, missiles and shield state differ — the player's own
// pose is unchanged, as that scenario barely steers.
// Re-recorded a third time the same day for bank-to-turn NPC steering: again
// only enemies, shots, missile lock and shields differ; player pose unchanged.
// Re-recorded a fourth time for the 25% global roll cut: same envelope again.
// Re-recorded a fifth time for roll ease-in/out (the ramp reaches into NPC
// banking too): same envelope again.
// The checks at the bottom of this test (mined ore, a missile launched, died and docked) all
// still hold, which is what says the scenario is still doing what it was written to do.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { state, resetPlaces, placeWorld } from '../src/state/state.js';
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
resetPlaces();placeWorld('reach');state.places.get('reach').loaded=true;state.profile=newProfile(); state.profile.msl=8; state.profile.loadout.wasp.primary=['cannon_basic','beam_basic']; state.profile.loadout.wasp.secondary=['missile_basic',null];
createPlayer();setShip('wasp');refillPower();refreshDrive();refreshShield();refreshHull();refreshGuns();state.place='hollow';state.player.place='hollow';state.player.docked=false;state.player.pos.set(0,0,0);state.flight.spawnT=1e9;state.aimDirection={x:0,y:0,z:-1};
state.world.asteroids.push({kind:'rock',pos:V(0,0,-200),quat:Q(),r:20,scale:V(20,20,20),s0:V(20,20,20),ore:500,max:500,type:'ferrite'});
spawnEnemy('raider', V(80,0,-550));
const snapshots=[];
for(let i=0;i<900;i++){
 state.profile.pw=i<300?'2':'1'; state.controls.fire=i<500; state.controls.sec=i===320; state.controls.thrust=i>=400&&i<450?1:0;
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
