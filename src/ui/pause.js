// Pause overlay. Freezes the simulation, mutes the engine, and releases the trigger.
// Layout, top to bottom: PAUSED title, resume hint, Resume button, sound on/off
// switch, Exit to main menu button — the two actions a paused pilot wants most
// are the top and bottom of the card. It opens anywhere in the open world,
// including while docked (see ui/overlays.js); only the title screen blocks it.
// The sound switch is the only way to mute the game (there is no mute key).

import { keys, syncControls, clearControls } from "../core/input.js";
import { setAudioSuspended, isMuted, toggleMute } from "../core/audio.js";
import { state, currentSave, saveCurrentGame } from "../state/state.js";
import { emit } from "../util/events.js";
import { pauseOverlayHtml } from "./overlays.js";
import { hideNotice } from "./notice.js";
import { resetStationPanels } from "./left-panel.js";
import { activeCampaignMission } from "../sim/campaign.js";
import { refreshMultiplayerCard, openMultiplayer, chatAway } from "./multiplayer.js";
import { isOn } from "../net/session.js";

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
  // The act lifecycle belongs to the campaign screens; the pause card only says
  // the pilot wants a clean restart.
  overlay.querySelector("#pz-restart-act")?.addEventListener("click", () => emit("pause-restart-act", {}));
  overlay.querySelector("#pz-main-menu").onclick = exitToMainMenu;
  // Multiplayer is a screen of its own now (title menu and pause card both open it).
  const mpButton = overlay.querySelector("#pz-mp");
  if (mpButton) mpButton.onclick = () => openMultiplayer({ from: "pause" });
  showSoundState();
  refreshMultiplayerCard();
}

/** Save the current resume point, then return to the title menu without losing progress. */
function exitToMainMenu() {
  saveCurrentGame();
  state.ui.intro = true;
  // The title, not the campaign screen: the pilot asked for the main menu.
  state.ui.campaign = false;
  state.ui.campaignChapter = null;
  resetStationPanels(state.ui);
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
  if (v) emit("freecam", false);
  // Step 16: opening multiplayer is a settings card, not a freeze. While this browser is
  // hosting or visiting a world the card is open *and the world keeps running* — for the
  // host and for the guest (owner's playtest 2: it still paused). `sim/step.js` reads
  // `state.multiplayer`, so it is a plain "is a session on", not "and the card is shut":
  // the old `!v &&` made opening the card stop everyone else's world.
  state.multiplayer = isOn();
  if (v) chatAway();
  else refreshMultiplayerCard();
  overlay.hidden = !v;
  const restart = overlay.querySelector("#pz-restart-act");
  if (restart) restart.hidden = !(state.mode === "campaign" && activeCampaignMission());
  // A trigger held when the game is paused must not fire on resume — and while a session is
  // on the sim keeps stepping behind the card, so every held key is released, not just the
  // guns: otherwise the ship would fly itself while the pilot reads the card.
  keys.fire = keys.sec = 0;
  if (v) clearControls();
  syncControls();
  setAudioSuspended(v);
  if (v) showSoundState();
  if (v) refreshMultiplayerCard();
}
