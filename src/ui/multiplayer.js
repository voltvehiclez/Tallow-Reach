// The multiplayer screen and the chat box (refactor step 16, slice 3).
//
// Reworked 2026-11-21 after the owner's first playtest. Three things were wrong, and all
// three were the same shape of mistake — a control that only works in a state the screen
// never lets you reach, or that says something the connection is not doing:
//
//  1. **The guest could never paste a link.** The panel showed the join box only when a
//     session already existed as a *guest*, and the only way to get one was the join box.
//     The switch, which was the only thing on screen, always started a *host* session. So
//     the join path was a closed loop and the code box at the bottom of the host panel —
//     the only box there was — answered "Make a fresh offer first".
//  2. **Hosting without a username said nothing.** The switch flipped to On on the stored
//     setting, `hostWorld` refused with "Set a username first.", and that sentence was
//     drawn into `#mp-code-out`, an element that did not exist in that state. The player
//     saw an On switch and no link, with no way to find out why.
//  3. **The paste-code offer deleted itself.** Making an offer ended with a full redraw,
//     so the code the host had just been told to send vanished. The answer box then sat
//     there offering a Connect button with nothing to connect.
//
// The rules the rewrite is built on:
//
//  - **The screen is one surface, and every control on it works in the state it is drawn.**
//    Hosting and joining are two separate blocks, both visible whenever they can be used;
//    joining does not need hosting first, and the switch cannot be turned on without a
//    username (it is `disabled`, and the action refuses too, so the rule holds twice).
//  - **A control's words are its contract** (LESSONS L32): the switch is drawn from the
//    *session* (`hosting`), never from the stored wish. If hosting fails, the switch goes
//    back to Off and the reason is on screen.
//  - **The offer lives in the model, not in the DOM.** `panelView.offer` holds it, so a
//    redraw cannot lose it (LESSONS L19: the writer and the reader agree).
//  - **Nothing is a dead end.** Every refusal is a sentence in `#mp-msg`, which always
//    exists, and an Enter with nowhere to send says so instead of silently keeping the
//    typed line.
//
// **What this file is not.** It holds no connection state: `net/session.js` owns that and
// tells this file when to redraw (`mp-state`). `net/` may not import `ui/`, so anything the
// connection wants *said* arrives on the bus (`mp-notice`).
//
// **The one rule that matters in the chat box.** Enter opens it and Escape closes it, and
// while it is open typing must not fly the ship. That is why it is a real `<input>`:
// `core/input.js` ignores keys aimed at a text field, so the rule is kept by using the
// platform instead of a second copy of it.
//
// The screen is opened from the title menu ("Join Multiplayer World") and from the pause
// card ("Open Multiplayer"). Those are the only two front doors, and both call
// `openMultiplayer()`.

import { state } from "../state/state.js";
import { emit, on } from "../util/events.js";
import { readSettings, writeSettings, cleanName } from "../net/settings.js";
import * as session from "../net/session.js";
import { NET, CHAT } from "../data/multiplayer.js";
import { clearPendingJoin, pendingJoin } from "../net/boot.js";
import { looksLikeCode } from "../net/paste.js";
import { makeJoinLink } from "../net/join-link.js";
import { showNotice } from "./notice.js";

/* ------------------------------------------------------------------------- */
/* What the screen is showing                                                 */
/* ------------------------------------------------------------------------- */

/**
 * Everything the screen decides, as a plain object with no DOM in it, so a test can ask
 * "what would the player see?" without a browser (LESSONS L19: ask the reader's question).
 *
 * `snap` is a `net/session.js` snapshot, `settings` the stored name/switch, and `v` this
 * module's own view state (the offer, the last message, the fields being typed into).
 */
export function screenModel({ snap = api.snapshot(), settings = readSettings(), v = panelView } = {}) {
  const nameValue = v.fields.name ?? settings.name;
  const name = cleanName(nameValue);
  const hosting = snap.on === true && snap.role === "host";
  const visiting = snap.on === true && snap.role === "guest";
  const connected = snap.state === "connected";
  const link = hosting ? api.currentLink() : null;
  return {
    nameValue,
    name,
    nameSet: !!name,
    hosting,
    visiting,
    connected,
    role: snap.role || null,
    state: snap.state || "idle",
    // The switch's words follow the session (LESSONS L32). Hosting is the only thing the
    // switch can start, so an On switch always means "this world is open to guests".
    switchOn: hosting,
    canSwitch: !!name && !visiting,
    canHost: !!name && !visiting,
    // The join block is there whenever nothing of yours is running; the button waits for
    // a name. Without this split the block drew "you are in a friend's world" to somebody
    // who had simply not typed a name yet.
    joinAvailable: !hosting && !visiting,
    canJoin: !!name && !hosting && !visiting,
    canCodes: hosting,
    status: hosting
      ? connected ? "Hosting — another pilot is connected." : "Hosting. Waiting for your friend to join…"
      : visiting
        ? connected ? "Connected to a friend's world." : snap.line
        : "Multiplayer is off.",
    stateLine: snap.line || "",
    worldId: snap.worldId || null,
    link: link?.url || "",
    guests: (snap.guests || []).slice(),
    peers: (snap.peers || []).slice(),
    chat: (snap.chat || []).slice(),
    offer: hosting ? v.offer || "" : "",
    // The answer code is shown whoever is on screen: a guest who joined by code is already
    // a guest, and that is exactly when they must still be able to read the code to send.
    answer: v.answer || "",
    joinValue: v.fields.join || "",
    codeValue: v.fields.code || "",
    message: v.message || "",
    messageKind: v.messageKind || "hint",
    busy: !!v.busy,
    mounted: !!root,
  };
}

/** The screen's own state: what was said, what is being pasted, the pending code. */
const panelView = {
  message: "",
  messageKind: "hint",  // "hint" | "error" | "ok"
  busy: false,
  offer: "",            // the host's offer code, kept here so a redraw cannot lose it
  answer: "",           // the guest's answer code to send back
  fields: { name: null, join: "", code: "" },
};

let root = null;        // #mp-screen (the whole overlay)
let chatBox = null;     // #mp-chat, bottom left
let chatInput = null;
let chatList = null;
let chatWho = null;
let chatNote = null;
let chatProblem = "";
let chatFadeTimer = 0;
let drawnHtml = "";     // what is currently in the card, so a no-op redraw does nothing

/** Is the chat box open (and therefore catching keystrokes)? */
export const isChatOpen = () => !!chatInput && !chatBox.hidden && document.activeElement === chatInput;

/** Is the multiplayer screen open? (Also mirrored on `state.ui.multiplayer` for input.) */
export const isMultiplayerScreenOpen = () => !!root && !root.hidden;

/* ------------------------------------------------------------------------- */
/* Setup                                                                      */
/* ------------------------------------------------------------------------- */

/**
 * Build the screen and the chat box, wire them to the bus, and draw the first state.
 * Called once from `main.js` during setup (after `ui/pause.js`, which owns the card's
 * "Open Multiplayer" button).
 */
export function setupMultiplayer() {
  buildScreen();
  buildChat();
  on("mp-state", () => draw());
  on("mp-chat-arrived", () => drawChat());
  // A sentence the connection wants shown. `net/` cannot reach the screen itself.
  on("mp-notice", text => {
    setMessage(text, "hint");
    showNotice(text);
  });
  // A `?join=` link found at boot (see net/boot.js). The session does the joining; this
  // file shows the result. The link is rebuilt from its two halves because that is the
  // shape `joinWorld` reads (a link string, or a whole pasted URL).
  on("mp-join-request", async found => {
    const link = makeLinkFrom(found);
    if (!link) { setMessage("That link is incomplete. Ask the host to copy it again.", "error"); return; }
    panelView.fields.join = link;
    const result = await api.joinWorld({ link });
    clearPendingJoin();
    if (!result?.ok) setMessage(result?.message || "That link was not accepted.", "error");
    else {
      setMessage("Joined. Press Enter to chat.", "ok");
      afterJoined();
    }
    draw();
  });
  // Leaving the world for the title: the screen and the chat box go with it.
  on("main-menu", () => { closeMultiplayer(); chatAway(); });
  draw();
  drawChat();
}

const makeLinkFrom = found =>
  found && typeof found === "object" && found.worldId && found.token
    ? makeJoinLink(found.worldId, found.token)
    : typeof found === "string" ? found : "";

/* ------------------------------------------------------------------------- */
/* The screen's markup (pure)                                                 */
/* ------------------------------------------------------------------------- */

/** The pause card's row: the button that opens the screen, and what it is doing now. */
export function multiplayerCardHtml() {
  return (
    `<section id="mp-card">` +
    `<button type="button" id="pz-mp">Open Multiplayer</button>` +
    `<p class="mp-hint" id="pz-mp-state"></p>` +
    `</section>`
  );
}

/** One line for the pause card, so the state is readable without opening the screen. */
export function multiplayerSummary() {
  const snap = api.snapshot();
  if (!snap.on) return "Off. Host your world or join a friend's.";
  if (snap.role === "host") {
    return snap.state === "connected" ? "Hosting — a pilot is connected." : "Hosting — waiting for your friend.";
  }
  return snap.state === "connected" ? "Connected to a friend's world." : snap.line || "Connecting…";
}

/**
 * The whole card as HTML. Pure: same model in, same string out, no state touched. Every
 * control is a `data-mp` action, so the one click listener on the screen never goes stale
 * when the card is redrawn.
 */
export function screenHtml(model) {
  return (
    `<h1 id="mp-title">Multiplayer</h1>` +
    `<p class="mp-state" id="mp-status">${escapeHtml(model.status)}</p>` +
    messageHtml(model) +
    nameHtml(model) +
    hostHtml(model) +
    joinHtml(model) +
    listHtml(model) +
    `<div class="mp-row"><button type="button" class="mp-close" data-mp="close">Close</button></div>`
  );
}

function messageHtml(model) {
  // Always present, so a refusal is never drawn into an element that is not on screen.
  return `<p id="mp-msg" class="mp-msg is-${escapeAttr(model.messageKind)}"${model.message ? "" : " hidden"}>` +
    `${escapeHtml(model.message)}</p>`;
}

function nameHtml(model) {
  return (
    `<section class="mp-block">` +
    `<h2>Your name</h2>` +
    `<label class="mp-label">Username` +
    `<input class="mp-input" id="mp-name" data-mp-field="name" maxlength="${NET.nameMax}" ` +
    `value="${escapeAttr(model.nameValue)}" placeholder="Your name" autocomplete="off" spellcheck="false"></label>` +
    `<p class="mp-hint" id="mp-name-hint">${model.nameSet
      ? "Your friends see this name."
      : "Set a username first: hosting and joining are both off until you do."}</p>` +
    `</section>`
  );
}

function hostHtml(model) {
  const switchHtml =
    `<button type="button" class="sw mp-switch" data-mp="host" role="switch" ` +
    `aria-checked="${model.switchOn ? "true" : "false"}"${model.canSwitch || model.hosting ? "" : " disabled"}>` +
    `<i></i><span>${model.switchOn ? "Open Multiplayer: On" : "Open Multiplayer: Off"}</span></button>`;
  const hint = model.visiting
    ? "You are in a friend's world. Leave it first to host your own."
    : !model.nameSet
      ? "Set a username above, then turn this on."
      : model.hosting
        ? "Send the link below to your friend. They paste it under “Join a friend's world”."
        : "Turns this world into a room and makes a link to send to a friend.";
  return (
    `<section class="mp-block">` +
    `<h2>Host your world</h2>` +
    switchHtml +
    `<p class="mp-hint">${escapeHtml(hint)}</p>` +
    (model.hosting ? linkHtml(model) + codesHtml(model) : "") +
    `</section>`
  );
}

function linkHtml(model) {
  return (
    `<label class="mp-label">Join link — send this to your friend` +
    `<input class="mp-input" id="mp-link" readonly data-mp-select value="${escapeAttr(model.link)}"></label>` +
    `<div class="mp-row">` +
    `<button type="button" data-mp="copy-link">Copy link</button>` +
    `<button type="button" data-mp="copy-world">Copy world id</button>` +
    `</div>`
  );
}

function codesHtml(model) {
  if (!model.offer) {
    return (
      `<p class="mp-hint">No broker, or your friend cannot join by link? Make a code instead.</p>` +
      `<div class="mp-row"><button type="button" data-mp="offer">No broker? Paste codes</button></div>`
    );
  }
  return (
    `<label class="mp-label">1. Offer code — send this to your friend` +
    `<textarea class="mp-code" id="mp-offer" readonly rows="3" data-mp-select>${escapeHtml(model.offer)}</textarea></label>` +
    `<div class="mp-row"><button type="button" data-mp="copy-offer">Copy offer code</button></div>` +
    `<label class="mp-label">2. Their answer code — paste it here` +
    `<textarea class="mp-code" data-mp-field="code" rows="3" placeholder="TRJOIN:…">${escapeHtml(model.codeValue)}</textarea></label>` +
    `<div class="mp-row"><button type="button" data-mp="finish">Connect</button>` +
    `<button type="button" data-mp="reset-offer">Start again</button></div>`
  );
}

function joinHtml(model) {
  const answerHtml = model.answer
    ? `<label class="mp-label">Answer code — send this back to your friend` +
      `<textarea class="mp-code" id="mp-answer" readonly rows="3" data-mp-select>${escapeHtml(model.answer)}</textarea></label>` +
      `<div class="mp-row"><button type="button" data-mp="copy-answer">Copy answer code</button></div>`
    : "";
  if (!model.joinAvailable) {
    const why = model.hosting
      ? "Stop hosting to join a friend's world."
      : "You are in a friend's world. Press Leave to stop.";
    return (
      `<section class="mp-block"><h2>Join a friend's world</h2>` +
      `<p class="mp-hint">${escapeHtml(why)}</p>` +
      answerHtml +
      (model.visiting ? `<div class="mp-row"><button type="button" data-mp="leave">Leave</button></div>` : "") +
      `</section>`
    );
  }
  return (
    `<section class="mp-block">` +
    `<h2>Join a friend's world</h2>` +
    `<label class="mp-label">Paste the link your friend sent` +
    `<textarea class="mp-input" id="mp-join" data-mp-field="join" rows="2" placeholder="?join=…" spellcheck="false">${escapeHtml(model.joinValue)}</textarea></label>` +
    `<div class="mp-row"><button type="button" data-mp="join"${model.canJoin ? "" : " disabled"}>Join</button></div>` +
    `<p class="mp-hint">${model.nameSet
      ? "A link looks like <code>…?join=w-… # …</code>. A <code>TRJOIN:</code> code works in the same box."
      : "Set a username above to join."}</p>` +
    answerHtml +
    `</section>`
  );
}

function listHtml(model) {
  if (!model.guests.length) return "";
  return (
    `<section class="mp-block"><h2>Who is here</h2>` +
    `<ul class="mp-list">${model.guests
      .map(g => `<li>${escapeHtml(g.name)}${g.docked ? " <small>docked</small>" : ""}</li>`)
      .join("")}</ul>` +
    `</section>`
  );
}

/* ------------------------------------------------------------------------- */
/* Actions — the buttons' work, callable without a DOM                        */
/* ------------------------------------------------------------------------- */

/**
 * Do one of the screen's actions. Returns true when the action worked, so the DOM layer
 * (and a test) can tell. Every refusal is a sentence in the message area, never a throw.
 */
export async function act(name, arg = "") {
  switch (name) {
    case "host": return toggleHosting();
    case "join": return joinFromBox();
    case "leave": return leaveSession();
    case "offer": return makeOffer();
    case "finish": return finishOffer();
    case "reset-offer":
      panelView.offer = "";
      panelView.fields.code = "";
      setMessage("Offer cleared. Make a fresh one when you are ready.", "hint");
      draw();
      return true;
    case "copy-link":
    case "copy-world":
    case "copy-offer":
    case "copy-answer":
      return copySomething(name, arg);
    case "close":
      closeMultiplayer();
      return true;
    default:
      return false;
  }
}

async function toggleHosting() {
  const model = screenModel();
  if (model.hosting) {
    api.stop();
    api.setEnabled(false);
    panelView.offer = "";
    panelView.fields.code = "";
    setMessage("Your world is closed.", "hint");
    draw();
    return true;
  }
  // The owner's rule, enforced here as well as by the disabled switch: no name, no world.
  if (!model.nameSet) {
    setMessage("Type a username first — nobody can join a world with no name on it.", "error");
    focusField("name");
    draw();
    return false;
  }
  if (model.visiting) {
    setMessage("Leave your friend's world before hosting your own.", "error");
    draw();
    return false;
  }
  const result = await withBusy("Opening your world…", () => api.hostWorld({ name: model.name }));
  if (!result?.ok) {
    // The switch does not stay on for a world that is not open (LESSONS L32).
    api.setEnabled(false);
    setMessage(result?.message || "Could not open your world.", "error");
    draw();
    return false;
  }
  api.setEnabled(true);
  setMessage("Your world is open. Copy the link and send it to your friend.", "ok");
  draw();
  return true;
}

async function joinFromBox() {
  const model = screenModel();
  const text = String(panelView.fields.join || "").trim();
  if (!model.joinAvailable) {
    setMessage(model.hosting ? "Stop hosting before joining a friend's world." : "You are already in a friend's world.", "error");
    draw();
    return false;
  }
  if (!model.nameSet) {
    setMessage("Type a username first — the host needs to know who is joining.", "error");
    focusField("name");
    draw();
    return false;
  }
  if (!text) {
    setMessage("Paste the link your friend sent first.", "error");
    draw();
    return false;
  }
  // One box, two kinds of thing to paste: a link, or a host's offer code.
  if (looksLikeCode(text)) return acceptOffer(text);

  const result = await withBusy("Looking for your friend's world…", () => api.joinWorld({ link: text }));
  if (!result?.ok) {
    setMessage(result?.message || "That link was not accepted.", "error");
    draw();
    return false;
  }
  clearPendingJoin();
  panelView.fields.join = "";
  setMessage("Joined. Press Enter to chat.", "ok");
  afterJoined();
  draw();
  return true;
}

/** A guest who just joined: get out of the way so the world (or the menu) is playable. */
function afterJoined() {
  if (state.ui.intro) {
    closeMultiplayer();
    emit("mp-enter-world", {});
  }
}

function leaveSession() {
  api.stop();
  api.setEnabled(false);
  panelView.offer = "";
  panelView.answer = "";
  panelView.fields.code = "";
  panelView.fields.join = "";
  setMessage("Multiplayer is off.", "hint");
  draw();
  return true;
}

/* --- the paste codes: two steps, and the button only exists for step two --- */

async function makeOffer() {
  const model = screenModel();
  if (!model.hosting) {
    setMessage("Turn Open Multiplayer on first — a code joins somebody to this world.", "error");
    draw();
    return false;
  }
  const codes = await withBusy("Making a code — this takes a few seconds…", () => api.codesOffer());
  if (!codes?.offer) {
    setMessage("Could not make a code. Try again, or send the link instead.", "error");
    draw();
    return false;
  }
  // Kept in the model, so the redraw below cannot delete the code the player must send.
  panelView.offer = codes.offer;
  panelView.fields.code = "";
  setMessage("Send the offer code to your friend. Paste their answer below and press Connect.", "ok");
  draw();
  return true;
}

async function finishOffer() {
  const code = String(panelView.fields.code || "").trim();
  if (!panelView.offer) {
    setMessage("Make an offer first: press “No broker? Paste codes”.", "error");
    draw();
    return false;
  }
  if (!code) {
    setMessage("Paste your friend's answer code first.", "error");
    focusField("code");
    draw();
    return false;
  }
  const result = await withBusy("Connecting directly…", () => api.codesFinish(code));
  if (!result?.ok) setMessage(result?.message || "That code was not accepted.", "error");
  else setMessage("Connected directly. Press Enter to chat.", "ok");
  draw();
  return !!result?.ok;
}

async function acceptOffer(code) {
  const model = screenModel();
  const result = await withBusy("Making your answer code…", () => api.codesAccept(code, { name: model.name }));
  if (!result?.ok || !result.answer) {
    setMessage(result?.message || "That code was not accepted.", "error");
    draw();
    return false;
  }
  panelView.answer = result.answer;
  setMessage("Send the answer code back to your friend. They paste it and press Connect.", "ok");
  draw();
  return true;
}

/* --- copy buttons ---------------------------------------------------------- */

async function copySomething(name, arg) {
  const model = screenModel();
  const text =
    name === "copy-link" ? model.link
      : name === "copy-world" ? model.worldId || ""
        : name === "copy-offer" ? model.offer
          : name === "copy-answer" ? (panelView.answer || arg)
            : "";
  if (!text) {
    setMessage("There is nothing to copy yet.", "error");
    draw();
    return false;
  }
  const done = await copyText(text);
  setMessage(
    done ? "Copied." : "Your browser would not copy for us. The text is selected — press Ctrl+C (⌘C).",
    done ? "ok" : "hint",
  );
  draw();
  return done;
}

/** Copy, or select the matching field so the player can copy it themselves. */
async function copyText(text) {
  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    /* a browser that refuses the clipboard: fall through and select it instead */
  }
  selectFieldWith(text);
  return false;
}

function selectFieldWith(text) {
  for (const field of mountedFields()) {
    if (field.value === text) { field.select?.(); return true; }
  }
  return false;
}

/* ------------------------------------------------------------------------- */
/* Drawing                                                                    */
/* ------------------------------------------------------------------------- */

function buildScreen() {
  if (typeof document === "undefined") return;
  root = document.createElement("div");
  root.id = "mp-screen";
  root.hidden = true;
  root.innerHTML = `<div class="mp-card" id="mp-card-inner" role="dialog" aria-modal="true" aria-labelledby="mp-title"></div>`;
  document.body.appendChild(root);
  state.ui.multiplayer = false;

  // One listener for every action, on the root that is never replaced: a redraw can
  // therefore never leave a button wired to nothing.
  root.addEventListener("click", event => {
    const selectable = event.target.closest?.("[data-mp-select]");
    if (selectable?.select) selectable.select();
    const button = event.target.closest?.("[data-mp]");
    if (!button || button.disabled) return;
    event.preventDefault();
    act(button.dataset.mp);
  });
  // Typing goes into the model as it happens, so a redraw mid-paste keeps the text.
  root.addEventListener("input", event => {
    const field = event.target.closest?.("[data-mp-field]");
    if (!field) return;
    panelView.fields[field.dataset.mpField] = field.value;
    // Typing a name enables both front doors. That is done in place: a full redraw under
    // the player's cursor at every keystroke is how a name field becomes unusable.
    if (field.dataset.mpField === "name") refreshLiveness();
  });
  // A name is committed when the player leaves the field, not on every keystroke.
  root.addEventListener("change", event => {
    const field = event.target.closest?.("[data-mp-field]");
    if (field?.dataset.mpField !== "name") return;
    const result = api.setUsername(String(field.value || ""));
    if (!result?.ok) setMessage(result?.message || "Type a name first.", "error");
    else panelView.fields.name = result.name;
    draw();
  });
  // Escape closes the screen, and nothing behind it sees the key.
  root.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();
      closeMultiplayer();
    }
  });
}

/**
 * Update the controls that depend on "is there a name yet", without rebuilding the card:
 * the host switch, the Join button and the line under each. Cheap, and it keeps the caret.
 */
function refreshLiveness() {
  if (!root) return;
  const model = screenModel();
  const hostSwitch = root.querySelector(".mp-switch");
  if (hostSwitch && !model.hosting) {
    if (model.canSwitch) hostSwitch.removeAttribute("disabled");
    else hostSwitch.setAttribute("disabled", "");
  }
  const joinButton = root.querySelector('[data-mp="join"]');
  if (joinButton) {
    if (model.canJoin) joinButton.removeAttribute("disabled");
    else joinButton.setAttribute("disabled", "");
  }
  const underName = root.querySelector("#mp-name-hint");
  if (underName) {
    underName.textContent = model.nameSet
      ? "Your friends see this name."
      : "Set a username first: hosting and joining are both off until you do.";
  }
}

function focusField(field) {
  if (!root) return;
  const node = root.querySelector(`[data-mp-field="${field}"]`);
  node?.focus?.();
}

function mountedFields() {
  if (!root) return [];
  return Array.from(root.querySelectorAll?.("[data-mp-field]") || []);
}

/** Put the current model on the screen. A no-op when nothing the player can see changed. */
function draw() {
  if (!root) return;
  if (!isMultiplayerScreenOpen()) {
    // Keep the pause card's one-line summary honest while the screen is closed.
    refreshMultiplayerCard();
    return;
  }
  const model = screenModel();
  const html = screenHtml(model);
  const card = root.querySelector("#mp-card-inner");
  if (!card) return;
  // A redraw while the player is typing must not throw the cursor away.
  const active = document.activeElement;
  const focusKey = active && active.dataset ? active.dataset.mpField || active.id : "";
  const caret = typeof active?.selectionStart === "number" ? active.selectionStart : null;
  if (html !== drawnHtml) {
    card.innerHTML = html;
    drawnHtml = html;
    if (focusKey) {
      const again = root.querySelector(`[data-mp-field="${focusKey}"]`) || root.querySelector(`#${focusKey}`);
      if (again) {
        again.focus?.();
        if (caret != null && typeof again.setSelectionRange === "function") {
          try { again.setSelectionRange(caret, caret); } catch (e) { /* an input type that has no caret */ }
        }
      }
    }
  }
  refreshMultiplayerCard();
}

/** The pause card's summary line (it exists only once the overlay is built). */
export function refreshMultiplayerCard() {
  if (typeof document === "undefined" || typeof document.getElementById !== "function") return;
  const line = document.getElementById("pz-mp-state");
  if (line) line.textContent = multiplayerSummary();
}

/* ------------------------------------------------------------------------- */
/* Opening and closing                                                        */
/* ------------------------------------------------------------------------- */

/**
 * Show the screen. `focus` names a field to put the cursor in ("join" for a player who
 * came here from a link, "name" when there is no name yet). Safe to call twice.
 */
export function openMultiplayer({ focus = "" } = {}) {
  if (!root) return false;
  // A link found at boot, waiting for a name: put it in the join box so the player only
  // has to type a name and press Join.
  const waiting = pendingJoin();
  if (waiting && !panelView.fields.join) panelView.fields.join = makeLinkFrom(waiting) || "";
  root.hidden = false;
  state.ui.multiplayer = true;
  // The chat box and a menu cannot both own the keyboard.
  closeChat();
  drawnHtml = "";               // force a fresh draw after being away
  draw();
  const model = screenModel();
  const where = focus || (!model.nameSet ? "name" : waiting ? "join" : "");
  if (where) focusField(where === "join" ? "join" : where);
  return true;
}

/** Hide the screen (and hand the keyboard back). */
export function closeMultiplayer() {
  if (!root) return false;
  root.hidden = true;
  state.ui.multiplayer = false;
  if (document.activeElement && root.contains?.(document.activeElement)) document.activeElement.blur?.();
  return true;
}

export const toggleMultiplayerScreen = () => (isMultiplayerScreenOpen() ? closeMultiplayer() : openMultiplayer());

/* ------------------------------------------------------------------------- */
/* The chat box                                                               */
/* ------------------------------------------------------------------------- */

function buildChat() {
  if (typeof document === "undefined") return;
  chatBox = document.createElement("div");
  chatBox.id = "mp-chat";
  chatBox.hidden = true;
  chatBox.innerHTML =
    `<div id="mp-chat-who"></div>` +
    `<div id="mp-chat-lines"></div>` +
    `<p id="mp-chat-note" hidden></p>` +
    `<input id="mp-chat-input" maxlength="${NET.chatLineMax}" placeholder="Say something…  (Enter sends, Esc closes)" autocomplete="off">`;
  document.body.appendChild(chatBox);
  chatInput = chatBox.querySelector("#mp-chat-input");
  chatList = chatBox.querySelector("#mp-chat-lines");
  chatWho = chatBox.querySelector("#mp-chat-who");
  chatNote = chatBox.querySelector("#mp-chat-note");

  chatInput.addEventListener("keydown", event => {
    // The box owns Enter and Escape while it is open. Stop here so the game's own
    // bindings (pause on Escape, dock on G, …) never see these keys.
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      sendChatLine();
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

/**
 * Send what is in the box. A line that cannot be sent keeps its text (nothing typed is
 * thrown away) and says why — before this, Enter did nothing visible at all when nobody
 * was connected, which reads as a broken chat.
 */
function sendChatLine() {
  const text = chatInput.value.trim();
  if (!text) { closeChat(); return false; }
  const result = sendChatText(text);
  if (result.sent) chatInput.value = "";
  setChatProblem(result.problem);
  drawChat();
  return result.sent;
}

/**
 * What pressing Enter means, without a DOM in it: send the line, or say why not.
 *
 * The line is *kept* when it cannot go (throwing away what somebody typed is worse than a
 * refusal) and the reason is a sentence, because "nothing happens" reads as a broken chat.
 */
export function sendChatText(text) {
  const line = String(text ?? "").trim();
  if (!line) return { sent: false, problem: "" };
  if (api.say(line)) return { sent: true, problem: "" };
  const snap = api.snapshot();
  return {
    sent: false,
    problem: !snap.on ? "Multiplayer is off."
      : snap.state === "connected" ? "Not sent — the other pilot could not be reached."
        : "Not sent — no other pilot is connected yet.",
  };
}

function setChatProblem(text) {
  chatProblem = text || "";
  if (!chatNote) return;
  chatNote.hidden = !chatProblem;
  chatNote.textContent = chatProblem;
}

/** Open the chat box and put the cursor in it. Enter does this while connected. */
export function openChat() {
  if (!chatBox) return false;
  if (!api.snapshot().on) return false;
  chatBox.hidden = false;
  document.body.classList.add("mp-chat-open");
  setChatProblem("");
  chatInput.focus();
  drawChat();
  return true;
}

/** Close the box (Escape, or Enter on an empty line). */
export function closeChat() {
  if (!chatBox) return;
  chatBox.hidden = true;
  document.body.classList.remove("mp-chat-open");
  chatInput?.blur?.();
  if (chatFadeTimer) { clearTimeout(chatFadeTimer); chatFadeTimer = 0; }
}

export const toggleChat = () => (isChatOpen() ? closeChat() : openChat());

function drawChat() {
  if (!chatBox) return;
  const snap = api.snapshot();
  // The box is only there when multiplayer is on, and only while playing: on the title
  // screen and on a station panel it would sit over a menu that already has the screen.
  const wanted = snap.on && !state.ui.intro && !sessionIsPanelOpen();
  if (!wanted) { chatBox.hidden = true; return; }
  chatBox.hidden = false;
  chatWho.textContent = whoLine(snap);
  chatList.innerHTML = snap.chat.length
    ? snap.chat.map(line => `<p><b>${escapeHtml(line.from)}</b> ${escapeHtml(line.text)}</p>`).join("")
    : `<p class="mp-hint">Press Enter to chat.</p>`;
  chatList.scrollTop = chatList.scrollHeight;
  if (chatInput) chatInput.hidden = !isChatOpen();
  setChatProblem(chatProblem);
  // Lines fade: chat is for the moment, and a wall of old lines over the glass is clutter.
  if (chatFadeTimer) clearTimeout(chatFadeTimer);
  chatFadeTimer = setTimeout(() => {
    chatList.querySelectorAll("p").forEach(p => { p.style.opacity = "0.55"; });
  }, CHAT.lineLifeSec * 1000);
}

function sessionIsPanelOpen() {
  return !!(state.ui.starmap || state.ui.cargo || state.ui.cache || state.paused || state.ui.multiplayer);
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

function setMessage(text, kind = "hint") {
  panelView.message = String(text || "");
  panelView.messageKind = kind;
}

/** Run an async connection call with the screen saying what it is doing. */
async function withBusy(text, run) {
  panelView.busy = true;
  setMessage(text, "hint");
  draw();
  try {
    return await run();
  } catch (error) {
    return { ok: false, message: error?.message || "Something went wrong." };
  } finally {
    panelView.busy = false;
  }
}

/* ------------------------------------------------------------------------- */
/* The connection, injected so a test can drive this file                     */
/* ------------------------------------------------------------------------- */

/**
 * Everything this file asks of `net/session.js`. In the game it *is* that module; a test
 * swaps in plain functions and gets the real markup, the real decisions and the real
 * sentences with no browser, no relay and no save.
 */
let api = session;

export function setMultiplayerApi(next = null) {
  api = next ? { ...session, ...next } : session;
  drawnHtml = "";
  draw();
  return api;
}

export const multiplayerApi = () => api;

/** Test-only: the view state (the offer, the message, the half-typed fields). */
export const panelState = () => panelView;

/** Test-only: put the screen back to a cold start between cases. */
export function resetPanel() {
  panelView.message = "";
  panelView.messageKind = "hint";
  panelView.busy = false;
  panelView.offer = "";
  panelView.answer = "";
  panelView.fields = { name: null, join: "", code: "" };
  drawnHtml = "";
  chatProblem = "";
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

const escapeAttr = escapeHtml;

export { cleanName, writeSettings };
