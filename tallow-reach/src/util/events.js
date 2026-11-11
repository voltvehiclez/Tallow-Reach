// A tiny publish/subscribe bus. Systems talk through events instead of
// importing each other, so new features can react to gameplay without
// touching the code that produced the event.
//
// Events in use:
//   action        { name, repeat, key?, to? }
//                                    key/bind pressed (see core/input.js); the
//                                    starmap's travel action carries `to`
//   freecam       boolean            Alt held / released
//   look          { dx, dy }         mouse movement while orbiting
//   wheel         deltaY             mouse wheel
//   hurt          { shielded, player } player took damage
//   player-dead   { player }         hull reached zero (non-local recovery not yet implemented)
//   docked                           player docked at the outpost
//   launched                         player left the outpost
//   died          text               ship destroyed (after docking)
//   mined         { item }           one unit of ore added to the hold
//   pickup        { item, player, place, encounter, encounterType }
//                                    crate picked up; encounter fields are null for ordinary loot
//   encounter-cleared { place, id, encounter }
//                                    final crate/patrol member was cleared and a cooldown began
//   encounter-spawned { place, id, encounter }
//                                    a static encounter rebuilt its crate content
//   place-memory-ready { placeId, kind, id, forced }
//                                    a rock/encounter cooldown expired or was overridden
//   respawn-place  { placeId, kind, id }
//                                    story/event hook to clear one place-memory cooldown
//   sfx           { name, ...rest }  a game sound the sim wants played; `name` is a key of
//                                    SFX in core/audio.js (the sim never calls the speakers
//                                    itself). Extra fields are that sound's arguments, e.g.
//                                    { name: "explosion", count } or { name: "warp-charge", dur }
//   enemy-killed  { def, faction, id, player, place, encounter }
//                                    a hostile was destroyed; encounter is null for ordinary enemies
//   entity-spawned { id, kind }     any other entity entered the world: a bullet, missile,
//                                    crate, particle or rock (render/views.js builds its mesh).
//                                    Hostiles keep `enemy-spawned` below, from step 7a.
//   entity-removed { id, kind }     that entity left the world: it hit, expired, was picked
//                                    up, or the field was cleared (the view deletes its mesh)
//   enemy-spawned { id, def, pos }   a hostile entered the world (render/views.js builds its mesh)
//   enemy-removed { id }             a hostile left the world: killed, out of range, or the field
//                                    was cleared (render/views.js removes its mesh)
//   place-entered { id, player }    scenery should show this pocket (also on docking reset)
//   place-changed { from, to, player }
//                                    the pocket changed, mid-warp (see sim/sectors.js)
//   warp-start    { from, to, player }
//                                    a warp began: ship locked, drive charging
//   warp-end      { from, to, player }
//                                    warp over (arrived, or cancelled by docking)
//   travel-denied { player, from, to, reason }
//                                    sim/sectors.js refused a proposed hop; the
//                                    starmap shows the reason without closing

const handlers = new Map();

export function on(name, fn) {
  if (!handlers.has(name)) handlers.set(name, []);
  handlers.get(name).push(fn);
}

export function emit(name, payload) {
  const list = handlers.get(name);
  if (list) for (const fn of list) fn(payload);
}
