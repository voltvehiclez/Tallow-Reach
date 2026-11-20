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

  // How long a dialogue line stays up before it moves on by itself. Enough time
  // to read, not a wait: a base breath plus a second per twelve characters.
  // A station line can also be clicked past; a line in space waits its time.
  dialogueBaseSeconds: 1.5,
  dialogueCharsPerSecond: 12,
};

/**
 * The controls a `control` step may ask for, and the reading of the pilot's
 * control record that counts as doing them. Mission data names one of these ids;
 * the sim reads the record, so no key name lives in a mission file.
 */
export const MISSION_CONTROLS = {
  "throttle-forward": { axis: "thrust", sign: 1, label: "W — throttle forward" },
  "throttle-back": { axis: "thrust", sign: -1, label: "S — throttle back" },
  "steer": { axis: "steer", label: "Mouse — steer" },
  "strafe-left": { axis: "strafe", sign: -1, label: "A — strafe left" },
  "strafe-right": { axis: "strafe", sign: 1, label: "D — strafe right" },
  "lift-up": { axis: "lift", sign: 1, label: "Space — rise" },
  "lift-down": { axis: "lift", sign: -1, label: "C — drop" },
  "roll-left": { axis: "roll", sign: -1, label: "Q — roll left" },
  "roll-right": { axis: "roll", sign: 1, label: "E — roll right" },
  "boost": { flag: "boost", label: "Shift — boost" },
  // Ctrl is the brake: it bleeds the throttle off and holds the Wasp still.
  // Taught second, right after W, so a new pilot can always stop the ship.
  "brake": { flag: "brake", label: "Ctrl — brake to a stop" },
  "stop": { flag: "stop", label: "X — stop" },
};

/** True when the pilot's control record is asking for this control right now. */
export function controlHeld(controls, id) {
  const spec = MISSION_CONTROLS[id];
  if (!spec || !controls) return false;
  if (spec.flag) return controls[spec.flag] === true;
  if (spec.axis === "steer") return Math.abs(Number(controls.steer?.x) || 0) >= 0.25;
  const value = Number(controls[spec.axis]) || 0;
  return spec.sign === -1 ? value <= -0.25 : value >= 0.25;
}

/** Reading time for one line of dialogue, in seconds. */
export function dialogueReadSeconds(text) {
  const length = String(text ?? "").trim().length;
  return MISSION_RULES.dialogueBaseSeconds + length / MISSION_RULES.dialogueCharsPerSecond;
}
