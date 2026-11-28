// Multiplayer saves (refactor step 16, slice 2): the `away` marker and the host's
// `world.guests`, as plain data, with no networking and no screen.
//
// Slice 1 (`net/custody.js`) is the rules of travel. This file is where those rules
// live in a save: a pilot who is visiting somebody has an `away` marker beside its
// profile, and a host keeps a copy of each visiting pilot in `world.guests`. Both
// are save v29 fields; `state/profile.js` owns their validation, and this file owns
// the few operations that change them, so nothing outside it has to know the shape.
//
//   adoptHostWorld(save, {guestId, ...})  this pilot is visiting; keep its suitcase
//                                        under its own key (`away:<worldId>`) too
//   leaveHostWorld(save)                 the pilot is home: clear the marker, keep the
//                                        suitcase readable and the key cleared
//   syncAway(save, suitcase, {rev})      the host wrote the pilot: store the new copy
//   worldIdFor(save)                     this world's id, minted once and then kept
//   guestOf / putGuest / dropGuest       the host's side of `world.guests`
//   guestList(save)                      every visiting pilot, newest seen first
//
// **The two copies.** A pilot's suitcase exists twice on the guest's own device: inside
// `away.suitcase` in the home save, and under `away:<worldId>` (`data/multiplayer.js`
// KEY). They are written separately so two tabs cannot overwrite each other, and both
// are updated by `syncAway`. The home-save copy is the one that travels; the key copy is
// the one that survives a damaged home save, which is what slice 5's recovery reads.
//
// **Nothing here trusts a token.** A host stores `hashToken(token, guestId)` (slice 1)
// and this file stores the guest's bundle WITHOUT its token, so a host's save never
// becomes a way to take somebody's pilot: `guestRecord` does that stripping.

import { sanitizeSave, cleanAway, SAVE_VERSION } from "../state/profile.js";
import { makeToken, guestRecord } from "./custody.js";
import { NET, KEY } from "../data/multiplayer.js";
import { writeAway, clearAway } from "../state/storage.js";

const clone = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const isPlainObject = value => !!value && typeof value === "object" && !Array.isArray(value);
const whole = value => Math.max(0, Math.floor(Number(value) || 0));
const idText = value => (typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : null);

/** A fresh id for this world, from the same source as a guest's token. */
export const makeWorldId = () => `w-${makeToken(12)}`;

/**
 * This world's own id (save v29, `world.worldId`), minted the first time it is
 * hosted and kept from then on — a join link names a world, and the link must keep
 * working after a reload. Returns a new save; the argument is not mutated.
 */
export function worldIdFor(save) {
  const next = clone(save);
  if (!isPlainObject(next.world)) next.world = {};
  if (typeof next.world.worldId !== "string" || !next.world.worldId.trim()) next.world.worldId = makeWorldId();
  return next;
}

/**
 * Mark this pilot as visiting `away.worldId` (an `away` record already built by
 * `custody.awayRecord`). Returns a new save: the marker is validated by the save's
 * own cleaner, so a half-built record cannot get in. The suitcase is written under
 * its own key at the same time — `writeAway` when storage exists — so the copy the
 * pilot keeps is never only inside the home save.
 */
export function adoptHostWorld(save, away) {
  const next = clone(save);
  const marker = cleanAway(away);
  if (!marker) return next;
  next.away = marker;
  next.v = SAVE_VERSION;
  if (marker.suitcase) writeAway(marker.worldId, marker.suitcase);
  return next;
}

/**
 * The pilot is home: clear the marker and forget the per-world key (the home save
 * is the record now). Returns a new save. The suitcase itself is not lost — the
 * caller has already applied it (`custody.checkIn`) — this only stops the marker
 * from claiming the pilot is somewhere it is not.
 */
export function leaveHostWorld(save) {
  const next = clone(save);
  const worldId = idText(next.away?.worldId);
  next.away = null;
  next.v = SAVE_VERSION;
  if (worldId) clearAway(worldId);
  return next;
}

/**
 * The host wrote the pilot and sent it back: store that copy as the suitcase.
 *
 * `compare` has already decided this snapshot is not older than what is here (slice
 * 5 does that at the edge); this function only records it and raises nothing — the
 * epoch and rev come from the host's copy. Returns a new save.
 */
export function syncAway(save, suitcase, { epoch, rev } = {}) {
  const next = clone(save);
  if (!isPlainObject(next.away)) return next;
  const kept = isPlainObject(suitcase) ? clone(suitcase) : clone(next.away.suitcase);
  next.away = cleanAway({
    ...next.away,
    epoch: epoch ?? kept?.epoch ?? next.away.epoch,
    rev: rev ?? kept?.rev ?? next.away.rev,
    suitcase: kept,
  }) || next.away;
  if (next.away.suitcase) writeAway(next.away.worldId, next.away.suitcase);
  return next;
}

/**
 * Note that somebody was seen. `lastSeen` is a millisecond stamp (from the host's
 * own clock); a visitor unheard for `NET.lastSeenSec` is shown as disconnected by
 * slice 5, which reads this field rather than keeping a timer of its own.
 */
export const seenGuest = (save, guestId, at = Date.now()) => {
  const next = clone(save);
  const id = idText(guestId);
  if (!id || !isPlainObject(next.world?.guests?.[id])) return next;
  next.world.guests[id].lastSeen = whole(at);
  return next;
};

/* ------------------------------------------------------------------------- */
/* The host's side: world.guests                                              */
/* ------------------------------------------------------------------------- */

/** This host's record of one visiting pilot, or null. */
export function guestOf(save, guestId) {
  const id = idText(guestId);
  return id && isPlainObject(save?.world?.guests) && isPlainObject(save.world.guests[id])
    ? save.world.guests[id]
    : null;
}

/**
 * Store (or replace) a host's copy of a visiting pilot. The record is built by
 * `custody.guestRecord`, so the guest's token is stripped and only its hash is kept.
 *
 * Written through a fresh save: `world.guests` is validated like everything else, and
 * an entry that the cleaner would reject is a bug here, not a reason to fail a save.
 * Returns a new save.
 */
export function putGuest(save, guestId, { name, token, epoch, rev, bundle, lastSeen, left, visitState } = {}) {
  const next = clone(save);
  const id = idText(guestId);
  if (!id) return next;
  if (!isPlainObject(next.world)) next.world = {};
  if (!isPlainObject(next.world.guests)) next.world.guests = {};
  const previous = next.world.guests[id];
  const record = guestRecord({
    name: name ?? previous?.name,
    token,
    // An edit that does not carry the secret (a write-back, a `left` mark) keeps the stored hash:
    // re-hashing nothing would lock the pilot out of its own record (playtest 23;
    // `tests/multiplayer-rejoin.test.mjs` is the class, not the case).
    tokenHash: previous?.tokenHash,
    guestId: id,
    epoch: epoch ?? previous?.epoch,
    rev: rev ?? previous?.rev,
    bundle: bundle ?? previous?.bundle,
    lastSeen: lastSeen ?? Date.now(),
    // An explicit `false` must clear the mark, so `left ?? old` would be wrong here.
    left: typeof left === "boolean" ? left : previous?.left === true,
    visitState: visitState !== undefined ? visitState : previous?.visitState ?? null,
  });
  next.world.guests[id] = record;
  // Round-trip through the cleaner so the in-memory record and the saved one are the
  // same object shape (an entry the cleaner drops is dropped here too, not later).
  const clean = sanitizeSave({ v: SAVE_VERSION, profile: next.profile, world: next.world, away: next.away });
  next.world.guests = clean.world.guests;
  return next;
}

/**
 * Delete a host's copy of a pilot. Always safe (the guest's suitcase has the copy);
 * this is what a guest's "Go home" asks the host to do on its next connect, and what
 * a host does when it wants its save back.
 */
export function dropGuest(save, guestId) {
  const next = clone(save);
  const id = idText(guestId);
  if (id && isPlainObject(next.world?.guests)) delete next.world.guests[id];
  return next;
}

/**
 * Every visiting pilot, in the order a screen wants them: the ones seen most
 * recently first, and a pilot never seen (`lastSeen: 0`) last. Each entry is the
 * record plus its id, because the id is the key and a list needs it.
 */
export function guestList(save) {
  const guests = isPlainObject(save?.world?.guests) ? save.world.guests : {};
  return Object.entries(guests)
    .map(([guestId, record]) => ({ guestId, ...record }))
    .sort((a, b) => (whole(b.lastSeen) - whole(a.lastSeen)) || a.guestId.localeCompare(b.guestId));
}

/** Has this host heard from `record` within the window that counts as connected? */
export const guestIsHere = (record, now = Date.now()) =>
  !!record && whole(record.lastSeen) > 0 && now - whole(record.lastSeen) < NET.lastSeenSec * 1000;

/**
 * The number of visiting pilots a host is holding, and whether it may take another.
 * `NET.maxGuests` is a valve, not a rule: a hosted world has no player cap, and the real limit is
 * the host's machine and connection (owner, playtest 22). It is also never a reason to delete a
 * record — a pilot that is not connected still owns its copy, and a host that forgot it would
 * strand somebody. So this only answers; nothing is dropped.
 */
export const guestCount = save => Object.keys(isPlainObject(save?.world?.guests) ? save.world.guests : {}).length;
export const canTakeGuest = save => guestCount(save) < NET.maxGuests || guestCount(save) === 0;

/**
 * Is this pilot at home? The one question a caller should ask, because the answer
 * has to be the same everywhere: `save.away` is `undefined` in every save older than
 * v29 and `null` in every save whose pilot is home.
 */
export const isAway = save => !!cleanAway(save?.away);

/** A one-line description of where a frozen pilot is, for a screen. */
export function awayLine(save) {
  const away = cleanAway(save?.away);
  if (!away) return "";
  const host = away.hostName ? `Your pilot is at ${away.hostName}` : "Your pilot is visiting another world";
  return `${host}.`;
}

/** The storage key a pilot's suitcase lives under, for a screen or a recovery. */
export const suitcaseKey = worldId => KEY.awayKey(worldId);
