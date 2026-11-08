// Unique ids for world entities.
//
// Every entity in `state.world` carries an `id` (`sim/enemy.js` has its own
// counter; this one is for the other kinds: bullets, missiles, crates and the
// particles of an explosion). An id is what `render/views.js` keys a mesh on, so
// one entity is always drawn by exactly one mesh — and an id is also what a host
// would put in a snapshot for a guest (refactor step 16), so it must be a plain
// number.
//
// A counter, not a random value: it never touches `util/rng.js`, so adding an
// entity can never change a seeded run's rolls.

let n = 0;

/** The next id, 1, 2, 3, ... Never reused within one session. */
export const nextId = () => ++n;

/** How many ids have been handed out (the tests use it). */
export const idsIssued = () => n;
