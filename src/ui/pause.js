// Pause overlay. Freezes the simulation, mutes the engine, and releases the trigger.
// Layout, top to bottom: PAUSED title, resume hint, Resume button, sound on/off
// switch, Exit to main menu button — the two actions a paused pilot wants most
// are the top and bottom of the card. It opens anywhere in the open world,
// including while docked (see ui/overlays.js); only the title screen blocks it.
// The sound switch is the only way to mute the game (there is no mute key).

import { keys, syncControls } from "../core/input.js";
import { setAudioSuspended, isMuted, toggleMute } from "../core/audio.js";
import { state, currentSave } from "../state/state.js";
import { saveAutosave } from "../state/storage.js";
import { emit } from "../util/events.js";
import { pauseOverlayHtml } from "./overlays.js";
import { hideNotice } from "./notice.js";

let overlay, soundBtn, soundLabel;

export function setupPause() {
  overlay = document.createElement("div");
  overlay.id = "pz";
  overlay.hidden = true;
  overlay.innerHTML = pauseOverlayHtml();
  document.body.appendChild(overlay);

  soundBtn = overlay.querySelector("#pz-sound");
  soundLabel = soundBtn.querySelector("span");
  soundBtn.onclick = () => {
    toggleMute();
    showSoundState();
  };
  overlay.querySelector("#pz-resume").onclick = () => setPause(false);
  overlay.querySelector("#pz-main-menu").onclick = exitToMainMenu;
  showSoundState();
}

/** Save the current resume point, then return to the title menu without losing progress. */
function exitToMainMenu() {
  saveAutosave(currentSave());
  state.ui.intro = true;
  state.ui.tab = "m";
  hideNotice();
  setPause(false);
  emit("main-menu", {});
}

/** Make the switch match the real mute state. */
function showSoundState() {
  const on = !isMuted();
  soundBtn.setAttribute("aria-checked", on ? "true" : "false");
  soundLabel.textContent = on ? "Sound: On" : "Sound: Off";
}

export function setPause(v) {
  state.paused = v;
  overlay.hidden = !v;
  // A trigger held when the game is paused must not fire on resume.
  keys.fire = keys.sec = 0;
  syncControls();
  setAudioSuspended(v);
  if (v) showSoundState();
}
