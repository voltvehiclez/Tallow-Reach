// Numbers the mission linter (validate.js) and the mission tests enforce.
// They are tuning values, so they live in data. See docs/MISSION_RULES.md.

export const MISSION_RULES = {
  // The nearest a mission-spawned ship may appear to the pilot, in world units.
  // Ships may arrive from a distance; they may never appear in the pilot's face.
  minSpawnDistance: 600,

  // Reasons a mission may declare in `fails.on`. Each is a clear cause the
  // player can understand. Silent or unexplained failure reasons are not listed.
  failReasons: ["player-dead", "abandon", "left-sector", "timeout"],

  // The step target that means "the mission is finished". Authors write
  // `next: "end"`, never a bare step number.
  endTarget: "end",
};
