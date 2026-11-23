// Playtest 16 (owner): joining worked, and the pilot never followed.
//
// The owner's report, in three parts:
//
//  1. "I join a multiplayer world, it joins without letting me click the bring my pilot prompt
//     it just joins." — the prompt was on the JOIN SCREEN, and a successful join CLOSES that
//     screen and enters the world. The button was destroyed by the very thing it was meant to
//     follow, so the player arrived with no pilot and no way to send one.
//  2. "quickly click bring my pilot before the game manages to log me into the world" landed on
//     the away card — a race: the click packed the pilot, then the world-entering code saw an
//     away pilot and bailed out to the card.
//  3. "logging back into the local open world doesnt give me a prompt to retrieve my pilot
//     either. Just goes straight into open world." — and the owner's decision: Open World must
//     REFUSE while the pilot is away, and the card is the only way on.
//
// Plus: Rejoin connected (the host saw the name) but the guest stayed on the card, because the
// join succeeded and nothing reopened a screen.
//
// The owner's choice for the flow (2026-11-23): **enter their world, and show the Bring my pilot
// prompt inside it** — not "stay on the multiplayer screen".

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as session from "../src/net/session.js";
import { SAVE_VERSION, newProfile, newWorld, sanitizeSave } from "../src/state/profile.js";
import { state } from "../src/state/state.js";
import { on } from "../src/util/events.js";

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const STATION = "reach:meridian";

function pilotSave() {
  const save = { v: SAVE_VERSION, profile: newProfile(), world: newWorld(), away: null };
  save.profile.cr = 800;
  save.profile.homeStation = STATION;
  save.profile.holds[save.profile.ship] = { ferrite: 10 };
  save.world.stationStores[STATION] = { ferrite: 5 };
  return sanitizeSave(save);
}

/** A guest seam, and the channels it makes — the in-memory wire the other tests use. */
function wire() {
  const made = [];
  const factory = ({ role, worldId, onState, onData, onPeer }) => {
    const ch = {
      role, worldId, peerId: null, outbound: [],
      join: async () => { onState?.({ state: "finding", reason: "" }); return ch; },
      send: (peer, value) => { ch.outbound.push({ peer, value }); ch.deliver?.(peer, value); return true; },
      broadcast: value => (ch.peerId ? (ch.send(ch.peerId, value), 1) : 0),
      peers: () => (ch.peerId ? [ch.peerId] : []),
      state: () => ({ state: ch.peerId ? "connected" : "finding", reason: "" }),
      room: () => worldId,
      leave: () => { ch.left = true; },
      restart: async () => ch,
      checkRelays: async () => ({ host: 1, srflx: 1, prflx: 0, relay: 0 }),
      reach: (message, peerId = "peer-1") => onData?.({ ...message, peerId }),
      connect(peerId = "peer-1") { ch.peerId = peerId; onPeer?.({ kind: "join", peerId }); },
    };
    made.push(ch);
    return ch;
  };
  return { factory, made };
}

function hostAndGuest({ guestAway = false } = {}) {
  const w = wire();
  session.setChannelFactory(w.factory);
  const hostSave = pilotSave();
  const guestSave = pilotSave();
  const hostKit = { read: () => hostSave, write: () => {}, install: () => {} };
  const guestKit = { read: () => guestSave, write: () => {}, install: next => Object.assign(guestSave, JSON.parse(JSON.stringify(next))) };
  return { w, hostSave, guestSave, hostKit, guestKit, guestAway };
}

/** Nothing is mounted on the title screen until the player acts: keep `state.away` honest. */
const clearAway = () => { state.away = null; };

test("playtest 16: the in-world prompt is asked for by the session, not the join screen", () => {
  // The prompt is DERIVED (`publishBringPrompt`) and sent on the bus, because `net/` may not
  // touch the DOM and the screen that needs it is not the screen that does the joining.
  const net = read("src/net/session.js");
  assert.match(net, /function publishBringPrompt/, "the session works out whether the prompt is wanted");
  assert.match(net, /role === "guest" && welcomed && !carried && !awayMark/,
    "a connected guest that has not carried, and is not already away, wants it");
  assert.match(net, /emit\("mp-bring-prompt", \{ show: wanted, text \}\)/, "and says so on the bus");
  assert.match(net, /export function askBringPrompt/, "a screen that mounted late can ask again");
  const events = read("src/util/events.js");
  assert.match(events, /mp-bring-prompt \{ show, text \}/, "the event is documented like every other");
});

test("playtest 16: the prompt is a card in the world, not a button on the join screen", () => {
  // The bug in one sentence: a join closes the join screen, so a button there is destroyed by
  // the join. The card must be its own element.
  const ui = read("src/ui/multiplayer.js");
  assert.match(ui, /function buildBringCard/, "its own element");
  assert.match(ui, /on\("mp-bring-prompt"/, "driven by the bus");
  assert.match(ui, /bringCard\.hidden = false/, "shown without any screen of its own");
  // ...and it must not be a modal: looking around and chatting without travelling is allowed.
  assert.match(ui, /id="mp-bring-later"/, "\"Not now\" lets a player just look around");
  const css = read("src/styles.css");
  assert.match(css, /#mp-bring-card \{[^}]*position: fixed/, "it floats over the world");
  // The press goes through the ONE rule that puts a pilot on the wire, not a private copy.
  const press = ui.slice(ui.indexOf('bringCard.querySelector("#mp-bring-go")'));
  assert.match(press.slice(0, 400), /session\.bringPilot\(\)/, "the card calls the same rule as the pause screen");
});

test("playtest 16: joining enters the world and the prompt follows it in", () => {
  // `afterJoined` is what closes the join screen. It must NOT be suppressed for a guest that
  // has not carried — that suppression was the bug — but it must still refuse to fly a frozen
  // pilot (playtest 14's rule, kept).
  const ui = read("src/ui/multiplayer.js");
  const after = ui.slice(ui.indexOf("function afterJoined()"));
  const body = after.slice(0, after.indexOf("\n}\n") + 3);
  assert.match(body, /emit\("mp-enter-world"/, "a successful join still enters the world");
  assert.match(body, /if \(state\.away\)/, "an away pilot still does not fly its own frozen ship");
});

test("playtest 16: Open World REFUSES while the pilot is away, and says why", () => {
  // The owner's decision: the card is the only way on. Unpacking behind the player's back was
  // the old behaviour and read as "it just goes straight into open world".
  const menu = read("src/ui/menu.js");
  const act = menu.slice(menu.indexOf("  intro() {"));
  const body = act.slice(0, 700);
  assert.match(body, /if \(state\.away\) \{/, "an away pilot is refused up front");
  assert.match(body, /showNotice\("Your pilot is in your friend's world/, "with the sentence that says where it is");
  assert.doesNotMatch(body, /comeHome\(\)\);?\s*\n\s*enterGameMode/, "and Open World never unpacks on the way in");
  // Bring pilot home is still the way out, so the refusal is not a dead end.
  assert.match(menu, /comehome\(\) \{\s*ACTIONS\.intro\(\);/, "Bring pilot home is still its own press");
});

test("playtest 16: Rejoin reopens the screen, so a rejoin you can see happens", () => {
  // The owner: "Clicking rejoin makes my character name pop up in the hosts player chat.
  // However on the guest side nothing happens, i stay in the your pilot is in friends world
  // menu and i get a message saying Rejoined your friends world."
  const menu = read("src/ui/menu.js");
  const fn = menu.slice(menu.indexOf("function rejoinStoredWorld"));
  const body = fn.slice(0, fn.indexOf("\n}\n") + 3);
  assert.match(body, /openMultiplayer\(\{ focus: "join", from: "menu" \}\)/, "the screen opens on success");
  assert.match(body, /showNotice\(`Rejoined/, "and the sentence is still said");
  // Entering the WORLD is still wrong here: the pilot is frozen, so it must not fly.
  assert.doesNotMatch(body, /mp-enter-world/, "rejoin does not fly a frozen pilot");
});

test("playtest 16: a real join asks for the pilot, and a real carry stops asking", async () => {
  // The behaviour, not the wiring: two sessions on the in-memory wire, a guest that joins but
  // has not carried. Before this, nothing at all asked the guest to bring its pilot — the only
  // button was on the screen the join closes.
  const w = wire();
  session.setChannelFactory(w.factory);
  const hostSave = pilotSave();
  const guestSave = pilotSave();
  const host = session.createChannelForTest("host", "w-1", "Ada", "host-token", {
    read: () => hostSave, write: () => {}, install: () => {},
  });
  await host.start();
  const hostCh = w.made.at(-1);
  const guest = session.createChannelForTest("guest", "w-1", "Bo", "guest-token", {
    read: () => guestSave,
    write: () => {},
    install: next => Object.assign(guestSave, JSON.parse(JSON.stringify(next))),
  });
  await guest.start();
  const guestCh = w.made.at(-1);
  hostCh.deliver = (peer, value) => guestCh.reach(value, peer);
  guestCh.deliver = (peer, value) => hostCh.reach(value, peer);

  const prompts = [];
  on("mp-bring-prompt", prompt => prompts.push(prompt));

  hostCh.connect("guest-peer");
  guestCh.connect("host-peer");
  session.focusForTest(guest);
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(prompts.at(-1)?.show, true, "the joined guest is asked to bring its pilot");
  assert.match(prompts.at(-1)?.text || "", /Bring my pilot/);

  const carried = guest.bringPilot();
  assert.equal(carried.ok, true, `the press must work: ${carried.message}`);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(prompts.at(-1)?.show, false, "and once the pilot is over, the prompt goes");
  assert.equal(guestSave.away?.worldId, "w-1", "the pilot really is in the friend's world now");
  session.stop();
});
