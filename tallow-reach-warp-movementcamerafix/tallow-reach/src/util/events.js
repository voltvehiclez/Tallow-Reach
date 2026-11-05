// A tiny publish/subscribe bus. Systems talk through events instead of
// importing each other, so new features can react to gameplay without
// touching the code that produced the event.
//
// Events in use:
//   action        { name, repeat }   key/bind pressed (see core/input.js)
//   freecam       boolean            Alt held / released
//   look          { dx, dy }         mouse movement while orbiting
//   wheel         deltaY             mouse wheel
//   hurt          { shielded }       player took damage
//   player-dead                      hull reached zero
//   docked                           player docked at the outpost
//   launched                         player left the outpost
//   died          text               ship destroyed (after docking)
//   mined         { item }           one unit of ore added to the hold
//   pickup        { item }           crate picked up
//   pirate-killed                    hostile destroyed
//   sector-changed { from, to }      the sector changed, mid-warp (see data/sectors.js)
//   warp-start    { from, to }       a warp began: ship locked, drive charging
//   warp-end      { from, to }       warp over (arrived, or cancelled by docking)

const handlers = new Map();

export function on(name, fn) {
  if (!handlers.has(name)) handlers.set(name, []);
  handlers.get(name).push(fn);
}

export function emit(name, payload) {
  const list = handlers.get(name);
  if (list) for (const fn of list) fn(payload);
}
