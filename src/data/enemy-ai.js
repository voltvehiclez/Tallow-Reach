// Movement personalities only. Weapons, damage, aim and hull stats remain in enemies.js.
const standard = {
  range: 1, strafe: 1, vertical: 0.35, attackChance: 0.45,
  decision: [2.6, 4.8], breakTime: [1.2, 2.2], dodgeChance: 0.3,
  dodgeTime: 0.65, dodgeCooldown: 3.5, reaction: 0.35,
};
export const ENEMY_AI = {
  standard,
  raider: { ...standard },
  captain: { ...standard, range: 0.45, strafe: 0.2, attackChance: 0, dodgeChance: 0, vertical: 0.08, decision: [6, 8] },
  drone: { ...standard, range: 0.55, strafe: 0.5, attackChance: 0, dodgeChance: 0.1, vertical: 0.2, decision: [5, 7] },
  smuggler: { ...standard, range: 1.15, strafe: 1.1, attackChance: 0.3 },
  freighter: { ...standard, range: 1.3, strafe: 0.4, vertical: 0.12, attackChance: 0.1, dodgeChance: 0.05, decision: [4, 6] },
  hiveguardian: { ...standard, range: 0.8, attackChance: 0.72, decision: [1.8, 3.2], breakTime: [0.8, 1.4], dodgeChance: 0.35 },
  riftguardian: { ...standard, range: 0.85, attackChance: 0.65, decision: [2, 3.5], breakTime: [0.9, 1.6] },
  deepguardian: { ...standard, range: 0.75, attackChance: 0.75, decision: [1.8, 3], breakTime: [0.8, 1.5], vertical: 0.45 },
};
export const enemyAI = def => ({ ...(ENEMY_AI[def.aiProfile] || standard), ...def.aiTuning });
export const AI_FLIGHT = {
  separation: 65, separationSpeed: 90, rockMargin: 35, lookAhead: 2.5,
  avoidSpeed: 170, response: 1.5, phaseSpread: 6.28318530718,
  rangeVariation: 0.2, verticalRate: 0.65, breakRange: 0.55,
  attackSpeed: 1.7, breakSpeed: 1.6, maxSpeedFactor: 1.15,
  bulletLookAhead: 0.7, bulletMissDistance: 28,
  probeInterval: 0.2, probeSide: 18, initialDecisionSpread: 3,
  reverseChance: 0.35, dodgeStrafe: 1.4, aimSpread: 0.025,
  playerMargin: 28, rockEnvelope: 1.4,
};
