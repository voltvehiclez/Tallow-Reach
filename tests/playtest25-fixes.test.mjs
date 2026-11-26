// Playtest 25: two reports, and both are rules rather than patches.
//
//   1. **One pointer at a time.** The pinned chat box takes the mouse, so hovering it showed the
//      system arrow inside the HUD's orange circle. The owner's rule: while the pilot steers, the
//      orange circle is *the* pointer; only a surface that takes the stick (chat typing, the hold,
//      the chart, pause) may show the system cursor. Left Alt's free camera is not one of those.
//   2. **The lead pip follows the lock, not the target's kind.** Locking a visiting pilot with F
//      drew no pip because the instrument was hard-wired to hostiles (`lock.k === 'e'`), even
//      though playtest 23 made pilots lockable. The weapon is still the selected primary bay.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadHeadless } from "./headless.mjs";
import { createShipStream } from "../src/render/shipstream.js";
import { pointerTaken, pilotPointer, syncPointer, resetPointer, POINTER_CLASS } from "../src/ui/pointer.js";

const srcDir = fileURLToPath(new URL("../src", import.meta.url));
const read = file => readFileSync(path.join(srcDir, file), "utf8");
const css = read("styles.css");

/** A `state` as the shell holds it while flying. */
function flying(extra = {}) {
  return {
    player: { docked: false },
    ui: { intro: false },
    paused: false,
    freeCam: { on: false },
    ...extra,
  };
}

/* ------------------------------------------------------------------------- */
/* 1. One pointer at a time                                                   */
/* ------------------------------------------------------------------------- */

test("playtest 25: while the pilot steers, the orange circle is the pointer", () => {
  assert.equal(pilotPointer(flying()), true, "flying with nothing open: the circle");

  // **Free camera is not a decoupling** (owner, playtest 25: *"clicking left alt decouples steering
  // but i still want the orange cursor like now since we are still flying the ship just from a
  // different view point"*). The viewpoint changed; the pilot did not stop flying.
  assert.equal(pilotPointer(flying({ freeCam: { on: true } })), true, "left alt keeps the circle");
});

test("playtest 25: a surface that takes the stick brings the system cursor back", () => {
  const surfaces = {
    chat: "chat typing (and a live text selection)",
    navigation: "the N pocket list",
    cargo: "the in-flight hold",
    cache: "the rift-cache trade",
    starmap: "the chart",
    multiplayer: "the multiplayer screen",
  };
  for (const [key, what] of Object.entries(surfaces)) {
    const s = flying();
    s.ui[key] = true;
    assert.equal(pointerTaken(s), true, `${what} takes the pointer`);
    assert.equal(pilotPointer(s), false, `${what}: the system cursor, as asked`);
  }

  // A card that stops the world is a card too.
  const ending = flying();
  ending.ui.campaignEnd = "accomplished";
  assert.equal(pilotPointer(ending), false, "an act's end card has the mouse");

  // ...as do the three screens that are not flight at all.
  assert.equal(pilotPointer(flying({ paused: true })), false, "pause is a card with buttons");
  assert.equal(pilotPointer(flying({ player: { docked: true } })), false, "a station is a mouse screen");
  assert.equal(pilotPointer(flying({ ui: { intro: true } })), false, "the title screen has no ship");
  assert.equal(pilotPointer({ player: null, ui: {} }), false, "no ship, no stick");
  assert.equal(pilotPointer(null), false, "no state, no pointer");
});

test("playtest 25: the class goes on the page once per change, not once per frame", () => {
  resetPointer();
  const body = { on: null, classList: { toggle(name, on) { assert.equal(name, POINTER_CLASS); this.owner.on = on; } } };
  body.classList.owner = body;
  let writes = 0;
  const doc = { body };
  const toggle = body.classList.toggle.bind(body.classList);
  body.classList.toggle = (name, on) => { writes += 1; toggle(name, on); };
  const state = flying({ ui: { chat: true } });

  assert.equal(syncPointer(doc, state), false, "chat open: the system cursor");
  assert.equal(body.on, false, "and the page says so");
  assert.equal(writes, 1, "one write");

  syncPointer(doc, state);
  assert.equal(writes, 1, "the same answer is not written again");

  state.ui.chat = false;
  assert.equal(syncPointer(doc, state), true, "chat closed: the circle again");
  assert.equal(body.on, true);
  assert.equal(writes, 2, "and exactly one more write");
  resetPointer();
});

test("playtest 25: styles.css draws one pointer, and hides the ring on a decoupled surface", () => {
  assert.match(
    css,
    /body\.pilot-pointer,\s*\nbody\.pilot-pointer \* \{\s*\n\s*cursor: none !important;/,
    "while the pilot steers, nothing under the mouse shows the system arrow",
  );
  assert.match(css, /body:not\(\.pilot-pointer\) #cur \{\s*\n\s*display: none;/, "and the ring is hidden where the system cursor is not");
});

test("playtest 25: the frame loop asks the rule every frame", () => {
  const main = read("main.js");
  assert.match(main, /import \{ syncPointer \} from "\.\/ui\/pointer\.js";/, "the shell owns the once-a-frame call");
  assert.match(main, /function frame\(now\) \{[\s\S]{0,400}?syncPointer\(\);/, "called before the frame draws, so pause and chat are already known");
});

/* ------------------------------------------------------------------------- */
/* 2. The lead pip follows the lock                                           */
/* ------------------------------------------------------------------------- */

const views = await loadHeadless(
  "src/render/views.js",
  {
    state: "src/state/state.js",
    emit: "src/util/events.js",
    V: "src/util/math.js",
    Q: "src/util/math.js",
    createPlayer: "src/sim/player.js",
    setShip: "src/sim/player.js",
    localPlayer: "src/state/state.js",
    newProfile: "src/state/profile.js",
  },
  { keep: ["views.js"] }
);

function bareWorld() {
  views.state.players.length = 0;
  views.state.localPlayerIndex = 0;
  views.state.place = "hollow";
  views.state.otherPilots = [];
  views.createPlayer();
  views.setShip("wasp");
  views.localPlayer().docked = false;
  views.localPlayer().pos.set(0, 0, 0);
  views.updateEntityViews();
  return views.state;
}

/** A visiting record, as `sim/multiplayer.js` leaves it: plain data with its own `v`. */
function visitor(extra = {}) {
  const P = {
    kind: "ship",
    guestId: "guest-1",
    name: "Acey",
    ship: "wasp",
    place: "hollow",
    pos: views.V(0, 0, -200),
    quat: views.Q(),
    v: views.V(0, 0, 0),
    thr: 0,
    docked: false,
    dead: false,
    hull: 50,
    hullMax: 100,
    sh: 20,
    shMax: 40,
    ...extra,
  };
  views.state.players.push(P);
  return P;
}

test("playtest 25: a locked pilot carries a velocity, so the pip has something to lead", () => {
  const S = bareWorld();
  // The host's own screen: the record's `v` is the number the sim flew it with.
  const P = visitor({ v: views.V(0, 0, 60) });
  views.updateEntityViews(1);
  assert.equal(S.otherPilots.length, 1, "the friend is in the mirror");
  const ref = S.otherPilots[0];
  assert.equal(ref.k, "p", "a pilot lock");
  assert.deepEqual([ref.v.x, ref.v.y, ref.v.z], [0, 0, 60], "moving away at 60 m/s: the pip leads it");

  // A pilot at rest has nothing to lead, and says 0 rather than keeping the last speed.
  P.v.set(0, 0, 0);
  views.updateEntityViews(1);
  assert.deepEqual([ref.v.x, ref.v.y, ref.v.z], [0, 0, 0], "a still hull reads as still");
});

test("playtest 25: on a guest, the pip leads the host's hull by the velocity on the wire", () => {
  const S = bareWorld();
  const stream = createShipStream();
  const at = 1000;
  stream.receive([{
    id: "host",
    name: "Ada",
    ship: "bulwark",
    place: "hollow",
    pos: [40, 0, -300],
    quat: [0, 0, 0, 1],
    velocity: [0, 0, 80],
    throttle: 1,
    docked: false,
    dead: false,
    hull: 0.8,
    shield: 0.4,
  }], at);
  views.updateEntityViews(1, stream.sample(at + 200));

  assert.equal(S.otherPilots.length, 1, "the host's hull is in a guest's mirror");
  const ref = S.otherPilots[0];
  assert.deepEqual([ref.v.x, ref.v.y, ref.v.z], [0, 0, 80], "straight off the wire");
});

test("playtest 25: the pip is drawn for every lock that moves, with the selected primary gun", () => {
  const hud = read("ui/hud.js");
  // The old gate, which is exactly what made a locked pilot show nothing.
  assert.doesNotMatch(hud, /lock\?\.k !== 'e'/, "the pip is not hostiles-only any more");
  assert.match(hud, /const lock = F\.lock;\s*\n\s*if \(state\.warp \|\| P\.docked \|\| !lock\) return;/, "any lock at all");
  assert.match(hud, /Number\.isFinite\(lock\.o\?\.hp\) && lock\.o\.hp <= 0/, "a wreck is still skipped");
  assert.match(hud, /targetVel\.lengthSq\(\) < LEAD_MIN_SPEED \* LEAD_MIN_SPEED/, "a target at rest has nothing to lead");
  assert.match(hud, /primarySlotIndex\(state\.profile\.pw, P\)/, "and the weapon is still the selected primary bay");
  // Owner, playtest 25: *"make the lead indicator currently only be for primary weapon, it's
  // easier that way right now"* — the launcher is not consulted by this instrument.
  const instrument = hud.slice(hud.indexOf("function updateInstruments"), hud.indexOf("function updateInstruments") + 4000);
  assert.doesNotMatch(instrument, /missile|launcher/, "the secondary is not part of this pip");
});
