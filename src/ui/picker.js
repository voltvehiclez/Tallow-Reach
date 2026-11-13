// Which Outfitting picker is open. The rule is one at a time: clicking a bay
// opens its picker and closes any other, clicking the open one closes it.
//
// These are pure functions so the rule can be tested without a browser; the
// panel calls them from ui/menu.js and reads the result in ui/screens.js.
//
// The open picker is either:
//   { kind: "module", g, i }   a module bay: group id and bay index
//   { kind: "paint", k }       a paint bay: APPEARANCE_SLOTS id
//   null                       nothing open

/** Click module bay `i` of `group`; returns the picker that should be open. */
export function toggleModulePicker(open, group, i) {
  const same = !!open && open.kind === "module" && open.g === group && open.i === i;
  return same ? null : { kind: "module", g: group, i };
}

/** Click paint bay `k`; returns the picker that should be open. */
export function togglePaintPicker(open, k) {
  const same = !!open && open.kind === "paint" && open.k === k;
  return same ? null : { kind: "paint", k };
}
