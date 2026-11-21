// Multiplayer settings (step 16, slice 3): the username and the two switches, kept
// in the browser and never in a save.
//
// Why not in the save: a name is how *this browser* presents itself, and a pilot who
// plays on two machines may want two names. More practically, the settings are read
// before a save exists (the title screen's multiplayer panel), and writing them into
// a save would mean a settings change could fail on a full disk and take a game with
// it. `sessionStorage` is not used either: a name that forgets itself every reload is
// not a name.

const KEY = "tr_mp";

/** The longest name the game will take from a player (the host suffixes `*` on top). */
import { NET } from "../data/multiplayer.js";

/**
 * A name is text or nothing. A number in storage is not a name (it came from a bug or a
 * hand-edited value), so it is refused rather than turned into "42" and shown to a friend.
 */
const clean = value =>
  (typeof value === "string" ? value : "").replace(/\s+/g, " ").trim().slice(0, NET.nameMax);

/**
 * What multiplayer remembers between sessions:
 *
 *   name          the display name (blank until the player sets one)
 *   enabled       whether open multiplayer is on at all (the pause card's switch)
 *   autoJoin      whether a `?join=` link in the address bar is taken automatically
 */
export function readSettings() {
  const fallback = { name: "", enabled: false, autoJoin: true };
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    return {
      name: clean(value?.name),
      enabled: value?.enabled === true,
      autoJoin: value?.autoJoin !== false,
    };
  } catch (e) {
    // No storage, or something wrote nonsense there: multiplayer still works for
    // this session, it just does not remember anything.
    return fallback;
  }
}

/** Merge `patch` into the stored settings and return the whole record. */
export function writeSettings(patch = {}) {
  const next = { ...readSettings(), ...patch };
  const record = { name: clean(next.name), enabled: next.enabled === true, autoJoin: next.autoJoin !== false };
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(record));
  } catch (e) {
    /* a browser that cannot store still gets the value for this session */
  }
  return record;
}

/** A name is usable when it is not empty; `uniqueName` in `net/custody.js` suffixes clashes. */
export const nameIsSet = (name = readSettings().name) => clean(name).length > 0;

export const cleanName = clean;
