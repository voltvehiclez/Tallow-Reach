// Ship snapshots (refactor step 16, slice 8a): the picture of every pilot the host sends, built
// from the live player records in `state.players`.
//
// The host's browser is the only writer of the truth (see docs/architecture/multiplayer.md), so
// the guest never simulates a friend's ship: it is *drawn* from these fields and nothing else.
// This file is the one place that turns a player record into wire data, which is what keeps
// `SHIP_FIELDS` (in `data/multiplayer.js`) a fact about the game rather than a comment:
//
//   shipEntry(P, { id, name })   one pilot, as `SHIP_FIELDS` says, or null
//   shipEntries(players, opts)   every pilot in a world, the host's own first
//   hullFraction(P)              Hull HP as 0..1 (1 when a record has no hull figure yet)
//
// The two health fractions are not computed here: `sim/pilot-stats.js` owns them, because the
// host's own screen draws the same numbers for a visiting record with no wire at all
// (`render/views.js`) and the bar a guest sees must not disagree with the bar the host sees.
//
// **No `net/` knowledge and no `sim/` writes.** It reads records (plain data: Vector3s and
// numbers) and returns plain arrays and numbers, so a test can hand it a stub record. Nothing
// here mutates a pilot, and nothing here can be written back into the host's world: the wire is
// one-way in this slice, host → guest.
//
// **The local pilot travels too.** The guest needs the host's own ship to draw it, so the host's
// record is an entry like any other, under `HOST_PILOT_ID` and with the host's own display name
// (which lives in `net/settings.js`, not in the profile — so `main.js` passes it in).

import { HOST_PILOT_ID, SHIP_FIELDS } from "../data/multiplayer.js";
import { shipTypeOf } from "../data/ships.js";
import { hullFraction, shieldFraction } from "../sim/pilot-stats.js";

export { hullFraction, shieldFraction };

/** A wire number: a millimetre is plenty, and three decimals keep the packet small. */
const round = (value, places = 3) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const scale = 10 ** places;
  return Math.round(n * scale) / scale;
};

const vec3 = v => [round(v?.x), round(v?.y), round(v?.z)];

/** A record's rotation as `[x, y, z, w]`, identity when it has none. */
function quatOf(P) {
  const q = P?.quat;
  if (!q) return [0, 0, 0, 1];
  const out = [round(q.x, 4), round(q.y, 4), round(q.z, 4), round(q.w, 4)];
  const len = Math.hypot(out[0], out[1], out[2], out[3]);
  if (!Number.isFinite(len) || len < 1e-6) return [0, 0, 0, 1];
  return out.map(value => round(value / len, 4));
}

/**
 * One pilot as the wire carries it, or null when it has no identity to be keyed on.
 *
 * `id` and `name` are passed in rather than read off the record: a visitor's record carries its
 * `guestId` and name, but the host's own record carries neither (it is the pilot at the
 * controls), and the two must look the same on the wire.
 */
export function shipEntry(P, { id = "", name = "" } = {}) {
  const key = typeof id === "string" ? id.trim() : "";
  if (!P || !key) return null;
  const entry = {
    id: key,
    name: String(name || P.name || "").trim(),
    ship: P.ship || "wasp",
    place: P.place || "",
    pos: vec3(P.pos),
    quat: quatOf(P),
    velocity: vec3(P.v),
    throttle: round(P.thr),
    docked: P.docked === true,
    dead: P.dead === true,
    hull: round(hullFraction(P)),
    shield: round(shieldFraction(P)),
    boost: P.boost === true,
    shake: round(Math.max(0, Math.min(1, Number(P.shake) || 0))),
  };
  // The table in `data/multiplayer.js` is the contract, so an entry is built from it: a field
  // added there and forgotten here would be a silent hole in the picture.
  const out = {};
  for (const field of SHIP_FIELDS) if (field in entry) out[field] = entry[field];
  return out;
}

/**
 * Every pilot in this world, the host's own first, as wire entries.
 *
 * `localIndex` says which record is the pilot at the controls (it travels under
 * `HOST_PILOT_ID`, with `localName` — the host's multiplayer name); every other record is a
 * visitor and travels under its `guestId`. A record with no id at all is skipped: nothing on the
 * far side could key a hull on it.
 */
export function shipEntries(players, { localIndex = 0, localName = "" } = {}) {
  const list = Array.isArray(players) ? players : [];
  const out = [];
  const local = list[localIndex] || null;
  if (local) {
    const entry = shipEntry(local, { id: HOST_PILOT_ID, name: localName });
    if (entry) out.push(entry);
  }
  for (const P of list) {
    if (!P || P === local) continue;
    const id = typeof P.guestId === "string" && P.guestId ? P.guestId : "";
    const entry = shipEntry(P, { id, name: P.name || "" });
    if (entry) out.push(entry);
  }
  return out;
}

/** The hull id an entry asks a screen to draw, falling back the way the renderer does. */
export const hullFor = entry => shipTypeOf(entry?.ship) || shipTypeOf("wasp");
