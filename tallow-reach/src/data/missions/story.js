// A small story mission used as the 13b worked example. Story text and the
// ids named by its steps stay here; the runner only knows how to interpret the
// generic mission vocabulary.

export const BORDER_SIGNAL_MISSION = {
  id: "story.border-signal",
  title: "The Border Signal",
  kind: "story",
  requires: [],
  origin: "hollow",
  timeout: 180,
  steps: [
    {
      id: "intro",
      kind: "dialogue",
      speaker: "Archivist Vale",
      lines: ["A weak signal is repeating beyond Kestrel Hollow.", "Will you find its source before it fades?"],
      choices: [
        { id: "help", text: "I will investigate.", set: { "story.border.helped": true }, next: "prepare" },
        { id: "decline", text: "Not today.", set: { "story.border.helped": false }, next: "declined" },
      ],
    },
    {
      id: "prepare",
      kind: "script",
      action: { kind: "set-sector-state", place: "hollow", set: { borderSignal: "active" } },
      next: "brief",
    },
    {
      id: "brief",
      kind: "dialogue",
      speaker: "Archivist Vale",
      lines: ["The signal is inside the hollow. Stay with it until the patrol reveals the beacon."],
      next: "spawn",
    },
    {
      id: "spawn",
      kind: "script",
      action: { kind: "spawn-wave", place: "hollow", enemy: "raider", count: 2 },
      next: "wait",
    },
    { id: "wait", kind: "wait", trigger: "wave-clear", count: 1, next: "search" },
    {
      id: "search",
      kind: "parallel",
      steps: [
        { id: "reach-signal", kind: "reach", place: "hollow", count: 1 },
        { id: "hold-position", kind: "survive", count: 2 },
      ],
      next: "check-help",
    },
    {
      id: "check-help",
      kind: "flags",
      test: { "story.border.helped": true },
      then: "reward-item",
      else: "declined",
    },
    {
      id: "reward-item",
      kind: "script",
      action: { kind: "give-item", target: "ship", item: "salv", count: 1 },
      next: "finish",
    },
    {
      id: "finish",
      kind: "dialogue",
      speaker: "Archivist Vale",
      lines: ["The beacon is yours. Bring it home and we can learn who sent the signal."],
      next: 10,
    },
    {
      id: "declined",
      kind: "dialogue",
      speaker: "Archivist Vale",
      lines: ["Understood. The signal will wait, if the border does not."],
    },
  ],
  rewards: { credits: 300 },
  fails: {
    on: ["player-dead", "left-sector", "timeout"],
    sector: "hollow",
    action: "abandon",
    message: "The border signal mission was lost.",
  },
};

export const STORY_MISSIONS = [BORDER_SIGNAL_MISSION];

export const storyMission = id => STORY_MISSIONS.find(mission => mission.id === id) || null;
