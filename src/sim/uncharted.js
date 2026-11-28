// Off-chart systems have permanent seeded geography. Each generation of a connection
// identifies BOTH endpoints, so a stale door can never take a pilot to a new partner.
import { WORMHOLE_SYSTEMS as rules, WORMHOLE_POCKET, WORMHOLE_SPAWN, cleanConnections, unchartedName } from '../data/instances.js';
import { makeRng } from '../util/rng.js';
import { emit, on } from '../util/events.js';
import { V, Q } from '../util/math.js';
import { state, placeWorld } from '../state/state.js';
import { registerWormholePlace, unregisterWormholePlace } from '../data/places.js';
import { environmentalCore } from './galaxy.js';
import { addEntity, dropEntity } from './entity.js';
import { clearWorldObjects } from './world.js';

function pocket(world, parent, id, name, extra) {
  return world.pockets[id] = {id, parent, n:name, kind:'pocket', def:'empty', role:'ordinary', tier:rules.tier,
    ...(parent && world.systemsById[parent]?.uncharted ? {sky:rules.environment.sky} : {}),
    enter:{kind:'warp',pos:[...WORMHOLE_POCKET.enter.pos]}, leave:{kind:'warp'}, ...extra};
}
function pair(world, i, epoch, live, keep = null) {
  const name = unchartedName(i), prefix = `${name}-${epoch}`;
  const rng = makeRng(world.seed ^ Math.imul(i+1, 0x9e3779b1) ^ Math.imul(epoch, 0x85ebca6b));
  const systems = world.systems; // only charted systems are in this list
  const parent = systems[Math.floor(rng()*systems.length)].id;
  const result = [];
  function connect(tag, aParent, bParent, stream) {
    const ends = [`${prefix}${tag}-outside`, `${prefix}${tag}-inside`];
    for (const [k, local] of [aParent,bParent].entries()) {
      const angle = stream()*Math.PI*2, id = ends[k];
      if (keep && !keep.has(id)) continue;
      const target = k ? aParent : bParent;
      const label = world.systemsById[target]?.n || target;
      result.push(pocket(world,local,id,`${live ? '' : 'Collapsed '}${rules.doorName} · ${label}`,{
        connection:true, peer:live ? ends[1-k] : null,
        mapPos:[Math.cos(angle)*rules.mapRadius,Math.sin(angle)*rules.mapRadius], features:WORMHOLE_POCKET.features,
      }));
    }
  }
  // Preserve the original normal-space escape and its exact v25 endpoint ids and positions.
  connect('',parent,name,rng);
  for (const {slot,partner} of world.connectionSlots[i]) {
    const stream = makeRng(world.seed ^ Math.imul(i+1,0x7feb352d) ^ Math.imul(slot,0x846ca68b) ^ Math.imul(epoch,0x85ebca6b));
    const peer = unchartedName(partner);
    // Balance the guaranteed escape with one paired inter-system link. Optional slots
    // then roll 50/50 per occupied inside endpoint, not per undirected edge.
    if (slot > 1 && stream() >= rules.extraSlotChance) continue;
    if (slot === 1 || stream() < rules.otherSystemChance) connect(`-s${slot}`,peer,name,stream);
    else for (const [side, local] of [name,peer].entries()) {
      const normal = systems[Math.floor(stream()*systems.length)].id;
      connect(`-s${slot}-${side}`,normal,local,stream);
    }
  }
  return result;
}

// A seeded round-robin matching reserves both ends before any clocks run. Each layer
// uses at most one slot per system, including inbound links, even during renewal.
function connectionSlots(seed,count) {
  const slots = Array.from({length:count},()=>[]);
  const ring = slots.map((_,i)=>i), rng = makeRng(seed);
  for(let i=count-1;i>0;i--) {
    const j=Math.floor(rng()*(i+1)); [ring[i],ring[j]]=[ring[j],ring[i]];
  }
  if(count%2) ring.push(null);
  for(let slot=1;slot<rules.maxPerSystem;slot++) {
    for(let k=0;k<ring.length/2;k++) {
      const owner=ring[k], partner=ring[ring.length-1-k];
      if(owner!=null && partner!=null) slots[owner].push({slot,partner});
    }
    ring.splice(1,0,ring.pop());
  }
  return slots;
}
// Build before validation so a save even inside a collapsed pocket resolves normally.
export function installUncharted(world, raw) {
  const rows = cleanConnections(raw?.connections);
  world.expiredConnections = new Set();
  world.connectionSlots = connectionSlots(world.seed,rows.length);
  world.liveConnectionEnds = [];
  const keep = new Set([raw?.place, ...(Array.isArray(raw?.instances) ? raw.instances.map(r=>r?.origin) : [])]);
  rows.forEach(({epoch},i) => {
    const n = unchartedName(i);
    const core = environmentalCore(world.seed,n,rules.environment);
    world.systemsById[n] = {id:n,n,kind:'system',uncharted:true,intraSystem:'free',tier:rules.tier,pos:[0,0],core:{...core,n}};
    rules.pockets.forEach(({suffix,template}) => pocket(world,n,`${n}-${suffix}`,`${n} ${suffix}`,{template}));
  });
  rows.forEach(({epoch},i) => {
    const n = unchartedName(i);
    world.liveConnectionEnds[i] = pair(world,i,epoch,true);
    for (const id of keep) {
      if (typeof id !== 'string') continue;
      const [name,generation] = id.split('-');
      const old = Number(generation);
      if(name===n && Number.isSafeInteger(old) && old>=0 && old<epoch)
        for(const p of pair(world,i,old,false,new Set([id]))) world.expiredConnections.add(p.id);
    }
  });
}
export function restoreConnectionDoors(pockets = Object.values(state.galaxy?.pockets || {})) {
  for(const p of pockets) if(p.connection) {
    registerWormholePlace(p);
    if(!p.peer) continue;
    const doors = placeWorld(p.id).rifts;
    if(!doors.some(d=>d.peer===p.peer)) addEntity(doors,{kind:'rift',variant:'simple',place:p.id,peer:p.peer,
      n:p.n,dest:p.n,exit:rules.exit,pos:V(),quat:Q(),spin:rules.spin,r:rules.doorRadius,gone:false});
  }
}
// Ordinary warp clears transient doors on departure; restore the live endpoint on revisit.
on('place-entered', ({id}) => {
  const p = state.galaxy?.pocketsById?.[id];
  if (p?.connection && p.peer) restoreConnectionDoors([p]);
});
export function tickConnections(dt) {
  const world = state.galaxy, rows = state.worldState.connections;
  if(!world?.expiredConnections || !rows || !(dt>0)) return;
  rows.forEach((row,i)=>{
    row.lifetime -= dt;
    if(row.lifetime>0) return;
    for(const p of world.liveConnectionEnds[i]) {
      const id=p.id; p.peer=null; p.n=`Collapsed ${p.n}`;
      for(const d of [...placeWorld(id).rifts]) if(d.peer) {d.gone=true;dropEntity(placeWorld(id).rifts,d);}
      world.expiredConnections.add(id);
    }
    row.epoch++; row.lifetime=WORMHOLE_SPAWN.lifetimeSec;
    world.liveConnectionEnds[i] = pair(world,i,row.epoch,true);
    restoreConnectionDoors(world.liveConnectionEnds[i]);
    emit('wormhole-link-renewed',{system:unchartedName(i)});
  });
  for(const id of world.expiredConnections) {
    if(state.players.some(p=>p.place===id || p.warp?.to===id) || [...state.instances.values()].some(r=>r.origin===id)) continue;
    clearWorldObjects(id); state.places.delete(id); delete world.pockets[id]; if (world.pocketsById) delete world.pocketsById[id]; unregisterWormholePlace(id);
    world.expiredConnections.delete(id); emit('wormhole-gone',{id});
  }
}
