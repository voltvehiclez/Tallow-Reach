// STEP 9 LOCAL-ONLY: slots, autosave and import/export store the local profile only.
// Persistence: the autosave, three manual save slots, and text save codes.
// Storage keys are unchanged from the prototype so existing saves still load.

import { sanitizeProfile } from "./profile.js";

const AUTOSAVE_KEY = "tr1";
const SLOT_PREFIX = "tr_s";
const CODE_PREFIX = "TR1:";
export const SLOT_COUNT = 3;

export function loadAutosave() {
  try {
    const raw = JSON.parse(localStorage.getItem(AUTOSAVE_KEY));
    return raw ? sanitizeProfile(raw) : null;
  } catch (e) {
    return null;
  }
}

export function saveAutosave(profile) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(profile));
  } catch (e) {
    // Storage full or disabled. The game keeps running without persistence.
  }
}

/** Returns the stored save in a slot, or null if empty. Not yet validated. */
export function readSlot(i) {
  try {
    return JSON.parse(localStorage.getItem(SLOT_PREFIX + i));
  } catch (e) {
    return null;
  }
}

export function writeSlot(i, profile) {
  try {
    localStorage.setItem(SLOT_PREFIX + i, JSON.stringify(profile));
    return true;
  } catch (e) {
    return false;
  }
}

export function deleteSlot(i) {
  try {
    localStorage.removeItem(SLOT_PREFIX + i);
  } catch (e) {
    // ignore
  }
}

export function encodeSave(profile) {
  return CODE_PREFIX + btoa(JSON.stringify(profile));
}

/** Throws if the text is not a valid save code. */
export function decodeSave(text) {
  return sanitizeProfile(JSON.parse(atob(text.trim().replace(/^TR1:/, ""))));
}
