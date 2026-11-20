import { sanitizeSave, newCampaignSave, SAVE_VERSION } from "./profile.js";

const AUTOSAVE_KEY = "tr1";

const isRootSave = save => !!(save && typeof save === "object" && save.open && save.campaign);
/** Shallow but strict check for a dual-mode envelope. Full generated-geography
 * validation belongs to `prepareGalaxySave`, which can install each half's catalog. */
function cleanRootSave(raw) {
  if (!isRootSave(raw)) throw new Error("not a dual-mode Tallow Reach save");
  const clone = mode => JSON.parse(JSON.stringify(raw[mode]));
  return { v: SAVE_VERSION, mode: raw.mode === "campaign" ? "campaign" : "open", open: clone("open"), campaign: clone("campaign") };
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
const saveForDisk = save => isRootSave(save) ? cleanRootSave(save) : rootFromNestedSave(save);
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

export function loadAutosave(prepare = sanitizeSave) {
  try {
    const raw = getItem(AUTOSAVE_KEY);
    return raw ? prepare(JSON.parse(raw)) : null;
  } catch (e) {
    return null;
  }
}

export function saveAutosave(save) {
  return setItem(AUTOSAVE_KEY, JSON.stringify(saveForDisk(save)));
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
  return setItem(SLOT_PREFIX + i, JSON.stringify(saveForDisk(save)));
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
