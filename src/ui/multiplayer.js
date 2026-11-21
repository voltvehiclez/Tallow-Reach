// The multiplayer screens (refactor step 16, slice 3): the panel behind the pause card,
// and the chat box beside the HUD.
//
// Two surfaces, deliberately different:
//
//   #mp-panel   the pause card's "Open Multiplayer" section: the on/off switch, the
//               username, the join link to copy, the box to paste somebody's link, and
//               the paste-code fallback. It is a *settings and setup* surface; it never
//               needs to be open while flying.
//   #mp-chat    bottom left, while playing: the recent chat lines and the list of who is
//               connected, which is the only surface that has to be readable at speed.
//
// **The one rule that matters here.** Chat is opened with Enter and closed with Escape,
// and *while the box is open, typing must not fly the ship*. That is why the box is a
// real `<input>`: `core/input.js` already ignores keys aimed at a text field, so the
// rule is kept by using the platform instead of adding a second copy of it.
//
// Everything else obeys the same idea: this file draws and forwards; it holds no
// connection state. `net/session.js` owns that and tells this file when to redraw.

import { state } from "../state/state.js";
import { emit, on } from "../util/events.js";
import { readSettings, writeSettings, cleanName } from "../net/settings.js";
import { snapshot, currentLink } from "../net/session.js";
import * as session from "../net/session.js";
import { NET } from "../data/multiplayer.js";
import { clearPendingJoin } from "../net/boot.js";
import { showNotice } from "./notice.js";

let panel = null;   // #mp-panel, inside the pause overlay
let chatBox = null; // #mp-chat, bottom left
let chatInput = null;
let chatList = null;
let chatWho = null;
let chatTimer = 0;

/** Is the chat box open (and therefore catching keystrokes)? */
export const isChatOpen = () => !!chatInput && !chatBox.hidden && document.activeElement === chatInput;

/**
 * Build both surfaces, wire them to the bus, and draw the first state. Called once from
 * `ui/pause.js` / `main.js` during setup.
 */
export function setupMultiplayer() {
  buildPanel();
  buildChat();
  // The session says when anything changed; this redraws from its snapshot.
  on("mp-state", () => {
    drawPanel();
    drawChat();
  });
  // A chat line that arrives is worth a small sound and a nudge, and it must not open the
  // box: the pilot may be mid-fight, and a panel appearing over the glass is not help.
  on("mp-chat-arrived", () => drawChat());
  // A `?join=` link found at boot: the session joins it, and the player is told where the
  // connection ended up. Kept here (not in net/boot.js) so the boot path has no UI of its own.
  // `net/` has no screen: sentences it wants shown arrive here (see net/boot.js).
  on("mp-notice", text => showNotice(text));
  on("mp-join-request", async link => {
    const result = await session.joinWorld({ link });
    clearPendingJoin();
    if (!result.ok) showProblem(result.message || "That link was not accepted.");
    drawPanel();
  });
  drawPanel();
  drawChat();
}

/* ------------------------------------------------------------------------- */
/* The pause panel                                                            */
/* ------------------------------------------------------------------------- */

/** The markup inside the pause card. `ui/overlays.js` includes it, so the card stays one file. */
export function multiplayerPanelHtml() {
  const settings = readSettings();
  return (
    `<section id="mp-panel">` +
    `<button class="sw" id="mp-toggle" role="switch" aria-checked="${settings.enabled ? "true" : "false"}">` +
    `<i></i><span>${settings.enabled ? "Open Multiplayer: On" : "Open Multiplayer: Off"}</span></button>` +
    `<label class="mp-name">Username <input id="mp-name" maxlength="${NET.nameMax}" value="${escapeAttr(settings.name)}" placeholder="Your name" autocomplete="off"></label>` +
    `<div id="mp-body"></div>` +
    `</section>`
  );
}

function buildPanel() {
  panel = document.getElementById("mp-panel");
  if (!panel) return;

  panel.querySelector("#mp-toggle").onclick = () => {
    const on = !readSettings().enabled;
    session.setEnabled(on);
    const button = panel.querySelector("#mp-toggle");
    button.setAttribute("aria-checked", on ? "true" : "false");
    button.querySelector("span").textContent = on ? "Open Multiplayer: On" : "Open Multiplayer: Off";
    if (on) session.hostWorld().then(result => {
      if (!result.ok) showProblem(result.message);
      drawPanel();
    });
    else drawPanel();
  };

  const name = panel.querySelector("#mp-name");
  name.onchange = () => {
    const result = session.setUsername(name.value);
    if (!result.ok) showProblem(result.message);
    else name.value = result.name;
    drawPanel();
  };
  // A pasted link or code: one box, because the player has one thing to paste either way.
  panel.addEventListener("paste", event => {
    const box = event.target;
    if (!box || box.tagName !== "INPUT" && box.tagName !== "TEXTAREA") return;
    if (box.id !== "mp-name" && box.id !== "mp-paste" && box.id !== "mp-code") return;
    if (box.id === "mp-name") return; // a name is typed, not pasted from a link
  });
}

/** Draw the part of the panel that depends on the session. */
function drawPanel() {
  if (!panel || panel.hidden) return;
  const body = panel.querySelector("#mp-body");
  if (!body) return;
  const snap = snapshot();
  const settings = readSettings();

  if (!settings.name) {
    body.innerHTML = `<p class="mp-hint">Set a username, then turn Open Multiplayer on.</p>`;
    return;
  }

  if (!snap.on) {
    body.innerHTML = `<p class="mp-hint">Open Multiplayer is off. Turn it on to host your world or join a friend's.</p>`;
    return;
  }

  if (snap.role === "host") {
    const links = currentLink();
    body.innerHTML =
      `<p class="mp-state">${escapeHtml(snap.line)}</p>` +
      (links ? `<label class="mp-name">Join link <input id="mp-link" readonly value="${escapeAttr(links.url)}"></label>` +
        `<div class="mp-row"><button type="button" id="mp-copy">Copy link</button>` +
        `<button type="button" id="mp-codes">No broker? Paste codes</button></div>` : "") +
      (snap.guests.length
        ? `<ul class="mp-list">${snap.guests.map(g => `<li>${escapeHtml(g.name)}${g.docked ? " <small>docked</small>" : ""}</li>`).join("")}</ul>`
        : `<p class="mp-hint">Nobody has joined yet. Send the link to a friend.</p>`) +
      `<label class="mp-name">Paste their answer code <input id="mp-code" placeholder="TRJOIN:…" autocomplete="off"></label>` +
      `<div class="mp-row"><button type="button" id="mp-finish">Connect</button></div>` +
      `<div id="mp-code-out"></div>`;
    wireCopy(links);
    wireCodes(snap);
    return;
  }

  // Guest.
  body.innerHTML =
    `<p class="mp-state">${escapeHtml(snap.line)}</p>` +
    (snap.state === "connected"
      ? `<p class="mp-hint">Connected. Press <b>Enter</b> to chat.</p>${playersHtml(snap)}`
      : `<label class="mp-name">Paste the host's link or code <input id="mp-paste" placeholder="?join=… or TRJOIN:…" autocomplete="off"></label>` +
        `<div class="mp-row"><button type="button" id="mp-join">Join</button>` +
        `<button type="button" id="mp-accept">Use a paste code</button></div>` +
        `<div id="mp-code-out"></div>`) +
    `<div class="mp-row"><button type="button" id="mp-stop">Leave</button></div>`;
  wireGuest(snap);
}

function playersHtml(snap) {
  if (!snap.guests.length) return "";
  return `<ul class="mp-list">${snap.guests.map(g => `<li>${escapeHtml(g.name)}${g.docked ? " <small>docked</small>" : ""}</li>`).join("")}</ul>`;
}

function wireCopy(links) {
  const button = panel.querySelector("#mp-copy");
  if (!button || !links) return;
  button.onclick = async () => {
    try {
      await navigator.clipboard.writeText(links.url);
      button.textContent = "Copied";
    } catch (e) {
      // A browser that refuses the clipboard: select the text so the player can copy it.
      const field = panel.querySelector("#mp-link");
      field?.select?.();
      button.textContent = "Select it, then copy";
    }
    setTimeout(() => { button.textContent = "Copy link"; }, 2000);
  };
}

function wireCodes(snap) {
  const make = panel.querySelector("#mp-codes");
  if (make) make.onclick = async () => {
    const codes = await session.codesOffer();
    const out = panel.querySelector("#mp-code-out");
    if (!codes?.offer) { showProblem("Could not make a code. Try the link instead."); return; }
    if (out) {
      out.innerHTML =
        `<label class="mp-name">Offer code — send this to your friend <textarea id="mp-offer" readonly rows="4">${escapeHtml(codes.offer)}</textarea></label>` +
        `<p class="mp-hint">They paste it in their game, send you the answer, and you paste it below.</p>`;
      out.querySelector("#mp-offer").select();
    }
    drawPanel();
  };
  const finish = panel.querySelector("#mp-finish");
  if (finish) finish.onclick = async () => {
    const code = panel.querySelector("#mp-code")?.value || "";
    const result = await session.codesFinish(code);
    if (!result.ok) showProblem(result.message || "That code was not accepted.");
    else drawPanel();
  };
}

function wireGuest(snap) {
  const join = panel.querySelector("#mp-join");
  if (join) join.onclick = async () => {
    const text = panel.querySelector("#mp-paste")?.value || "";
    const result = await session.joinWorld({ link: text });
    if (!result.ok) showProblem(result.message || "That link was not accepted.");
    drawPanel();
  };
  const accept = panel.querySelector("#mp-accept");
  if (accept) accept.onclick = async () => {
    const text = panel.querySelector("#mp-paste")?.value || "";
    const result = await session.codesAccept(text);
    const out = panel.querySelector("#mp-code-out");
    if (!result.ok) { showProblem(result.message || "That code was not accepted."); return; }
    if (out) {
      out.innerHTML =
        `<label class="mp-name">Answer code — send this back to the host <textarea id="mp-answer" readonly rows="4">${escapeHtml(result.answer)}</textarea></label>`;
      out.querySelector("#mp-answer").select();
    }
  };
  const stop = panel.querySelector("#mp-stop");
  if (stop) stop.onclick = () => { session.stop(); drawPanel(); };
}

/** Say something the player must read, in the panel, without a modal. */
function showProblem(message) {
  const out = panel?.querySelector("#mp-code-out");
  if (out) out.innerHTML = `<p class="mp-error">${escapeHtml(message || "")}</p>`;
}

/** `ui/pause.js` calls this whenever the card is shown or hidden. */
export function refreshMultiplayerPanel() {
  drawPanel();
}

/* ------------------------------------------------------------------------- */
/* The chat box                                                               */
/* ------------------------------------------------------------------------- */

function buildChat() {
  chatBox = document.createElement("div");
  chatBox.id = "mp-chat";
  chatBox.hidden = true;
  chatBox.innerHTML =
    `<div id="mp-chat-who"></div>` +
    `<div id="mp-chat-lines"></div>` +
    `<input id="mp-chat-input" maxlength="${NET.chatLineMax}" placeholder="Say something…  (Enter sends, Esc closes)" autocomplete="off">`;
  document.body.appendChild(chatBox);
  chatInput = chatBox.querySelector("#mp-chat-input");
  chatList = chatBox.querySelector("#mp-chat-lines");
  chatWho = chatBox.querySelector("#mp-chat-who");

  chatInput.addEventListener("keydown", event => {
    // The box owns Enter and Escape while it is open. Stop here so the game's own
    // bindings (pause on Escape, dock on G, …) never see these keys.
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      const text = chatInput.value.trim();
      if (text && session.say(text)) chatInput.value = "";
      else if (!text) closeChat();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeChat();
    }
  });
  // Clicking into the box is a normal way to type; clicking a line must not steal focus.
  chatInput.addEventListener("blur", () => {
    // Losing focus closes an empty box (the pilot clicked back into the game), but keeps
    // a half-written line: losing half a sentence to a stray click is not a feature.
    if (!chatInput.value) setTimeout(() => { if (document.activeElement !== chatInput) closeChat(); }, 120);
  });
}

/** Open the chat box and put the cursor in it. Enter does this while connected. */
export function openChat() {
  if (!chatBox) return false;
  if (!snapshot().on) return false;
  chatBox.hidden = false;
  document.body.classList.add("mp-chat-open");
  chatInput.focus();
  drawChat();
  return true;
}

/** Close the box (Escape, or Enter on an empty line). */
export function closeChat() {
  if (!chatBox) return;
  chatBox.hidden = true;
  document.body.classList.remove("mp-chat-open");
  chatInput.blur();
  if (chatTimer) { clearTimeout(chatTimer); chatTimer = 0; }
}

export const toggleChat = () => (isChatOpen() ? closeChat() : openChat());

function drawChat() {
  if (!chatBox) return;
  const snap = snapshot();
  // The box is only there when multiplayer is on, and only while playing: on the title
  // screen and on a station panel it would sit over a menu that already has the screen.
  const wanted = snap.on && !state.ui.intro && !sessionIsPanelOpen();
  if (!wanted) { chatBox.hidden = true; return; }
  if (chatBox.hidden && !isChatOpen()) {
    // Collapsed: show the last few lines and who is here, without an input.
    chatBox.hidden = false;
  }
  chatWho.textContent = whoLine(snap);
  chatList.innerHTML = snap.chat.length
    ? snap.chat.map(line => `<p><b>${escapeHtml(line.from)}</b> ${escapeHtml(line.text)}</p>`).join("")
    : `<p class="mp-hint">Press Enter to chat.</p>`;
  chatList.scrollTop = chatList.scrollHeight;
  // Lines fade: chat is for the moment, and a wall of old lines over the glass is clutter.
  if (chatTimer) clearTimeout(chatTimer);
  chatTimer = setTimeout(() => { chatList.querySelectorAll("p").forEach(p => { p.style.opacity = "0.55"; }); }, 20000);
  if (!isChatOpen()) chatBox.querySelector("#mp-chat-input").hidden = true;
  else chatBox.querySelector("#mp-chat-input").hidden = false;
}

function sessionIsPanelOpen() {
  return !!(state.ui.starmap || state.ui.cargo || state.ui.cache || state.paused);
}

function whoLine(snap) {
  const names = [snap.name, ...snap.guests.filter(g => g.name !== snap.name).map(g => g.name)].filter(Boolean);
  return names.length ? names.join(" · ") : "Multiplayer";
}

/** Called when the game wants the chat box gone (pause, a station panel, the title). */
export function chatAway() {
  closeChat();
  if (chatBox) chatBox.hidden = true;
}

/* ------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* ------------------------------------------------------------------------- */

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

const escapeAttr = escapeHtml;


export { cleanName, writeSettings };
