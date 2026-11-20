// Moving between pockets. The starmap chooses an explicit destination; this
// module rechecks the travel rules before running the unchanged WARP sequence.
// Each pilot owns their warp and current pocket; shared places are instanced.

import { WARP, WARP_SWITCH_AT, WARP_TIME, warpFlashAt } from "../data/sectors.js";
import { PLACES, PLACE_LINKS, placeAt, nextPocket } from "../data/places.js";
import { travelQuote } from "./travel.js";
import { campaignTravelRefusal } from "./campaign.js";
import { emit } from "../util/events.js";
import { state, localPlayer, profileOf, msg, say, currentSave, saveCurrentGame } from "../state/state.js";
import { clearWorldObjects } from "./world.js";
import { enterPlace, arrivalPos } from "./places.js";
import { facePlayer } from "./pilot.js";
import { V } from "../util/math.js";

export const isWarping = (player = localPlayer()) => !!(player && player.warp);

/** Begin one explicitly chosen, legal hop. The optional legacy sibling default
 *  remains for old headless scripts, but is also checked by the same travel rules;
 *  the live M key opens the map and never calls this without a destination. */
export function startWarp(player = localPlayer(), to = null) {
  const P = player;
  if (!P || P.warp || P.docked || P.dead) return false;
  // A campaign act owns the pocket it plays in: no jump key, no map warp and no
  // route can take the pilot out unless the act itself allows it.
  const refusal = campaignTravelRefusal(profileOf(P));
  if (refusal) {
    if (P === localPlayer()) msg(refusal, 4);
    emit("travel-denied", { player: P, reason: refusal });
    return false;
  }
  const from = P.place || state.place;
  to = to || nextPocket(from);
  // Direct legacy callers (old tests/tools) have no resolved session galaxy.
  // Their authored reach/hollow link still works; live play always uses state.galaxy.
  const galaxy = state.galaxy || { pockets: PLACES, pocketsById: PLACES, links: PLACE_LINKS };
  const quote = travelQuote(galaxy, from, to, { player: P, profile: profileOf(P), world: state.worldState });
  if (!quote.ok) {
    if (P === localPlayer()) msg(quote.reason, 4);
    emit("travel-denied", { player: P, from, to, reason: quote.reason });
    return false;
  }
  if (Object.entries(quote.cost).length) {
    const reason = "This route has a travel cost, but no cost handler is registered yet.";
    if (P === localPlayer()) msg(reason, 4);
    emit("travel-denied", { player: P, from, to, reason });
    return false;
  }

  P.warp = {
    from, to, t: 0, fx: 0, flash: 0, switched: false,
    steer: {
      x: P === localPlayer() && state.freeCam.on ? 0 : P.controls.steer.x,
      y: P === localPlayer() && state.freeCam.on ? 0 : P.controls.steer.y,
      roll: P.controls.roll,
    },
  };
  P.acc = 0;
  if (P === localPlayer()) state.freeCam.on = false;
  P.flight.beamOn = false;
  P.flight.beamT = 0;
  if (P === localPlayer()) emit("sfx", { name: "warp-charge", dur: WARP.charge });
  emit("warp-start", { from, to, player: P });
  return true;
}

export function updateWarp(dt, player = localPlayer()) {
  const P = player,
    w = P && P.warp;
  if (!w) return;
  w.t += dt;
  if (!w.switched && w.t >= WARP_SWITCH_AT) {
    w.switched = true;
    arrive(P, w.from, w.to);
  }
  w.fx = warpFx(w.t);
  w.flash = warpFlashAt(w.t);
  if (w.t < WARP_TIME && P === localPlayer()) say("Warp drive engaged");
  else if (w.t >= WARP_TIME) {
    P.warp = null;
    emit("warp-end", { from: w.from, to: w.to, player: P });
  }
}

export function cancelWarp(player = localPlayer()) {
  const P = player,
    w = P && P.warp;
  if (!w) return;
  P.warp = null;
  emit("warp-end", { from: w.from, to: w.to, player: P });
}

function warpFx(t) {
  if (t < WARP.charge) return t / WARP.charge;
  if (t < WARP_SWITCH_AT + WARP.flash) return 1;
  return Math.max(0, 1 - (t - WARP_SWITCH_AT - WARP.flash) / WARP.settle);
}

function arrive(P, from, to) {
  const dest = placeAt(to);
  // Do not erase a fight another active pilot is still having in the old pocket.
  const others = state.players.some(o => o !== P && !o.docked && !o.dead && (o.place || state.place) === from);
  if (!others) clearWorldObjects(from);
  // Update the pilot's actual arrival state before `place-entered` listeners
  // run. Mission scripts must never see the old pocket's position and spawn
  // content relative to stale coordinates.
  P.pos.copy(arrivalPos(to));
  const arrivalFace = placeAt(to)?.enter?.face;
  if (Array.isArray(arrivalFace) && arrivalFace.length === 3 && arrivalFace.every(Number.isFinite)) {
    facePlayer(V(...arrivalFace), 1, P);
  }
  P.v.set(0, 0, 0);
  P.thr = 0;
  P.acc = 0;
  P.snap = true;
  P.flight.lock = null;
  P.flight.missileLock = { target: null, t: 0, locked: false };
  enterPlace(to, P);
  if (P === localPlayer()) {
    emit("sfx", { name: "warp-burst" });
    msg(`Warp: ${placeAt(from).n} to ${dest.n}. ${dest.d}`, 4);
    saveCurrentGame();   // a successful arrival is the next resume point
  }
  emit("place-changed", { from, to, player: P });
}
