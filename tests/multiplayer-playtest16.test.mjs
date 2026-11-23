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

test("playtest 16/17: the join box holds the choice, and joining does not enter the world", () => {
  // The bug this replaced: a successful join closed the multiplayer screen and loaded the
  // world, destroying the only "Bring my pilot" button before the player could press it.
  const ui = read("src/ui/multiplayer.js");
  const after = ui.slice(ui.indexOf("function afterJoined()"));
  const body = after.slice(0, after.indexOf("\n}\n") + 3);
  assert.doesNotMatch(body, /emit\("mp-enter-world"/, "a join no longer loads the world by itself");
  // The choice lives in the join block, driven by the session's own state.
  assert.match(ui, /choosing: visiting && connected && !snap\.carrying && !snap\.carriedAcked/,
    "the box offers the choice once the link is live and the pilot has not crossed");
  assert.match(ui, /data-mp="bring">Bring my pilot</, "Bring my pilot is in that box");
  assert.match(ui, /data-mp="join-world">Enter the world without my pilot</,
    "and so is entering the world without it");
  // Entering the world is its own press, which is what makes the placeholder possible.
  assert.match(ui, /case "join-world":/, "there is an action for entering the world");
});

test("playtest 17: the in-world card is gone — the join box replaced it", () => {
  // It was a workaround for "the join screen closes", and the owner's design removed the cause.
  const ui = read("src/ui/multiplayer.js");
  assert.doesNotMatch(ui, /buildBringCard|mp-bring-card/, "no second prompt floating over the world");
  const css = read("src/styles.css");
  assert.doesNotMatch(css, /#mp-bring-card/, "and no styles for one");
  const events = read("src/util/events.js");
  assert.doesNotMatch(events, /mp-bring-prompt/, "and no event asking for one");
});

test("playtest 17: the away card is never a room with no door", () => {
  // The owner: "in the your pilot is in friends world menu there is no option even to go to
  // main menu (which should be here). So hes stuck."
  const screens = read("src/ui/screens.js");
  const card = screens.slice(screens.indexOf("function awayCardHtml"));
  const body = card.slice(0, card.indexOf("\n}\n") + 3);
  assert.match(body, /data-a="menu">Main menu</, "the card has a Main menu button");
  // ...and names its build, so a player on an older download can tell that is what happened
  // (playtest 17: the owner reported a card with no door while running the build before it).
  assert.match(body, /away-build">Build \$\{esc\(BUILD\)\}/, "the card says which build it is");
  // Every button on the card is the same kind of button. "Main menu" was the one without
  // `class="go"`, so it rendered as a small box on the left (owner, playtest 17).
  const buttons = body.match(/<button[^>]*>/g) || [];
  assert.equal(buttons.length, 3, "three ways out");
  for (const tag of buttons) assert.match(tag, /class="go"/, `${tag} is a full-width button`);
  // ...and the card has styles of its own, so the layout is a column and not the browser's.
  const css = read("src/styles.css");
  assert.match(css, /\.away-actions \{[^}]*display: grid/, "the ways out are a column");
  assert.match(css, /\.away-note \{/, "the notes are styled");
  const menu = read("src/ui/menu.js");
  assert.match(menu, /  menu\(\) \{\s*state\.ui\.awayCardDismissed = true;/, "which dismisses the card");
  // ...and dismissing it must NOT bring the pilot home or hide the fact it is away.
  const act = menu.slice(menu.indexOf("  menu() {"));
  const menuBody = act.slice(0, act.indexOf("\n  },") + 4);
  assert.doesNotMatch(menuBody, /bringPilotHome|leaveVisit/, "Main menu is not a decision about the save");
  assert.match(screens, /state\.away && !state\.ui\?\.awayCardDismissed/, "the card is only skipped when asked");
  // A redraw from a *new* visit must show the card again.
  assert.match(menu, /state\.ui\.awayCardDismissed = false;\n\s*resetStationPanels/, "arriving at the menu resets it");
});

test("playtest 17: Bring pilot home is its own press, and works with the host closed", () => {
  // The owner's definition, in his words: "bringing pilot home simply means making the version
  // of your character that was on your friends world be the latest version on your local open
  // world." It routes through Open World's action before, which refuses while a pilot is away —
  // so the card's own button answered with the sentence meant for Open World.
  const menu = read("src/ui/menu.js");
  const act = menu.slice(menu.indexOf("  comehome() {"));
  const body = act.slice(0, act.indexOf("\n  },") + 4);
  assert.match(body, /bringPilotHomeAtMenu\(/, "it unpacks the suitcase itself");
  assert.doesNotMatch(body, /ACTIONS\.intro\(\)/, "and does not borrow Open World's refusal");
  // No session is needed: the suitcase is the guest's own copy.
  const net = read("src/net/session.js");
  assert.match(net, /const suitcase = away\.suitcase \|\| readAwayCopy\(away\.worldId\)/);
});

test("playtest 17: Rejoin with the host gone says the host is gone", () => {
  const menu = read("src/ui/menu.js");
  const fn = menu.slice(menu.indexOf("function rejoinStoredWorld"));
  const body = fn.slice(0, fn.indexOf("\n}\n") + 3);
  assert.match(body, /is not there — their game is closed/, "it names the situation, not the wire");
  assert.match(body, /cancel\|timeout\|refus\|unreach\|no answer/, "and decides that from the failure");
});

test("playtest 17: a real join connects without carrying, and the carry works", async () => {
  // The behaviour the owner asked for: joining connects, and the pilot stays home until the
  // player presses Bring my pilot — which is what lets the join box offer the choice.
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
  hostCh.connect("guest-peer");
  guestCh.connect("host-peer");
  session.focusForTest(guest);
  await new Promise(resolve => setTimeout(resolve, 0));

  const snap = guest.snapshot();
  assert.equal(snap.role, "guest");
  assert.equal(snap.state, "connected", "the join really connects");
  assert.equal(snap.carrying, false, "and nothing crossed — the pilot is still home");
  assert.equal(guestSave.away, null, "the save agrees");

  const carried = guest.bringPilot();
  assert.equal(carried.ok, true, `the press must work: ${carried.message}`);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(guestSave.away?.worldId, "w-1", "now the pilot really is in the friend's world");
  session.stop();
});

/* ---- playtest 17: the switch that could not be pressed -------------------------- */

test("playtest 17: a visitor's switch is ON and CAN be pressed — that is the way out", () => {
  // The owner: "Multiplayer on/off button doesnt work so i cant test the build properly."
  // Two faults, both fatal together: the switch read `hosting` (so a guest saw Off) and it was
  // DISABLED while visiting — and the pause surface does not draw the join block, so the only
  // Leave button was on a screen the guest could not reach from where they were.
  const ui = read("src/ui/multiplayer.js");
  assert.match(ui, /switchOn: hosting \|\| visiting/, "a visit counts as multiplayer being on");
  assert.match(ui, /canSwitch: !!name,/, "and the switch is not disabled for a visitor");
  const model = ui.slice(ui.indexOf("  if (model.visiting) {"));
  assert.match(model.slice(0, 600), /leaveSession\(\)/, "pressing it while visiting leaves the world");
  // ...and the same action is drawn beside the switch, where the player is looking.
  assert.match(ui, /data-mp="leave">Leave \$\{/, "there is a Leave button on the pause surface too");
});

test("playtest 17: turning the switch on when nothing is running opens a world", () => {
  // `openWorld` was carved out of `toggleHosting` so the action has one body; the model must
  // still treat a press as "host", which is what every earlier test asserts too.
  const ui = read("src/ui/multiplayer.js");
  const fn = ui.slice(ui.indexOf("async function toggleHosting()"));
  const body = fn.slice(0, fn.indexOf("/** Open the world and make the link."));
  assert.match(body, /return openWorld\(\);/, "the last branch opens the room");
  assert.match(ui, /async function openWorld\(\)/, "and that is a real function");
});

test("playtest 17: the session can be switched on with nothing running", () => {
  // `setEnabled(true)` on a browser with no session used to write the setting and stop there,
  // so the switch had nothing to act on. It now makes an idle host session to act on.
  const net = read("src/net/session.js");
  const fn = net.slice(net.indexOf("export function setEnabled(value)"));
  const body = fn.slice(0, fn.indexOf("\n}\n") + 3);
  assert.match(body, /if \(!active\) \{/, "a switched-on browser gets a session");
  assert.match(body, /role: "host"/, "an idle host: nothing is opened until it hosts");
  // ...and the snapshot now says whether that session exists, which the screen needs.
  assert.match(net, /enabled: readSettings\(\)\.enabled === true, session: !!active/,
    "the snapshot carries the switch and whether a session exists");
});
