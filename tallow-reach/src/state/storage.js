import { sanitizeSave } from "./profile.js";

const AUTOSAVE_KEY = "tr1";
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
  return setItem(AUTOSAVE_KEY, JSON.stringify(sanitizeSave(save)));
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
  return setItem(SLOT_PREFIX + i, JSON.stringify(sanitizeSave(save)));
}

export function deleteSlot(i) {
  removeItem(SLOT_PREFIX + i);
}

/** Portable text save code (safe for non-ASCII characters). */
export function encodeSave(save) {
  const bytes = new TextEncoder().encode(JSON.stringify(sanitizeSave(save)));
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
