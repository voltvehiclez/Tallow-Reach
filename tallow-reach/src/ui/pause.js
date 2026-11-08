// Pause overlay. Freezes the simulation, mutes the engine, and releases the trigger.
// Layout, top to bottom: PAUSED title, resume hint, sound on/off switch, Resume button.
// The sound switch is the only way to mute the game (there is no mute key).

import { keys, syncControls } from "../core/input.js";
import { setAudioSuspended, isMuted, toggleMute } from "../core/audio.js";
import { state } from "../state/state.js";

let overlay, soundBtn, soundLabel;

export function setupPause() {
  overlay = document.createElement("div");
  overlay.id = "pz";
  overlay.hidden = true;
  overlay.innerHTML =
    `<div>` +
    `<h1>Paused</h1>` +
    `<p>P or Esc to resume</p>` +
    `<button class="sw" id="pz-sound" role="switch"><i></i><span></span></button>` +
    `<button id="pz-resume">Resume</button>` +
    `</div>`;
  document.body.appendChild(overlay);

  soundBtn = overlay.querySelector("#pz-sound");
  soundLabel = soundBtn.querySelector("span");
  soundBtn.onclick = () => {
    toggleMute();
    showSoundState();
  };
  overlay.querySelector("#pz-resume").onclick = () => setPause(false);
  showSoundState();
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
