import { sanitizeSave, newCampaignSave, SAVE_VERSION } from "./profile.js";
import { KEY } from "../data/multiplayer.js";

const AUTOSAVE_KEY = "tr1";

const isRootSave = save => !!(save && typeof save === "object" && save.open && save.campaign);
/** Shallow but strict check for a dual-mode envelope. Full generated-geography
 * validation belongs to `prepareGalaxySave`, which can install each half's catalog. */
function cleanRootSave(raw) {
  if (!isRootSave(raw)) throw new Error("not a dual-mode Tallow Reach save");
  const clone = mode => JSON.parse(JSON.stringify(raw[mode]));
  return { v: SAVE_VERSION, mode: raw.mode === "campaign" ? "campaign" : "open", open: clone("open"), campaign: clone("campaign") };
}

/**
 * Both modes' halves as the envelope carries them. `away` (v29) belongs to a half,
 * not to the envelope, so it is copied with the half it describes. Writing through
 * this is what keeps a pilot's marker from being dropped by a save made in the other
 * mode — the frozen pilot must still say it is away after any autosave at all.
 */
function rootSaveForDisk(raw) {
  if (!isRootSave(raw)) return rootFromNestedSave(raw);
  const clean = cleanRootSave(raw);
  for (const mode of ["open", "campaign"]) {
    const marker = raw[mode]?.away ?? raw.away;
    clean[mode] = { ...clean[mode], away: marker ? JSON.parse(JSON.stringify(marker)) : null };
  }
  return clean;
}
/** A legacy nested save is the open-world half. Wrapping it here keeps every
 * browser slot and export code dual-mode even when a test or tool calls the
 * storage layer with a pre-v26 record. */
function rootFromNestedSave(save) {
  const open = sanitizeSave(save);
  // The campaign is its own pilot and world; wrapping an open-world save must
  // never copy that pilot into it.
  const campaign = newCampaignSave();
  return { v: SAVE_VERSION, mode: "open", open, campaign };
}
const saveForDisk = save => rootSaveForDisk(save);
const SLOT_PREFIX = "tr_s";
const CODE_PREFIX = "TR1:";
export const SLOT_COUNT = 3;

// localStorage throws in some locked-down browser modes (private windows,
// sandboxed iframes, file:// with strict settings). Fail quietly so the game
// still runs, just without persistence.
function getItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function setItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

function removeItem(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    /* ignore */
  }
}

/**
 * Write `value` to `key` through a scratch key, keeping the version that was there.
 *
 * The order is what makes a crash safe: the new text goes to `key:tmp` first, then
 * it is swapped in, then whatever `key` held before is copied to `key:prev`. A
 * browser stopped at any point leaves one of three readable states — the old save,
 * the new save, or a new save with the old one still beside it — and never a
 * half-written one. `keepPrevious: 0` turns the copy off (and drops the old copy),
 * which is what the scratch and per-world keys use: nothing reads their history.
 */
function writeThrough(key, value, { keepPrevious = 1 } = {}) {
  const previous = key + KEY.PREVIOUS_SUFFIX;
  const scratch = key + KEY.TEMP_SUFFIX;
  if (!setItem(scratch, value)) return false;
  const had = getItem(key);
  if (!setItem(key, value)) {
    removeItem(scratch);
    return false;
  }
  if (keepPrevious > 0 && had != null) setItem(previous, had);
  else if (keepPrevious <= 0) removeItem(previous);
  removeItem(scratch);
  return true;
}

/** The version a key held before the last write, or null. Used to recover an
 * interrupted write and to let a player go back one step. */
export function readPrevious(key) {
  try {
    const raw = getItem(key + KEY.PREVIOUS_SUFFIX);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function loadAutosave(prepare = sanitizeSave) {
  try {
    const raw = getItem(AUTOSAVE_KEY);
    return raw ? prepare(JSON.parse(raw)) : null;
  } catch (e) {
    // A save that will not read is exactly the accident the previous version is
    // kept for. Try it before giving up, so one bad write cannot cost a pilot.
    try {
      const previous = getItem(AUTOSAVE_KEY + KEY.PREVIOUS_SUFFIX);
      return previous ? prepare(JSON.parse(previous)) : null;
    } catch (ignored) {
      return null;
    }
  }
}

export function saveAutosave(save) {
  return writeThrough(AUTOSAVE_KEY, JSON.stringify(saveForDisk(save)), { keepPrevious: 1 });
}

export function readSlot(i) {
  try {
    const raw = getItem(SLOT_PREFIX + i);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function writeSlot(i, save) {
  // A slot has no history to keep (the player asked for this save); it is still
  // swapped in through the scratch key, so an interrupted write cannot eat the
  // slot that was there.
  return writeThrough(SLOT_PREFIX + i, JSON.stringify(saveForDisk(save)), { keepPrevious: 0 });
}

export function deleteSlot(i) {
  removeItem(SLOT_PREFIX + i);
}

/** Portable text save code (safe for non-ASCII characters). The code carries the
 * record it is given: the game exports the dual-mode root, older tools and tests may
 * still encode a plain pre-v26 save, and both decode back to the same shape. The
 * browser autosave/slots are normalised to the dual-mode root by the write functions. */
export function encodeSave(save) {
  const bytes = new TextEncoder().encode(JSON.stringify(save));
  let bin = "";
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return CODE_PREFIX + btoa(bin);
}

export function decodeSave(text, prepare = sanitizeSave) {
  const s = (text || "").trim();
  if (!s.startsWith(CODE_PREFIX)) throw new Error("missing prefix");
  const bin = atob(s.slice(CODE_PREFIX.length));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return prepare(JSON.parse(new TextDecoder().decode(bytes)));
}

/* ------------------------------------------------------------------------- */
/* The suitcase, under its own key (step 16, slice 2)                        */
/* ------------------------------------------------------------------------- */

/**
 * The suitcase on its own, under `away:<worldId>` (`data/multiplayer.js` KEY).
 *
 * A pilot's home save carries its own copy of the suitcase inside `away`, and this
 * is the second copy beside it. They are written separately on purpose: two browser
 * tabs — one at home, one visiting — cannot overwrite each other's copy of the same
 * pilot, and a damaged home save still leaves the pilot's last snapshot readable.
 *
 * The key is per world, so visiting somebody new never overwrites the copy of a
 * visit that is still going on. `writeAway` also removes the copy for a world the
 * pilot has finished with (`clearAway`).
 */
export function writeAway(worldId, suitcase) {
  const key = KEY.awayKey(worldId);
  if (!key.slice("away:".length) || !suitcase) return false;
  return writeThrough(key, JSON.stringify(suitcase), { keepPrevious: 0 });
}

export function readAway(worldId, prepare = value => value) {
  const key = KEY.awayKey(worldId);
  if (!key.slice("away:".length)) return null;
  try {
    const raw = getItem(key);
    return raw ? prepare(JSON.parse(raw)) : null;
  } catch (e) {
    return null;
  }
}

export function clearAway(worldId) {
  const key = KEY.awayKey(worldId);
  if (!key.slice("away:".length)) return false;
  removeItem(key);
  removeItem(key + KEY.TEMP_SUFFIX);
  removeItem(key + KEY.PREVIOUS_SUFFIX);
  return true;
}

/**
 * Which worlds have a suitcase on this device. Used by the pause screen and by the
 * recovery path, so a pilot is never stranded on a key nobody looks for.
 */
export function awayWorlds() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (typeof key === "string" && key.startsWith("away:") && !key.endsWith(KEY.TEMP_SUFFIX) && !key.endsWith(KEY.PREVIOUS_SUFFIX)) {
        out.push(key.slice("away:".length));
      }
    }
  } catch (e) {
    /* no storage: no suitcase, and no way to have one */
  }
  return out;
}
