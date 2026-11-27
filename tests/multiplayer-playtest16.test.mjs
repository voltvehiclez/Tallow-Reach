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

test("playtest 18 + 20: the card appears on Open World, and always while the pilot is away", () => {
  // Playtest 18's rule still stands: *"This your pilot is in menu should only come if you try to
  // join your local open world"* — the card is raised by that press and by nothing else.
  //
  // Playtest 20 corrected WHEN that press asks (owner: *"logging into the guests own open world
  // does not give a prompt to bring their pilot home. It should to confirm its updating to the
  // local open world to latest version of their pilot."*). Whether the copy in that world is
  // newer is not the question: being away at all means this world is not up to date with its
  // pilot, so the press always asks.
  const screens = read("src/ui/screens.js");
  // The menu is the menu: being away no longer replaces it.
  assert.match(screens, /if \(state\.away && state\.ui\?\.awayCard\) \{/,
    "the card shows only when the press raised it");
  const menu = read("src/ui/menu.js");
  assert.match(menu, /if \(state\.away\) \{\s*state\.ui\.awayCard = true;/,
    "Open World always raises the card while the pilot is away");
  assert.doesNotMatch(menu, /if \(newerCopyAway/, "and not only when something newer is waiting");
  // ...and nothing opens from that press: the card is the whole answer.
  assert.match(menu, /state\.ui\.awayCard = true;[\s\S]{0,240}return;\s*\}\s*enterGameMode\("open"\);/,
    "nothing opens until the pilot is home");
  // **Nothing is compared at all** (owner, playtest 20: *"Doesnt matter if nothing has changed,
  // game should always try to use the latest pilot version since even small things like pilot
  // position can change."*). The card takes the marker and nothing else, and the comparison that
  // used to label it is gone from the codebase rather than merely unused.
  assert.match(screens, /function awayCardHtml\(away\) \{/, "the card needs no verdict");
  assert.match(screens, /awayCardHtml\(state\.away\)\)?/, "it is drawn from the marker");
  assert.doesNotMatch(menu + screens, /newerCopyAway|awayNewer/, "no copy is called newer");
  assert.doesNotMatch(read("src/net/session.js"), /export function newerCopyAway/, "and has no home");
  assert.doesNotMatch(read("src/state/state.js"), /awayNewer/, "not even as a flag");
  // Arriving at the menu clears it, so Main menu lands on the menu.
  assert.match(menu, /state\.ui\.intro = true;[\s\S]{0,400}state\.ui\.awayCard = false;/,
    "the menu clears the card");
});

test("playtest 20: coming home takes the copy that world holds — a tie is not a reason to skip it", async () => {
  // The owner: *"Doesnt matter if nothing has changed, game should always try to use the latest
  // pilot version since even small things like pilot position can change."*
  //
  // Playtest 18 had the game decide by credits and cargo whether the friend's world held anything
  // worth collecting, and skip the question when it did not. Two things were wrong with that: the
  // comparison is invisible to the player, and it is not even the right measure — `shipPlaces`
  // (which station a hull is parked at), hull damage and modules are all facts that change with
  // no number moving. So the copy comes home, always, and nothing is weighed first.
  const { checkOut } = await import("../src/net/custody.js");
  const { SAVE_VERSION, newProfile, newWorld, sanitizeSave } = await import("../src/state/profile.js");
  const makeSave = () => sanitizeSave({ v: SAVE_VERSION, profile: newProfile(), world: newWorld(), away: null });

  const home = makeSave();
  const { save: packed, bundle } = checkOut(home, { worldId: "w-1", hostName: "Ada", guestId: "g-1", token: "t" });
  // The host wrote the pilot while the guest was there: same credits, one hull parked a station
  // further along and a little hull damage. Nothing a credits-or-cargo rule can see.
  const parked = Object.keys(bundle.profile.shipPlaces || {})[0] || bundle.profile.ship;
  const written = {
    ...bundle,
    // the pair is deliberately UNCHANGED: this is the tie the old rule answered "not newer" for
    epoch: packed.away.epoch,
    rev: packed.away.rev,
    profile: { ...bundle.profile, hp: { ...(bundle.profile.hp || {}), [parked]: 0.5 } },
  };
  const stored = { ...packed, away: { ...packed.away, suitcase: written } };

  const done = session.bringPilotHome(stored);
  assert.equal(done.ok, true, done.message);
  assert.equal(done.save.away, null, "the pilot is home");
  assert.equal(done.save.profile.hp[parked], 0.5, "the damage taken there came home");
  assert.deepEqual(done.save.profile.shipPlaces, written.profile.shipPlaces,
    "and so did where every hull was parked");
  // Nothing compares: the helpers that answered "is it newer?" are gone, so no future caller can
  // put the question back in front of the one act that has no alternative.
  const custody = read("src/net/custody.js");
  assert.doesNotMatch(custody, /export function isNewerCopy/, "the comparison is deleted, not idle");
  const session_ = read("src/net/session.js");
  assert.match(session_, /It takes the copy that world holds, and asks nothing about whether it changed/,
    "and the rule is written where the act lives");
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
  assert.equal(buttons.length, 2, "two doors off the card: home, or the menu");
  for (const tag of buttons) assert.match(tag, /class="go"/, `${tag} is a full-width button`);
  // ...and the card has styles of its own, so the layout is a column and not the browser's.
  const css = read("src/styles.css");
  assert.match(css, /\.away-actions \{[^}]*display: grid/, "the ways out are a column");
  assert.match(css, /\.away-note \{/, "the notes are styled");
  const menu = read("src/ui/menu.js");
  assert.match(menu, /  menu\(\) \{\s*state\.ui\.awayCard = false;/, "which dismisses the card");
  // ...and dismissing it must NOT bring the pilot home or hide the fact it is away.
  const act = menu.slice(menu.indexOf("  menu() {"));
  const menuBody = act.slice(0, act.indexOf("\n  },") + 4);
  assert.doesNotMatch(menuBody, /bringPilotHome|leaveVisit/, "Main menu is not a decision about the save");
  assert.match(screens, /state\.away && state\.ui\?\.awayCard/, "the card is drawn only when asked");
  // Arriving at the menu clears it, so Main menu lands on the menu.
  assert.match(menu, /state\.ui\.awayCard = false;\n\s*resetStationPanels/, "arriving at the menu clears it");
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

test("playtest 21: the visit opens the stand-in world and says it is not your friend's", () => {
  // The owner's reports, in order: playtest 20 — *"the pilot's own world pausing while it is away
  // is not working as intended"*; playtest 21 — *"Clicking the bring my pilot now when joining a
  // world doesnt log you into their open world. Im just stuck at the menu where you add link."*
  //
  // The first put a guard in front of every door into the open world, and the second showed what
  // that costs: a player who had just sent their pilot was left on the join screen with nothing
  // to press. The owner's decision: *"drop me into the local world, add a pop up that this is not
  // the hosts world (yet)"* — because the friend's world on this screen is step 16 slice 7.
  const menu = read("src/ui/menu.js");
  const fn = menu.slice(menu.indexOf("function enterGameMode(mode) {"));
  const head = fn.slice(0, fn.indexOf("state.ui.intro = false;"));
  assert.doesNotMatch(head, /state\.away/, "the world opens; there is no guard in front of it");
  // The title press still asks the custody question (playtest 20), which is a different rule.
  assert.match(menu, /ACTIONS = \{/, "actions are still the menu's own");
  const intro = menu.slice(menu.indexOf("  intro() {"));
  assert.match(intro.slice(0, 2400), /if \(state\.away\) \{\s*state\.ui\.awayCard = true;/,
    "Open World from the menu still raises the away card first");

  const ui = read("src/ui/multiplayer.js");
  // Bringing the pilot is one press, not two: the world opens as soon as it crosses.
  const bring = ui.slice(ui.indexOf('case "bring": {'));
  const bringBody = bring.slice(0, bring.indexOf('case "join-world"'));
  assert.match(bringBody, /if \(done\.ok && state\.ui\.intro\) \{\s*closeMultiplayer\(\);\s*emit\("mp-enter-world", \{\}\);/,
    "a pilot that crossed is a player who is in the world");
  // ...and Enter the world is drawn while the pilot is away, which is what playtest 20 hid.
  const join = ui.slice(ui.indexOf('case "join-world": {'));
  const joinBody = join.slice(0, join.indexOf('case "leave":'));
  assert.doesNotMatch(joinBody, /state\.away/, "the door does not refuse because the pilot is away");
  assert.match(joinBody, /emit\("mp-enter-world", \{\}\)/, "it opens the world");
  assert.match(ui, /model\.visiting && model\.brought && !model\.choosing[\s\S]{0,600}data-mp="join-world">Enter the world</,
    "the button is on the panel with the pilot already here");
  assert.match(ui, /You will enter your <strong>friend's<\/strong> world with your pilot's copy/,
    "and the panel says which galaxy it opens, before the press");

  // The pop-up when entering the friend's world, naming the friend.
  const enter = menu.slice(menu.indexOf('on("mp-enter-world"'));
  const enterBody = enter.slice(0, enter.indexOf("  });") + 5);
  assert.match(enterBody, /if \(state\.away\) \{/, "it only speaks when the pilot is away");
  assert.match(enterBody, /showNotice\(`Visiting \$\{where\}\.`\)/, "a notice, not a card");
  assert.match(enterBody, /state\.away\.hostName/, "in the friend's own name when there is one");
});

