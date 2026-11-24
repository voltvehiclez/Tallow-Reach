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
// **The rules that matter in the chat box.** Enter opens it and Escape closes it, and while
// it is open typing must not fly the ship. That is why it is a real `<input>`: `core/input.js`
// ignores keys aimed at a text field, so the rule is kept by using the platform instead of a
// second copy of it. And a panel raised by an event has to leave on its own (LESSONS L45,
// playtest 20): a line shows the box for `CHAT.autoHideSec`, **Pin** keeps it, and a
// half-written line keeps it — `chatKeepsOpen({ pin, typing, saidAt, now })` is that decision,
// so the only untested part is the timer.
//
// The screen is opened from the title menu ("Join Multiplayer World") and from the pause
// card ("Open Multiplayer"). Those are the only two front doors, and both call
// `openMultiplayer()`.
//
// Trimmed 2026-11-22 (owner's request): the screen is a simple box — a "Playing as" row, the
// one block the door offers, and a "More details" region (world id, offer/answer codes, relay
// server, connection report) that opens above the Close button. The players list and the
// "waiting for your friend" row left the card (the chat column says who is here), the hosting
// hint and the "Your world is open" popup were dropped, the teal status row is gone, and the
// message popup that says "Send the offer code…" clears itself. The relay boxes open
// pre-filled with the built-in ExpressTURN. The on/off switch is drawn like the pause card's
// sound switch (a knob), via the shared `.sw` styles.

import { state, saveCurrentGame } from "../state/state.js";
import { emit, on } from "../util/events.js";
import { readSettings, writeSettings, cleanName } from "../net/settings.js";
import * as session from "../net/session.js";
import { NET, CHAT, BUILD } from "../data/multiplayer.js";
import { clearPendingJoin, pendingJoin } from "../net/boot.js";
import { looksLikeCode } from "../net/paste.js";
import { makeJoinLink } from "../net/join-link.js";
import { showNotice } from "./notice.js";
import { relayFromFields, packRelay, builtinRelayName, builtinRelays, builtinRelayFields } from "../net/turn.js";

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
    // Step 16 slice 4: has the pilot actually crossed? The join surface shows
    // "Bring my pilot" until it has, then says so instead of offering it twice.
    brought: snap.carrying === true || snap.carriedAcked === true,
    // Playtest 17, the owner's design: after a link connects, the SAME box becomes the choice —
    // *Bring my pilot* or *Enter the world* — and nothing is loaded until one is pressed. The
    // button used to live on a screen that the join itself closed, so it was destroyed by the
    // event it existed to follow. Keep the player where he is until he has decided.
    choosing: visiting && connected && !snap.carrying && !snap.carriedAcked,
    role: snap.role || null,
    state: snap.state || "idle",
    // The switch's words follow the session (LESSONS L32). Hosting is the only thing the
    // switch can start, so an On switch always means "this world is open to guests" — plus a
    // visit, which is the one state that was invisible here (owner, playtest 17): a guest saw
    // *Off* on a control that was **disabled**, so there was no way to stop the visit from the
    // pause card at all.
    switchOn: hosting || visiting,
    // **Every state can work the switch, including a visitor** (playtest 17). A greyed switch
    // reading "On" with no way to press it is the report we are fixing. For a visitor the
    // switch is a *turn it off* control: pressing it leaves the friend's world (the same
    // `data-mp="leave"` action sits beside it, saying what will happen).
    canSwitch: !!name,
    canHost: !!name && !visiting,
    // The join block is there whenever nothing of yours is running; the button waits for
    // a name. Without this split the block drew "you are in a friend's world" to somebody
    // who had simply not typed a name yet.
    // A guest who never got through is not "in a friend's world": the paste box is exactly
    // what they need, and hiding it behind that state left them with nothing to do (playtest 6).
    joinAvailable: !hosting && (!visiting || (snap.stalled === true && snap.state !== "connected")),
    canJoin: !!name && !hosting && !visiting,
    canCodes: hosting,
    status: hosting
      ? connected ? "Hosting — another pilot is connected." : "Hosting. Waiting for your friend to join…"
      : visiting
        ? connected ? "Connected to a friend's world." : snap.line
        : "Multiplayer is off.",
    stateLine: snap.line || "",
    worldId: snap.worldId || null,
    // Nobody has appeared after the wait: the relay route is not delivering, so the screen
    // stops offering it first and offers the code path instead.
    stalled: !!snap.stalled,
    link: link?.url || "",
    hostName: snap.hostName || "",
    // The transport's facts, when there is a connection to describe. A session joined by
    // **codes** has no channel at all, so it used to have no details block either — the guest
    // could only ever say "I am alone" (owner, playtest 12). Its own wire's state and the
    // code's paths are the same kind of fact, so they are reported the same way.
    diag: snap.diag || (snap.on
      ? {
        signalling: snap.state || "idle",
        line: snap.line || "",
        useTurn: !!snap.relay,
        peers: [],
        sent: 0,
        received: 0,
        relays: null,
        clock: Date.now(),
        codesOnly: true,
        codePaths: snap.codePaths || null,
      }
      : null),
    // What the offer/answer code can do: `relay > 0` means it works across networks.
    codePaths: snap.codePaths || null,
    // The player's own relay server (settings), and whatever is in the boxes right now.
    // The boxes open holding the built-in relay (ExpressTURN), so a player never has to find
    // and retype three values the game already ships with (owner's request, 2026-11-22).
    relay: settings.relay || null,
    relayFields: {
      urls: v.fields.relayUrls ?? settings.relay?.urls ?? relayDefaults.urls,
      username: v.fields.relayUser ?? settings.relay?.username ?? relayDefaults.username,
      credential: v.fields.relayPass ?? settings.relay?.credential ?? relayDefaults.credential,
    },
    // The "relay mode" flag (the transport's own), kept apart from `relay` above: that one is
    // the player's saved server, and the two used to share a name — so a saved server read as
    // "none" and the whole relay block was a lie (found while fixing playtest 12).
    relayMode: !!snap.relay,
    guests: (snap.guests || []).slice(),
    peers: (snap.peers || []).slice(),
    // The box draws the session's lines and its own log together, oldest first.
    chat: chatLog(snap),
    surface: v.surface || "both",
    offer: hosting ? v.offer || "" : "",
    // The answer code is shown whoever is on screen: a guest who joined by code is already
    // a guest, and that is exactly when they must still be able to read the code to send.
    answer: v.answer || "",
    joinValue: v.fields.join || "",
    codeValue: v.fields.code || "",
    message: v.message || "",
    messageKind: v.messageKind || "hint",
    connectProgress: snap.connectProgress || null,
    busy: !!v.busy,
    mounted: !!root,
  };
}

/** The built-in relay as the three boxes' starting values (ExpressTURN — see `turn.js`). */
const relayDefaults = builtinRelayFields();

/** The screen's own state: what was said, what is being pasted, the pending code. */
const panelView = {
  message: "",
  messageKind: "hint",  // "hint" | "error" | "ok"
  // Whether the "More details" region is open. The offer codes, the relay server and the
  // connection details live behind it: the screen is a simple box until a player wants them
  // (owner's request, 2026-11-22).
  detailsOpen: false,
  busy: false,
  offer: "",            // the host's offer code, kept here so a redraw cannot lose it
  autoOffer: false,     // the stalled session already offered the code path, once
  answer: "",           // the guest's answer code to send back
  fields: { name: null, join: "", code: "" },
  // Which door the screen was opened from. The owner's rule (playtest 2): joining is the
  // main menu's job, hosting is the pause card's, so each door shows only its own block.
  surface: "both",      // "join" | "host" | "both" (both is only the cold model)
  // The chat box's own log: lines that never left the screen (nobody was connected) and
  // lines from earlier sessions. It is the only reason a host alone can "scroll up".
  history: [],
};

let root = null;        // #mp-screen (the whole overlay)
let chatBox = null;     // #mp-chat, bottom left
let chatInput = null;
let chatList = null;
let chatWho = null;
let chatNote = null;
let chatProblem = "";
let chatFadeTimer = 0;
// When somebody last said something (or this pilot last started typing), for the auto-hide
// clock. 0 means nothing has been said yet, so the box starts hidden: chat is for the moment,
// and a box that is always there is a box nobody reads (owner, playtest 20).
let chatSaidAt = 0;
let chatHideTimer = 0;     // takes the box away `CHAT.autoHideSec` after the last line
// Is the box *open*? Its own flag, not "does the input have the cursor": a hidden input
// cannot take the cursor, so asking the cursor first made the field stay hidden forever
// and the box untypable — the guest's half of the 2026-11-21 report.
let chatOpen = false;
let chatPinned = false;
// Auto-dismiss timer for informational message popups (the "Send the offer code…" one):
// a confirmation the player has read should clear itself, an error must not.
let msgTimer = 0;
let drawnHtml = "";     // what is currently in the card, so a no-op redraw does nothing

/** Is the chat box open (and therefore catching keystrokes)? */
export const isChatOpen = () => !!chatInput && !chatBox.hidden && !!chatOpen && document.activeElement === chatInput;

/**
 * What the box should show, with no DOM in it: the box itself while a session is on and
 * nothing else owns the screen, and the input only while the box is open.
 *
 * This is a function because getting it wrong is invisible until somebody types: the box
 * drew its lines and hid its field, and the keys went to the ship.
 */
export function chatVisibility({ on, intro, panel, open }) {
  const box = !!on && !intro && !panel;
  return { box, input: box && !!open };
}

/**
 * **Does the box stay up by itself?** (owner, playtest 20)
 *
 * Four things can keep it on screen, and nothing else may:
 *
 *   pin       the player pressed **Pin**: the box is theirs to keep, timer and all.
 *   typing    a half-written line is in the field. Hiding the box does not lose the text, but
 *             losing the *view* of what you were writing mid-sentence is still rude.
 *   fresh     somebody said something less than `CHAT.autoHideSec` ago. This is the whole
 *             point: a line arrives, the box appears so it can be read, then it goes.
 *   panel     ...never: a station panel, the title and the pause card own the screen, and a
 *             pinned box is the one exception (it is what "pin" is for).
 *
 * Pure, and it takes the clock, so a test can ask "and seven seconds later?" without timers.
 */
export function chatKeepsOpen({
  on = true,
  intro = false,
  panel = false,
  pin = false,
  typing = false,
  saidAt = 0,
  now = Date.now(),
} = {}) {
  if (!chatVisibility({ on, intro, panel, open: false }).box && !pin) return false;
  if (pin) return true;
  if (typing) return true;
  return saidAt > 0 && now - saidAt < Math.max(0, CHAT.autoHideSec) * 1000;
}

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
  on("mp-state", () => {
    draw();
    autoOfferWhenStalled();
  });
  // A line from somebody else: show the box so it is read, and give it its seven seconds.
  on("mp-chat-arrived", () => pokeChat());
  // Step 16 slice 4: the pilot crossed (or came home). The join surface stops offering
  // "Bring my pilot" and states that it is here, and the title's card is re-read.
  on("mp-away-changed", ({ away } = {}) => {
    // `net/` owns the marker on the save; `state.away` is the copy the screen reads. Set
    // here, at one boundary, rather than each screen reaching into the save. The title
    // card redraws from its own listener (`ui/menu.js`) — this file must not import the
    // menu, because the menu imports this one.
    state.away = away || null;
    draw();
  });
  // A sentence the connection wants shown. `net/` cannot reach the screen itself.
  //
  // **Two places, two different audiences** (owner, playtest 19). `setMessage` is the line
  // inside the card; `showNotice` is the one at the top of the screen, and it is the only one a
  // player sees when the screen is closed (a join that failed at boot). This is not the doubled
  // refusal he reported — that was one action raising both in `openWorld`, and it is fixed —
  // but a connection notice is genuinely meant for somebody who may not be looking at the card.
  on("mp-notice", text => {
    setMessage(text, "hint");
    showNotice(text);
  });
  /**
   * Step 16 slice 5: **the connection to the host is gone, mid-game.**
   *
   * The owner's rule (2026-11-24): *"If the host closed their game or the guest loses
   * connection to the host mid game they should be returned to the main menu with a prompt
   * saying something like lost connection to host. Dismissing this returns you to main menu.
   * Like Minecraft."*
   *
   * So there is no half-connected state and no question about a save: the session stops (the
   * room it was in is gone), the player is put back on the main menu, and the menu carries one
   * prompt that says what happened and offers one way out of it. Joining again is joining
   * again — the link still works while the host's world is the same world.
   *
   * **Quietly**, because a `bye` is a message to the host and the host is the thing that is
   * gone; and **before** the menu is shown, because the menu's own handler stops a running
   * session (that is right for a player who chose to leave, and it would also switch the
   * multiplayer switch off, which is the last thing somebody who wants to rejoin needs).
   *
   * The pilot is untouched by all of this: `state.away` and the suitcase stay as they are, so
   * `Open World` still offers to bring it home (`ui/screens.js`'s away card).
   */
  on("mp-host-left", ({ reason, hostName } = {}) => {
    panelView.offer = "";
    panelView.answer = "";
    panelView.fields.code = "";
    panelView.fields.join = "";
    const snap = api.snapshot();
    const host = hostName || snap.hostName || "";
    const said = reason || "The connection to your friend's world dropped.";
    // A player taken out of the cockpit mid-flight keeps what it had: the same courtesy the pause
    // card's *Exit to main menu* does, so losing a host cannot cost a session's flying.
    if (!state.ui.intro) saveCurrentGame();
    api.stop({ quiet: true });
    state.ui.lostHost = { hostName: host, reason: said };
    emit("main-menu", {});
    draw();
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
  on("main-menu", () => {
    closeMultiplayer();
    chatAway();
    // Hosting is something you do while flying your own world (owner's rule): at the title
    // there is no world to be in, so the room closes instead of staying open behind the menu.
    // A session that was lost is already stopped by the `mp-host-left` handler above, so by
    // here there is nothing left to close for it.
    if (api.snapshot().on) {
      api.stop();
      api.setEnabled(false);
      panelView.offer = "";
      panelView.answer = "";
      panelView.fields.code = "";
    }
  });
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

/** The pause card's row: the one button that opens the screen. */
export function multiplayerCardHtml() {
  return (
    `<section id="mp-card">` +
    `<button type="button" id="pz-mp">Open Multiplayer</button>` +
    `</section>`
  );
}

/**
 * Whether the pause card offers multiplayer at all.
 *
 * **Not in the campaign** (owner, playtest 6): a campaign act is a story with a save of its
 * own, and offering to host it there invites the question the slice cannot answer yet. A
 * live session keeps its row whatever the mode, so a player who is already connected can
 * still see what it is doing and turn it off.
 */
export const multiplayerAvailable = mode => mode !== "campaign";

/**
 * The whole card as HTML. Pure: same model in, same string out, no state touched. Every
 * control is a `data-mp` action, so the one click listener on the screen never goes stale
 * when the card is redrawn.
 */
export function screenHtml(model) {
  // One door, one block (owner's rule, playtest 2): the main menu is where you join, the
  // pause card is where you host. A guest who still has an answer code to send sees it on
  // the pause card too, because that is the only screen they can reach mid-flight.
  //
  // The offer codes, the relay server and the connection report sit behind one "More
  // details" region on every surface (owner's request, 2026-11-22): the screen is a simple
  // box — title, who you are, the one thing to do — and everything else opens on demand.
  const body = model.surface === "join"
    ? joinHtml(model) + detailsRow() + detailsHtml(model)
    : model.surface === "host"
      ? hostHtml(model) +
        (model.stalled && model.role === "guest" && !model.hosting ? joinHtml(model) : "") +
        (model.visiting || model.answer ? answerAndLeaveHtml(model) : "")
      : hostHtml(model) + joinHtml(model) + detailsRow() + detailsHtml(model);
  return (
    `<h1 id="mp-title">Multiplayer</h1>` +
    // The teal status row ("Multiplayer is off." / "Hosting. Waiting for your friend to
    // join…") is gone: the switch, the link box and the chat column say the same thing, and
    // the row repeated it on every door (owner's request, 2026-11-22).
    messageHtml(model) +
    nameHtml(model) +
    body +
    `<div class="mp-row"><button type="button" class="mp-close" data-mp="close">Close</button></div>`
  );
}

/** The one button that opens the details region. */
function detailsRow() {
  return `<div class="mp-row"><button type="button" data-mp="details">More details</button></div>`;
}

/**
 * Everything a player only wants sometimes: the world id, the offer/answer codes, the relay
 * server and the connection report. Hidden behind "More details" — the screen below it is
 * the simple box, and the extra UI opens above the Close button when it is pressed. The relay
 * block is rendered here, not inside `diagHtml`: it is wanted even when there is no session
 * to report on, and a block should be drawn by exactly one place.
 */
function detailsHtml(model) {
  return (
    `<section class="mp-block" id="mp-details"${panelView.detailsOpen ? "" : " hidden"}>` +
    // The build, in the open (playtest 17): two machines on different builds cannot talk, and
    // a player on an old download needs to be able to say so without opening a console.
    `<p class="mp-hint">Build ${escapeHtml(BUILD)}</p>` +
    `<div class="mp-row"><button type="button" data-mp="copy-world">Copy world id</button></div>` +
    codesHtml(model) + relayServerHtml(model) + diagHtml(model) +
    `</section>`
  );
}

function messageHtml(model) {
  // Always present, so a refusal is never drawn into an element that is not on screen.
  const prog = panelView.busy && model.connectProgress ? model.connectProgress : null;
  const bar = prog
    ? `<div class="mp-progress" role="progressbar" aria-valuenow="${prog.pct}" aria-valuemin="0" aria-valuemax="100">` +
      `<div class="mp-progress-bar" style="width:${prog.pct}%"></div></div>` +
      `<p class="mp-hint">${escapeHtml(prog.label)} (${prog.pct}%)</p>`
    : "";
  return `<p id="mp-msg" class="mp-msg is-${escapeAttr(model.messageKind)}"${model.message ? "" : " hidden"}>` +
    `${escapeHtml(model.message)}</p>${bar}`;
}

function nameHtml(model) {
  // One row: who is playing. The name is the pilot's own; "Playing as X" says it (owner's
  // request, 2026-11-22 — the separate "Your name" row said it twice).
  return (
    `<section class="mp-block">` +
    `<p class="mp-hint">Playing as <b>${escapeHtml(model.nameValue || "Pilot")}</b>.</p>` +
    `</section>`
  );
}

function hostHtml(model) {
  // A visitor needs a way out that is not "find the Leave button in the join block", because
  // the join block is hidden on the pause surface. This is the same `data-mp="leave"` action,
  // placed where the player is looking when they go to turn multiplayer off (playtest 17).
  const leaveRow = model.visiting
    ? `<div class="mp-row"><button type="button" data-mp="leave">Leave ${escapeHtml(model.hostName ? model.hostName + "'s world" : "your friend's world")}</button></div>` +
      `<p class="mp-hint">Leaving stops the connection. Your pilot stays where it is until you bring it home.</p>`
    : "";
  const switchHtml =
    `<button type="button" class="sw mp-switch" data-mp="host" role="switch" ` +
    `aria-checked="${model.switchOn ? "true" : "false"}"` +
    // Why a switch that cannot do anything is still pressable (owner, playtest 17): he asked
    // for a popup saying a username is needed, and **a `disabled` button receives no click at
    // all**, so the refusal could never be shown. The switch is the first control on the card;
    // a press that cannot be honoured answers in words instead of silently doing nothing.
    (model.canSwitch ? "" : ` aria-disabled="true"`) +
    `>` +
    `<i></i><span>${model.switchOn ? "Multiplayer: On" : "Multiplayer: Off"}</span></button>` +
    leaveRow;
  // The hosting hint ("send the link below…") is gone: the link row says "send this to your
  // friend" and the message popup says it too, so a third copy of the same sentence was noise
  // (owner's request, 2026-11-22).
  const hint = model.visiting
    ? "You are in a friend's world. Leave it first to host your own."
    : !model.nameSet
      // The only username box in the game is on the title menu, so the hint names the
      // journey rather than a field ("above" pointed at nothing — playtest 17).
      ? "You need a username before multiplayer can be turned on. It is on the main menu."
      : !model.hosting
        ? "Turns this world into a room and makes a link to send to a friend."
        : "";
  // The details region belongs to this block only on the host surface; on the cold "both"
  // model screenHtml appends one region after the join block instead, so it is never drawn
  // twice.
  const own = model.surface === "host";
  return (
    `<section class="mp-block">` +
    `<h2>Host your world</h2>` +
    switchHtml +
    (hint ? `<p class="mp-hint">${escapeHtml(hint)}</p>` : "") +
    // Hosting: the copy buttons carry their own "More details". Not hosting: a plain button.
    (model.hosting ? linkHtml(model) : own ? detailsRow() : "") +
    (own ? detailsHtml(model) : "") +
    `</section>`
  );
}

function linkHtml(model) {
  return (
    `<label class="mp-label">Join link — send this to your friend` +
    `<input class="mp-input" id="mp-link" readonly data-mp-select value="${escapeAttr(model.link)}"></label>` +
    `<div class="mp-row">` +
    `<button type="button" data-mp="copy-link">Copy link</button>` +
    `<button type="button" data-mp="details">More details</button>` +
    `</div>`
  );
}

function codesHtml(model) {
  if (!model.offer) {
    return (
      (model.stalled
        ? `<p class="mp-hint mp-warn">Nobody has appeared in your room. The server route is not reaching your friend, so use the codes: they go through a chat window and need no server at all.</p>`
        : `<p class="mp-hint">No relay, or your friend cannot join by link? Make a code instead — a code goes through this chat window, not through any server.</p>`) +
      `<div class="mp-row"><button type="button" data-mp="offer">No relay? Copy/paste codes</button></div>`
    );
  }
  return (
    codePathsHtml(model) +
    `<label class="mp-label">1. Offer code — send this to your friend` +
    `<textarea class="mp-code" id="mp-offer" readonly rows="3" data-mp-select>${escapeHtml(model.offer)}</textarea></label>` +
    `<div class="mp-row"><button type="button" data-mp="copy-offer">Copy offer code</button></div>` +
    `<label class="mp-label">2. Their answer code — paste it here` +
    `<textarea class="mp-code" data-mp-field="code" rows="3" placeholder="TRJOIN:…">${escapeHtml(model.codeValue)}</textarea></label>` +
    `<div class="mp-row"><button type="button" data-mp="finish">Connect</button>` +
    `<button type="button" data-mp="reset-offer">Start again</button></div>`
  );
}

/**
 * One line about what the code in front of the player can do.
 *
 * A code is a list of network paths. Two machines on the same wifi can use local ones; a
 * phone on 4G and a PC at home cannot — they need a path through a TURN server. Without this
 * line, "it worked at home and not on my phone" has no explanation anywhere on screen.
 */
function codePathsHtml(model) {
  const paths = model.codePaths;
  if (!paths) return "";
  if (paths.relay > 0) {
    return `<p class="mp-hint">This code carries a relay path, so it works between different networks (a phone on 4G included).</p>`;
  }
  return (
    `<p class="mp-hint mp-warn">This code has no relay path — only local addresses — so it only works between machines on the same network. ` +
    `Both machines need to reach a TURN server for it to work across the internet; if this keeps happening, send me the Connection details.</p>`
  );
}

/** The answer code and the way out — the two things a guest needs mid-flight. */
function answerAndLeaveHtml(model) {
  return (
    `<section class="mp-block"><h2>You are in a friend's world</h2>` +
    answerHtml(model) +
    `<div class="mp-row"><button type="button" data-mp="leave">Leave</button></div>` +
    `</section>`
  );
}

function answerHtml(model) {
  return model.answer
    ? `<label class="mp-label">Answer code — send this back to your friend` +
      `<textarea class="mp-code" id="mp-answer" readonly rows="3" data-mp-select>${escapeHtml(model.answer)}</textarea></label>` +
      `<div class="mp-row"><button type="button" data-mp="copy-answer">Copy answer code</button></div>`
    : "";
}

function joinHtml(model) {
  const answer = answerHtml(model);
  if (!model.joinAvailable) {
    const why = model.hosting
      ? "Stop hosting to join a friend's world."
      : "You are in a friend's world. Press Leave to stop.";
    return (
      `<section class="mp-block"><h2>Join a friend's world</h2>` +
      `<p class="mp-hint">${escapeHtml(why)}</p>` +
      answer +
      // Step 16 slice 4: the press that puts the PILOT on the wire. Joining only looks
      // around a friend's world; this is what freezes the pilot at home and sends its
      // ship, hold, credits and lockers across. Worded as the plan words it.
      // **Playtest 17, the owner's design.** Once the link connects, this same box becomes the
      // choice: *Bring my pilot* (send the pilot, then enter) or *Enter the world* (look around
      // first). Nothing is loaded until one is pressed — the join used to close this screen and
      // load the world before the player could answer, which is how the button came to be
      // destroyed by the very event it was meant to follow.
      (model.choosing
        ? `<p class="mp-hint mp-connected">Connected to ${escapeHtml(model.hostName || "your friend's world")}.` +
          ` Choose what to do:</p>` +
          `<div class="mp-row"><button type="button" class="go" data-mp="bring">Bring my pilot</button></div>` +
          `<p class="mp-hint">It takes your ship, hold, credits and station lockers across, and your own ` +
          `galaxy pauses until it comes home. Bringing it home works even if your friend is offline.</p>` +
          `<div class="mp-row"><button type="button" data-mp="join-world">Enter the world without my pilot</button></div>` +
          `<p class="mp-hint">You can look around and chat. Your pilot stays at home until you bring it.</p>`
        : "") +
      // **The pilot is here, so this world is not** (playtest 20, A3). While the pilot is away its
      // own galaxy is paused — entering it would fly a hull whose cargo is in a suitcase in
      // somebody else's galaxy — so the screen does not offer a button it would have to refuse.
      // It says where the pilot is and how to get it home, and the **Leave** row below is the way
      // off this screen (LESSONS L41/L42).
      (model.visiting && model.brought && !model.choosing
        ? (state.away
          ? `<p class="mp-hint mp-connected">Your pilot is here: its ship, hold and credits came with it.</p>` +
            `<p class="mp-hint">Your own galaxy is paused where you left it, and opens the ` +
            `moment the pilot is home. <strong>Leave</strong> this visit, then press ` +
            `<strong>Open World</strong> on the main menu to bring it home.</p>`
          : `<p class="mp-hint mp-connected">Your pilot is here: its ship, hold and credits came with it.</p>` +
            `<div class="mp-row"><button type="button" class="go" data-mp="join-world">Enter the world</button></div>`)
        : "") +
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
    answer +
    `</section>`
  );
}

/**
 * What the connection is actually doing, as facts rather than a mood.
 *
 * This exists because "you are the only one there" is not a diagnosis. The two facts that
 * separate the possible causes are **how many browsers are in the room** and **how many
 * messages each side has sent and received**, so both are on screen and both are in the
 * report a player can copy:
 *
 *   - one browser in the room, on both machines → they are not in the same room (a different
 *     world id, or one of them is not hosting) — nothing to do with the network path;
 *   - two in the room, sent climbing, received 0 → the room is right and the path is not;
 *   - different Build strings → the two machines are not running the same file.
 */
export function diagFacts(model) {
  const d = model.diag;
  if (!d) return null;
  const peers = d.peers || [];
  const first = peers[0] || null;
  return {
    build: BUILD,
    worldId: model.worldId || "(none)",
    role: model.role || "none",
    signalling: d.signalling || "unknown",
    signallingLine: d.line || "",
    inRoom: peers.length + 1,          // the room always contains this browser
    direct: first
      ? `${first.connection || "unknown"}${first.ice ? ` (${first.ice})` : ""}`
      : "",
    relay: !!d.useTurn,
    relays: d.relays && (d.relays.total || d.relays.connected) ? d.relays : null,
    clock: Number(d.clock) || 0,
    codePaths: d.codePaths || model.codePaths || null,
    codesOnly: !!d.codesOnly,
    sent: Number(d.sent) || 0,
    received: Number(d.received) || 0,
    waiting: !!model.hosting && peers.length > 0 && !(model.guests || []).length,
  };
}

/** The details as one block of text a player can copy and send to somebody who can help. */
export function diagReport(model) {
  const f = diagFacts(model);
  if (!f) return "Tallow Reach connection report\n(no connection is open)";
  return [
    "Tallow Reach connection report",
    `Build: ${f.build}`,
    `World id: ${f.worldId}`,
    `Role: ${f.role}`,
    `Signalling: ${f.signalling}${f.signallingLine ? ` — ${f.signallingLine}` : ""}`,
    ...(f.codesOnly ? [] : [`Browsers in the room: ${f.inRoom}`]),
    ...(f.codesOnly ? [] : [`Direct link: ${f.direct || "no other browser is in the room"}`]),
    `Relay mode: ${f.relay ? "on (a public relay server)" : "off (direct only)"}`,
    ...(f.relays && f.relays.total > 0 ? [`Relays reachable: ${f.relays.open} of ${f.relays.total}`] : []),
    ...(f.relays && Number.isFinite(f.relays.connected) ? [`Relays connected: ${f.relays.connected}`] : []),
    ...(f.codePaths ? [`Code paths: ${f.codePaths.host} local, ${f.codePaths.srflx} public, ${f.codePaths.relay} relay`] : []),
    `Messages sent ${f.sent}, received ${f.received}`,
    ...(f.clock ? [`This machine's clock: ${new Date(f.clock).toISOString()}`] : []),
  ].join("\n");
}

function diagHtml(model) {
  const f = diagFacts(model);
  if (!f) return "";
  const link = f.direct ? `Direct link: ${f.direct}` : "Direct link: no other browser in the room yet";
  return (
    `<section class="mp-block mp-diag"><h2>Connection details</h2>` +
    `<ul class="mp-facts">` +
    `<li>Build: ${escapeHtml(f.build)}</li>` +
    `<li>World id: ${escapeHtml(f.worldId)}</li>` +
    `<li>Signalling: ${escapeHtml(f.signalling)}${f.signallingLine ? ` — ${escapeHtml(f.signallingLine)}` : ""}</li>` +
    (f.codesOnly ? "" : `<li>Browsers in the room: ${f.inRoom}</li><li>${escapeHtml(link)}</li>`) +
    `<li>Relay mode: ${f.relay ? "on (a public relay server)" : "off (direct only)"}</li>` +
    (f.relays && f.relays.total > 0 ? `<li>Relays reachable: ${f.relays.open} of ${f.relays.total}</li>` : "") +
    (f.relays && Number.isFinite(f.relays.connected)
      ? `<li>Relays connected: ${f.relays.connected}</li>`
      : "") +
    (f.codePaths
      ? `<li>Code paths: ${f.codePaths.host} local, ${f.codePaths.srflx} public, ${f.codePaths.relay} relay</li>`
      : "") +
    `<li>Messages sent ${f.sent}, received ${f.received}</li>` +
    (f.clock ? `<li>This machine's clock: ${escapeHtml(new Date(f.clock).toISOString().replace("T", " ").slice(0, 19))} UTC</li>` : "") +
    `</ul>` +
    (f.waiting
      ? `<p class="mp-hint mp-warn">A browser is in the room but has not identified itself. If this stays for more than a few seconds, the connection between the two machines is being blocked.</p>`
      : "") +
    (f.relays && f.relays.total > 0 && f.relays.open === 0
      ? `<p class="mp-hint mp-warn">None of the servers that introduce players to each other answered this browser. Your network is blocking them, so the two machines cannot find each other this way. Use the codes instead: “No relay? Copy/paste codes” below.</p>`
      : f.relays && Number.isFinite(f.relays.connected) && f.relays.connected === 0
        ? `<p class="mp-hint mp-warn">The relays answered, but none of them would carry this game's messages, so no other player can find you through them. Use the codes instead: “No relay? Copy/paste codes” below — they need no relay at all.</p>`
        : "") +
    (f.inRoom === 1 && !f.waiting
      ? `<p class="mp-hint">No other browser is in this room. Check that the other player turned Open Multiplayer on, and that both screens show the same World id.</p>`
      : "") +
    `<div class="mp-row">` +
    `<button type="button" data-mp="reconnect">Reconnect</button>` +
    `<button type="button" data-mp="copy-diag">Copy details</button>` +
    `</div>` +
    `<p class="mp-hint">If received stays 0 while sent climbs, the two browsers cannot hear each other. Reconnect tries through a relay server.</p>` +
    `</section>`
  );
}

/**
 * The relay server: what is in use, and three fields to replace it.
 *
 * The game brings its own relay (`ICE.turn` — ExpressTURN's free tier, measured working over
 * 4G on 2026-11-22), so a fresh install needs nothing here. This block exists for the two
 * things a built-in server cannot promise: it can stop answering (a free tier has a data cap),
 * and a player may have a better one. Theirs is used first. **Test** asks the servers for a
 * relayed address, which is the only honest answer to "is it them or is it me".
 */
function relayServerHtml(model) {
  const builtin = builtinRelays();
  const doors = builtin.flatMap(entry => entry.urls).length;
  const saved = model.relay
    ? escapeHtml(model.relay.urls)
    : `${escapeHtml(builtinRelayName())} — nothing to set up` + (doors ? ` (${doors} addresses)` : "");
  return (
    `<h2>Relay server</h2>` +
    `<p class="mp-hint">The game brings its own relay, so a link or a code already crosses networks — a phone ` +
    `on 4G and a PC at home included. Fill these in only to use a server of your own (a provider gives an ` +
    `address, a username and a credential); yours is tried before the built-in one.</p>` +
    `<p class="mp-hint">In use: ${saved}${model.codePaths && model.codePaths.relay === 0
      ? ` — but the last code had <strong>no relay path</strong>, so ${model.relay ? "that server" : "the built-in one"} did not answer. Press Test relay servers.`
      : ""}</p>` +
    `<p class="mp-hint">Paste the whole block your provider gave you into the first box (or a <code>TRTURN:</code> ` +
    `line from another machine) and press Save relay — the username and credential in it are read out for you. ` +
    `An address with no <code>turn:</code> in front is fine. Several addresses work too, separated by commas: ` +
    `<code>turn:host:3478, turn:host:3478?transport=tcp, turns:host:5349</code> — the TCP and TLS ones are what a ` +
    `phone on 4G usually needs, because it often blocks UDP.</p>` +
    `<label class="mp-label">Relay address (turn: or turns:)<input class="mp-input" data-mp-field="relayUrls" ` +
    `value="${escapeAttr(model.relayFields.urls)}" placeholder="turn:global.relay.metered.ca:80" spellcheck="false"></label>` +
    `<label class="mp-label">Username<input class="mp-input" data-mp-field="relayUser" ` +
    `value="${escapeAttr(model.relayFields.username)}" autocomplete="off" spellcheck="false"></label>` +
    `<label class="mp-label">Credential<input class="mp-input" data-mp-field="relayPass" ` +
    `value="${escapeAttr(model.relayFields.credential)}" autocomplete="off" spellcheck="false"></label>` +
    `<div class="mp-row">` +
    `<button type="button" data-mp="save-relay">Save relay</button>` +
    `<button type="button" data-mp="test-relay">Test relay servers</button>` +
    `<button type="button" data-mp="clear-relay">Use the built-in relay</button>` +
    (model.relay ? `<button type="button" data-mp="copy-relay">Copy relay settings</button>` : "") +
    `</div>`
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
    case "host":
      // The owner's rule (playtest 2): hosting is the pause card's job. The switch is not
      // drawn on the title's screen at all, so this is the second lock on the same door.
      if (panelView.surface === "join") {
        setMessage("Turn multiplayer on from the pause menu (P), once you are in your own world.", "error");
        draw();
        return false;
      }
      return toggleHosting();
    case "join":
      if (panelView.surface === "host") {
        setMessage("Joining a friend's world is done from the main menu — quit to it and press Join Multiplayer World.", "error");
        draw();
        return false;
      }
      return joinFromBox();
    // Step 16 slice 4: the pilot crosses here, not when the world loads.
    case "bring": {
      const done = session.bringPilot();
      setMessage(done.message, done.ok ? "" : "error");
      draw();
      return done.ok;
    }
    // "Enter the world" — the second half of the owner's join box (playtest 17). Loading the
    // world is a SEPARATE press from joining now, so a guest who only wants to chat never
    // leaves this screen, and a guest who brought a pilot gets in with one press.
    //
    // For now "the world" is the guest's OWN galaxy: the wire carries no ship or world state
    // (slices 7 and 8), so both players are in their own worlds and share chat and the pilot.
    // That is deliberate and is what this placeholder is for — it lets the UI be tested.
    case "join-world": {
      if (!screenModel().visiting) {
        setMessage("Join a friend's world first.", "error");
        draw();
        return false;
      }
      // A pilot that is away cannot enter its own world (playtest 20, A3): there is no shared
      // world on the wire yet (slice 8), so "the world" here would be the pilot's own galaxy —
      // which is paused while its travelling half is in a suitcase somewhere else. This screen is
      // the one place that can say so and still hand the player the way home, so it answers with
      // the sentence instead of closing onto a title screen with no explanation.
      if (state.away) {
        const where = state.away?.hostName ? `${state.away.hostName}'s world` : "a friend's world";
        setMessage(`Your pilot is in ${where}, so your own galaxy is paused where you left it. Leave this visit, then press Open World on the main menu to bring the pilot home — your own world opens the moment it is home.`, "error");
        draw();
        return false;
      }
      closeMultiplayer();
      emit("mp-enter-world", {});
      draw();
      return true;
    }
    case "leave": return leaveSession();
    case "save-relay": {
      const relay = relayFromFields(screenModel().relayFields);
      if (!relay) {
        setMessage("A relay server needs all three: its address, a username and a credential.", "error");
        draw();
        return false;
      }
      api.saveRelay(relay);
      panelView.fields.relayUrls = undefined;
      panelView.fields.relayUser = undefined;
      panelView.fields.relayPass = undefined;
      setMessage("Relay server saved. Press Start again to make a new offer code — a code carries the servers that existed when it was made.", "ok");
      draw();
      return true;
    }
    case "clear-relay": {
      api.saveRelay(null);
      panelView.fields.relayUrls = undefined;
      panelView.fields.relayUser = undefined;
      panelView.fields.relayPass = undefined;
      setMessage("Using the built-in relay again.", "hint");
      draw();
      return true;
    }
    case "copy-relay": {
      const packed = packRelay(screenModel().relay);
      if (!packed) { setMessage("Save a relay server first.", "error"); draw(); return false; }
      const done = await copyText(packed);
      setMessage(done ? "Relay settings copied. Paste them into the same box on the other machine." : "Could not copy. The three fields are on screen.", done ? "ok" : "error");
      draw();
      return true;
    }
    case "test-relay": {
      setMessage("Asking the relay servers for an address — this takes a few seconds…", "hint");
      draw();
      api.testTurn().then(result => {
        setMessage(result?.sentence || "The relay servers did not answer.", result?.ok ? "ok" : "error");
        draw();
      });
      return true;
    }
    case "reconnect": {
      // Re-ask the relays as well: this button is pressed exactly when the answer matters.
      session.checkRelays?.({ force: true });
      return retryConnection();
    }
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
    case "copy-diag": {
      const report = diagReport(screenModel());
      const done = await copyText(report);
      setMessage(done ? "Copied. Send that to whoever is helping." : "Your browser would not copy for us. Select the details above and press Ctrl+C.",
        done ? "ok" : "hint");
      draw();
      return done;
    }
    case "details":
      // One region, one toggle: the offer codes, the relay server and the connection report
      // open above the Close box and close again. A redraw rebuilds the region from
      // `panelView.detailsOpen`, so the state lives in the model, not the DOM.
      panelView.detailsOpen = !panelView.detailsOpen;
      draw();
      return true;
    case "close":
      closeMultiplayer();
      return true;
    default:
      return false;
  }
}

async function toggleHosting() {
  const model = screenModel();
  // **The switch's one job is the thing it names** (LESSONS L32, and playtest 17):
  //   visiting     -> off, which means leaving the friend's world. A guest used to see a
  //                   DISABLED switch reading Off with no other way out from the pause card.
  //   hosting      -> off, closing the room.
  //   anything else-> on, which opens the room. One press, as it has always been.
  if (model.visiting) {
    const away = state.away;
    leaveSession();
    setMessage(away
      ? "Left your friend's world. Your pilot is still there — bring it home from the main menu."
      : "Left your friend's world.", "hint");
    draw();
    return true;
  }
  if (model.hosting) {
    api.stop();
    api.setEnabled(false);
    panelView.offer = "";
    panelView.fields.code = "";
    setMessage("Your world is closed.", "hint");
    draw();
    return true;
  }
  return openWorld();
}

/** Open the world and make the link. The switch's second press, and the pause card's door. */
async function openWorld() {
  const model = screenModel();
  // The owner's rule, enforced here as well as by the disabled switch: no name, no world.
  if (!model.nameSet) {
    // **One refusal, in one place** (owner, playtest 19: *"Opening multiplayer in pause menu
    // without a username shows a teal pop up and a red pop up. The red one is enough, the teal
    // one at the top is just unnecessary info."*).
    //
    // It used to raise both: a notice at the top of the screen AND the red line in the card,
    // saying the same thing twice. The card's own line stays — it sits next to the switch that
    // caused it, stays until it is replaced, and reaches a screen reader through the card.
    // `showNotice` also swallows routine confirmations, so it was never the reliable half.
    setMessage("No username yet. Set one on the main menu — \"Exit to main menu\" is at the bottom of this card.", "error");
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
  setMessage("", "hint");
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
  writeSettings({ ...readSettings(), lastJoin: text });
  panelView.fields.join = text;
  setMessage("Joined. Press Enter to chat.", "ok");
  afterJoined();
  draw();
  return true;
}

/** A guest who just joined: get out of the way so the world (or the menu) is playable. */
/**
 * A guest who just joined. **It no longer enters the world** (owner, playtest 17).
 *
 * This is the line that made the "Bring my pilot" prompt unusable: entering the world closed
 * the multiplayer screen, so the button that lived on it was destroyed by the join, and the
 * player arrived with no pilot and no way to send one. The owner's design is that the join box
 * stays up after connecting and offers the two choices, so this only makes sure the box is
 * showing them.
 */
function afterJoined() {
  if (!state.ui.intro) return;
  // The screen is already open — it is where the player pressed Join. It just needs to know
  // that the connection is now live, which `mp-state` does; the redraw shows the choice.
  setMessage("Connected. Bring your pilot, or enter the world without it.", "ok");
  draw();
}

async function retryConnection() {
  if (!api.snapshot().on) {
    setMessage("Multiplayer is off — there is nothing to reconnect.", "error");
    draw();
    return false;
  }
  const done = await withBusy("Reconnecting through a relay — this can take a few seconds…", () => api.reconnect());
  setMessage(done ? "Reconnected. Give it a few seconds for the other pilot to answer." : "Could not reconnect. Try the paste codes.", done ? "ok" : "error");
  draw();
  return !!done;
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

/**
 * The relay route has failed to produce anybody: make the code, without being asked.
 *
 * The owner's playtest 6 ran out of patience with a button called "No relay? Copy/paste
 * codes" while nobody was in the room — a player reads the state line, not the footnote.
 * So when the session says it is stalled and the screen is open on the host's block, the
 * offer appears by itself and the message says what to do with it. Once per screen opening,
 * so a slow code cannot turn into a loop.
 */
function autoOfferWhenStalled() {
  if (panelView.autoOffer || panelView.offer) return;
  if (!isMultiplayerScreenOpen()) return;
  const model = screenModel();
  if (!model.stalled || !model.hosting || !model.nameSet || model.visiting) return;
  panelView.autoOffer = true;
  makeOffer();
}

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
  setMessage("Send the offer code to your friend. Paste their answer below and press Connect.", "ok", 6);
  draw();
  return true;
}

async function finishOffer() {
  const code = String(panelView.fields.code || "").trim();
  if (!panelView.offer) {
    setMessage("Make an offer first: press “No relay? Copy/paste codes”.", "error");
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
    if (String(field.dataset.mpField).startsWith("relay")) queueRelaySave();
    // Typing a name enables both front doors. That is done in place: a full redraw under
    // the player's cursor at every keystroke is how a name field becomes unusable.
    if (field.dataset.mpField === "name") refreshLiveness();
  });
  // A name is committed when the player leaves the field, not on every keystroke.
  //
  // **In place, never a redraw.** Clicking a button blurs the field first, so committing the
  // name used to replace `#mp-card-inner` between mousedown and mouseup: the button under the
  // cursor was destroyed and the click never happened. That is why the first Join press on a
  // fresh browser did nothing and the second one worked (owner's playtest 3).
  root.addEventListener("change", event => {
    const field = event.target.closest?.("[data-mp-field]");
    if (field?.dataset.mpField !== "name") return;
    const result = api.setUsername(String(field.value || ""));
    if (!result?.ok) setMessage(result?.message || "Type a name first.", "error");
    else panelView.fields.name = result.name;
    refreshLiveness();
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
  // The message travels with the rest: a refusal raised by the field commit has to be seen,
  // and this path deliberately does not redraw.
  const msg = root.querySelector("#mp-msg");
  if (msg) {
    msg.textContent = model.message;
    msg.hidden = !model.message;
    msg.className = `mp-msg is-${model.messageKind}`;
  }
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

/**
 * Save the relay server as it is typed, not only when the button is pressed.
 *
 * The owner's playtest 12 typed ExpressTURN's three values, made a code, and the details still
 * said "In use: none" — the code carried local addresses and 4G had no chance. A setting that
 * only exists after a deliberate press is a setting that will be missing when it matters, so a
 * complete entry is saved 600 ms after the last keystroke, and the screen says so.
 */
let relaySaveTimer = 0;
function queueRelaySave() {
  if (relaySaveTimer) clearTimeout(relaySaveTimer);
  relaySaveTimer = setTimeout(() => {
    relaySaveTimer = 0;
    const relay = relayFromFields(panelView.fields);
    const saved = readSettings().relay || null;
    if (!relay) return;
    const same = saved && saved.urls === relay.urls.join(",") && saved.username === relay.username && saved.credential === relay.credential;
    if (same) return;
    api.saveRelay(relay);
    // A code carries the servers that existed when it was made, so an offer made before the
    // relay was saved cannot use it. Remaking it here is the difference between "saved" and
    // "saved, and the code you are holding still cannot cross a network".
    if (panelView.offer) {
      setMessage("Relay server saved. Making a new offer code with it…", "hint");
      draw();
      makeOffer();
      return;
    }
    setMessage("Relay server saved. Make a new code to use it.", "ok");
    draw();
  }, 600);
}

/** Put the current model on the screen. A no-op when nothing the player can see changed. */
function draw() {
  if (!root) return;
  if (!isMultiplayerScreenOpen()) return;
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
}

/* ------------------------------------------------------------------------- */
/* Opening and closing                                                        */
/* ------------------------------------------------------------------------- */

/**
 * Show the screen. `focus` names a field to put the cursor in ("join" for a player who
 * came here from a link, "name" when there is no name yet). Safe to call twice.
 */
export function openMultiplayer({ focus = "", from = "" } = {}) {
  // The door decides the block: the title menu joins, the pause card hosts (owner's rule,
  // playtest 2). A caller that names no door keeps both blocks, which is only the cold
  // model a test builds. Set before the DOM guard, so the rule holds with no screen built.
  panelView.surface = from === "menu" ? "join" : from === "pause" ? "host" : "both";
  panelView.autoOffer = false;
  // The relay boxes open holding the relay the game brings (ExpressTURN) unless the player
  // saved one of their own — seeded into the model, not only into the display, so Save and
  // the automatic save see a complete three-value entry (owner's request, 2026-11-22).
  const seed = readSettings().relay || relayDefaults;
  panelView.fields.relayUrls ??= seed.urls;
  panelView.fields.relayUser ??= seed.username;
  panelView.fields.relayPass ??= seed.credential;
  if (!root) return false;
  // A link found at boot, waiting for a name: put it in the join box so the player only
  // has to type a name and press Join.
  const waiting = pendingJoin();
  if (waiting && !panelView.fields.join) panelView.fields.join = makeLinkFrom(waiting) || "";
  root.hidden = false;
  state.ui.multiplayer = true;
  // The chat box and a menu cannot both own the keyboard.
  closeChat();
  chatOpen = false;
  drawnHtml = "";               // force a fresh draw after being away
  draw();
  // Ask the signalling relays how they are, so Connection details can say it. Fire-and-forget:
  // the answer redraws the screen when it arrives and nothing waits on it.
  session.checkRelays?.({ force: true });
  const model = screenModel();
  const where = focus || (!model.nameSet ? "name" : waiting ? "join" : "");
  if (where) focusField(where === "join" ? "join" : where);
  return true;
}

/** Hide the screen (and hand the keyboard back). */
export function closeMultiplayer() {
  if (msgTimer) { clearTimeout(msgTimer); msgTimer = 0; }
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
  // Two columns: the lines on the left, a compact list of who is here on the right.
  chatBox.innerHTML =
    `<div id="mp-chat-main">` +
    `<div id="mp-chat-lines"></div>` +
    `<p id="mp-chat-note" hidden></p>` +
    `<input id="mp-chat-input" maxlength="${NET.chatLineMax}" placeholder="Say something…  (Enter sends, Esc closes)" autocomplete="off">` +
    `</div>` +
    `<aside id="mp-chat-who" aria-label="Who is here"></aside>` +
    `<button type="button" id="mp-chat-pin" title="Keep chat visible">Pin</button>`;
  document.body.appendChild(chatBox);
  chatInput = chatBox.querySelector("#mp-chat-input");
  chatList = chatBox.querySelector("#mp-chat-lines");
  chatWho = chatBox.querySelector("#mp-chat-who");
  chatNote = chatBox.querySelector("#mp-chat-note");
  const pinBtn = chatBox.querySelector("#mp-chat-pin");
  pinBtn?.addEventListener("mousedown", e => e.preventDefault());
  pinBtn?.addEventListener("click", () => {
    chatPinned = !chatPinned;
    pinBtn.classList.toggle("is-pinned", chatPinned);
    // Said out loud as well as coloured: the amber border is a hint, the word is the answer
    // to "did that do anything?" (owner, playtest 20 — the box was staying up forever).
    pinBtn.textContent = chatPinned ? "Pinned" : "Pin";
    pinBtn.setAttribute("aria-pressed", chatPinned ? "true" : "false");
    pokeChat();
  });

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
  // Cleared when it went, and when it only went on this screen: a line already in the list
  // must not also be left sitting in the field (pressing Enter again would send it twice).
  if (result.sent || result.echoed) chatInput.value = "";
  setChatProblem(result.problem);
  // Your own line counts as news too: it stays up long enough to see that it went.
  pokeChat();
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
  if (!line) return { sent: false, echoed: false, problem: "" };
  const snap = api.snapshot();
  if (api.say(line)) return { sent: true, echoed: false, problem: "" };
  if (!snap.on) return { sent: false, echoed: false, problem: "Multiplayer is off." };
  // Nobody to hear it: the line still goes on this screen, and the note says who can see
  // it. A host waiting for the first guest can type, read it back, and keep talking; the
  // line lives in the box's own log, which is what survives the session.
  noteHistory({ from: snap.name || readSettings().name || "You", text: line, at: Date.now(), own: true });
  // Two different sentences, because they are two different problems: nobody there yet,
  // or somebody there that could not be reached.
  const problem = snap.state === "connected"
    ? "Not sent — the other pilot could not be reached."
    : "Only you are here so far — nobody else will see this.";
  return { sent: false, echoed: true, problem };
}

/**
 * The box's log: the session's recent lines and the ones only ever shown here, oldest
 * first, without duplicates. `CHAT.historyLines` is what "scroll up" means in practice.
 */
function chatLog(snap = api.snapshot()) {
  const all = [...panelView.history, ...(snap.chat || []).slice()];
  const seen = new Set();
  const out = [];
  for (const line of all) {
    if (!line || typeof line.text !== "string") continue;
    const key = `${line.at}|${line.from}|${line.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  out.sort((a, b) => (a.at || 0) - (b.at || 0));
  return out.slice(-(CHAT.historyLines || 40));
}

/** Keep one line that only this screen has. */
function noteHistory(line) {
  panelView.history.push(line);
  const cap = CHAT.historyLines || 40;
  while (panelView.history.length > cap) panelView.history.shift();
  return line;
}

/**
 * The pilots in the box's column: you first, then the host, then every guest — never twice.
 *
 * The host is the row that was missing: the guest list only ever carries *guests*, so a
 * guest built its column from "me" plus "me, as the host sees me" and saw one row while it
 * could read the host's chat (owner's playtest 3). `hostName` is learnt from the welcome.
 */
export function chatWhoRows(snap) {
  const names = [];
  for (const name of [snap?.name, snap?.hostName, ...((snap?.guests || []).map(entry => entry.name))]) {
    const clean = String(name ?? "").trim();
    if (clean && !names.includes(clean)) names.push(clean);
  }
  return names.length ? names : ["Pilot"];
}

/** One small row per pilot. Pure, so a test can count them. */
export function chatWhoHtml(snap) {
  const rows = chatWhoRows(snap);
  // The column says what it is: these are the pilots connected right now. Long names
  // ellipsize to `name…` (the CSS on `#mp-chat-who li`), so the column never pushes the
  // lines box around (owner's request, 2026-11-22).
  return `<h2>Players</h2><ul>` +
    rows.map(name => `<li>${escapeHtml(name)}</li>`).join("") +
    `</ul>`;
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
  chatOpen = true;
  state.ui.chat = true;
  chatBox.hidden = false;
  // Visible *before* the focus call: a `[hidden]` field cannot take the cursor, so asking
  // for it first is a silent no-op (the guest's box opened with no way to type).
  if (chatInput) chatInput.hidden = false;
  document.body.classList.add("mp-chat-open", "mp-chat-live");
  setChatProblem("");
  chatInput.focus();
  pokeChat();
  return true;
}

/**
 * Close the box (Escape, Enter on an empty line, or losing the field).
 *
 * An explicit close is a decision, so it hides even with a half-written line in the field —
 * the text is still there when the box is opened again. A pinned box is the exception: the
 * player asked for it to stay.
 */
export function closeChat() {
  if (!chatBox) return;
  chatOpen = false;
  state.ui.chat = false;
  document.body.classList.remove("mp-chat-open");
  chatInput?.blur?.();
  if (chatFadeTimer) { clearTimeout(chatFadeTimer); chatFadeTimer = 0; }
  if (chatPinned) { drawChat(); return; }
  hideChatBox({ force: true });
}

/** A line was said, or this pilot started typing: show the box and restart its clock. */
function pokeChat() {
  chatSaidAt = Date.now();
  drawChat();
}

/** Arm the one timer that takes the box away again. */
function armChatHide() {
  if (chatHideTimer) { clearTimeout(chatHideTimer); chatHideTimer = 0; }
  if (!chatBox || chatBox.hidden || chatPinned) return;
  chatHideTimer = setTimeout(() => {
    chatHideTimer = 0;
    if (chatPinned) return;
    // Mid-sentence keeps it: a half-written line must not disappear because the other pilot
    // stopped talking. The clock restarts, so it goes soon after the line is sent.
    if ((chatInput?.value || "").trim()) { armChatHide(); return; }
    hideChatBox();
  }, Math.max(0, CHAT.autoHideSec) * 1000);
  if (typeof chatHideTimer?.unref === "function") chatHideTimer.unref();
}

/**
 * Take the box off the screen, and give the keyboard back to the ship.
 *
 * The automatic call refuses while a half-written line is in the field (`force` skips that,
 * for a close the player asked for — Escape, a click back into the game, the pause card).
 */
function hideChatBox({ force = false } = {}) {
  if (!chatBox) return false;
  if (!force && (chatPinned || (chatInput?.value || "").trim())) return false;
  chatBox.hidden = true;
  chatOpen = false;
  state.ui.chat = false;
  if (chatFadeTimer) { clearTimeout(chatFadeTimer); chatFadeTimer = 0; }
  if (chatHideTimer) { clearTimeout(chatHideTimer); chatHideTimer = 0; }
  document.body.classList.remove("mp-chat-live", "mp-chat-open");
  if (document.activeElement === chatInput) chatInput.blur();
  return true;
}

export const toggleChat = () => (isChatOpen() ? closeChat() : openChat());

function drawChat() {
  if (!chatBox) return;
  const snap = api.snapshot();
  if (!snap.on) {
    hideChatBox({ force: true });
    chatPinned = false;
    return;
  }
  // The box is only there when multiplayer is on, and only while playing: on the title
  // screen and on a station panel it would sit over a menu that already has the screen.
  // **And it is only there because it has something to say** (owner, playtest 20): a line
  // said in the last `CHAT.autoHideSec`, a half-written line, or the pin.
  const shown = chatVisibility({
    on: snap.on,
    intro: !!state.ui.intro,
    panel: sessionIsPanelOpen(),
    open: chatOpen,
  });
  const keep = chatKeepsOpen({
    on: snap.on,
    intro: !!state.ui.intro,
    panel: sessionIsPanelOpen(),
    pin: chatPinned,
    typing: !!(chatInput?.value || "").trim(),
    saidAt: chatSaidAt,
  });
  if (!keep) {
    hideChatBox({ force: true });
    return;
  }
  chatBox.hidden = false;
  document.body.classList.add("mp-chat-live");
  document.body.classList.toggle("mp-chat-open", chatOpen);
  if (chatWho) chatWho.innerHTML = chatWhoHtml(snap);
  const lines = chatLog(snap);
  chatList.innerHTML = lines.length
    ? lines.map(line => line.from === "Tallow Reach"
        ? `<p class="mp-chat-system">${escapeHtml(line.text)}</p>`
        : `<p><b>${escapeHtml(line.from)}</b> ${escapeHtml(line.text)}</p>`).join("")
    : `<p class="mp-hint">Press Enter to chat.</p>`;
  chatList.scrollTop = chatList.scrollHeight;
  if (chatInput) chatInput.hidden = !shown.input;
  setChatProblem(chatProblem);
  // Lines fade: chat is for the moment, and a wall of old lines over the glass is clutter.
  if (chatFadeTimer) clearTimeout(chatFadeTimer);
  chatFadeTimer = setTimeout(() => {
    chatList.querySelectorAll("p").forEach(p => { p.style.opacity = "0.55"; });
  }, CHAT.lineLifeSec * 1000);
  // ...and the clock that takes the whole box away, which a pinned box never sets.
  armChatHide();
}

function sessionIsPanelOpen() {
  return !!(state.ui.starmap || state.ui.cargo || state.ui.cache || state.paused || state.ui.multiplayer);
}

/** Called when the game wants the chat box gone (pause, a station panel, the title). */
export function chatAway() {
  closeChat();
  hideChatBox({ force: true });
}

/* ------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* ------------------------------------------------------------------------- */

/**
 * Say something in the message popup. `dismissAfter` (seconds) clears an informational
 * confirmation by itself: the blue "Send the offer code…" popup is a sentence the player has
 * read, not a status that must stay until it is replaced (owner's request, 2026-11-22).
 * Errors never auto-dismiss — a refusal has to stay readable.
 */
function setMessage(text, kind = "hint", dismissAfter = 0) {
  panelView.message = String(text || "");
  panelView.messageKind = kind;
  if (msgTimer) { clearTimeout(msgTimer); msgTimer = 0; }
  if (dismissAfter > 0) {
    msgTimer = setTimeout(() => {
      msgTimer = 0;
      if (panelView.message) { panelView.message = ""; draw(); }
    }, dismissAfter * 1000);
  }
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
  if (msgTimer) { clearTimeout(msgTimer); msgTimer = 0; }
  panelView.message = "";
  panelView.messageKind = "hint";
  panelView.busy = false;
  panelView.offer = "";
  panelView.answer = "";
  panelView.detailsOpen = false;
  panelView.fields = { name: null, join: "", code: "" };
  panelView.surface = "both";
  panelView.history = [];
  drawnHtml = "";
  chatOpen = false;
  chatProblem = "";
  // Slice 5: the box's own clock and switch, so one case cannot leave the next one showing.
  if (chatHideTimer) { clearTimeout(chatHideTimer); chatHideTimer = 0; }
  if (chatFadeTimer) { clearTimeout(chatFadeTimer); chatFadeTimer = 0; }
  chatSaidAt = 0;
  chatPinned = false;
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

const escapeAttr = escapeHtml;

export { cleanName, writeSettings };
