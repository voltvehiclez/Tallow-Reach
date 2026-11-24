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

/** A secret is letters and digits (`custody.makeToken`), or nothing at all. */
const cleanToken = value =>
  String(typeof value === "string" ? value : "").replace(/[^A-Za-z0-9]/g, "").slice(0, 64);

/**
 * The player's own relay server, as far as storage is concerned: three short strings or
 * nothing. It is validated properly in `net/turn.js` (a server needs a login to be usable);
 * this only refuses to *store* nonsense.
 */
function cleanRelay(value) {
  if (!value || typeof value !== "object") return null;
  const urls = String(value.urls || "").trim().slice(0, 300);
  const username = String(value.username || "").trim().slice(0, 120);
  const credential = String(value.credential || "").trim().slice(0, 120);
  if (!urls && !username && !credential) return null;
  return { urls, username, credential };
}

/**
 * What multiplayer remembers between sessions:
 *
 *   name          the display name (blank until the player sets one)
 *   enabled       whether open multiplayer is on at all (the pause card's switch)
 *   autoJoin      whether a `?join=` link in the address bar is taken automatically
 *   relay         the player's own TURN server, or null — `{ urls, username, credential }`.
 *                 The game brings its own (ExpressTURN's free tier, `ICE.turn`); this is the
 *                 player's, tried first, for when the built-in one stops answering or when they
 *                 have a better one (see `net/turn.js`).
 *   pilotToken    **this browser's own identity as a guest** (playtest 22). It used to be the
 *                 secret in the join link, which is one per world — so two friends using the same
 *                 link were the same pilot to the host, and the second arrival kicked the first.
 *                 An invitation is not an identity: this is made once per browser and kept, so a
 *                 rejoin after a lost connection is still the same pilot to the host, and a
 *                 second window of the same browser is still a takeover.
 */
export function readSettings() {
  const fallback = { name: "", enabled: false, autoJoin: true, relay: null, lastJoin: "", pilotToken: "" };
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    return {
      name: clean(value?.name),
      enabled: value?.enabled === true,
      autoJoin: value?.autoJoin !== false,
      relay: cleanRelay(value?.relay),
      lastJoin: typeof value?.lastJoin === "string" ? value.lastJoin : "",
      pilotToken: cleanToken(value?.pilotToken),
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
  const record = {
    name: clean(next.name),
    enabled: next.enabled === true,
    autoJoin: next.autoJoin !== false,
    relay: cleanRelay(next.relay),
    lastJoin: typeof next.lastJoin === "string" ? next.lastJoin : "",
    pilotToken: cleanToken(next.pilotToken),
  };
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
