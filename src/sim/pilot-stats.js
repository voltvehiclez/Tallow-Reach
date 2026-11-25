// A pilot's health as fractions (refactor step 16, slice 8a — the targeting fix after playtest 23).
//
// The owner's acceptance criterion for a visiting pilot is that it behaves "like any other ship":
// selectable, named, and with its hull and shield bars. Two places need those numbers and they
// must agree, because a bar that disagrees with the wire is a lie on the screen:
//
//   net/ships.js     what the host TELLS a guest (`SHIP_FIELDS.hull` / `.shield`)
//   render/views.js  what the host DRAWS for a visiting record, with no wire at all
//
// So the arithmetic lives here, once, in `sim/` — which both may import (`render/` and `net/` read
// the simulation, never the other way round). Nothing here mutates a record: two functions in,
// two numbers out.
//
// **A fraction of nothing is not zero.** A record whose maximum has not been fitted yet
// (`hullMax` 0, which a visitor is for its first frame) reads as *whole*, not as wrecked: a hull
// drawn as destroyed because its fit was not applied yet would be a lie in the other direction.
// A shield module that is not fitted at all (`shMax` 0) reads as 0 — there is nothing there to
// show, which is exactly what an unshielded ship's own HUD says.

const fraction = (value, max) => {
  const top = Number(max);
  const held = Number(value);
  if (!Number.isFinite(top) || top <= 0) return null;
  if (!Number.isFinite(held)) return 0;
  return Math.max(0, Math.min(1, held / top));
};

/** Hull HP as 0..1. A record with no hull figure yet is whole (see the note above). */
export function hullFraction(P) {
  const value = fraction(P?.hull, P?.hullMax);
  return value === null ? 1 : value;
}

/** Shield HP as 0..1; 0 when no shield module is fitted (there is no pool to fill). */
export function shieldFraction(P) {
  const value = fraction(P?.sh, P?.shMax);
  return value === null ? 0 : value;
}
