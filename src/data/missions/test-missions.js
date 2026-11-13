// Short, plain missions that exist to exercise the mission framework. They are
// built from templates, they must lint clean, and tests/mission-invariants runs
// every one of them (and Border Signal) through the same awkward situations.
//
// They are NOT part of the campaign and are not offered to normal players. To
// try them by hand, open the game with `?testmissions` on the end of the address;
// they then appear under "Test missions" in the Mission log.

import { ambush, briefing, handOver, loadCargo, mineOre, mission, radio, travelTo } from "./templates.js";

// Cargo delivery: load at the dock (waits for room), fly out, hand it over.
export const PARCEL_RUN = mission({
  id: "test.parcel-run",
  title: "Test: Parcel run",
  credits: 150,
  // No declared death rule: dying with the parcel aboard fails the mission by itself.
  steps: [
    briefing({ id: "brief", speaker: "Dispatcher", lines: ["A sealed parcel needs to reach Kestrel Hollow.", "Load it at the dock and fly it out."], objective: "Hear the dispatcher's request." }),
    loadCargo({ id: "load", place: "reach", item: "parcel", objective: "Load the parcel aboard at Meridian Station." }),
    travelTo({ id: "fly", place: "hollow", objective: "Fly the parcel to Kestrel Hollow." }),
    handOver({ id: "hand", place: "hollow", item: "parcel", objective: "Hand the parcel over in Kestrel Hollow." }),
    radio({ id: "thanks", speaker: "Hollow contact", lines: ["Received. Thank you, pilot."], objective: "Return to Meridian Station to collect your payment." }),
  ],
});

// Radio-only story with a choice. Nothing in it needs a dock.
export const RADIO_RELAY = mission({
  id: "test.radio-relay",
  title: "Test: Radio relay",
  credits: 100,
  steps: [
    radio({
      id: "call", speaker: "Relay operator", lines: ["Pilot, our relay in Kestrel Hollow has gone quiet.", "Can you take a look?"],
      objective: "Answer the relay operator.",
      choices: [
        { id: "yes", text: "I'll take a look.", set: { "test.relay.agreed": true }, next: "fly" },
        { id: "no", text: "Not now.", set: { "test.relay.agreed": false }, next: "refused" },
      ],
    }),
    travelTo({ id: "fly", place: "hollow", objective: "Fly to Kestrel Hollow and look at the relay.", next: "report" }),
    radio({ id: "report", speaker: "Relay operator", lines: ["Thanks. We have it back."], objective: "Return to Meridian Station to collect your payment.", next: "end" }),
    radio({ id: "refused", speaker: "Relay operator", lines: ["Understood. We'll find someone else."], objective: "Close the conversation.", next: "end" }),
  ],
});

// Mine N of an ore and bring it back. Partial progress counts; the hand-in takes it.
export const ORE_RUN = mission({
  id: "test.ore-run",
  title: "Test: Ore run",
  credits: 120,
  handIn: { objective: "Deliver {count} {item} to {station}." },
  steps: [
    briefing({ id: "brief", speaker: "Foreman", lines: ["We need three Ferrite at the station."], objective: "Hear the foreman's request." }),
    mineOre({ id: "mine", item: "ferrite", count: 3, objective: "Mine 3 Ferrite and bring it to Meridian Station." }),
  ],
});

// Can fail (the ship is destroyed) and be replayed from a clean start.
export const AMBUSH_RUN = mission({
  id: "test.ambush-run",
  title: "Test: Ambush run",
  credits: 200,
  fails: { on: ["player-dead"], action: "abandon", message: "The ambush run was lost because the ship was destroyed." },
  steps: [
    briefing({ id: "brief", speaker: "Scout", lines: ["Raiders have been seen near Kestrel Hollow."], objective: "Hear the scout's warning." }),
    travelTo({ id: "fly", place: "hollow", objective: "Fly to Kestrel Hollow." }),
    ambush({ id: "raiders", place: "hollow", count: 2, objective: "Deal with the raiders in Kestrel Hollow." }),
    radio({ id: "done", speaker: "Scout", lines: ["Well flown. Come back for your pay."], objective: "Return to Meridian Station to collect your payment." }),
  ],
});

export const TEST_MISSIONS = [PARCEL_RUN, RADIO_RELAY, ORE_RUN, AMBUSH_RUN];
